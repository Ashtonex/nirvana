import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Categories that are accounting entries, NOT real cash out from the shop.
// Excluding these stops them from inflating the expense line against revenue.
const NON_CASH_CATEGORIES = new Set([
  "Cash Drawer Opening",
  "Cash Drawer Adjustment",
  "Stock Adjustment",
  "Operations Transfer",
  "Inventory Acquisition",
  "Shipping & Logistics",
  "Lay-by Completed",
  "Lay-by Pending",
  "Lay-by Payment",
  "Return",
  "Refund",
]);

export async function GET(request: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());
    const shopId = searchParams.get("shopId") || null;

    if (month < 1 || month > 12 || year < 2000) {
      return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
    }

    const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(year, month, 0).toISOString().split("T")[0];

    // Fetch in parallel
    const [
      { data: shops },
      { data: classificationsData },
      { data: salesData },
      { data: ledgerData },
    ] = await Promise.all([
      supabaseAdmin.from("shops").select("id, name"),
      // Load saved classifications — gracefully handle if table doesn't exist yet
      supabaseAdmin.from("expense_classifications").select("expense_id, source, group_name").then((r: any) => r).catch(() => ({ data: [] })),
      supabaseAdmin
        .from("sales")
        .select("id, shop_id, date, item_name, quantity, unit_price, total_with_tax")
        .gte("date", startDate)
        .lte("date", endDate),
      // Only pull genuine shop-level expense ledger entries (not ops_ledger)
      supabaseAdmin
        .from("ledger_entries")
        .select("id, shop_id, amount, type, category, description, date")
        .eq("type", "expense")
        .not("shop_id", "is", null)         // Must be shop-scoped
        .gte("date", startDate)
        .lte("date", endDate),
    ]);

    const shopList = Array.isArray(shops) ? shops : [];
    const sales = Array.isArray(salesData) ? salesData : [];

    // Filter to only real cash-out expenses (exclude accounting noise)
    const ledgerExpenses = (Array.isArray(ledgerData) ? ledgerData : []).filter(
      (e: any) => !NON_CASH_CATEGORIES.has(e.category || "")
    );

    // Build classification lookup map
    const classMap = new Map<string, string>();
    (classificationsData || []).forEach((c: any) => {
      classMap.set(`${c.source}:${c.expense_id}`, c.group_name);
    });

    // Expense grouping — saved classification wins, then keyword fallback
    const categorizeExpense = (text: string, id: string, source: string): string => {
      const saved = classMap.get(`${source}:${id}`);
      if (saved) return saved;
      const lower = text.toLowerCase();
      if (/(rent|salary|salaries|utility|utilities|overhead)/.test(lower)) return "Overheads";
      if (/(stock|order|purchase|supplier|restock|supply|supplies)/.test(lower)) return "Stock Orders";
      if (/(invest|vault|transfer|saving|savings|blackbox|deposit|withdrawal)/.test(lower)) return "Transfers";
      if (/(grocery|groceries|fuel|owner|drawing|personal)/.test(lower)) return "Personal Use";
      return "Other";
    };

    // Initialise per-shop buckets
    const performanceByShop: { [key: string]: any } = {};
    shopList.forEach((shop) => {
      performanceByShop[shop.id] = {
        shopId: shop.id,
        shopName: shop.name,
        revenue: 0,
        salesCount: 0,
        // totalExpenses = all real cash out (Overheads + Stock Orders + Other)
        // Transfers and Personal Use are tracked separately and NOT counted against profit
        totalExpenses: 0,
        expenseCount: 0,
        profit: 0,               // Revenue - totalExpenses (Overheads + Stock + Other)
        trueOperatingProfit: 0,  // Revenue - Overheads only (purest operating view)
        items: [] as any[],
        expenseBreakdown: {} as { [key: string]: number },
        groupedExpenses: {
          Overheads: 0,
          "Stock Orders": 0,
          Transfers: 0,
          "Personal Use": 0,
          Other: 0,
        } as { [key: string]: number },
      };
    });

    // Process sales
    sales.forEach((sale: any) => {
      const sid = sale.shop_id;
      if (!sid || !performanceByShop[sid]) return;
      performanceByShop[sid].revenue += Number(sale.total_with_tax || 0);
      performanceByShop[sid].salesCount += 1;
      performanceByShop[sid].items.push({
        name: sale.item_name,
        quantity: sale.quantity,
        unitPrice: sale.unit_price,
        total: Number(sale.total_with_tax || 0),
      });
    });

    // Process shop-level ledger expenses
    ledgerExpenses.forEach((exp: any) => {
      const sid = exp.shop_id;
      if (!sid || !performanceByShop[sid]) return;
      const amount = Number(exp.amount || 0);
      if (amount <= 0) return;

      const textToCategorize = `${exp.category || ""} ${exp.description || ""}`;
      const group = categorizeExpense(textToCategorize, exp.id, "ledger_entries");

      // Transfers and Personal Use are NOT real business expenses — track them but exclude from profit calc
      const countsAgainstProfit = group !== "Transfers" && group !== "Personal Use";

      if (countsAgainstProfit) {
        performanceByShop[sid].totalExpenses += amount;
      }
      performanceByShop[sid].expenseCount += 1;

      // Fine-grained breakdown uses the raw category label
      const rawCat = exp.category || "Other";
      performanceByShop[sid].expenseBreakdown[rawCat] =
        (performanceByShop[sid].expenseBreakdown[rawCat] || 0) + amount;

      // High-level group
      performanceByShop[sid].groupedExpenses[group] =
        (performanceByShop[sid].groupedExpenses[group] || 0) + amount;
    });

    // Calculate profit figures
    Object.keys(performanceByShop).forEach((sid) => {
      const shop = performanceByShop[sid];
      shop.profit = shop.revenue - shop.totalExpenses;
      shop.trueOperatingProfit = shop.revenue - shop.groupedExpenses.Overheads;

      // Best seller
      if (shop.items.length > 0) {
        const best = shop.items.reduce((prev: any, cur: any) =>
          cur.total > prev.total ? cur : prev
        );
        shop.bestSeller = [best.name, best.total];
      }
      // Biggest single expense category
      if (Object.keys(shop.expenseBreakdown).length > 0) {
        shop.biggestOverhead = Object.entries(shop.expenseBreakdown).reduce(
          (prev: any, cur: any) => (cur[1] > prev[1] ? cur : prev),
          ["—", 0]
        );
      }
      // Rename for API clarity
      shop.expenses = shop.totalExpenses;
      delete shop.totalExpenses;
      delete shop.items;
    });

    let result = Object.values(performanceByShop);
    if (shopId && performanceByShop[shopId]) {
      result = [performanceByShop[shopId]];
    }

    const totalRevenue = result.reduce((s: number, sh: any) => s + sh.revenue, 0);
    const totalExpenses = result.reduce((s: number, sh: any) => s + sh.expenses, 0);
    const totalProfit = result.reduce((s: number, sh: any) => s + sh.profit, 0);
    const totalTrueProfit = result.reduce((s: number, sh: any) => s + sh.trueOperatingProfit, 0);
    const totalOverheads = result.reduce((s: number, sh: any) => s + (sh.groupedExpenses?.Overheads || 0), 0);
    const totalStockOrders = result.reduce((s: number, sh: any) => s + (sh.groupedExpenses?.["Stock Orders"] || 0), 0);
    const totalTransfers = result.reduce((s: number, sh: any) => s + (sh.groupedExpenses?.Transfers || 0), 0);
    const totalPersonal = result.reduce((s: number, sh: any) => s + (sh.groupedExpenses?.["Personal Use"] || 0), 0);

    return NextResponse.json({
      success: true,
      period: { year, month, startDate, endDate },
      performance: result,
      totals: {
        totalRevenue,
        totalExpenses,
        totalProfit,
        totalTrueOperatingProfit: totalTrueProfit,
        totalOverheads,
        totalStockOrders,
        totalTransfers,
        totalPersonalUse: totalPersonal,
        totalSales: result.reduce((s: number, sh: any) => s + sh.salesCount, 0),
        shopCount: result.length,
        profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0,
        trueOperatingMargin: totalRevenue > 0 ? ((totalTrueProfit / totalRevenue) * 100) : 0,
      },
    });
  } catch (e: any) {
    console.error("Performance endpoint error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
