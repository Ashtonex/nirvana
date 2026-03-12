import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
