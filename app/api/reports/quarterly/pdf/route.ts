import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { getQuarterlyReportData } from "@/app/actions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function winAnsiSafe(text: any) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKD");

  let out = "";
  for (const ch of normalized) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp <= 0x7e) { out += ch; continue; }
    if (ch === "’" || ch === "‘") { out += "'"; continue; }
    if (ch === "“" || ch === "”") { out += "\""; continue; }
    if (ch === "–" || ch === "—") { out += "-"; continue; }
    if (ch === "•") { out += "-"; continue; }
    if (ch === "…") { out += "..."; continue; }
    if (cp >= 0xa0 && cp <= 0xff) { out += ch; }
  }
  return out;
}

const COLORS = {
  header: rgb(0.1, 0, 0.3),
  primary: rgb(0.1, 0.4, 0.7),
  profit: rgb(0.1, 0.5, 0.2),
  expense: rgb(0.8, 0.1, 0.1),
  neutral: rgb(0.4, 0.4, 0.4),
  bg: rgb(0.97, 0.98, 1),
};

async function drawBarChart(
    page: PDFPage, 
    font: PDFFont, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    data: { label: string, value: number }[]
) {
    if (data.length === 0) return;
    const maxVal = Math.max(...data.map(d => d.value), 0) || 1;
    const chartHeight = height - 20;
    const barWidth = (width / data.length) * 0.6;
    const spacing = (width / data.length) * 0.4;

    data.forEach((d, i) => {
        const barH = (d.value / maxVal) * chartHeight;
        const bx = x + i * (barWidth + spacing);
        
        page.drawRectangle({
            x: bx,
            y,
            width: barWidth,
            height: Math.max(2, barH),
            color: COLORS.primary,
        });

        page.drawText(winAnsiSafe(d.label), {
            x: bx,
            y: y - 12, size: 7, font, color: COLORS.neutral
        });

        page.drawText(`$${Math.round(d.value).toLocaleString()}`, {
            x: bx, y: y + barH + 5, size: 7, font, color: COLORS.header
        });
    });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId") || "";
    const month = url.searchParams.get("month") || new Date().toISOString().substring(0, 7);

    if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });

    const data = await getQuarterlyReportData(shopId, `${month}-01T12:00:00Z`, { skipAuth: true });
    if (!data) return NextResponse.json({ error: "No data" }, { status: 500 });

    const pdf = await PDFDocument.create();
    const pageSize: [number, number] = [595.28, 841.89];
    let page = pdf.addPage(pageSize);
    const { width, height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const margin = 50;
    let y = height - margin;

    const drawText = (text: string, size = 10, bold = false, color = rgb(0, 0, 0), x = margin) => {
      page.drawText(winAnsiSafe(text), { x, y, size, font: bold ? fontBold : font, color });
      y -= (size + 6);
    };

    const sectionHeader = (title: string) => {
        y -= 20;
        page.drawRectangle({ x: margin, y: y - 2, width: width - margin * 2, height: 22, color: COLORS.header });
        page.drawText(winAnsiSafe(title.toUpperCase()), { x: margin + 10, y: y + 6, size: 12, font: fontBold, color: rgb(1,1,1) });
        y -= 35;
    };

    const ensureSpace = (minY = 100) => {
      if (y < minY) {
        page = pdf.addPage(pageSize);
        y = height - margin;
      }
    };

    // --- TITLE ---
    drawText("📊 QUARTERLY BUSINESS REPORT", 26, true, COLORS.header);
    drawText(`Business: ${winAnsiSafe(data.shopName)}`, 14, true, COLORS.neutral);
    drawText(`Quarter Ending: ${month}`, 11, false, COLORS.neutral);
    y -= 25;

    // 1. EXECUTIVE SUMMARY
    sectionHeader("1. Executive Summary");
    drawText(`Q-Revenue: $${data.finances.revenuePreTax.toLocaleString()}`, 11, true);
    drawText(`Q-Net Profit: $${data.finances.netProfit.toLocaleString()}`, 11, true, data.finances.netProfit >= 0 ? COLORS.profit : COLORS.expense);
    drawText(`Q-Gross Margin: ${data.finances.grossMargin.toFixed(1)}%`, 11, false);
    y -= 15;

    // 2. PERFORMANCE OVERVIEW
    sectionHeader("2. Performance Overview");
    drawText("2.1 Monthly Revenue Progression", 10, true);
    y -= 10;
    const monthlyData = data.months.map((m: any, i: number) => ({ label: `Month ${i+1}`, value: m.salesPreTax }));
    await drawBarChart(page, font, margin + 20, y - 70, 300, 70, monthlyData);
    y -= 95;

    // 3. GROWTH ANALYSIS
    ensureSpace(200);
    sectionHeader("3. Growth & Scale Analysis");
    const firstMonthRev = data.months[0]?.salesPreTax || 1;
    const lastMonthRev = data.months[2]?.salesPreTax || 1;
    const qGrowth = ((lastMonthRev - firstMonthRev) / firstMonthRev) * 100;
    
    drawText(`Intra-Quarter Growth Rate: ${qGrowth.toFixed(1)}%`, 11, true, qGrowth >= 0 ? COLORS.profit : COLORS.expense);
    drawText(`New Customer Base Expansion: +${data.customers.new} entities`, 10, false, COLORS.neutral);
    y -= 15;

    // 4. COST & EXPENSE ANALYSIS
    ensureSpace(200);
    sectionHeader("4. Cost & Expense Structure");
    drawText(`Total Operating Expenses: $${data.finances.operatingExpenses.toLocaleString()}`, 11, true, COLORS.expense);
    y -= 10;
    data.expenseCategories.slice(0, 6).forEach((ex: any) => {
        drawText(`${ex.category}: $${Number(ex.amount || 0).toLocaleString()}`, 9, false, COLORS.neutral, margin + 20);
    });
    y -= 15;

    // 5. INVENTORY PERFORMANCE
    ensureSpace(200);
    sectionHeader("5. Inventory Performance (Strategic)");
    drawText(`Inventory Asset Value: $${data.finances.inventoryValue.toLocaleString()}`, 10, false);
    drawText(`Quarterly Turnover Rate: ${data.turnover.toFixed(2)}x`, 10, false);
    y -= 15;

    // 6. STRATEGIC RECOMMENDATIONS
    ensureSpace(200);
    sectionHeader("6. Strategic Recommendations (Next 90 Days)");
    drawText("1. Margin Optimization: Renegotiate supplier terms for top 3 categories.", 10, true, COLORS.header);
    drawText("2. OpEx Discipline: Review all recurring administrative costs.", 10, true, COLORS.header);
    drawText("3. Expansion: Evaluate additional capacity in high-demand nodes.", 10, true, COLORS.header);

    const pdfBytes = await pdf.save();
    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Quarterly_Business_Report_${shopId}_${month}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Quarterly PDF Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
