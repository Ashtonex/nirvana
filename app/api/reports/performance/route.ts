import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    // Validate month and year
    if (month < 1 || month > 12 || year < 2000) {
      return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
    }

    // Calculate date range
    const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(year, month, 0).toISOString().split("T")[0];

    // Get all shops
    const { data: shops } = await supabaseAdmin.from("shops").select("id, name");
    const shopList = Array.isArray(shops) ? shops : [];

    // Get sales data
    const { data: salesData } = await supabaseAdmin
      .from("sales")
      .select("id, shopId, date, itemName, quantity, unitPrice, totalWithTax")
      .gte("date", startDate)
      .lte("date", endDate);

    // Get operations ledger (expenses)
    const { data: expensesData } = await supabaseAdmin
      .from("operations_ledger")
      .select("id, shop_id, amount, kind, title, overhead_category, created_at")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`);

    // Get ledger entries (if they exist)
    const { data: ledgerData } = await supabaseAdmin
      .from("ledger_entries")
      .select("id, shop_id, amount, type, date")
      .eq("type", "expense")
      .gte("date", startDate)
      .lte("date", endDate);

    const sales = Array.isArray(salesData) ? salesData : [];
    const expenses = Array.isArray(expensesData) ? expensesData : [];
    const ledgerExpenses = Array.isArray(ledgerData) ? ledgerData : [];

    // Process data by shop
    const performanceByShop: { [key: string]: any } = {};

    // Initialize shops
    shopList.forEach((shop) => {
      performanceByShop[shop.id] = {
        shopId: shop.id,
        shopName: shop.name,
        revenue: 0,
        salesCount: 0,
        expenses: 0,
        expenseCount: 0,
        profit: 0,
        items: [] as any[],
        expenseBreakdown: {} as { [key: string]: number },
      };
    });

    // Process sales
    sales.forEach((sale: any) => {
      const sid = sale.shopId || sale.shop_id; // Support both naming conventions
      if (!sid || !performanceByShop[sid]) return;

      performanceByShop[sid].revenue += sale.totalWithTax || sale.total_with_tax || 0;
      performanceByShop[sid].salesCount += 1;
      performanceByShop[sid].items.push({
        name: sale.itemName || sale.item_name,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice || sale.unit_price,
        total: sale.totalWithTax || sale.total_with_tax,
      });
    });

    // Process expenses
    expenses.forEach((exp: any) => {
      const sid = exp.shop_id;
      if (!sid || !performanceByShop[sid]) return;

      performanceByShop[sid].expenses += exp.amount || 0;
      performanceByShop[sid].expenseCount += 1;

      const category = exp.overhead_category || exp.kind || "Other";
      performanceByShop[sid].expenseBreakdown[category] =
        (performanceByShop[sid].expenseBreakdown[category] || 0) + (exp.amount || 0);
    });

    // Process ledger expenses
    ledgerExpenses.forEach((exp: any) => {
      const sid = exp.shop_id;
      if (!sid || !performanceByShop[sid]) return;

      performanceByShop[sid].expenses += exp.amount || 0;
      performanceByShop[sid].expenseCount += 1;
      performanceByShop[sid].expenseBreakdown["Ledger Expenses"] =
        (performanceByShop[sid].expenseBreakdown["Ledger Expenses"] || 0) + (exp.amount || 0);
    });

    // Calculate profit and find best sellers
    Object.keys(performanceByShop).forEach((shopId) => {
      const shop = performanceByShop[shopId];
      shop.profit = shop.revenue - shop.expenses;

      // Find best seller (highest selling item)
      if (shop.items.length > 0) {
        const best = shop.items.reduce((prev: any, current: any) =>
          current.total > prev.total ? current : prev
        );
        shop.bestSeller = [best.name, best.total];
      }

      // Find biggest overhead
      if (Object.keys(shop.expenseBreakdown).length > 0) {
        shop.biggestOverhead = Object.entries(shop.expenseBreakdown).reduce(
          (prev: any, current: any) => (current[1] > prev[1] ? current : prev),
          ["Other", 0]
        );
      }

      // Remove detailed items from response (keep just best seller)
      delete shop.items;
    });

    // Filter by shop if requested
    let result = Object.values(performanceByShop);
    if (shopId && performanceByShop[shopId]) {
      result = [performanceByShop[shopId]];
    }

    // Calculate totals
    const totals = {
      totalRevenue: result.reduce((sum: number, shop: any) => sum + shop.revenue, 0),
      totalExpenses: result.reduce((sum: number, shop: any) => sum + shop.expenses, 0),
      totalProfit: result.reduce((sum: number, shop: any) => sum + shop.profit, 0),
      totalSales: result.reduce((sum: number, shop: any) => sum + shop.salesCount, 0),
      shopCount: result.length,
    };

    return NextResponse.json({
      success: true,
      period: { year, month, startDate, endDate },
      performance: result,
      totals,
    });
  } catch (e: any) {
    console.error("Performance endpoint error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
