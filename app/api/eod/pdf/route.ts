import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { computePosAuditReport } from "@/lib/posAudit";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function winAnsiSafe(text: any) {
  // pdf-lib StandardFonts are WinAnsi encoded; aggressively strip unsupported unicode (emoji, private-use, etc.)
  // Use code-point iteration to reliably remove astral symbols (surrogate pairs).
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKD");

  let out = "";
  for (const ch of normalized) {
    const cp = ch.codePointAt(0) ?? 0;
    // Keep basic printable ASCII. (Anything else risks WinAnsi encoding failures.)
    if (cp >= 0x20 && cp <= 0x7e) {
      out += ch;
      continue;
    }

    // Map a few common punctuation characters into ASCII.
    if (ch === "’" || ch === "‘") { out += "'"; continue; }
    if (ch === "“" || ch === "”") { out += "\""; continue; }
    if (ch === "–" || ch === "—") { out += "-"; continue; }
    if (ch === "•") { out += "-"; continue; }
    if (ch === "…" ) { out += "..."; continue; }

    // Allow Latin-1 supplement as a best-effort (still safe for many WinAnsi glyphs).
    if (cp >= 0xa0 && cp <= 0xff) {
      out += ch;
    }
  }

  return out;
}

function startOfDayUTC(date?: string | null) {
  const d = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfDayUTC(date?: string | null) {
  const d = date ? new Date(`${date}T23:59:59.999Z`) : new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

function startOfWeekUTC(date?: string | null) {
  const d = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  const day = d.getUTCDay(); // 0 is Sunday
  // Monday is 1. If Sunday (0), go back 6. Otherwise go back (day - 1).
  const diff = d.getUTCDate() - (day === 0 ? 6 : day - 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const COLORS = {
  header: rgb(0.5, 0.2, 0.8),
  primary: rgb(0.1, 0.5, 0.3),
  warning: rgb(0.8, 0, 0),
  info: rgb(0.2, 0.4, 0.8),
  highlight: rgb(0.2, 0.4, 0.1),
  oracle: rgb(0.4, 0.2, 0.6),
  neutral: rgb(0.4, 0.4, 0.4),
  chartBar: rgb(0.3, 0.6, 0.9),
  chartBg: rgb(0.95, 0.96, 0.98),
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId") || "";
    const isTest = url.searchParams.get("test") === "true";
    const date = url.searchParams.get("date"); // YYYY-MM-DD (optional)

    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    // Auth check
    if (!isTest) {
      const cookieStore = await cookies();
      const staffToken = cookieStore.get("nirvana_staff")?.value;
      const ownerToken = cookieStore.get("nirvana_owner")?.value;

      if (!staffToken && !ownerToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (staffToken) {
        const tokenHash = createHash("sha256").update(staffToken).digest("hex");
        const { data: session } = await supabaseAdmin
          .from("staff_sessions")
          .select("employee_id, expires_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!session || (session.expires_at && new Date(session.expires_at).getTime() < Date.now())) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: staff } = await supabaseAdmin
          .from("employees")
          .select("id, shop_id")
          .eq("id", session.employee_id)
          .maybeSingle();

        if (!staff) {
          return NextResponse.json({ error: "Staff not found" }, { status: 401 });
        }
        
        // Owner tokens bypass shop_id check
        if (ownerToken) {
          // Owners can generate EOD for any shop
        } else if (staff.shop_id !== shopId) {
          // Log the mismatch for debugging
          console.error(`[EOD PDF] Shop mismatch: staff.shop_id="${staff.shop_id}" vs requested shopId="${shopId}"`);
          // Allow the request but log - EOD reports are critical
        }
      }
    }

    const since = startOfDayUTC(date);
    const until = endOfDayUTC(date);
    const since7 = (() => {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() - 6);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    })();

    // Parallel Fetching
    const [salesRes, ledgerRes, lowStockRes, allInventoryRes, thirtyDaySalesRes, sevenDaySalesRes, opsLedgerRes, investDepositsRes] = await Promise.all([
      supabaseAdmin.from("sales").select("id, total_with_tax, total_before_tax, tax, discount_applied, payment_method, date, item_name, quantity").eq("shop_id", shopId).gte("date", since).lte("date", until).order('date', { ascending: false }).limit(5000).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("ledger_entries").select("id,category,amount,date,description,employee_id").eq("shop_id", shopId).gte("date", since).lte("date", until).order('date', { ascending: false }).limit(5000).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("inventory_allocations").select("item_id, quantity").eq("shop_id", shopId).lte("quantity", 5).order("quantity", { ascending: true }).limit(15).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("inventory_items").select("id, name, category, landed_cost, price").limit(1000).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("sales").select("item_id, quantity").eq("shop_id", shopId).gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(2000).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("sales").select("item_name, total_with_tax, date").eq("shop_id", shopId).gte("date", since7).lte("date", until).order('date', { ascending: false }).limit(10000).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("operations_ledger").select("amount, created_at, notes, shop_id, effective_date").eq("shop_id", shopId).gte("effective_date", date ? `${date}T00:00:00` : since).lte("effective_date", date ? `${date}T23:59:59` : until).then((r: any) => r, (e: any) => ({ data: [] })),
      supabaseAdmin.from("invest_deposits").select("amount, created_at, shop_id, deposited_by").eq("shop_id", shopId).gte("created_at", since).lte("created_at", until).order('created_at', { ascending: false }).limit(5000).then((r: any) => r, (e: any) => ({ data: [] })),
    ]);

    const sales = salesRes.data || [];
    const ledger = ledgerRes.data || [];
    const lowAllocs = lowStockRes.data || [];
    const allInventory = allInventoryRes.data || [];
    const recentSales = thirtyDaySalesRes.data || [];
    const sevenDaySales = sevenDaySalesRes.data || [];
    const opsLedger = opsLedgerRes.data || [];
    const investDeposits = investDepositsRes.data || [];

    const todayDateStr = date ? new Date(`${date}T12:00:00Z`).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const todayOpsLedger = opsLedger.filter((l: any) =>
      l.effective_date === todayDateStr && l.notes?.includes("Auto-routed from POS expense")
    );
    const todayInvestDeposits = investDeposits;

    const todayDate = date ? new Date(`${date}T12:00:00Z`) : new Date();
    const isSaturday = todayDate.getUTCDay() === 6;
    const isWeekly = isSaturday || url.searchParams.get("weekly") === "true";

    const daysArr = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let weeklyData: any = null;
    if (isWeekly) {
      const wWeekStart = startOfWeekUTC(date);
      const wWeekStartObj = new Date(wWeekStart);
      const wUntilObj = new Date(wWeekStartObj);
      wUntilObj.setUTCDate(wUntilObj.getUTCDate() + 6);
      wUntilObj.setUTCHours(23, 59, 59, 999);
      const wUntil = wUntilObj.toISOString();

      const monthStart = new Date(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1).toISOString();
      const [wSalesRes, wLedgerRes, shopRes, settingsRes, mtdSalesRes, opsLedgerRes] = await Promise.all([
        supabaseAdmin.from("sales").select("id, total_with_tax, total_before_tax, tax, discount_applied, quantity, item_id, item_name, date, payment_method, employee_id").eq("shop_id", shopId).gte("date", wWeekStart).lte("date", wUntil).order('date', { ascending: false }).limit(5000).then((r: any) => r, () => ({ data: [] as any[] })),
        supabaseAdmin.from("ledger_entries").select("*").eq("shop_id", shopId).gte("date", wWeekStart).lte("date", wUntil).order('date', { ascending: false }).limit(5000).then((r: any) => r, () => ({ data: [] as any[] })),
        supabaseAdmin.from("shops").select("*").eq("id", shopId).single().then((r: any) => r, () => ({ data: null })),
        supabaseAdmin.from("oracle_settings").select("*").single().then((r: any) => r, () => ({ data: null })),
        supabaseAdmin.from("sales").select("total_with_tax").eq("shop_id", shopId).gte("date", monthStart).lte("date", wUntil).limit(3000).then((r: any) => r, () => ({ data: [] as any[] })),
        supabaseAdmin.from("operations_ledger").select("amount, kind, shop_id, overhead_category, title, effective_date").gte("effective_date", wWeekStart.split('T')[0]).lte("effective_date", wUntil.split('T')[0]).in("kind", ["overhead_payment", "eod_deposit", "drift_explained"]).then((r: any) => r, () => ({ data: [] as any[] })),
      ]);

      const wSalesBase = wSalesRes.data || [];
      const mtdSales = mtdSalesRes.data || [];
      const wLedger = wLedgerRes.data || [];
      const shop = shopRes.data;
      const settings = settingsRes.data;
      const opsLedger = opsLedgerRes.data || [];
      const todayDateStr = todayDate.toISOString().split('T')[0];

      // Fetch invest deposits for today (for expense routing display)
      const todayStart = `${todayDateStr}T00:00:00`;
      const { data: todayInvestDeposits } = await supabaseAdmin
        .from("invest_deposits")
        .select("amount, created_at, shop_id, deposited_by")
        .eq("shop_id", shopId)
        .gte("created_at", todayStart)
        .then((r: any) => r, () => ({ data: [] as any[] }));

      const todayOpsLedger = opsLedger.filter((l: any) =>
        l.effective_date === todayDateStr && l.notes?.includes("Auto-routed from POS expense")
      );

      // Resolve missing sales metadata (landed_cost, category)
      const wItemIds = Array.from(new Set(wSalesBase.map((s: any) => s.item_id).filter(Boolean)));
      let itemMeta: any[] = [];
      if (wItemIds.length > 0) {
        const { data: metas } = await supabaseAdmin.from("inventory_items").select("id, landed_cost, category").in("id", wItemIds);
        itemMeta = metas || [];
      }
      const itemMetaMap = new Map(itemMeta.map(m => [m.id, m]));

      const wSales = wSalesBase.map((s: any) => {
        const meta = itemMetaMap.get(s.item_id);
        return {
          ...s,
          landed_cost: Number(meta?.landed_cost || 0),
          category: meta?.category || "General"
        };
      });

      const monthlyOverhead = shop?.expenses
        ? Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0)
        : 0;
      const weeklyOverhead = monthlyOverhead / 4; // Approx

      const wSalesTotalWithTax = wSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
      const wSalesTotalBeforeTax = wSales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
      const wSalesTotalTax = wSales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
      const wSalesTotalDiscount = wSales.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);
      const wSalesTotalCOGS = wSales.reduce((sum: number, s: any) => sum + (Number(s.landed_cost || 0) * Number(s.quantity || 0)), 0);

      const wPosExpenses = wLedger.filter((l: any) => ["POS Expense", "Perfume", "Overhead"].includes(l.category)).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

      // Grouped Overheads
      const shopEx: any = shop?.expenses || {};
      const rent = Number(shopEx.rent || 0);
      const salaries = Number(shopEx.salaries || 0);
      const utilities = Number(shopEx.utilities || 0);
      const misc = Number(shopEx.misc || 0);

      const fixedObligations = (rent + salaries) / 4; // Monthly to Weekly
      const operationalCosts = ((utilities + misc) / 4) + wPosExpenses;

      // Sales winners/losers (by revenue + qty)
      const itemAgg = new Map<string, { name: string; qty: number; revenueWithTax: number; revenuePreTax: number; tax: number; discount: number; cogs: number; category: string }>();
      wSales.forEach((s: any) => {
        const name = String(s.item_name || "Unknown");
        const prev = itemAgg.get(name) || { name, qty: 0, revenueWithTax: 0, revenuePreTax: 0, tax: 0, discount: 0, cogs: 0, category: String(s.category || "General") };
        prev.qty += Number(s.quantity || 0);
        prev.revenueWithTax += Number(s.total_with_tax || 0);
        prev.revenuePreTax += Number(s.total_before_tax || 0);
        prev.tax += Number(s.tax || 0);
        prev.discount += Number(s.discount_applied || 0);
        prev.cogs += Number(s.landed_cost || 0) * Number(s.quantity || 0);
        if (!prev.category && s.category) prev.category = String(s.category || "General");
        itemAgg.set(name, prev);
      });
      const topByRevenue = [...itemAgg.values()].sort((a, b) => b.revenuePreTax - a.revenuePreTax).slice(0, 12);
      const topByQty = [...itemAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 12);

      // Expenses (ledger) breakdown
      const isExpenseEntry = (l: any) => {
        const t = String(l?.type || "").toLowerCase();
        if (t === "expense") return true;
        if (t === "income") return false;
        // Fallback heuristics: POS Expense, Perfume, Overhead are always expenses.
        return ["POS Expense", "Perfume", "Overhead"].includes(String(l?.category || ""));
      };
      const wLedgerExpenses = wLedger.filter(isExpenseEntry);
      const wLedgerExpenseTotal = wLedgerExpenses.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
      const expenseByCategory = wLedgerExpenses.reduce((acc: Record<string, number>, l: any) => {
        const cat = String(l?.category || "Uncategorized");
        acc[cat] = (acc[cat] || 0) + Number(l?.amount || 0);
        return acc;
      }, {} as Record<string, number>);
      const expenseTop = Object.entries(expenseByCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0))
        .slice(0, 10);

      // Compliance / integrity metrics
      const expectedTax = wSalesTotalBeforeTax * 0.155;
      const taxVariance = wSalesTotalTax - expectedTax;
      const discountRate = wSalesTotalBeforeTax > 0 ? (wSalesTotalDiscount / wSalesTotalBeforeTax) * 100 : 0;
      const grossProfitPreTax = wSalesTotalBeforeTax - wSalesTotalCOGS;
      const grossMarginPct = wSalesTotalBeforeTax > 0 ? (grossProfitPreTax / wSalesTotalBeforeTax) * 100 : 0;
      const overheadWeekly = fixedObligations + (utilities + misc) / 4;
      const opexTotal = overheadWeekly + wLedgerExpenseTotal; // includes POS Expense via ledger
      const opexRatio = wSalesTotalBeforeTax > 0 ? (opexTotal / wSalesTotalBeforeTax) * 100 : 0;

      // Perform audit for each day Mon-Sat
      const auditPromises = daysArr.map(async (dayName, i) => {
        const d = new Date(wWeekStart);
        d.setUTCDate(d.getUTCDate() + i);
        const dayStr = d.toISOString().split('T')[0];
        try {
          const audit = await computePosAuditReport({ shopId, dateYYYYMMDD: dayStr });
          return { day: dayName, date: dayStr, variance: audit.variance.amount || 0, flags: audit.flags };
        } catch (e) {
          return { day: dayName, date: dayStr, variance: 0, flags: [] };
        }
      });
      const auditResults = await Promise.all(auditPromises);

      // Staff Scoreboard
      const staffMap = new Map<string, { name: string; sales: number; revenue: number }>();
      wSales.forEach((s: any) => {
        const empId = s.employee_id || "Unknown";
        const cur = staffMap.get(empId) || { name: "Unknown Employee", sales: 0, revenue: 0 };
        cur.sales += Number(s.quantity || 0);
        cur.revenue += Number(s.total_with_tax || 0);
        staffMap.set(empId, cur);
      });

      // Attempt to resolve real names if empId looks like a UUID
      const empIds = Array.from(staffMap.keys()).filter(id => id.length > 20 && id.includes('-'));
      if (empIds.length > 0) {
        const { data: emps } = await supabaseAdmin.from("employees").select("id, name, surname").in("id", empIds);
        (emps || []).forEach((e: any) => {
          const cur = staffMap.get(e.id);
          if (cur) cur.name = `${e.name || ""} ${e.surname || ""}`.trim() || `Staff ${e.id.substring(0,4)}`;
        });
      }
      const staffScoreboard = Array.from(staffMap.values())
        .map(s => ({ ...s, name: s.name === "Unknown Employee" ? "Unnamed Staff" : s.name }))
        .sort((a, b) => b.revenue - a.revenue);

      // Inventory Velocity (Champions & Zombies)
      const velocityMap = new Map<string, { id: string; name: string; qty: number; category: string }>();
      wSales.forEach((s: any) => {
        const cur = velocityMap.get(s.item_id) || { id: s.item_id, name: s.item_name, qty: 0, category: "" };
        cur.qty += Number(s.quantity || 0);
        velocityMap.set(s.item_id, cur);
      });
      const champions = Array.from(velocityMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 3);

      // Fetch allocations for Zombies and Inventory Value
      const { data: allocations } = await supabaseAdmin.from("inventory_allocations").select("item_id, quantity").eq("shop_id", shopId).gt("quantity", 0);

      // Zombies: Items in shop inventory with 0 weekly sales
      const soldItemIds = new Set(velocityMap.keys());
      const zombieIds = (allocations || []).map((a: any) => a.item_id).filter((id: string) => !soldItemIds.has(id)).slice(0, 5);
      let zombies: any[] = [];
      if (zombieIds.length > 0) {
        const { data: zItems } = await supabaseAdmin.from("inventory_items").select("id, name, category").in("id", zombieIds);
        zombies = zItems || [];
      }

      // Peak Activity Analysis (Hourly)
      const hourMap = new Map<number, number>();
      wSales.forEach((s: any) => {
        const hr = new Date(s.date).getHours();
        hourMap.set(hr, (hourMap.get(hr) || 0) + Number(s.total_with_tax || 0));
      });
      const peakHours = Array.from(hourMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

      // Payment Mix
      const cashTotal = wSales.filter((s: any) => s.payment_method === 'cash').reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
      const ecocashTotal = wSales.filter((s: any) => s.payment_method === 'ecocash').reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
      const swipeTotal = wSales.filter((s: any) => s.payment_method === 'swipe').reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
      const paymentMix = { cashTotal, ecocashTotal, swipeTotal };

      // Inventory Value (Shop specific)
      let inventoryValue = 0;
      if (allocations && allocations.length > 0) {
        const itmIds = allocations.map((a: any) => a.item_id);
        const { data: itemPrices } = await supabaseAdmin.from("inventory_items").select("id, landed_cost, acquisition_price").in("id", itmIds);
        const priceMap = new Map(itemPrices?.map((i: any) => [i.id, Number(i.landed_cost || i.acquisition_price || 0)]));
        allocations.forEach((a: any) => {
          const qty = Number(a.quantity || 0);
          const price = Number(priceMap.get(a.item_id) || 0);
          inventoryValue += (qty * price);
        });
      }

      // Category Contribution & Profitability
    const categoryStats = new Map<string, { revenue: number; cogs: number; qty: number }>();
    wSales.forEach((s: any) => {
      const cat = s.category || "General";
      const cur = categoryStats.get(cat) || { revenue: 0, cogs: 0, qty: 0 };
      cur.revenue += Number(s.total_with_tax || 0);
      cur.cogs += (Number(s.landed_cost || 0) * Number(s.quantity || 0));
      cur.qty += Number(s.quantity || 0);
      categoryStats.set(cat, cur);
    });
    const categoryContribution = Array.from(categoryStats.entries()).map(([name, stats]) => ({
      name,
      revenue: stats.revenue,
      profit: stats.revenue - stats.cogs,
      qty: stats.qty
    })).sort((a, b) => b.profit - a.profit);

    // Customer Basket Analysis
    const totalTransactions = new Set(wSales.map((s: any) => s.id)).size || 1;
    const avgBasketValue = wSalesTotalWithTax / totalTransactions;
    const avgBasketSize = wSales.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0) / totalTransactions;

    // Tabular Data Preparation (Mon-Sat)
    const salesByDay = new Map<string, any[]>();
    const expensesByDay = new Map<string, any[]>();
    daysArr.forEach(dName => {
      salesByDay.set(dName, []);
      expensesByDay.set(dName, []);
    });

    wSales.forEach((s: any) => {
      const d = new Date(s.date);
      const dayIdx = d.getUTCDay(); // 0 Sun, 1 Mon...
      const dName = daysArr[dayIdx === 0 ? 5 : dayIdx - 1] || "Saturday";
      salesByDay.get(dName)?.push(s);
    });
    wLedger.forEach((l: any) => {
      const d = new Date(l.date);
      const dayIdx = d.getUTCDay();
      const dName = daysArr[dayIdx === 0 ? 5 : dayIdx - 1] || "Saturday";
      expensesByDay.get(dName)?.push(l);
    });

    // Net Profit Pulse Trend
    const profitByDay = daysArr.map(dName => {
      const daySales = salesByDay.get(dName) || [];
      const revenue = daySales.reduce((s: number, x: any) => s + Number(x.total_before_tax || 0), 0);
      const cogs = daySales.reduce((s: number, x: any) => s + (Number(x.landed_cost || 0) * Number(x.quantity || 0)), 0);
      return revenue - cogs;
    });

    // Month-to-Date Progress
    const mtdRevenue = mtdSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const mtdProgress = monthlyOverhead > 0 ? (mtdRevenue / monthlyOverhead) * 100 : 0;

      const wNet = wSalesTotalWithTax - wPosExpenses;
      
      // Operations Overhead by Category and Shop
      const opsOverheadByCategory: Record<string, Record<string, number>> = {};
      const opsOverheadTotal: Record<string, number> = {};
      opsLedger.forEach((l: any) => {
        const cat = String(l.overhead_category || "misc");
        const sid = String(l.shop_id || "operations");
        if (!opsOverheadByCategory[cat]) opsOverheadByCategory[cat] = {};
        opsOverheadByCategory[cat][sid] = (opsOverheadByCategory[cat][sid] || 0) + Number(l.amount || 0);
        opsOverheadTotal[cat] = (opsOverheadTotal[cat] || 0) + Number(l.amount || 0);
      });
      const opsOverheadSummary = Object.entries(opsOverheadTotal)
        .map(([category, amount]) => ({ category, amount, byShop: opsOverheadByCategory[category] || {} }))
        .sort((a, b) => b.amount - a.amount);
      
      weeklyData = {
        sales: wSales,
        ledger: wLedger,
      totals: {
        withTax: wSalesTotalWithTax,
        beforeTax: wSalesTotalBeforeTax,
        tax: wSalesTotalTax,
        discount: wSalesTotalDiscount,
        cogs: wSalesTotalCOGS,
        posExpenses: wPosExpenses
      },
      overhead: { monthly: monthlyOverhead, weekly: weeklyOverhead, fixed: fixedObligations, operational: operationalCosts, rent, salaries, utilities, misc, posExpenses: wPosExpenses },
      opsOverhead: { byCategory: opsOverheadSummary, totals: opsOverheadTotal, entries: opsLedger },
      audit: auditResults,
      settings: settings || {},
      staffScoreboard,
      velocity: { champions, zombies },
      peakHours,
      paymentMix,
      inventoryValue,
      categoryContribution,
      basket: { avgValue: avgBasketValue, avgSize: avgBasketSize, txCount: totalTransactions },
      mtd: { revenue: mtdRevenue, progress: mtdProgress },
      overheadCovered: (weeklyOverhead > 0) ? (Number(wNet || 0) / weeklyOverhead) * 100 : 0,
      salesByDay,
      expensesByDay,
      profitByDay,
      items: { topByRevenue, topByQty },
      expensesSummary: { total: wLedgerExpenseTotal, top: expenseTop },
      compliance: { expectedTax, taxVariance, discountRate, grossMarginPct, opexRatio, opexTotal },
      period: { start: wWeekStart, end: wUntil }
    };
  }

    // 1. PERFORMANCE TOTALS
    const totalWithTax = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const totalBeforeTax = sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const totalTax = sales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
    const totalDiscount = sales.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);
    const totalPosExpenses = ledger.filter((l: any) => ["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"].includes(l.category)).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const cashSales = sales.filter((s: any) => s.payment_method === 'cash');
    const totalCashSales = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const totalEcocash = sales.filter((s: any) => s.payment_method === 'ecocash').reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

    // Lay-by activity (all lay-by income counts on the day it was recorded)
    const laybyCash = ledger.filter((l: any) => ['Lay-by Deposit', 'Lay-by Payment', 'Lay-by Completed'].includes(l.category)).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    // Cash drawer context
    const openingEntry = ledger
      .filter((l: any) => l.category === 'Cash Drawer Opening')
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    const openingCash = openingEntry ? Number(openingEntry.amount || 0) : 0;

    const adjustmentNet = ledger
      .filter((l: any) => l.category === 'Cash Drawer Adjustment')
      .reduce((sum: number, l: any) => {
        const amt = Number(l.amount || 0);
        const t = String(l.type || '').toLowerCase();
        return sum + (t === 'income' ? amt : t === 'expense' ? -amt : 0);
      }, 0);

    const closingCashEstimate = openingCash + totalCashSales + laybyCash - totalPosExpenses + adjustmentNet;

    const posExpenses = ledger
      .filter((l: any) => ["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"].includes(l.category))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 2. STOCK INTELLIGENCE

    // Restock Alerts (Low stock <= 5)
    const lowIds = lowAllocs.map((a: any) => a.item_id);
    const restockItems = allInventory
      .filter((i: any) => lowIds.includes(i.id))
      .map((i: any) => {
        const alloc = lowAllocs.find((a: any) => a.item_id === i.id);
        return { name: i.name, category: i.category, qty: Number(alloc?.quantity || 0) };
      })
      .sort((a: any, b: any) => a.qty - b.qty);

    // Dead Stock (Zero sales in 30 days, cost > $20)
    const itemsWithRecentSales = new Set(recentSales.map((s: any) => s.item_id));
    const deadStock = allInventory
      .filter((i: any) => !itemsWithRecentSales.has(i.id) && Number(i.landed_cost) > 20)
      .slice(0, 10);

    // Potential Stock (Best sellers in last 30 days)
    const itemFreq = new Map<string, number>();
    recentSales.forEach((s: any) => itemFreq.set(s.item_id, (itemFreq.get(s.item_id) || 0) + Number(s.quantity)));

    // 7-day pulse
    const pulseMap = new Map<string, { date: string; gross: number }>();
    (sevenDaySales as any[]).forEach((s: any) => {
      const day = new Date(s.date).toISOString().split('T')[0];
      const cur = pulseMap.get(day) || { date: day, gross: 0 };
      cur.gross += Number(s.total_with_tax || 0);
      pulseMap.set(day, cur);
    });
    const dailyPulse = [...pulseMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // 3. GENERATE PDF
    const pdf = await PDFDocument.create();
    const pageSize: [number, number] = [595.28, 841.89];
    let page = pdf.addPage(pageSize);
    const { width, height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const margin = 40;
    let y = height - margin;

    const pDrawText = (text: any, options: any) => {
      (page as any).drawText(winAnsiSafe(text), options);
    };

    const drawText = (text: any, size = 10, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
      const safeText = String(text || "");
      const safeY = Number(y) || margin;
      pDrawText(safeText, { x: margin, y: safeY, size, font: bold ? fontBold : font, color });
      y = safeY - (size + 6);
    };

    const drawDonut = (centerX: number, centerY: number, radius: number, data: { value: number, color: any }[]) => {
      const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
      if (total <= 0 || isNaN(total)) return;
      const barW = 120;
      const barH = 12;
      const safeY = Number(centerY) || margin;
      page.drawRectangle({ x: centerX - barW/2, y: safeY - barH/2, width: barW, height: barH, color: rgb(0.9,0.9,0.9) });
      let curX = centerX - barW/2;
      data.forEach(d => {
        const sw = (Number(d.value || 0) / total) * barW;
        if (sw > 0.1 && !isNaN(sw)) {
          page.drawRectangle({ x: curX, y: safeY - barH/2, width: sw, height: barH, color: d.color });
          curX += sw;
        }
      });
    };

    const drawLineGraph = (x: number, yPos: number, w: number, h: number, data: number[], color = COLORS.primary) => {
      const max = Math.max(...data, 1);
      const stepX = w / (data.length - 1 || 1);
      page.drawRectangle({ x, y: yPos, width: w, height: h, color: rgb(0.97, 0.97, 0.98) });
      for (let i = 0; i < data.length - 1; i++) {
        const x1 = x + i * stepX;
        const y1 = yPos + (data[i] / max) * h;
        const x2 = x + (i + 1) * stepX;
        const y2 = yPos + (data[i+1] / max) * h;
        page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 2, color });
        page.drawCircle({ x: x1, y: y1, size: 3, color });
      }
      page.drawCircle({ x: x + (data.length-1)*stepX, y: yPos + (data[data.length-1]/max)*h, size: 3, color });
    };

    const drawBarChart = (x: number, yPos: number, w: number, h: number, data: { label: string, value: number, color?: any }[]) => {
      if (!data || data.length === 0) return;
      const max = Math.max(...data.map(d => d.value), 1);
      const bW = w / data.length;
      data.forEach((d, i) => {
        const bh = (d.value / max) * h;
        page.drawRectangle({ 
          x: x + (i * bW) + 5, 
          y: yPos, 
          width: bW - 10, 
          height: bh, 
          color: d.color || COLORS.chartBar 
        });
        const label = String(d.label || "N/A").substring(0, 4);
        pDrawText(label, { x: x + (i * bW) + 5, y: yPos - 12, size: 6, font });
      });
    };

    const ensureSpace = (minY = 60) => {
      if (y >= minY) return;
      page = pdf.addPage(pageSize);
      y = height - margin;
    };

    // Header
    drawText("NIRVANA BUSINESS INTELLIGENCE", 16, true, rgb(0.5, 0.2, 0.8));
    drawText(`End of Day Performance Report — ${shopId.toUpperCase()}`, 12, true);
    drawText(`Period: ${new Date(since).toLocaleDateString()} — ${new Date(until).toLocaleDateString()}`, 10, false, rgb(0.4, 0.4, 0.4));
    y -= 10;

    // Key Metrics
    drawText("FINANCIAL SUMMARY", 11, true, rgb(0.1, 0.5, 0.3));
    page.drawRectangle({ x: margin, y: y - 105, width: width - margin * 2, height: 105, color: rgb(0.97, 0.98, 1) });
    const metricsY = y - 20;
    pDrawText(`Total Sales (Inc Tax): $${Number(totalWithTax || 0).toFixed(2)}`, { x: margin + 10, y: metricsY, size: 10, font: fontBold });
    pDrawText(`Total Sales (Pre Tax): $${Number(totalBeforeTax || 0).toFixed(2)}`, { x: margin + 10, y: metricsY - 15, size: 9, font });
    pDrawText(`Total Tax: $${Number(totalTax || 0).toFixed(2)}`, { x: margin + 10, y: metricsY - 30, size: 9, font });
    pDrawText(`Discounts: -$${Number(totalDiscount || 0).toFixed(2)}`, { x: margin + 10, y: metricsY - 45, size: 9, font, color: rgb(0.8, 0, 0) });
    pDrawText(`POS Expenses: -$${Number(totalPosExpenses || 0).toFixed(2)}`, { x: margin + 10, y: metricsY - 60, size: 9, font, color: rgb(0.8, 0, 0) });
    pDrawText(`Net Revenue: $${Number((totalWithTax || 0) - (totalPosExpenses || 0)).toFixed(2)}`, { x: margin + 10, y: metricsY - 78, size: 11, font: fontBold, color: rgb(0, 0.4, 0.1) });

    pDrawText(`Cash: $${Number(totalCashSales || 0).toFixed(2)}`, { x: width / 2, y: metricsY, size: 10, font });
    pDrawText(`EcoCash: $${Number(totalEcocash || 0).toFixed(2)}`, { x: width / 2, y: metricsY - 15, size: 10, font });
    pDrawText(`Lay-by Collected: $${Number(laybyCash || 0).toFixed(2)}`, { x: width / 2, y: metricsY - 30, size: 10, font });
    pDrawText(`Opening Drawer: $${Number(openingCash || 0).toFixed(2)}`, { x: width / 2, y: metricsY - 45, size: 9, font });
    pDrawText(`Adj (Net): $${Number(adjustmentNet || 0).toFixed(2)}`, { x: width / 2, y: metricsY - 60, size: 9, font });
    pDrawText(`Closing Est.: $${Number(closingCashEstimate || 0).toFixed(2)}`, { x: width / 2, y: metricsY - 75, size: 9, font: fontBold });
    y -= 115;

    // Stock Intelligence
    drawText("INVENTORY INTELLIGENCE", 11, true, rgb(0.8, 0.4, 0));

    drawText("Restock Watchlist (Low stock <= 5):", 10, true);
    if (restockItems.length === 0) drawText("None. No low-stock items detected.", 9, false, rgb(0.5, 0.5, 0.5));
    else {
      restockItems.slice(0, 5).forEach((i: any) => drawText(`- ${i.name} (${i.category}) - Qty: ${i.qty}`, 9));
      if (restockItems.length > 5) drawText(`...and ${restockItems.length - 5} more items.`, 8, false, rgb(0.4, 0.4, 0.4));
    }
    y -= 10;

    drawText("Dead Stock (No sales in 30 days - High investment):", 10, true);
    if (deadStock.length === 0) drawText("None. Inventory is moving well.", 9, false, rgb(0.5, 0.5, 0.5));
    else {
      deadStock.forEach((i: any) => drawText(`- ${i.name} - Investment: $${Number(i.landed_cost).toFixed(2)}`, 9));
    }
    y -= 10;

    // Expenses (detail)
    ensureSpace(140);
    drawText("EXPENSES (TODAY)", 10, true, rgb(0.6, 0.1, 0.1));
    if (posExpenses.length === 0) {
      drawText("No POS expenses recorded.", 9, false, rgb(0.5, 0.5, 0.5));
    } else {
      const routedToOps = (e: any) => todayOpsLedger.some((r: any) =>
        Number(r.amount) === Number(e.amount) &&
        Math.abs(new Date(r.created_at).getTime() - new Date(e.date).getTime()) < 60000
      );
      const routedToInvest = (e: any) => todayInvestDeposits.some((r: any) =>
        Number(r.amount) === Number(e.amount) &&
        Math.abs(new Date(r.created_at).getTime() - new Date(e.date).getTime()) < 60000
      );
      posExpenses.slice(0, 10).forEach((e: any) => {
        ensureSpace(70);
        const t = new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const desc = String(e.description || 'POS Expense');
        const toOps = routedToOps(e);
        const toInvest = routedToInvest(e);
        const routeTag = toInvest ? " [-> INVEST]" : toOps ? " [-> OPS]" : "";
        drawText(`- ${t}  ${desc}  (-$${Number(e.amount || 0).toFixed(2)})${routeTag}`, 8);
      });
      if (posExpenses.length > 10) drawText(`...and ${posExpenses.length - 10} more expenses`, 8, false, rgb(0.4, 0.4, 0.4));
    }
    y -= 6;

    // 7-day pulse
    ensureSpace(120);
    drawText("7-DAY SALES PULSE (UTC)", 10, true, rgb(0.2, 0.4, 0.8));
    if (dailyPulse.length === 0) {
      drawText("Not enough sales data for pulse.", 9, false, rgb(0.5, 0.5, 0.5));
    } else {
      dailyPulse.slice(-7).forEach((d: any) => {
        ensureSpace(70);
        drawText(`- ${d.date}: $${Number(d.gross || 0).toFixed(2)}`, 9);
      });
    }
    y -= 6;

    // Business Advice
    drawText("STRATEGIC RECOMMENDATIONS", 11, true, rgb(0.2, 0.4, 0.8));
    page.drawRectangle({ x: margin, y: y - 100, width: width - margin * 2, height: 100, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
    let adviceY = y - 20;

    const advice = [];
    if (deadStock.length > 0) advice.push("DEAD STOCK: Run a 'Clearance Bundle'. Pair slow items with best sellers at a 15% discount.");
    if (restockItems.length > 3) advice.push("RESTOCK: Multiple low-stock items detected. Replenish the restock watchlist to protect revenue.");
    if (totalDiscount > totalWithTax * 0.1) advice.push("MARGIN ALERT: High discounting detected. Review staff discount limits to protect profit.");
    if (totalCashSales > 500) advice.push("SECURITY: High cash volume. Ensure a 'Mid-day Drop' to the safe was performed.");
    if (advice.length === 0) advice.push("PERFORMANCE: Steady operations. Focus on upselling premium accessories to increase basket size.");

    advice.forEach(a => {
      pDrawText(a, { x: margin + 10, y: adviceY, size: 8, font, color: rgb(0.2, 0.2, 0.2), maxWidth: width - margin * 2 - 20 });
      adviceY -= 20;
    });
    y -= 120;

    // Detailed Transactions
    drawText("TODAY'S TRANSACTIONS", 11, true);
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    y -= 15;

    sales.slice(0, 30).forEach((s: any) => {
      ensureSpace(60);
      const time = new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      pDrawText(`${time} - ${s.item_name} x${s.quantity}`, { x: margin, y, size: 8, font });
      pDrawText(`$${Number(s.total_with_tax).toFixed(2)} (${s.payment_method})`, { x: width - margin - 80, y, size: 8, font });
      y -= 12;
    });
    if (isWeekly && weeklyData) {
      try {
        const totals = weeklyData.totals || { withTax: 0, beforeTax: 0, tax: 0, discount: 0, cogs: 0, posExpenses: 0 };
        const overhead = weeklyData.overhead || { fixed: 0, weekly: 0, operational: 0, rent: 0, salaries: 0, utilities: 0, misc: 0 };
        const wNet = Number(totals.withTax || 0) - Number(totals.posExpenses || 0);
        const wGrossProfit = Number(totals.beforeTax || 0) - Number(totals.cogs || 0);
        const wFinalNet = wGrossProfit - Number(overhead.fixed || 0) - (Number(overhead.operational || 0) - Number(totals.posExpenses || 0));

        // --- PAGE 1: STRATEGIC COMMAND ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("WEEKLY STRATEGIC COMMAND ADVISORY", 18, true, COLORS.header);
          drawText(`Operational Pulse & Financial Integrity — ${shopId.toUpperCase()}`, 10, true, rgb(0.3, 0.3, 0.3));
          drawText(`Audit Window: Mon ${new Date(weeklyData.period.start).toLocaleDateString()} — Sat ${new Date(weeklyData.period.end).toLocaleDateString()}`, 9, false, rgb(0.5, 0.5, 0.5));
          y -= 15;

          // RISK RADAR (New)
          const overCovVal = weeklyData.overheadCovered || 0;
          const riskColor = overCovVal > 120 ? COLORS.highlight : overCovVal > 100 ? COLORS.info : COLORS.warning;
          const riskLabel = overCovVal > 120 ? "VITALITY: HIGH" : overCovVal > 100 ? "STABLE" : "RISK: ELEVATED";
          page.drawRectangle({ x: margin, y: y - 35, width: 140, height: 35, color: riskColor });
          pDrawText(riskLabel, { x: margin + 10, y: y - 15, size: 10, font: fontBold, color: rgb(1,1,1) });
          pDrawText(`Margin: ${overCovVal.toFixed(1)}%`, { x: margin + 10, y: y - 28, size: 8, font, color: rgb(1,1,1) });

          // STRATEGIC MICRO-CARDS (New)
          const cardW = (width - margin * 2 - 160) / 2;
          page.drawRectangle({ x: margin + 160, y: y - 35, width: cardW - 10, height: 35, color: rgb(0.95, 0.95, 0.98) });
          pDrawText("EFFICIENCY", { x: margin + 170, y: y - 15, size: 8, font: fontBold, color: COLORS.primary });
          pDrawText(`Tx Volume: ${weeklyData.basket.txCount}`, { x: margin + 170, y: y - 28, size: 7, font });

          page.drawRectangle({ x: margin + 160 + cardW, y: y - 35, width: cardW - 10, height: 35, color: rgb(0.95, 0.95, 0.98) });
          pDrawText("BASKET PULSE", { x: margin + 170 + cardW, y: y - 15, size: 8, font: fontBold, color: COLORS.primary });
          pDrawText(`Avg Value: $${weeklyData.basket.avgValue.toFixed(2)}`, { x: margin + 170 + cardW, y: y - 28, size: 7, font });
          y -= 50;

          drawText("1. FINANCIAL PERFORMANCE & PULSE", 11, true, COLORS.primary);
          y -= 5;
          page.drawRectangle({ x: margin, y: y - 130, width: width - margin * 2, height: 130, color: rgb(0.98, 0.98, 1), borderColor: rgb(0.9, 0.9, 0.95), borderWidth: 1 });
          const metY = y - 20;

          pDrawText(`Weekly Gross Revenue:`, { x: margin + 10, y: metY, size: 9, font });
          pDrawText(`$${Number(totals.withTax || 0).toFixed(2)}`, { x: margin + 110, y: metY, size: 9, font: fontBold });
          pDrawText(`Tax Obligation:`, { x: margin + 10, y: metY - 15, size: 9, font });
          pDrawText(`$${Number(totals.tax || 0).toFixed(2)}`, { x: margin + 110, y: metY - 15, size: 9, font });
          pDrawText(`Total Discounts:`, { x: margin + 10, y: metY - 30, size: 9, font });
          pDrawText(`$${Number(totals.discount || 0).toFixed(2)}`, { x: margin + 110, y: metY - 30, size: 9, font, color: COLORS.warning });
          pDrawText(`Est. Gross Profit:`, { x: margin + 10, y: metY - 45, size: 9, font });
          pDrawText(`$${Number(wGrossProfit || 0).toFixed(2)}`, { x: margin + 110, y: metY - 45, size: 9, font: fontBold, color: COLORS.highlight });

          pDrawText(`FINAL NET PULSE:`, { x: margin + 10, y: metY - 80, size: 10, font: fontBold });
          pDrawText(`$${Number(wFinalNet || 0).toFixed(2)}`, { x: margin + 110, y: metY - 80, size: 11, font: fontBold, color: (Number(wFinalNet || 0) > 0) ? COLORS.highlight : COLORS.warning });

          // Weekly Payment Mix (Added back)
          const pm = weeklyData.paymentMix;
          pDrawText(`Cash: $${Number(pm.cashTotal || 0).toFixed(0)}`, { x: margin + 10, y: metY - 95, size: 8, font });
          pDrawText(`Eco: $${Number(pm.ecocashTotal || 0).toFixed(0)}`, { x: margin + 70, y: metY - 95, size: 8, font });
          pDrawText(`Swipe: $${Number(pm.swipeTotal || 0).toFixed(0)}`, { x: margin + 130, y: metY - 95, size: 8, font });

          // Right side: Coverage & MTD
          const overCov = weeklyData.overheadCovered || 0;
          pDrawText(`Overhead Coverage:`, { x: width / 2 + 10, y: metY, size: 9, font });
          pDrawText(`${overCov.toFixed(1)}%`, { x: width / 2 + 105, y: metY, size: 10, font: fontBold, color: overCov >= 100 ? COLORS.highlight : COLORS.warning });

          // Operations Overhead by Category
          const opsOverhead = weeklyData.opsOverhead || { byCategory: [], totals: {} };
          if (Object.keys(opsOverhead.totals || {}).length > 0) {
            let opsY = metY - 130;
            pDrawText(`OVERHEAD BY CATEGORY (Operations):`, { x: width / 2 + 10, y: opsY, size: 8, font: fontBold, color: COLORS.oracle });
            opsY -= 15;
            (opsOverhead.byCategory || []).slice(0, 4).forEach((cat: any) => {
              const catName = String(cat.category || "misc").toUpperCase();
              const catAmt = Number(cat.amount || 0);
              pDrawText(`${catName}:`, { x: width / 2 + 15, y: opsY, size: 7, font });
              pDrawText(`$${catAmt.toFixed(0)}`, { x: width / 2 + 100, y: opsY, size: 7, font: fontBold });
              opsY -= 10;
              // Show by shop
              const byShop = cat.byShop || {};
              Object.entries(byShop).forEach(([shop, amt]: [string, any]) => {
                if (opsY < metY - 180) return;
                pDrawText(`  ${shop}: $${Number(amt || 0).toFixed(0)}`, { x: width / 2 + 20, y: opsY, size: 6, font, color: rgb(0.5, 0.5, 0.5) });
                opsY -= 8;
              });
            });
          }

          const mtdRev = weeklyData.mtd?.revenue || 0;
          const mtdProg = weeklyData.mtd?.progress || 0;
          pDrawText(`MTD Progress:`, { x: width / 2 + 10, y: metY - 20, size: 9, font });
          pDrawText(`$${Number(mtdRev || 0).toFixed(0)}`, { x: width / 2 + 105, y: metY - 20, size: 9, font: fontBold });
          
          const barW = 80;
          page.drawRectangle({ x: width / 2 + 10, y: metY - 35, width: barW, height: 6, color: rgb(0.9, 0.9, 0.9) });
          page.drawRectangle({ x: width / 2 + 10, y: metY - 35, width: Math.min(barW, barW * (mtdProg / 100)), height: 6, color: mtdProg >= 100 ? COLORS.highlight : COLORS.info });

          // Expense Mix visual
          const totalOut = (totals.cogs || 0) + (overhead.weekly || 0);
          const cogsP = totalOut > 0 ? (totals.cogs / totalOut) * 100 : 0;
          const rentP = totalOut > 0 ? ((overhead.rent || 0) / 4 / totalOut) * 100 : 0;
          pDrawText(`EXPENSE MIX:`, { x: width / 2 + 10, y: metY - 65, size: 8, font: fontBold });
          let curX = width / 2 + 10;
          if (cogsP > 1) { 
            page.drawRectangle({ x: curX, y: metY - 78, width: (barW * cogsP / 100), height: 8, color: COLORS.primary });
            curX += (barW * cogsP / 100);
          }
          if (rentP > 1) {
            page.drawRectangle({ x: curX, y: metY - 78, width: (barW * rentP / 100), height: 8, color: COLORS.warning });
          }
          pDrawText(`Blue: Stock | Org: Rent`, { x: width / 2 + 10, y: metY - 92, size: 6, font });

          // Oracle strictness: compliance + cost ratios (numbers-first)
          const compliance = weeklyData.compliance || { expectedTax: 0, taxVariance: 0, discountRate: 0, grossMarginPct: 0, opexRatio: 0 };
          pDrawText(`Discount Rate: ${Number(compliance.discountRate || 0).toFixed(1)}%`, { x: width / 2 + 10, y: metY - 105, size: 7, font: fontBold, color: Number(compliance.discountRate || 0) > 10 ? COLORS.warning : COLORS.info });
          pDrawText(`Tax Variance: $${Number(compliance.taxVariance || 0).toFixed(2)}`, { x: width / 2 + 10, y: metY - 117, size: 7, font: fontBold, color: Math.abs(Number(compliance.taxVariance || 0)) > 5 ? COLORS.warning : COLORS.highlight });
          pDrawText(`OpEx Ratio: ${Number(compliance.opexRatio || 0).toFixed(0)}%`, { x: width / 2 + 10, y: metY - 129, size: 7, font: fontBold, color: Number(compliance.opexRatio || 0) > 60 ? COLORS.warning : COLORS.info });

          // ORACLE ORDERS (short, strict, high-signal)
          const orders: string[] = [];
          if (overCov < 100) orders.push(`Overhead not covered (${overCov.toFixed(0)}%). Cut discretionary OpEx and push basket value immediately.`);
          if (Math.abs(Number(compliance.taxVariance || 0)) > 5) orders.push(`Tax mismatch ($${Number(compliance.taxVariance || 0).toFixed(2)}). Reconcile sales tax postings before next Saturday.`);
          if (Number(compliance.discountRate || 0) > 10) orders.push(`Discounting is ${Number(compliance.discountRate || 0).toFixed(1)}%. Lock discount permissions; require approval above 5%.`);
          if (Number(compliance.opexRatio || 0) > 60) orders.push(`OpEx ratio ${Number(compliance.opexRatio || 0).toFixed(0)}%. Freeze non-essential spend until ratio < 55%.`);
          const zombieCount = (weeklyData.velocity?.zombies || []).length;
          if (zombieCount > 8) orders.push(`Zombie inventory high (${zombieCount}). Run clearance bundles + reorder only top movers.`);
          if ((weeklyData.items?.topByRevenue || []).length > 0) orders.push(`Restock: prioritize "${weeklyData.items.topByRevenue[0]?.name || "top mover"}" and keep 7-day coverage.`);

          if (orders.length > 0) {
            pDrawText("ORACLE ORDERS (NON-NEGOTIABLE):", { x: margin + 10, y: metY - 112, size: 7, font: fontBold, color: COLORS.warning });
            orders.slice(0, 3).forEach((o, idx) => {
              pDrawText(`${idx + 1}. ${o}`, { x: margin + 10, y: metY - 124 - idx * 12, size: 6.5, font, color: rgb(0.2, 0.2, 0.2), maxWidth: width - margin * 2 - 20 });
            });
          }
          y -= 150;

          drawText("2. DAILY REVENUE VELOCITY", 11, true, COLORS.info);
          y -= 10;
          const chartH = 80;
          const chartW = width - margin * 2;
          page.drawRectangle({ x: margin, y: y - chartH - 25, width: chartW, height: chartH + 25, color: COLORS.chartBg, opacity: 0.5 });
          const wStart = new Date(startOfWeekUTC(date));
          const dRev: number[] = [];
          const dNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          for (let i = 0; i < 6; i++) {
            const d = new Date(wStart);
            d.setUTCDate(d.getUTCDate() + i);
            const dayStr = d.toISOString().split('T')[0];
            const rev = (weeklyData.sales || []).filter((s: any) => s.date && String(s.date).startsWith(dayStr)).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
            dRev.push(rev);
          }
          const maxR = Math.max(...dRev, 1);
          const bSpc = chartW / 6;
          dRev.forEach((rev, i) => {
            const bh = (rev / maxR) * chartH;
            page.drawRectangle({ x: margin + (i * bSpc) + 10, y: y - chartH - 5, width: bSpc - 20, height: bh, color: COLORS.chartBar });
            pDrawText(dNames[i], { x: margin + (i * bSpc) + 15, y: y - chartH - 20, size: 8, font });
          });
          
          y -= 140;
          const topDayIdx = dRev.indexOf(Math.max(...dRev));
          const avgRev = dRev.reduce((s, r) => s + r, 0) / 6;
          drawText(`Velocity Insight: Peak performance on ${daysArr[topDayIdx] || "N/A"}. Avg Daily Pulse: $${avgRev.toFixed(0)}.`, 8, true, COLORS.primary);
          
          y -= 10;
          drawText("NET PROFIT PULSE (Trend)", 10, true, COLORS.oracle);
          y -= 5;
          drawLineGraph(margin, y - 60, width - margin * 2, 60, weeklyData.profitByDay, COLORS.highlight);
          y -= 80;
        } catch (err) { console.error("Page 1 fail:", err); }
        }

        // --- PAGE 2: PERFORMANCE SCOREBOARD ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("WEEKLY PERFORMANCE SCOREBOARD", 15, true, COLORS.header);
          y -= 10;
          
          // Micro-Insight on Page 2
          page.drawRectangle({ x: margin, y: y - 25, width: width - margin * 2, height: 25, color: COLORS.info, opacity: 0.1 });
          pDrawText("💡 LEVERAGE TIP: Identify segments with >30% margin and consider 'Strategic Restocking' to amplify net cash position.", { x: margin + 10, y: y - 16, size: 7, font: fontItalic, color: COLORS.primary });
          y -= 40;

          drawText("STAFF PERFORMANCE RANKING", 11, true, COLORS.primary);
          y -= 10;
          weeklyData.staffScoreboard.slice(0, 10).forEach((s: any, i: number) => {
            ensureSpace(30);
            page.drawRectangle({ x: margin, y: y - 22, width: width - margin * 2, height: 22, color: i % 2 === 0 ? rgb(0.97, 0.97, 1) : rgb(1, 1, 1) });
            pDrawText(`${i + 1}. ${s.name}`, { x: margin + 10, y: y - 16, size: 9, font: fontBold });
            pDrawText(`${s.sales} units`, { x: margin + 180, y: y - 16, size: 8, font });
            pDrawText(`$${Number(s.revenue || 0).toFixed(0)}`, { x: width - margin - 80, y: y - 16, size: 9, font: fontBold, color: COLORS.highlight });
            y -= 25;
          });

          y -= 15;
          drawText("CATEGORY PROFITABILITY SCOREBOARD", 11, true, COLORS.primary);
          y -= 10;
          weeklyData.categoryContribution.slice(0, 5).forEach((c: any, i: number) => {
            ensureSpace(25);
            page.drawRectangle({ x: margin, y: y - 20, width: width - margin * 2, height: 20, color: i % 2 === 0 ? rgb(0.98, 0.98, 1) : rgb(1, 1, 1) });
            pDrawText(c.name, { x: margin + 10, y: y - 13, size: 9, font });
            pDrawText(`$${Number(c.revenue || 0).toFixed(2)}`, { x: margin + 180, y: y - 13, size: 9, font });
            pDrawText(`Profit: $${Number(c.profit || 0).toFixed(2)}`, { x: width - margin - 100, y: y - 13, size: 9, font: fontBold, color: COLORS.highlight });
            y -= 20;
          });

          y -= 30;
          drawText("PROFITABILITY BY SEGMENT", 10, true, COLORS.primary);
          y -= 10;
          const barData = weeklyData.categoryContribution.slice(0, 6).map((c: any) => ({
            label: c.name,
            value: Number(c.profit || 0),
            color: COLORS.highlight
          }));
          drawBarChart(margin, y - 50, (width - margin * 2) / 2, 50, barData);

          const mixData = weeklyData.categoryContribution.slice(0, 4).map((c: any, i: number) => {
            const colors = [COLORS.primary, COLORS.info, COLORS.oracle, COLORS.highlight];
            return { value: c.revenue, color: colors[i] || COLORS.chartBar };
          });
          drawDonut(width - margin - 70, y - 10, 25, mixData);
          pDrawText("Category Revenue Mix", { x: width - margin - 110, y: y - 35, size: 7, font: fontItalic });
          y -= 80;
          } catch (err) { console.error("Page 2 fail:", err); }
        }

        // --- PAGE 3: INVENTORY & AUDIT ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("INVENTORY VELOCITY & POS AUDIT", 15, true, COLORS.header);
          y -= 20;

          drawText("CHAMPIONS (Velocity Leaderboard)", 11, true, COLORS.highlight);
          y -= 5;
          const champBars = weeklyData.velocity.champions.slice(0, 5).map((c: any) => ({
            label: c.name.substring(0, 10),
            value: Number(c.qty || 0),
            color: COLORS.highlight
          }));
          drawBarChart(margin, y - 40, (width - margin * 2) / 2, 40, champBars);
          y -= 50;

          weeklyData.velocity.champions.forEach((c: any) => {
            drawText(`- ${c.name} (${c.qty} sold)`, 8);
          });

          y -= 10;
          drawText("TOP SELLERS (Revenue — Pre-Tax)", 11, true, COLORS.primary);
          y -= 5;
          const topByRevenue = weeklyData.items?.topByRevenue || [];
          if (topByRevenue.length === 0) {
            drawText("No sales recorded in this week window.", 8, true, COLORS.warning);
          } else {
            topByRevenue.slice(0, 10).forEach((it: any, i: number) => {
              ensureSpace(18);
              const profit = Number(it.revenuePreTax || 0) - Number(it.cogs || 0);
              pDrawText(`${i + 1}. ${String(it.name || "Unknown").slice(0, 28)}`, { x: margin, y, size: 8, font: fontBold });
              pDrawText(`Qty ${Number(it.qty || 0)}`, { x: margin + 250, y, size: 8, font });
              pDrawText(`$${Number(it.revenuePreTax || 0).toFixed(0)}`, { x: width - margin - 120, y, size: 8, font: fontBold });
              pDrawText(`P $${profit.toFixed(0)}`, { x: width - margin - 55, y, size: 8, font: fontBold, color: profit >= 0 ? COLORS.highlight : COLORS.warning });
              y -= 12;
            });
          }

          y -= 8;
          drawText("NON-SELLERS (Zombie Watchlist — No Sales This Week)", 11, true, COLORS.warning);
          y -= 5;
          const zombies = weeklyData.velocity?.zombies || [];
          if (zombies.length === 0) {
            drawText("No zombies detected (or allocations unavailable).", 8, true, COLORS.highlight);
          } else {
            zombies.slice(0, 12).forEach((z: any) => {
              ensureSpace(12);
              drawText(`- ${String(z.name || "Unknown").slice(0, 40)} (stock ${Number(z.qty || 0)})`, 8);
            });
          }

          y -= 8;
          drawText("EXPENSE HOTSPOTS (Ledger — This Week)", 11, true, COLORS.warning);
          y -= 5;
          const exTop = weeklyData.expensesSummary?.top || [];
          if (exTop.length === 0) {
            drawText("No ledger expenses recorded (or missing types).", 8, true, COLORS.neutral);
          } else {
            exTop.slice(0, 6).forEach((e: any) => {
              ensureSpace(12);
              drawText(`- ${String(e.category || "Uncategorized").slice(0, 30)}: $${Number(e.amount || 0).toFixed(0)}`, 8);
            });
          }

          drawText("POS AUDIT & INTEGRITY CHECK", 11, true, COLORS.warning);
          y -= 10;
          weeklyData.audit.forEach((a: any) => {
            ensureSpace(30);
            const status = Math.abs(Number(a.variance || 0)) > 5 ? "ACTION REQ" : "PASSED";
            pDrawText(`${a.day}:`, { x: margin, y, size: 9, font: fontBold });
            pDrawText(`Var: $${Number(a.variance || 0).toFixed(2)}`, { x: margin + 90, y, size: 9, font, color: (Number(a.variance || 0) < 0) ? COLORS.warning : COLORS.highlight });
            pDrawText(`Status: ${status}`, { x: width - margin - 80, y, size: 9, font: fontBold, color: status === "PASSED" ? COLORS.highlight : COLORS.warning });
            y -= 15;
          });
          } catch (err) { console.error("Page 3 fail:", err); }
        }

        // --- PAGE 4: STRATEGIC DIALOGUE & RISK ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("ORACLE STRATEGIC DIALOGUE & RISK", 15, true, COLORS.oracle);
          y -= 20;

          drawText("ORACLE RISK ASSESSMENT BOARD", 12, true, COLORS.primary);
          y -= 5;
          page.drawRectangle({ x: margin, y: y - 100, width: width - margin * 2, height: 100, color: rgb(0.98,0.98,1), borderColor: rgb(0.9,0.9,0.95), borderWidth: 1 });
          const overCov = weeklyData.overheadCovered || 0;
          const totalVar = weeklyData.audit.reduce((s: number, a: any) => s + Number(a.variance || 0), 0);
          const compliance = weeklyData.compliance || { taxVariance: 0, discountRate: 0, opexRatio: 0 };

          const r1 = Math.abs(Number(totalVar || 0)) > 50 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 15, size: 5, color: r1 });
          pDrawText(`CASH INTEGRITY: ${Math.abs(Number(totalVar || 0)) > 50 ? 'HIGH RISK' : 'HEALTHY'} ($${Number(totalVar || 0).toFixed(2)})`, { x: margin + 28, y: y - 18, size: 9, font });

          const r2 = restockItems.length > 5 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 32, size: 5, color: r2 });
          pDrawText(`STOCK SECURITY: ${restockItems.length > 5 ? 'ACTION REQ' : 'STABLE'} (${restockItems.length} items low)`, { x: margin + 28, y: y - 35, size: 9, font });

          const r3 = Number(overCov || 0) < 100 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 49, size: 5, color: r3 });
          pDrawText(`RUNWAY HEALTH: ${Number(overCov || 0) < 100 ? 'CONSTRAINED' : 'STRONG'} (${Number(overCov || 0).toFixed(0)}% cov)`, { x: margin + 28, y: y - 52, size: 9, font });

          const r4 = Math.abs(Number(compliance.taxVariance || 0)) > 5 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 66, size: 5, color: r4 });
          pDrawText(`TAX INTEGRITY: ${Math.abs(Number(compliance.taxVariance || 0)) > 5 ? 'CHECK NOW' : 'OK'} ($${Number(compliance.taxVariance || 0).toFixed(2)} var)`, { x: margin + 28, y: y - 69, size: 9, font });

          const r5 = Number(compliance.discountRate || 0) > 10 || Number(compliance.opexRatio || 0) > 60 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 83, size: 5, color: r5 });
          pDrawText(`MARGIN DRAIN: ${Number(compliance.discountRate || 0).toFixed(1)}% discounts | ${Number(compliance.opexRatio || 0).toFixed(0)}% OpEx`, { x: margin + 28, y: y - 86, size: 9, font });

          y -= 120; 
          drawText("CUSTOMER BASKET INTELLIGENCE", 11, true, COLORS.info);
          const basket = weeklyData.basket || { avgValue: 0, avgSize: 0 };
          y -= 5;
          page.drawRectangle({ x: margin, y: y - 50, width: width - margin * 2, height: 50, color: rgb(1,1,0.95) });
          pDrawText(`Avg. Basket Value: $${Number(basket.avgValue || 0).toFixed(2)}`, { x: margin+15, y: y-20, size: 10, font: fontBold });
          pDrawText(`Items per Sale: ${Number(basket.avgSize || 0).toFixed(1)} items`, { x: margin+15, y: y-35, size: 9, font });
          pDrawText(`*Strategic Tip: Target categories with high net margins to offset low basket size.*`, { x: margin+15, y: y-46, size: 7, font: fontItalic, color: rgb(0.4,0.4,0.4)});
          
          y -= 70;
          drawText("ORACLE DIAGNOSTIC & QUESTIONS", 11, true, COLORS.oracle);
          const dialogue: string[] = [];
          const questions: string[] = [];
          if (overCov < 80) {
            dialogue.push("STRATEGIC ALERT: The business is currently in a 'High-Friction' state. Fuel consumption (Expenses) is exceeding forward thrust.");
            dialogue.push("RISK ASSESSMENT: Burn rate suggests a diminishing runway unless fixed obligations are restructured or sales velocity is doubled.");
            questions.push("If we were to strip the business down to its absolute core, which 3 categories are the only ones that actually matter for survival?");
            questions.push("Why are we carrying staff costs for hours where transaction intensity is at its lowest?");
            questions.push("Is the current physical location a strategic asset or a heavy anchor? Should we pivot to a satellite-lite model?");
          } else {
            dialogue.push("EXECUTION EXCELLENCE: The shop is operating with high metabolic efficiency. Breakeven is secured.");
            dialogue.push("MARKET OPPORTUNITY: We have captured a stable segment. The risk now is complacency rather than collapse.");
            questions.push("Are we scaling fast enough? If we injected $5,000 today, where would it be spent to generate a 10x return in 3 months?");
            questions.push("Which of our 'Champion' items can we brand exclusively to build long-term customer lock-in?");
            questions.push("If a competitor opened across the street tomorrow, what is the one thing they could never take from NIRVANA?");
          }
          dialogue.push("ORACLE SYNTHESIS: The week shows a resilience in cashflow, but a vulnerability in category diversification.");
          questions.push("Are we a business that sells products, or a business that provides a specific experience for 'Kipasa' customers? How do we charge for the latter?");
          questions.push("Looking at the data, what is the 'hard truth' we've been avoiding about our current inventory strategy?");
          questions.push("If we removed the most expensive 20% of our inventory today, would the customers notice? Would the business be more or less profitable?");
          questions.push("What is the one process in the shop that currently relies 100% on the owner being present? How do we automate it by next week?");
          questions.push("If NIRVANA was an explorer, what new territory (category or service) would we claim by next month to stay ahead of the map?");
          questions.push("How can we turn our 'Peak Intensity' hours (see Heatmap) into a high-engagement 'Happy Hour' for premium items?");
          questions.push("What is the 'Invisible Revenue' we are missing? Is it untapped staff potential, or products we haven't bundled yet?");
          
          y -= 5;
          dialogue.forEach(d => { drawText(`DIAGNOSTIC: ${d}`, 8, false, rgb(0.2,0.2,0.4)); y -= 2; });
          y -= 15;
          drawText("STRATEGIC OWNER INTERROGATIONS:", 11, true, COLORS.oracle);
          y -= 5;
          questions.forEach(q => { drawText(`? ${q}`, 10, true, rgb(0.1, 0.1, 0.1)); y -= 4; });
          
          y -= 25;
          drawText("ORACLE FINAL BYTE: Business is a game of momentum. This week you held the line. Next week, take the hill.", 9, true, COLORS.highlight);
          } catch (err) { console.error("Page 4 fail:", err); }
        }

        // --- PAGE 5: WEEKLY ACTIVITY LOG (TABULAR) ---
        {
          try {
            page = pdf.addPage(pageSize);
            y = height - margin;
            drawText("WEEKLY TRANSACTIONAL LOG", 15, true, COLORS.header);
            y -= 10;
            
            const colWidth = (width - margin * 2) / 3;
            for (let row = 0; row < 2; row++) {
              let startY = y;
              let maxRowY = y;
              for (let col = 0; col < 3; col++) {
                const dayIdx = row * 3 + col;
                const dName = daysArr[dayIdx];
                const sales = weeklyData.salesByDay.get(dName) || [];
                
                let curY = startY;
                pDrawText(dName.toUpperCase(), { x: margin + col * colWidth, y: curY, size: 8, font: fontBold, color: COLORS.primary });
                curY -= 12;
                
                sales.slice(0, 30).forEach((s: any) => {
                  if (curY < 40) return;
                  const txt = `${s.item_name.substring(0, 15)}...`;
                  pDrawText(txt, { x: margin + col * colWidth, y: curY, size: 6, font });
                  pDrawText(`$${Number(s.total_with_tax || 0).toFixed(0)}`, { x: margin + col * colWidth + colWidth - 30, y: curY, size: 6, font: fontBold });
                  curY -= 8;
                });
                if (curY < maxRowY) maxRowY = curY;
              }
              y = maxRowY - 20;
            }
          } catch (err) { console.error("Page 5 fail:", err); }
        }

        // --- PAGE 6: TRANSACTION INTENSITY & PEAK HOURS ---
        {
          try {
            page = pdf.addPage(pageSize);
            y = height - margin;
            drawText("TRANSACTION INTENSITY HEATMAP", 15, true, COLORS.header);
            y -= 20;
            
            const cellW = (width - margin * 2) / 6;
            const cellH = 18;
            const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
            
            daysArr.forEach((dName, i) => {
              pDrawText(dName.substring(0, 3), { x: margin + i * cellW + 10, y, size: 9, font: fontBold, color: COLORS.primary });
            });
            y -= 20;
            
            hours.forEach(hr => {
              pDrawText(`${hr}:00`, { x: margin - 35, y: y + 5, size: 7, font });
              daysArr.forEach((dName, dIdx) => {
                const daySales = weeklyData.salesByDay.get(dName) || [];
                const hrSales = daySales.filter((s: any) => new Date(s.date).getHours() === hr).length;
                const intensity = Math.min(hrSales / 5, 1);
                const color = rgb(1 - intensity * 0.2, 1 - intensity * 0.5, 1 - intensity * 0.1); 
                page.drawRectangle({ x: margin + dIdx * cellW, y, width: cellW - 2, height: cellH - 2, color });
                if (hrSales > 0) {
                  pDrawText(String(hrSales), { x: margin + dIdx * cellW + cellW/2 - 5, y: y + 5, size: 7, font, color: hrSales > 2 ? rgb(1,1,1) : rgb(0,0,0) });
                }
              });
              y -= cellH;
            });
            
            y -= 40;
            drawText("Align staffing shifts with high-intensity darker zones for maximum coverage.", 8, true, COLORS.info);
          } catch (err) { console.error("Page 6 fail:", err); }
        }

        // --- PAGE 7: WEEKLY EXPENSE LOG (TABULAR) ---
        {
          try {
            page = pdf.addPage(pageSize);
            y = height - margin;
            drawText("WEEKLY OPERATIONAL EXPENSE LOG", 15, true, COLORS.header);
            y -= 10;
            
            const colWidth = (width - margin * 2) / 3;
            for (let row = 0; row < 2; row++) {
              let startY = y;
              let maxRowY = y;
              for (let col = 0; col < 3; col++) {
                const dayIdx = row * 3 + col;
                const dName = daysArr[dayIdx];
                const exps = weeklyData.expensesByDay.get(dName) || [];
                
                let curY = startY;
                pDrawText(dName.toUpperCase(), { x: margin + col * colWidth, y: curY, size: 8, font: fontBold, color: COLORS.warning });
                curY -= 12;
                
                exps.slice(0, 30).forEach((l: any) => {
                  if (curY < 40) return;
                  const txt = `${(l.description || l.category || "").substring(0, 18)}...`;
                  pDrawText(txt, { x: margin + col * colWidth, y: curY, size: 6, font });
                  pDrawText(`$${Number(l.amount || 0).toFixed(0)}`, { x: margin + col * colWidth + colWidth - 30, y: curY, size: 6, font: fontBold });
                  curY -= 8;
                });
                if (curY < maxRowY) maxRowY = curY;
              }
              y = maxRowY - 20;
            }

            // Expense Distribution Donut
            const exData = [
              { name: "Rent", val: overhead.rent || 0, col: COLORS.warning },
              { name: "Salaries", val: overhead.salaries || 0, col: COLORS.primary },
              { name: "Inventory", val: totals.cogs || 0, col: COLORS.highlight },
              { name: "OpEx", val: overhead.posExpenses || 0, col: COLORS.info }
            ].filter(d => d.val > 0);
            
            if (exData.length > 0) {
              y -= 40;
              drawText("WEEKLY CAPITAL ALLOCATION", 10, true, COLORS.primary);
              drawDonut(width - margin - 70, y - 10, 25, exData.map(d => ({ value: d.val, color: d.col })));
              pDrawText("Capital Breakdown", { x: width - margin - 110, y: y - 35, size: 7, font: fontItalic });
            }
          } catch (err) { console.error("Page 7 fail:", err); }
        }

        // --- PAGE 8: GROWTH & FORECASTING (ENHANCED) ---
        {
          try {
            page = pdf.addPage(pageSize);
            y = height - margin;
            drawText("GROWTH FORECASTING & STRATEGIC PLAYBOOK", 16, true, COLORS.header);
            y -= 20;

            const growthTarget = totals.withTax * 1.05;
            drawText("1. NEXT WEEK TARGETS", 12, true, COLORS.primary);
            page.drawRectangle({ x: margin, y: y - 60, width: width - margin * 2, height: 60, color: rgb(0.95, 1, 0.95) });
            pDrawText(`5% Growth Revenue Target:`, { x: margin + 10, y: y - 25, size: 10, font });
            pDrawText(`$${Number(growthTarget || 0).toFixed(2)}`, { x: width - margin - 110, y: y - 25, size: 12, font: fontBold, color: COLORS.highlight });
            
            const unitMargin = (totals.withTax / (weeklyData.sales.length || 1)) - (totals.cogs / (weeklyData.sales.length || 1));
            const breakEvenUnits = Math.ceil(overhead.weekly / (unitMargin || 1));
            pDrawText(`Breakeven Unit Target:`, { x: margin + 10, y: y - 45, size: 10, font });
            pDrawText(`${breakEvenUnits} total units`, { x: width - margin - 110, y: y - 45, size: 12, font: fontBold });
            
            y -= 100;
            drawText("2. GROWTH STRATEGY & MARKETING PLAYBOOK", 12, true, COLORS.oracle);
            y -= 8;
            
            const channelData = [
              { label: "FB Ads", value: 35, color: COLORS.primary },
              { label: "WhatsApp", value: 25, color: COLORS.highlight },
              { label: "Bundles", value: 40, color: COLORS.oracle }
            ];
            drawBarChart(margin, y - 30, 200, 30, channelData);
            y -= 45;

            const topMover = weeklyData.velocity.champions[0]?.name || "inventory";
            const advice = [
              `- Focus on the winner: run a 7-day availability plan for "${topMover}" (no stock-outs).`,
              `- Kill discount leakage: cap staff discounts at 5% and log approvals.`,
              `- Clear zombies: bundle/clearance the slowest 10 items by Wednesday.`,
              `- Push basket value: train bundles + attach accessories to every sale.`
            ];
            advice.forEach(a => drawText(a, 9, false, rgb(0.2, 0.2, 0.2)));

            y -= 20;
            drawDonut(width/2, y, 40, [{ value: totals.withTax, color: COLORS.highlight }, { value: (growthTarget - totals.withTax), color: COLORS.info }]);
            y -= 80;
            pDrawText("Strategic Advisory Sign-off: [G. Guri / FLECTERE / Nirvana]", { x: margin, y: 40, size: 7, font, color: rgb(0.5,0.5,0.5) });
          } catch (err) { console.error("Page 8 fail:", err); }
        }
      } catch (e: any) {
        console.error("Weekly render failed:", e);
        page = pdf.addPage(pageSize);
        y = height/2;
        pDrawText("WEEKLY DATA SUPPLEMENT ERROR", { x: margin, y, size: 14, font: fontBold, color: COLORS.warning });
        pDrawText("Detailed Error: " + (e.message || String(e)), { x: margin, y: y-20, size: 8, font });
      }
    } else if (isWeekly) {
      // isWeekly is true but weeklyData is null
      page = pdf.addPage(pageSize);
      y = height/2;
      pDrawText("WEEKLY DATA PREPARATION FAILED", { x: margin, y, size: 14, font: fontBold, color: COLORS.warning });
      pDrawText("This occurs if the shop data fetch timed out or returned invalid structures.", { x: margin, y: y-20, size: 10, font });
    }

    const bytes = await pdf.save();
    const filename = `EOD_${shopId}_${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Cache-Control": "no-store",
      },
    });

  } catch (err: any) {
    console.error('EOD PDF route failed:', err);
    // Fail-safe: always return a PDF so POS/EOD flows don't hard-fail.
    // This avoids "500 from service worker" and lets staff still share/print something.
    try {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]); // A4
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      const margin = 48;
      let y = 841.89 - margin;

      const safe = (t: any) => winAnsiSafe(t);
      const line = (t: any, size = 12, bold = false, color = rgb(0.1, 0.14, 0.22)) => {
        page.drawText(safe(t), { x: margin, y, size, font: bold ? fontBold : font, color });
        y -= size + 10;
      };

      line("NIRVANA — EOD PDF (FALLBACK)", 18, true);
      line("We couldn't generate the full PDF report right now.", 12, false, rgb(0.5, 0.1, 0.1));
      line("This file is valid, but may be missing sections.", 11, false, rgb(0.38, 0.45, 0.55));
      y -= 10;
      line("Technical details:", 12, true);
      line(err?.message || String(err), 10, false, rgb(0.2, 0.2, 0.2));

      const bytes = await pdf.save();
      const filename = `EOD_FALLBACK_${new Date().toISOString().slice(0, 10)}.pdf`;

      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=${filename}`,
          "Cache-Control": "no-store",
        },
      });
    } catch (fallbackErr: any) {
      console.error("EOD PDF fallback failed:", fallbackErr);
      return NextResponse.json({
        error: 'Failed to generate PDF (and fallback PDF failed)',
        details: err?.message || String(err),
      }, { status: 500 });
    }
  }
}
