import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId") || "";
  const isTest = url.searchParams.get("test") === "true";
  const date = url.searchParams.get("date"); // YYYY-MM-DD (optional)
  
  if (!shopId) {
    return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
  }

  // Skip auth for test mode (test button)
  if (!isTest) {
    const cookieStore = await cookies();
    const staffToken = cookieStore.get("nirvana_staff")?.value;
    const ownerToken = cookieStore.get("nirvana_owner")?.value;

    // Require either staff or owner session
    if (!staffToken && !ownerToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If staff is logged in, enforce shop match as before
    if (staffToken) {
      const tokenHash = createHash("sha256").update(staffToken).digest("hex");
      const { data: session } = await supabaseAdmin
        .from("staff_sessions")
        .select("employee_id, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: "Session expired" }, { status: 401 });
      }

      const { data: staff } = await supabaseAdmin
        .from("employees")
        .select("id, shop_id, name, surname")
        .eq("id", session.employee_id)
        .maybeSingle();

      if (!staff) {
        return NextResponse.json({ error: "Staff not found" }, { status: 401 });
      }
      if (staff.shop_id !== shopId) {
        return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
      }
    }

    // If only owner is logged in (no staff token), we trust AccessGate/owner auth
    // and do not enforce a shop match here. The owner can generate for any shopId.
  }

  const since = startOfDayUTC(date);
  const until = endOfDayUTC(date);

  // Fetch Sales
  const { data: sales, error: salesErr } = await supabaseAdmin
    .from("sales")
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method,discount_applied")
    .eq("shop_id", shopId)
    .gte("date", since)
    .lte("date", until);

  // Fetch Ledger (Opening Balance, POS Expenses, Lay-by cash)
  const { data: ledger, error: ledgerErr } = await supabaseAdmin
    .from("ledger_entries")
    .select("category,amount,date,description")
    .eq("shop_id", shopId)
    .gte("date", since)
    .lte("date", until);

  // Fetch Inventory for Restock Alerts
  const { data: inventory, error: invErr } = await supabaseAdmin
    .from("inventory_items")
    .select("id, name, category, inventory_allocations(shop_id, quantity)");

  if (salesErr || ledgerErr || invErr) {
    console.error("PDF generation error:", salesErr, ledgerErr, invErr);
    return NextResponse.json({ error: `Database error: ${salesErr?.message || ledgerErr?.message || invErr?.message}` }, { status: 500 });
  }

  const rows = sales || [];
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
  const totalDiscount = rows.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);

  // Cash Reconciliation Logic
  const openingEntry = (ledger || []).find((l: any) => l.category === 'Cash Drawer Opening');
  const openingBalance = Number(openingEntry?.amount || 0);

  const cashSales = rows.filter((s: any) => s.payment_method === 'cash');
  const totalCashSales = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

  const posExpenses = (ledger || []).filter((l: any) => l.category === 'POS Expense');
  const totalPosExpenses = posExpenses.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

  // Lay-by ledger activity (cash movements)
  const laybyDeposits = (ledger || []).filter((l: any) => l.category === 'Lay-by Deposit');
  const laybyInstallments = (ledger || []).filter((l: any) => l.category === 'Lay-by installment');
  const laybyFinals = (ledger || []).filter((l: any) => l.category === 'Lay-by Final Payment');

  const totalLaybyDeposit = laybyDeposits.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const totalLaybyInstall = laybyInstallments.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const totalLaybyFinal = laybyFinals.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const totalLaybyCash = totalLaybyDeposit + totalLaybyInstall + totalLaybyFinal;

  const closingCashBalance = openingBalance + totalCashSales - totalPosExpenses;

  const ecocashSales = rows.filter((s: any) => s.payment_method === 'ecocash');
  const totalEcocash = ecocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

  // Lay-by position (outstanding vs collected) from quotations
  const { data: laybyQuotes } = await supabaseAdmin
    .from("quotations")
    .select("shop_id,total_with_tax,paid_amount,status")
    .eq("shop_id", shopId)
    .in("status", ["layby", "converted"]);

  const laybyRows = laybyQuotes || [];
  const laybyOutstanding = laybyRows
    .filter((q: any) => q.status === "layby")
    .reduce((sum: number, q: any) => {
      const total = Number(q.total_with_tax || 0);
      const paid = Number(q.paid_amount || 0);
      return sum + Math.max(0, total - paid);
    }, 0);

  const laybyCollectedToDate = laybyRows.reduce(
    (sum: number, q: any) => sum + Number(q.paid_amount || 0),
    0
  );

  // Restock logic
  const outOfStockItems = (inventory || []).filter((item: any) => {
    const alloc = (item.inventory_allocations || []).find((a: any) => a.shop_id === shopId);
    return alloc && Number(alloc.quantity) <= 0;
  }).map((item: any) => ({
    name: item.name,
    category: item.category
  }));

  const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
  for (const s of rows as any[]) {
    const key = s.item_name || "Unknown";
    const cur = itemMap.get(key) || { name: key, qty: 0, gross: 0 };
    cur.qty += Number(s.quantity || 0);
    cur.gross += Number(s.total_with_tax || 0);
    itemMap.set(key, cur);
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 10);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = height - margin;

  const drawText = (text: string, size = 11, bold = false, color = rgb(0.1, 0.14, 0.22)) => {
    page.drawText(text, { x: margin, y, size, font: bold ? fontBold : font, color });
    y -= size + 6;
  };

  // Header
  drawText("NIRVANA", 18, true);
  drawText(`End of Day Report — ${shopId.toUpperCase()}`, 14, true);
  drawText(`Generated: ${new Date().toLocaleString()}`, 10, false, rgb(0.38, 0.45, 0.55));
  y -= 8;

  // Overview Box
  const boxTop = y;
  const boxHeight = 110;
  page.drawRectangle({
    x: margin, y: boxTop - boxHeight, width: width - margin * 2, height: boxHeight,
    borderColor: rgb(0.85, 0.88, 0.92), borderWidth: 1, color: rgb(0.96, 0.97, 0.98),
  });
  y = boxTop - 20;
  page.drawText(`Daily Sales Summary`, { x: margin + 12, y, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  y -= 18;
  page.drawText(`Transactions: ${rows.length}`, { x: margin + 12, y, size: 11, font: fontBold, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Total (inc tax): $${totalWithTax.toFixed(2)}`, { x: margin + 12, y, size: 11, font: fontBold, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Total (pre tax): $${totalBeforeTax.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Tax: $${totalTax.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Discounts Issued: -$${totalDiscount.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.8, 0.1, 0.1) });
  y -= 18;
  page.drawText(`Expenses: -$${totalPosExpenses.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.8, 0.1, 0.1) });

  y = boxTop - boxHeight - 20;

  // Cash Reconciliation Box
  const reconTop = y;
  const reconHeight = 110;
  page.drawRectangle({
    x: margin, y: reconTop - reconHeight, width: width - margin * 2, height: reconHeight,
    borderColor: rgb(0.1, 0.6, 0.3), borderWidth: 1, color: rgb(0.94, 1.0, 0.96),
  });
  y = reconTop - 20;
  page.drawText(`Cash Drawer Reconciliation`, { x: margin + 12, y, size: 10, font: fontBold, color: rgb(0.1, 0.4, 0.2) });
  y -= 18;
  page.drawText(`1. Opening Cash: $${openingBalance.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`2. Total Cash Sales: $${totalCashSales.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`3. POS Expenses: -$${totalPosExpenses.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.8, 0.1, 0.1) });
  y -= 18;
  page.drawText(`= Final Closing Cash: $${closingCashBalance.toFixed(2)}`, { x: margin + 12, y, size: 12, font: fontBold, color: rgb(0.1, 0.14, 0.22) });

  y = reconTop - reconHeight - 30;

  // Payments & Items Header
  drawText("Payments Overview", 12, true);
  page.drawText(`Cash: $${totalCashSales.toFixed(2)}`, { x: margin, y, size: 10, font, color: rgb(0.38, 0.45, 0.55) });
  y -= 14;
  page.drawText(`EcoCash: $${totalEcocash.toFixed(2)}`, { x: margin, y, size: 10, font, color: rgb(0.38, 0.45, 0.55) });
  y -= 14;

  // Lay-by cash activity (today)
  if (totalLaybyCash > 0 || laybyOutstanding > 0) {
    y -= 6;
    drawText("Lay-by Activity (Cash Today)", 11, true);
    page.drawText(
      `Deposits: $${totalLaybyDeposit.toFixed(2)} • Installments: $${totalLaybyInstall.toFixed(2)} • Final: $${totalLaybyFinal.toFixed(2)}`,
      { x: margin, y, size: 9, font, color: rgb(0.38, 0.45, 0.55) }
    );
    y -= 14;
    page.drawText(
      `Total Lay-by Cash Today: $${totalLaybyCash.toFixed(2)}`,
      { x: margin, y, size: 10, font: fontBold, color: rgb(0.1, 0.4, 0.2) }
    );
    y -= 14;
    page.drawText(
      `Lay-by Position: Outstanding $${laybyOutstanding.toFixed(2)} • Collected to Date $${laybyCollectedToDate.toFixed(2)}`,
      { x: margin, y, size: 9, font, color: rgb(0.38, 0.45, 0.55) }
    );
    y -= 18;
  } else {
    y -= 24;
  }

  // Get top item names for highlighting
  const topItemNames = new Set(topItems.slice(0, 5).map(i => i.name));

  // ALL SALES TODAY
  drawText("All Sales Today", 12, true);

  // Table header
  const colTime = margin;
  const colItem = margin + 60;
  const colQty = width - margin - 100;
  const colDiscount = width - margin - 40;
  const colGross = width - margin - 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  y -= 16;
  page.drawText("Time", { x: colTime, y, size: 9, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page.drawText("Item", { x: colItem, y, size: 9, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page.drawText("Qty", { x: colQty, y, size: 9, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page.drawText("Disc.", { x: colDiscount, y, size: 9, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page.drawText("Total", { x: colGross - 40, y, size: 9, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  y -= 14;

  // Sort sales by time (newest first)
  const sortedSales = [...rows].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (const s of sortedSales) {
    if (y < margin + 40) {
      // Add new page if needed
      const newPage = pdf.addPage([595.28, 841.89]);
      y = height - margin;
    }
    
    const time = new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isTopPerformer = topItemNames.has(s.item_name);
    const itemColor = isTopPerformer ? rgb(0.1, 0.6, 0.3) : rgb(0.1, 0.14, 0.22);
    const itemFont = isTopPerformer ? fontBold : font;
    const discount = Number(s.discount_applied || 0);
    
    page.drawText(time, { x: colTime, y, size: 8, font, color: rgb(0.38, 0.45, 0.55) });
    page.drawText((s.item_name || 'Unknown').length > 35 ? `${(s.item_name || 'Unknown').slice(0, 33)}...` : (s.item_name || 'Unknown'), { x: colItem, y, size: 8, font: itemFont, color: itemColor });
    page.drawText(String(s.quantity || 0), { x: colQty, y, size: 8, font, color: rgb(0.1, 0.14, 0.22) });
    page.drawText(discount > 0 ? `-$${discount.toFixed(2)}` : '-', { x: colDiscount, y, size: 8, font, color: discount > 0 ? rgb(0.8, 0.1, 0.1) : rgb(0.5, 0.5, 0.5) });
    page.drawText(`$${Number(s.total_with_tax || 0).toFixed(2)}`, { x: colGross - 50, y, size: 8, font: itemFont, color: itemColor });
    y -= 14;
  }

  // SECOND PAGE: Top Performers Summary
  const page2 = pdf.addPage([595.28, 841.89]);
  let y2 = height - margin;
  
  page2.drawText("🏆 TOP PERFORMERS", { x: margin, y: y2, size: 14, font: fontBold, color: rgb(0.1, 0.6, 0.3) });
  y2 -= 30;

  // Table header
  page2.drawLine({ start: { x: margin, y: y2 }, end: { x: width - margin, y: y2 }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  y2 -= 16;
  page2.drawText("Item", { x: margin, y: y2, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page2.drawText("Qty Sold", { x: width - margin - 180, y: y2, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page2.drawText("Revenue", { x: width - margin - 60, y: y2, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  y2 -= 10;
  page2.drawLine({ start: { x: margin, y: y2 }, end: { x: width - margin, y: y2 }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  y2 -= 14;

  for (const it of topItems) {
    page2.drawText(it.name.length > 60 ? `${it.name.slice(0, 58)}...` : it.name, { x: margin, y: y2, size: 9, font: fontBold, color: rgb(0.1, 0.6, 0.3) });
    page2.drawText(String(it.qty), { x: width - margin - 180, y: y2, size: 9, font: fontBold, color: rgb(0.1, 0.14, 0.22) });
    page2.drawText(`$${it.gross.toFixed(2)}`, { x: width - margin - 60, y: y2, size: 9, font: fontBold, color: rgb(0.1, 0.14, 0.22) });
    y2 -= 16;
  }

  y2 -= 30;

  // Restock Required Section (on same page 2)
  if (outOfStockItems.length > 0) {
    if (y2 < margin + 100) {
      // Add new page if needed
      const newPage = pdf.addPage([595.28, 841.89]);
      y2 = height - margin;
    }

    page2.drawText("NIRVANA restock alert", { x: margin, y: y2, size: 14, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
    y2 -= 24;
    page2.drawText(`The following products at ${shopId.toUpperCase()} have 0 stock and need restocking:`, { x: margin, y: y2, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y2 -= 30;

    // Table header
    page2.drawLine({ start: { x: margin, y: y2 }, end: { x: width - margin, y: y2 }, thickness: 1, color: rgb(0.8, 0.1, 0.1) });
    y2 -= 16;
    page2.drawText("Product Name", { x: margin, y: y2, size: 10, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
    page2.drawText("Category", { x: width - margin - 150, y: y2, size: 10, font: fontBold, color: rgb(0.8, 0.1, 0.1) });
    y2 -= 10;
    page2.drawLine({ start: { x: margin, y: y2 }, end: { x: width - margin, y: y2 }, thickness: 1, color: rgb(0.8, 0.1, 0.1) });
    y2 -= 14;

    for (const item of outOfStockItems) {
      if (y2 < margin + 40) {
        // Handle overflow if many items are out of stock
        const nextPage = pdf.addPage([595.28, 841.89]);
        y2 = height - margin;
      }
      page2.drawText(item.name.length > 60 ? `${item.name.slice(0, 58)}...` : item.name, { x: margin, y: y2, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
      page2.drawText(item.category, { x: width - margin - 150, y: y2, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y2 -= 16;
    }
  }

  const bytes = await pdf.save();
  const stamp = (date || new Date().toISOString().slice(0, 10));
  const filename = `EOD_${shopId}_${stamp}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
