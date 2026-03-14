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
    supabaseAdmin.from("ledger_entries").select("*").eq("shop_id", shopId).gte("date", since).lte("date", until),
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
    const [wSales, wLedger, shopRes, settingsRes] = await Promise.all([
      supabaseAdmin.from("sales").select("*").eq("shop_id", shopId).gte("date", weekStart).lte("date", until),
      supabaseAdmin.from("ledger_entries").select("*").eq("shop_id", shopId).gte("date", weekStart).lte("date", until),
      supabaseAdmin.from("shops").select("*").eq("id", shopId).single(),
      supabaseAdmin.from("oracle_settings").select("*").single(),
    ]);

    const shop = shopRes.data;
    const settings = settingsRes.data;
    const monthlyOverhead = shop?.expenses 
      ? Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0) 
      : 0;
    const weeklyOverhead = monthlyOverhead / 4; // Approx

    const auditResults = [];
    // Perform audit for each day Mon-Sat
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      const dayStr = d.toISOString().split('T')[0];
      try {
        const audit = await computePosAuditReport({ shopId, dateYYYYMMDD: dayStr });
        auditResults.push({ day: days[i], date: dayStr, variance: audit.variance.amount || 0, flags: audit.flags });
      } catch (e) {
        auditResults.push({ day: days[i], date: dayStr, variance: 0, flags: [] });
      }
    }

    weeklyData = {
      sales: wSales.data || [],
      ledger: wLedger.data || [],
      overhead: { monthly: monthlyOverhead, weekly: weeklyOverhead },
      audit: auditResults,
      settings: settings || {}
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

  // --- WEEKLY REPORT SECTIONS ---
  if (isWeekly && weeklyData) {
    page = pdf.addPage(pageSize);
    y = height - margin;

    drawText("WEEKLY STRATEGIC COMMAND ADVISORY", 18, true, COLORS.header);
    drawText(`Performance Audit & Operational Pulse — ${shopId.toUpperCase()}`, 12, true);
    drawText(`Week: Mon ${new Date(startOfWeekUTC(date)).toLocaleDateString()} — Sat ${new Date(until).toLocaleDateString()}`, 10, false, rgb(0.4, 0.4, 0.4));
    y -= 15;

    // Weekly Totals
    const wTotalWithTax = weeklyData.sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const wTotalBeforeTax = weeklyData.sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const wTotalTax = weeklyData.sales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
    const wExpenses = weeklyData.ledger.filter((l: any) => l.category === 'POS Expense').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
    const wNet = wTotalWithTax - wExpenses;
    const overheadCovered = (wNet / weeklyData.overhead.weekly) * 100;

    drawText("WEEKLY FINANCIAL CONTEXT", 11, true, COLORS.primary);
    page.drawRectangle({ x: margin, y: y - 100, width: width - margin * 2, height: 100, color: rgb(0.98, 0.98, 1) });
    const wMetricsY = y - 20;
    page.drawText(`Weekly Gross Revenue: $${wTotalWithTax.toFixed(2)}`, { x: margin + 10, y: wMetricsY, size: 10, font: fontBold });
    page.drawText(`Weekly Pre-Tax Revenue: $${wTotalBeforeTax.toFixed(2)}`, { x: margin + 10, y: wMetricsY - 15, size: 9, font });
    page.drawText(`Weekly Sales Tax: $${wTotalTax.toFixed(2)}`, { x: margin + 10, y: wMetricsY - 30, size: 9, font });
    page.drawText(`Weekly Total Expenses: $${wExpenses.toFixed(2)}`, { x: margin + 10, y: wMetricsY - 45, size: 9, font });
    page.drawText(`Weekly Net Revenue: $${wNet.toFixed(2)}`, { x: margin + 10, y: wMetricsY - 65, size: 11, font: fontBold, color: COLORS.highlight });

    page.drawText(`Overhead Target (Weekly): $${weeklyData.overhead.weekly.toFixed(2)}`, { x: width / 2, y: wMetricsY, size: 9, font });
    page.drawText(`Coverage Status: ${overheadCovered.toFixed(1)}%`, { x: width / 2, y: wMetricsY - 15, size: 10, font: fontBold, color: overheadCovered >= 100 ? COLORS.highlight : COLORS.warning });
    
    // Progress Bar for Overhead
    const barW = (width - margin * 2) / 2;
    page.drawRectangle({ x: width / 2, y: wMetricsY - 35, width: barW - 20, height: 10, color: rgb(0.9, 0.9, 0.9) });
    page.drawRectangle({ x: width / 2, y: wMetricsY - 35, width: (Math.min(100, overheadCovered) / 100) * (barW - 20), height: 10, color: overheadCovered >= 100 ? COLORS.highlight : COLORS.primary });

    y -= 100;

    // Daily Pulse Chart (Simple)
    drawText("DAILY REVENUE PULSE (MON-SAT)", 11, true, COLORS.info);
    const chartHeight = 100;
    const chartWidth = width - margin * 2;
    page.drawRectangle({ x: margin, y: y - chartHeight - 20, width: chartWidth, height: chartHeight + 20, color: COLORS.chartBg });
    
    const wStart = new Date(startOfWeekUTC(date));
    const dailyRev: number[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(wStart);
      d.setUTCDate(d.getUTCDate() + i);
      const dayStr = d.toISOString().split('T')[0];
      const dayRev = weeklyData.sales
        .filter((s: any) => s.date.startsWith(dayStr))
        .reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
      dailyRev.push(dayRev);
    }
    const maxRev = Math.max(...dailyRev, 1);
    const barSpacing = chartWidth / 6;
    const barActualW = barSpacing * 0.6;

    dailyRev.forEach((rev, i) => {
      const barH = (rev / maxRev) * chartHeight;
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      page.drawRectangle({
        x: margin + (i * barSpacing) + (barSpacing - barActualW) / 2,
        y: y - chartHeight - 10,
        width: barActualW,
        height: barH,
        color: COLORS.chartBar
      });
      page.drawText(days[i], { x: margin + (i * barSpacing) + barSpacing / 4, y: y - chartHeight - 25, size: 8, font });
      page.drawText(`$${rev.toFixed(0)}`, { x: margin + (i * barSpacing) + barSpacing / 8, y: y - chartHeight + barH - 5, size: 7, font: fontBold, color: rgb(1, 1, 1) });
    });
    y -= 150;

    // Top Product
    const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
    weeklyData.sales.forEach((s: any) => {
      const cur = itemMap.get(s.item_id) || { name: s.item_name, qty: 0, gross: 0 };
      cur.qty += Number(s.quantity);
      cur.gross += Number(s.total_with_tax);
      itemMap.set(s.item_id, cur);
    });
    const topMover = [...itemMap.values()].sort((a, b) => b.qty - a.qty)[0];

    drawText("WEEKLY TOP PERFORMANCE", 11, true);
    if (topMover) {
      page.drawRectangle({ x: margin, y: y - 45, width: width - margin * 2, height: 45, color: rgb(0.95, 0.98, 0.95), borderColor: COLORS.highlight, borderWidth: 1 });
      page.drawText(`MVP PRODUCT: ${topMover.name.toUpperCase()}`, { x: margin + 15, y: y - 20, size: 12, font: fontBold, color: COLORS.highlight });
      page.drawText(`Total Sold: ${topMover.qty} Units  |  Total Revenue: $${topMover.gross.toFixed(2)}`, { x: margin + 15, y: y - 35, size: 9, font });
    }
    y -= 65;

    // POS Audit Summary
    drawText("POS AUDIT & INTEGRITY CHECK", 11, true, COLORS.warning);
    y -= 5;
    weeklyData.audit.forEach((a: any) => {
      ensureSpace(40);
      const status = Math.abs(a.variance) > 1 ? "FAILED" : "PASSED";
      const color = status === "FAILED" ? COLORS.warning : COLORS.highlight;
      page.drawText(`${a.day}:`, { x: margin, y, size: 9, font: fontBold });
      page.drawText(`Variance: $${a.variance.toFixed(2)}`, { x: margin + 80, y, size: 9, font, color: a.variance < 0 ? COLORS.warning : a.variance > 0 ? COLORS.highlight : rgb(0.4, 0.4, 0.4) });
      page.drawText(`Status: ${status}`, { x: width - margin - 80, y, size: 9, font: fontBold, color });
      y -= 12;
      if (a.flags.length > 0) {
        a.flags.slice(0, 1).forEach((f: any) => {
          page.drawText(`  ! ${f.message}`, { x: margin + 10, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
          y -= 10;
        });
      }
    });
    y -= 10;

    // Weekly Transaction Log
    ensureSpace(120);
    drawText("WEEKLY TRANSACTION LOG (HIGHLIGHTS)", 11, true, COLORS.primary);
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
    y -= 15;
    
    // Sort by date descending
    const sortedWSales = [...weeklyData.sales].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    sortedWSales.slice(0, 40).forEach((s: any) => {
      ensureSpace(40);
      const d = new Date(s.date);
      const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
      page.drawText(`${dayName} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${s.item_name} x${s.quantity}`, { x: margin, y, size: 7, font });
      page.drawText(`$${Number(s.total_with_tax).toFixed(2)}`, { x: width - margin - 50, y, size: 7, font });
      y -= 9;
    });
    if (sortedWSales.length > 40) drawText(`...and ${sortedWSales.length - 40} more transactions this week.`, 7, false, rgb(0.4, 0.4, 0.4));
    y -= 10;

    // Weekly Expense Log
    ensureSpace(120);
    drawText("WEEKLY EXPENSE LOG", 11, true, rgb(0.8, 0, 0));
    y -= 5;
    const wPosExpenses = weeklyData.ledger.filter((l: any) => l.category === 'POS Expense').sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    wPosExpenses.forEach((e: any) => {
      ensureSpace(40);
      const d = new Date(e.date);
      const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
      const desc = String(e.description || e.category || 'Expense');
      page.drawText(`${dayName} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${desc}`, { x: margin, y, size: 7, font });
      page.drawText(`-$${Number(e.amount || 0).toFixed(2)}`, { x: width - margin - 50, y, size: 7, font, color: COLORS.warning });
      y -= 9;
    });

    // Oracle Strategic Dialogue (NEW PAGE)
    page = pdf.addPage(pageSize);
    y = height - margin;

    drawText("ORACLE STRATEGIC DIALOGUE", 16, true, COLORS.oracle);
    drawText("Direct advisory from Nirvana Intelligence", 10, false, rgb(0.4, 0.4, 0.4));
    y -= 25;

    const dialogue = [];
    const questions = [];

    // Analyze performance for dialogue
    if (overheadCovered < 80) {
      dialogue.push("Shop performance is critically low this week. We are struggling to cover basic overhead. We need to identify if this is a foot traffic issue or a conversion problem.");
      questions.push("Wait, if our rent is $"+weeklyData.overhead.monthly+" and we only cleared $"+wNet.toFixed(2)+" profit this week, can we survive next month without a capital injection?");
    } else if (overheadCovered < 100) {
      dialogue.push("We are at the breakeven point. Operations are covering themselves, but there is no growth capital being generated.");
      questions.push("I noticed our best day was "+dailyRev.indexOf(Math.max(...dailyRev))+"—was there a specific campaign that day we can repeat?");
    } else {
      dialogue.push("Exceptional performance. The shop is scaling and generating healthy net profit after all theoretical overhead.");
      questions.push("We are $"+(wNet - weeklyData.overhead.weekly).toFixed(2)+" above target. Shall we reinvest this into more '"+(topMover?.name || 'inventory')+"' or keep it as a safety buffer?");
    }

    // Variance check
    const totalVar = weeklyData.audit.reduce((s: number, a: any) => s + a.variance, 0);
    if (Math.abs(totalVar) > 10) {
      dialogue.push("Significant cash variance detected across the week. This is a system-wide integrity risk.");
      questions.push("We lost $"+Math.abs(totalVar).toFixed(2)+" in literal cash differences this week. Who was handling the drawer during the shifts with the highest variances?");
    }

    // Inventory check
    if (topMover && topMover.qty > 50) {
      dialogue.push("The velocity of "+topMover.name+" is impressive. It constitutes a major part of our weekly cashflow.");
      questions.push("If we ran out of '"+topMover.name+"' today, how much would our Monday revenue drop? Do we have enough buffer stock?");
    }

    // Rendering Dialogue
    drawText("OPERATIONAL DIAGNOSTIC:", 11, true, COLORS.oracle);
    y -= 5;
    dialogue.forEach(d => {
      ensureSpace(80);
      page.drawRectangle({ x: margin, y: y - 45, width: width - margin * 2, height: 40, color: rgb(0.97, 0.95, 0.98), borderColor: COLORS.oracle, borderWidth: 0.5 });
      page.drawText(d, { x: margin + 10, y: y - 25, size: 9, font, color: rgb(0.2, 0.2, 0.3), maxWidth: width - margin * 2 - 20 });
      y -= 55;
    });

    y -= 15;
    drawText("STRATEGIC QUESTIONS FOR THE OWNER:", 11, true, rgb(0.2, 0.2, 0.2));
    y -= 10;
    questions.forEach((q, idx) => {
      ensureSpace(60);
      page.drawCircle({ x: margin + 5, y: y + 2, size: 3, color: COLORS.oracle });
      page.drawText(q, { x: margin + 20, y: y - 5, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1), maxWidth: width - margin * 2 - 40 });
      y -= 45;
    });

    // Sign-off
    ensureSpace(100);
    y = 60;
    page.drawText("This report is confidential and intended for management only. Generated by Nirvana Oracle.", { x: margin, y, size: 7, font, color: rgb(0.6, 0.6, 0.6) });
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

  } catch (err) {
    console.error('EOD PDF route failed:', err);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
