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
  const { data: sales, error } = await supabaseAdmin
    .from("sales")
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method")
    .eq("shop_id", shopId)
    .gte("date", since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = sales || [];
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);

  // Calculate payment method breakdown
  const cashSales = rows.filter((s: any) => s.payment_method === 'cash');
  const ecocashSales = rows.filter((s: any) => s.payment_method === 'ecocash');
  
  const totalCash = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalEcocash = ecocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

  const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
  for (const s of rows as any[]) {
    const key = s.item_name || "Unknown";
    const cur = itemMap.get(key) || { name: key, qty: 0, gross: 0 };
    cur.qty += Number(s.quantity || 0);
    cur.gross += Number(s.total_with_tax || 0);
    itemMap.set(key, cur);
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 12);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = height - margin;

  const drawText = (text: string, size = 11, bold = false, color = rgb(0.1, 0.14, 0.22)) => {
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color,
    });
    y -= size + 6;
  };

  drawText("NIRVANA", 18, true);
  drawText(`End of Day Report — ${shopId.toUpperCase()}`, 14, true);
  drawText(`Generated: ${new Date().toLocaleString()}`, 10, false, rgb(0.38, 0.45, 0.55));
  y -= 8;

  const boxTop = y;
  const boxHeight = 120;
  page.drawRectangle({
    x: margin,
    y: boxTop - boxHeight,
    width: width - margin * 2,
    height: boxHeight,
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
    color: rgb(0.96, 0.97, 0.98),
  });
  y = boxTop - 20;
  page.drawText(`Transactions: ${rows.length}`, { x: margin + 12, y, size: 11, font: fontBold, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Total (inc tax): $${totalWithTax.toFixed(2)}`, { x: margin + 12, y, size: 11, font: fontBold, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Total (pre tax): $${totalBeforeTax.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Tax: $${totalTax.toFixed(2)}`, { x: margin + 12, y, size: 11, font, color: rgb(0.1, 0.14, 0.22) });
  y -= 18;
  page.drawText(`Cash Sales: $${totalCash.toFixed(2)} (${cashSales.length} txns)`, { x: margin + 12, y, size: 10, font, color: rgb(0.38, 0.45, 0.55) });
  y -= 14;
  page.drawText(`EcoCash Sales: $${totalEcocash.toFixed(2)} (${ecocashSales.length} txns)`, { x: margin + 12, y, size: 10, font, color: rgb(0.38, 0.45, 0.55) });

  y = boxTop - boxHeight - 24;
  drawText("Top Items", 12, true);

  // Table header
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

  if (topItems.length === 0) {
    page.drawText("No sales recorded today.", { x: margin, y, size: 11, font, color: rgb(0.38, 0.45, 0.55) });
  } else {
    for (const it of topItems) {
      if (y < margin + 40) break;
      const name = String(it.name);
      const qty = String(it.qty);
      const gross = `$${Number(it.gross || 0).toFixed(2)}`;

      // Truncate long names
      const maxChars = 64;
      const safeName = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;

      page.drawText(safeName, { x: colItem, y, size: 10, font, color: rgb(0.1, 0.14, 0.22) });
      page.drawText(qty, { x: colQty, y, size: 10, font, color: rgb(0.1, 0.14, 0.22) });
      page.drawText(gross, { x: colGross - 60, y, size: 10, font, color: rgb(0.1, 0.14, 0.22) });
      y -= 16;
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
