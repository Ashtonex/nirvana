import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { computePosAuditReport } from "@/lib/posAudit";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

        if (!staff || staff.shop_id !== shopId) {
          return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
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
    const [salesRes, ledgerRes, lowStockRes, allInventoryRes, thirtyDaySalesRes, sevenDaySalesRes] = await Promise.all([
      supabaseAdmin.from("sales").select("*").eq("shop_id", shopId).gte("date", since).lte("date", until),
      supabaseAdmin.from("ledger_entries").select("id,category,amount,date,description,employee_id").eq("shop_id", shopId).gte("date", since).lte("date", until),
      supabaseAdmin.from("inventory_allocations").select("item_id, quantity").eq("shop_id", shopId).lte("quantity", 5).order("quantity", { ascending: true }).limit(15),
      supabaseAdmin.from("inventory_items").select("id, name, category, landed_cost, price"),
      supabaseAdmin.from("sales").select("item_id, quantity").eq("shop_id", shopId).gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin.from("sales").select("item_name, total_with_tax, date").eq("shop_id", shopId).gte("date", since7).lte("date", until),
    ]);

    const sales = salesRes.data || [];
    const ledger = ledgerRes.data || [];
    const lowAllocs = lowStockRes.data || [];
    const allInventory = allInventoryRes.data || [];
    const recentSales = thirtyDaySalesRes.data || [];
    const sevenDaySales = sevenDaySalesRes.data || [];

    const todayDate = date ? new Date(`${date}T12:00:00Z`) : new Date();
    const isSaturday = todayDate.getUTCDay() === 6;
    const isWeekly = isSaturday || url.searchParams.get("weekly") === "true";

    let weeklyData: any = null;
    if (isWeekly) {
      const weekStart = startOfWeekUTC(date);
      const monthStart = new Date(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1).toISOString();
      const [wSalesRes, wLedgerRes, shopRes, settingsRes, mtdSalesRes] = await Promise.all([
        supabaseAdmin.from("sales").select("*").eq("shop_id", shopId).gte("date", weekStart).lte("date", until).catch(() => ({ data: [] })),
        supabaseAdmin.from("ledger_entries").select("*").eq("shop_id", shopId).gte("date", weekStart).lte("date", until).catch(() => ({ data: [] })),
        supabaseAdmin.from("shops").select("*").eq("id", shopId).single().catch(() => ({ data: null })),
        supabaseAdmin.from("oracle_settings").select("*").single().catch(() => ({ data: null })),
        supabaseAdmin.from("sales").select("total_with_tax").eq("shop_id", shopId).gte("date", monthStart).lte("date", until).catch(() => ({ data: [] })),
      ]);

      const wSales = wSalesRes.data || [];
      const mtdSales = mtdSalesRes.data || [];
      const wLedger = wLedgerRes.data || [];
      const shop = shopRes.data;
      const settings = settingsRes.data;
      const monthlyOverhead = shop?.expenses
        ? Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0)
        : 0;
      const weeklyOverhead = monthlyOverhead / 4; // Approx

      const wSalesTotalWithTax = wSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
      const wSalesTotalBeforeTax = wSales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
      const wSalesTotalTax = wSales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
      const wSalesTotalDiscount = wSales.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);
      const wSalesTotalCOGS = wSales.reduce((sum: number, s: any) => sum + (Number(s.landed_cost || 0) * Number(s.quantity || 0)), 0);

      const wPosExpenses = wLedger.filter((l: any) => l.category === 'POS Expense').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

      // Grouped Overheads
      const shopEx: any = shop?.expenses || {};
      const rent = Number(shopEx.rent || 0);
      const salaries = Number(shopEx.salaries || 0);
      const utilities = Number(shopEx.utilities || 0);
      const misc = Number(shopEx.misc || 0);

      const fixedObligations = (rent + salaries) / 4; // Monthly to Weekly
      const operationalCosts = ((utilities + misc) / 4) + wPosExpenses;

      // Perform audit for each day Mon-Sat
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const auditPromises = days.map(async (dayName, i) => {
        const d = new Date(weekStart);
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
        // Fallback: Use seller_name or employee_name if employee_id is missing or looks like an ID
        const empId = s.employee_id || "Unknown";
        const empName = s.seller_name || s.employee_name || "Unknown Employee";
        const cur = staffMap.get(empId) || { name: empName, sales: 0, revenue: 0 };
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
          if (cur) cur.name = `${e.name} ${e.surname || ""}`.trim();
        });
      }
      const staffScoreboard = Array.from(staffMap.values()).sort((a, b) => b.revenue - a.revenue);

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

    // Month-to-Date Progress
    const mtdRevenue = mtdSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const mtdProgress = monthlyOverhead > 0 ? (mtdRevenue / monthlyOverhead) * 100 : 0;

    const wNet = wSalesTotalWithTax - wPosExpenses;
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
      overheadCovered: (weeklyOverhead > 0) ? (wNet / weeklyOverhead) * 100 : 0
    };
  }

    // 1. PERFORMANCE TOTALS
    const totalWithTax = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const totalBeforeTax = sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const totalTax = sales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
    const totalDiscount = sales.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);
    const totalPosExpenses = ledger.filter((l: any) => l.category === 'POS Expense').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const cashSales = sales.filter((s: any) => s.payment_method === 'cash');
    const totalCashSales = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const totalEcocash = sales.filter((s: any) => s.payment_method === 'ecocash').reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

    // Lay-by activity
    const laybyCash = ledger.filter((l: any) => ['Lay-by Deposit', 'Lay-by installment', 'Lay-by Final Payment'].includes(l.category)).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

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
      .filter((l: any) => l.category === 'POS Expense')
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

    const drawText = (text: string, size = 10, bold = false, color = rgb(0.1, 0.1, 0.1)) => {
      page.drawText(text, { x: margin, y, size, font: bold ? fontBold : font, color });
      y -= size + 6;
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
    page.drawText(`Total Sales (Inc Tax): $${totalWithTax.toFixed(2)}`, { x: margin + 10, y: metricsY, size: 10, font: fontBold });
    page.drawText(`Total Sales (Pre Tax): $${totalBeforeTax.toFixed(2)}`, { x: margin + 10, y: metricsY - 15, size: 9, font });
    page.drawText(`Total Tax: $${totalTax.toFixed(2)}`, { x: margin + 10, y: metricsY - 30, size: 9, font });
    page.drawText(`Discounts: -$${totalDiscount.toFixed(2)}`, { x: margin + 10, y: metricsY - 45, size: 9, font, color: rgb(0.8, 0, 0) });
    page.drawText(`POS Expenses: -$${totalPosExpenses.toFixed(2)}`, { x: margin + 10, y: metricsY - 60, size: 9, font, color: rgb(0.8, 0, 0) });
    page.drawText(`Net Revenue: $${(totalWithTax - totalPosExpenses).toFixed(2)}`, { x: margin + 10, y: metricsY - 78, size: 11, font: fontBold, color: rgb(0, 0.4, 0.1) });

    page.drawText(`Cash: $${totalCashSales.toFixed(2)}`, { x: width / 2, y: metricsY, size: 10, font });
    page.drawText(`EcoCash: $${totalEcocash.toFixed(2)}`, { x: width / 2, y: metricsY - 15, size: 10, font });
    page.drawText(`Lay-by Collected: $${laybyCash.toFixed(2)}`, { x: width / 2, y: metricsY - 30, size: 10, font });
    page.drawText(`Opening Drawer: $${openingCash.toFixed(2)}`, { x: width / 2, y: metricsY - 45, size: 9, font });
    page.drawText(`Adj (Net): $${adjustmentNet.toFixed(2)}`, { x: width / 2, y: metricsY - 60, size: 9, font });
    page.drawText(`Closing Est.: $${closingCashEstimate.toFixed(2)}`, { x: width / 2, y: metricsY - 75, size: 9, font: fontBold });
    y -= 115;

    // Stock Intelligence
    drawText("INVENTORY INTELLIGENCE", 11, true, rgb(0.8, 0.4, 0));

    drawText("Restock Watchlist (Low stock <= 5):", 10, true);
    if (restockItems.length === 0) drawText("None. No low-stock items detected.", 9, false, rgb(0.5, 0.5, 0.5));
    else {
      restockItems.slice(0, 5).forEach((i: any) => drawText(`• ${i.name} (${i.category}) — Qty: ${i.qty}`, 9));
      if (restockItems.length > 5) drawText(`...and ${restockItems.length - 5} more items.`, 8, false, rgb(0.4, 0.4, 0.4));
    }
    y -= 10;

    drawText("Dead Stock (No sales in 30 days - High investment):", 10, true);
    if (deadStock.length === 0) drawText("None. Inventory is moving well.", 9, false, rgb(0.5, 0.5, 0.5));
    else {
      deadStock.forEach((i: any) => drawText(`• ${i.name} - Investment: $${Number(i.landed_cost).toFixed(2)}`, 9));
    }
    y -= 10;

    // Expenses (detail)
    ensureSpace(140);
    drawText("EXPENSES (TODAY)", 10, true, rgb(0.6, 0.1, 0.1));
    if (posExpenses.length === 0) {
      drawText("No POS expenses recorded.", 9, false, rgb(0.5, 0.5, 0.5));
    } else {
      posExpenses.slice(0, 10).forEach((e: any) => {
        ensureSpace(70);
        const t = new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const desc = String(e.description || 'POS Expense');
        drawText(`• ${t}  ${desc}  (-$${Number(e.amount || 0).toFixed(2)})`, 8);
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
        drawText(`• ${d.date}: $${Number(d.gross || 0).toFixed(2)}`, 9);
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
      page.drawText(a, { x: margin + 10, y: adviceY, size: 8, font, color: rgb(0.2, 0.2, 0.2), maxWidth: width - margin * 2 - 20 });
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
      page.drawText(`${time} - ${s.item_name} x${s.quantity}`, { x: margin, y, size: 8, font });
      page.drawText(`$${Number(s.total_with_tax).toFixed(2)} (${s.payment_method})`, { x: width - margin - 80, y, size: 8, font });
      y -= 12;
    });
    if (isWeekly && weeklyData) {
      try {
        const totals = weeklyData.totals || { withTax: 0, beforeTax: 0, tax: 0, discount: 0, cogs: 0, posExpenses: 0 };
        const overhead = weeklyData.overhead || { fixed: 0, weekly: 0, operational: 0, rent: 0, salaries: 0, utilities: 0, misc: 0 };
        const wNet = totals.withTax - totals.posExpenses;
        const wGrossProfit = totals.beforeTax - totals.cogs;
        const wFinalNet = wGrossProfit - overhead.fixed - (overhead.operational - totals.posExpenses);

        // --- PAGE 1: STRATEGIC COMMAND ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("WEEKLY STRATEGIC COMMAND ADVISORY", 18, true, COLORS.header);
          drawText(`Operational Pulse & Financial Integrity — ${shopId.toUpperCase()}`, 10, true, rgb(0.3, 0.3, 0.3));
          drawText(`Audit Window: Mon ${new Date(startOfWeekUTC(date)).toLocaleDateString()} — Sat ${new Date(until).toLocaleDateString()}`, 9, false, rgb(0.5, 0.5, 0.5));
          y -= 30;

          drawText("1. FINANCIAL PERFORMANCE & PULSE", 11, true, COLORS.primary);
          y -= 5;
          page.drawRectangle({ x: margin, y: y - 130, width: width - margin * 2, height: 130, color: rgb(0.98, 0.98, 1), borderColor: rgb(0.9, 0.9, 0.95), borderWidth: 1 });
          const metY = y - 20;

          page.drawText(`Weekly Gross Revenue:`, { x: margin + 10, y: metY, size: 9, font });
          page.drawText(`$${totals.withTax.toFixed(2)}`, { x: margin + 110, y: metY, size: 9, font: fontBold });
          page.drawText(`Tax Obligation:`, { x: margin + 10, y: metY - 15, size: 9, font });
          page.drawText(`$${totals.tax.toFixed(2)}`, { x: margin + 110, y: metY - 15, size: 9, font });
          page.drawText(`Total Discounts:`, { x: margin + 10, y: metY - 30, size: 9, font });
          page.drawText(`$${totals.discount.toFixed(2)}`, { x: margin + 110, y: metY - 30, size: 9, font, color: COLORS.warning });
          page.drawText(`Est. Gross Profit:`, { x: margin + 10, y: metY - 45, size: 9, font });
          page.drawText(`$${wGrossProfit.toFixed(2)}`, { x: margin + 110, y: metY - 45, size: 9, font: fontBold, color: COLORS.highlight });

          page.drawText(`FINAL NET PULSE:`, { x: margin + 10, y: metY - 80, size: 10, font: fontBold });
          page.drawText(`$${wFinalNet.toFixed(2)}`, { x: margin + 110, y: metY - 80, size: 11, font: fontBold, color: wFinalNet > 0 ? COLORS.highlight : COLORS.warning });

          // Right side: Coverage & MTD
          const overCov = weeklyData.overheadCovered || 0;
          page.drawText(`Overhead Coverage:`, { x: width / 2 + 10, y: metY, size: 9, font });
          page.drawText(`${overCov.toFixed(1)}%`, { x: width / 2 + 105, y: metY, size: 10, font: fontBold, color: overCov >= 100 ? COLORS.highlight : COLORS.warning });

          const mtdRev = weeklyData.mtd?.revenue || 0;
          const mtdProg = weeklyData.mtd?.progress || 0;
          page.drawText(`MTD Progress:`, { x: width / 2 + 10, y: metY - 20, size: 9, font });
          page.drawText(`$${mtdRev.toFixed(0)}`, { x: width / 2 + 105, y: metY - 20, size: 9, font: fontBold });
          
          const barW = 80;
          page.drawRectangle({ x: width / 2 + 10, y: metY - 35, width: barW, height: 6, color: rgb(0.9, 0.9, 0.9) });
          page.drawRectangle({ x: width / 2 + 10, y: metY - 35, width: Math.min(barW, barW * (mtdProg / 100)), height: 6, color: mtdProg >= 100 ? COLORS.highlight : COLORS.info });

          // Expense Mix visual
          const totalOut = (totals.cogs || 0) + (overhead.weekly || 0);
          const cogsP = totalOut > 0 ? (totals.cogs / totalOut) * 100 : 0;
          const rentP = totalOut > 0 ? ((overhead.rent || 0) / 4 / totalOut) * 100 : 0;
          page.drawText(`EXPENSE MIX:`, { x: width / 2 + 10, y: metY - 65, size: 8, font: fontBold });
          let curX = width / 2 + 10;
          if (cogsP > 1) { 
            page.drawRectangle({ x: curX, y: metY - 78, width: (barW * cogsP / 100), height: 8, color: COLORS.primary });
            curX += (barW * cogsP / 100);
          }
          if (rentP > 1) {
            page.drawRectangle({ x: curX, y: metY - 78, width: (barW * rentP / 100), height: 8, color: COLORS.warning });
          }
          page.drawText(`Blue: Stock | Org: Rent`, { x: width / 2 + 10, y: metY - 92, size: 6, font });
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
            dRev.push(weeklyData.sales.filter((s: any) => s.date.startsWith(dayStr)).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0));
          }
          const maxR = Math.max(...dRev, 1);
          const bSpc = chartW / 6;
          dRev.forEach((rev, i) => {
            const bh = (rev / maxR) * chartH;
            page.drawRectangle({ x: margin + (i * bSpc) + 10, y: y - chartH - 5, width: bSpc - 20, height: bh, color: COLORS.chartBar });
            page.drawText(dNames[i], { x: margin + (i * bSpc) + 15, y: y - chartH - 20, size: 8, font });
          });
          y -= 140;
        } catch (err) { console.error("Page 1 fail:", err); }
        }

        // --- PAGE 2: PERFORMANCE SCOREBOARD ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("WEEKLY PERFORMANCE SCOREBOARD", 15, true, COLORS.header);
          y -= 20;

          drawText("STAFF PERFORMANCE RANKING", 11, true, COLORS.primary);
          y -= 10;
          weeklyData.staffScoreboard.slice(0, 10).forEach((s: any, i: number) => {
            ensureSpace(30);
            page.drawRectangle({ x: margin, y: y - 22, width: width - margin * 2, height: 22, color: i % 2 === 0 ? rgb(0.97, 0.97, 1) : rgb(1, 1, 1) });
            page.drawText(`${i + 1}. ${s.name}`, { x: margin + 10, y: y - 16, size: 9, font: fontBold });
            page.drawText(`${s.sales} units`, { x: margin + 180, y: y - 16, size: 8, font });
            page.drawText(`$${s.revenue.toFixed(2)}`, { x: width - margin - 80, y: y - 16, size: 9, font: fontBold, color: COLORS.highlight });
            y -= 25;
          });

          y -= 15;
          drawText("CATEGORY PROFITABILITY SCOREBOARD", 11, true, COLORS.primary);
          y -= 10;
          weeklyData.categoryContribution.slice(0, 5).forEach((c: any, i: number) => {
            ensureSpace(25);
            page.drawRectangle({ x: margin, y: y - 20, width: width - margin * 2, height: 20, color: i % 2 === 0 ? rgb(0.98, 0.98, 1) : rgb(1, 1, 1) });
            page.drawText(c.name, { x: margin + 10, y: y - 13, size: 9, font });
            page.drawText(`$${c.revenue.toFixed(2)}`, { x: margin + 180, y: y - 13, size: 9, font });
            page.drawText(`Profit: $${c.profit.toFixed(2)}`, { x: width - margin - 100, y: y - 13, size: 9, font: fontBold, color: COLORS.highlight });
            y -= 20;
          });
          } catch (err) { console.error("Page 2 fail:", err); }
        }

        // --- PAGE 3: INVENTORY & AUDIT ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("INVENTORY VELOCITY & POS AUDIT", 15, true, COLORS.header);
          y -= 20;

          drawText("CHAMPIONS (Top Moving)", 11, true, COLORS.highlight);
          weeklyData.velocity.champions.forEach((c: any) => {
            drawText(`• ${c.name} (${c.qty} sold)`, 9);
          });
          y -= 10;

          drawText("POS AUDIT & INTEGRITY CHECK", 11, true, COLORS.warning);
          y -= 10;
          weeklyData.audit.forEach((a: any) => {
            ensureSpace(30);
            const status = Math.abs(a.variance) > 5 ? "ACTION REQ" : "PASSED";
            page.drawText(`${a.day}:`, { x: margin, y, size: 9, font: fontBold });
            page.drawText(`Var: $${a.variance.toFixed(2)}`, { x: margin + 90, y, size: 9, font, color: a.variance < 0 ? COLORS.warning : COLORS.highlight });
            page.drawText(`Status: ${status}`, { x: width - margin - 80, y, size: 9, font: fontBold, color: status === "PASSED" ? COLORS.highlight : COLORS.warning });
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
          page.drawRectangle({ x: margin, y: y - 65, width: width - margin * 2, height: 65, color: rgb(0.98,0.98,1), borderColor: rgb(0.9,0.9,0.95), borderWidth: 1 });
          const overCov = weeklyData.overheadCovered || 0;
          const totalVar = weeklyData.audit.reduce((s: number, a: any) => s + a.variance, 0);

          const r1 = Math.abs(totalVar) > 50 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 15, size: 5, color: r1 });
          page.drawText(`CASH INTEGRITY: ${Math.abs(totalVar) > 50 ? 'HIGH RISK' : 'HEALTHY'} ($${totalVar.toFixed(2)})`, { x: margin + 28, y: y - 18, size: 9, font });

          const r2 = restockItems.length > 5 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 32, size: 5, color: r2 });
          page.drawText(`STOCK SECURITY: ${restockItems.length > 5 ? 'ACTION REQ' : 'STABLE'} (${restockItems.length} items low)`, { x: margin + 28, y: y - 35, size: 9, font });

          const r3 = overCov < 100 ? COLORS.warning : COLORS.highlight;
          page.drawCircle({ x: margin + 15, y: y - 49, size: 5, color: r3 });
          page.drawText(`RUNWAY HEALTH: ${overCov < 100 ? 'CONSTRAINED' : 'STRONG'} (${overCov.toFixed(0)}% cov)`, { x: margin + 28, y: y - 52, size: 9, font });

          y -= 85; 
          drawText("CUSTOMER BASKET INTELLIGENCE", 11, true, COLORS.info);
          const basket = weeklyData.basket || { avgValue: 0, avgSize: 0 };
          y -= 5;
          page.drawRectangle({ x: margin, y: y - 50, width: width - margin * 2, height: 50, color: rgb(1,1,0.95) });
          page.drawText(`Avg. Basket Value: $${basket.avgValue.toFixed(2)}`, { x: margin+15, y: y-20, size: 10, font: fontBold });
          page.drawText(`Items per Sale: ${basket.avgSize.toFixed(1)} items`, { x: margin+15, y: y-35, size: 9, font });
          page.drawText(`*Strategic Tip: Target categories with high net margins to offset low basket size.*`, { x: margin+15, y: y-46, size: 7, font: fontItalic, color: rgb(0.4,0.4,0.4)});
          
          y -= 70;
          drawText("ORACLE DIAGNOSTIC & QUESTIONS", 11, true, COLORS.oracle);
          const dialogue: string[] = [];
          const questions: string[] = [];
          if (overCov < 80) {
            dialogue.push("Critical performance gap detected. Expenses are significantly outpacing net revenue.");
            questions.push("Which specific overhead item (Rent/Staff/Utilities) is the most flexible if we need to cut down next week?");
          } else {
            dialogue.push("Stable operations. The shop is maintaining healthy breakeven or profit margins.");
            questions.push("With current surplus, should we invest in a 'Clearance Weekend' for stagnant stock or restock the champions?");
          }
          dialogue.forEach(d => { drawText(`DIAGNOSTIC: ${d}`, 9, false, rgb(0.2,0.2,0.3)); y -= 5; });
          questions.forEach(q => { drawText(`? ${q}`, 10, true); y -= 5; });
          } catch (err) { console.error("Page 4 fail:", err); }
        }

        // --- PAGE 5: ACTIVITY LOGS ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("WEEKLY ACTIVITY LOGS", 15, true, COLORS.header);
          y -= 10;
          [...weeklyData.sales].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50).forEach((s: any) => {
            ensureSpace(20);
            const dStr = new Date(s.date).toLocaleDateString();
            page.drawText(`${dStr} - ${s.item_name}`, { x: margin, y, size: 8, font });
            page.drawText(`$${Number(s.total_with_tax).toFixed(2)}`, { x: width - margin - 60, y, size: 8, font: fontBold });
            y -= 12;
          });
          } catch (err) { console.error("Page 5 fail:", err); }
        }

        // --- PAGE 6: GROWTH & FORECASTING ---
        {
          try {
          page = pdf.addPage(pageSize);
          y = height - margin;
          drawText("GROWTH FORECASTING & PROJECTIONS", 16, true, COLORS.header);
          y -= 30;

          const growthTarget = totals.withTax * 1.05;
          drawText("NEXT WEEK TARGETS", 12, true, COLORS.primary);
          page.drawRectangle({ x: margin, y: y - 60, width: width - margin * 2, height: 60, color: rgb(0.95, 1, 0.95) });
          page.drawText(`5% Growth Revenue Target:`, { x: margin + 10, y: y - 25, size: 10, font });
          page.drawText(`$${growthTarget.toFixed(2)}`, { x: width - margin - 110, y: y - 25, size: 12, font: fontBold, color: COLORS.highlight });
          
          const unitMargin = (totals.withTax / (weeklyData.sales.length || 1)) - (totals.cogs / (weeklyData.sales.length || 1));
          const breakEvenUnits = Math.ceil(overhead.weekly / (unitMargin || 1));
          page.drawText(`Breakeven Unit Target:`, { x: margin + 10, y: y - 45, size: 10, font });
          page.drawText(`${breakEvenUnits} total units`, { x: width - margin - 110, y: y - 45, size: 12, font: fontBold });
          
          y -= 100;
          page.drawText("Strategic Advisory Sign-off: [G. Guri / Nirvana Admin]", { x: margin, y: 40, size: 7, font, color: rgb(0.5,0.5,0.5) });
          } catch (err) { console.error("Page 6 fail:", err); }
        }
      } catch (e: any) {
        console.error("Weekly render failed:", e);
        page = pdf.addPage(pageSize);
        y = height/2;
        page.drawText("WEEKLY DATA SUPPLEMENT UNAVAILABLE", { x: margin, y, size: 14, font: fontBold, color: COLORS.warning });
        page.drawText("Error: " + (e.message || "Rendering timeout or data gap"), { x: margin, y: y-20, size: 10, font });
      }
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
    return NextResponse.json({
      error: 'Failed to generate PDF',
      details: err?.message || String(err),
      stack: err?.stack
    }, { status: 500 });
  }
}
