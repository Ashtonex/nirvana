import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId") || "";
  if (!shopId) {
    return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
  }

  // Staff auth only
  const token = (await cookies()).get("nirvana_staff")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
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

  const since = startOfTodayUTC();

  // Fetch Sales
  const { data: sales, error: salesErr } = await supabaseAdmin
    .from("sales")
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method,discount_applied")
    .eq("shop_id", shopId)
    .gte("date", since);

  // Fetch Ledger (Opening Balance & POS Expenses)
  const { data: ledger, error: ledgerErr } = await supabaseAdmin
    .from("ledger_entries")
    .select("category,amount,date")
    .eq("shop_id", shopId)
    .gte("date", since);

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

  const closingCashBalance = openingBalance + totalCashSales - totalPosExpenses;

  const ecocashSales = rows.filter((s: any) => s.payment_method === 'ecocash');
  const totalEcocash = ecocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

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
  y -= 24;

  drawText("Top Performers Today", 12, true);

  // Table
  const colItem = margin;
  const colQty = width - margin - 120;
  const colGross = width - margin - 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  y -= 16;
  page.drawText("Item", { x: colItem, y, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page.drawText("Qty", { x: colQty, y, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  page.drawText("Gross", { x: colGross - 40, y, size: 10, font: fontBold, color: rgb(0.38, 0.45, 0.55) });
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  y -= 14;

  for (const it of topItems) {
    if (y < margin + 40) break;
    page.drawText(it.name.length > 50 ? `${it.name.slice(0, 48)}...` : it.name, { x: colItem, y, size: 9, font, color: rgb(0.1, 0.14, 0.22) });
    page.drawText(String(it.qty), { x: colQty, y, size: 9, font, color: rgb(0.1, 0.14, 0.22) });
    page.drawText(`$${it.gross.toFixed(2)}`, { x: colGross - 60, y, size: 9, font, color: rgb(0.1, 0.14, 0.22) });
    y -= 16;
  }

  // SECOND PAGE: Restock Required
  if (outOfStockItems.length > 0) {
    const page2 = pdf.addPage([595.28, 841.89]);
    let y2 = height - margin;

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
  const filename = `EOD_${shopId}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
