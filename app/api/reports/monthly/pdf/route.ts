import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import { getMonthlyReportData } from "@/app/actions";
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

    const data = await getMonthlyReportData(shopId, `${month}-01T12:00:00Z`, { skipAuth: true });
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
        y -= 15;
        page.drawRectangle({ x: margin, y: y - 2, width: width - margin * 2, height: 20, color: COLORS.header });
        page.drawText(winAnsiSafe(title.toUpperCase()), { x: margin + 10, y: y + 5, size: 11, font: fontBold, color: rgb(1,1,1) });
        y -= 30;
    };

    const ensureSpace = (minY = 100) => {
      if (y < minY) {
        page = pdf.addPage(pageSize);
        y = height - margin;
      }
    };

    // --- TITLE ---
    drawText("📊 MONTHLY BUSINESS REPORT", 24, true, COLORS.header);
    drawText(`Business: ${winAnsiSafe(data.shopName)}`, 12, true, COLORS.neutral);
    drawText(`Reporting Period: ${month}`, 10, false, COLORS.neutral);
    drawText(`Generated: ${new Date().toLocaleString()}`, 9, false, COLORS.neutral);
    y -= 20;

    // 1. EXECUTIVE SUMMARY
    sectionHeader("1. Executive Summary");
    const delta = (data as any).comparison?.delta || {};
    const growth = (data as any).comparison?.prev?.revenuePreTax > 0 
        ? (delta.revenuePreTax / (data as any).comparison.prev.revenuePreTax) * 100 
        : 0;

    drawText(`Total Revenue: $${data.finances.revenuePreTax.toLocaleString()}`, 10, true);
    drawText(`Net Profit: $${data.finances.netProfit.toLocaleString()}`, 10, true, data.finances.netProfit >= 0 ? COLORS.profit : COLORS.expense);
    drawText(`Growth vs Last Month: ${growth.toFixed(1)}%`, 10, false, growth >= 0 ? COLORS.profit : COLORS.expense);
    y -= 10;
    drawText(`Key Success: ${growth > 0 ? "Strong revenue momentum." : "Stable operations."}`, 9, false, COLORS.neutral);
    drawText(`Main Challenge: ${data.turnover < 0.5 ? "Slow inventory movement." : "Maintaining margins."}`, 9, false, COLORS.neutral);
    y -= 15;

    // 2. SALES PERFORMANCE
    sectionHeader("2. Sales Performance");
    drawText("2.1 Revenue Breakdown by Category", 10, true);
    y -= 10;
    data.categories.sort((a,b) => b.revenue - a.revenue).slice(0, 5).forEach(cat => {
        const share = (cat.revenue / data.finances.revenuePreTax) * 100;
        drawText(`${cat.name}: $${cat.revenue.toLocaleString()} (${share.toFixed(1)}%)`, 9, false, COLORS.neutral, margin + 20);
    });
    y -= 10;
    
    drawText("2.2 Weekly Sales Trends", 10, true);
    y -= 10;
    const weeklyData = data.weeks.map((w: any, i: number) => ({ label: `W${i+1}`, value: w.sales }));
    await drawBarChart(page, font, margin + 20, y - 60, 250, 60, weeklyData);
    y -= 85;

    // 3. INVENTORY INSIGHTS
    ensureSpace(200);
    sectionHeader("3. Inventory Insights");
    drawText(`Total Inventory Value: $${data.finances.inventoryValue.toLocaleString()}`, 10, false);
    drawText(`Inventory Turnover: ${data.turnover.toFixed(2)}x`, 10, false);
    drawText(`Days of Inventory (Model): ${data.finances.daysOfInventory.toFixed(0)} days`, 10, false);
    y -= 10;

    // 4. CUSTOMER INSIGHTS
    ensureSpace(200);
    sectionHeader("4. Customer Insights");
    drawText(`New Customers: ${data.customers.new}`, 10, false);
    drawText(`Returning Customers: ${data.customers.returning}`, 10, false);
    drawText(`Total Customers Served: ${data.customers.total}`, 10, false);
    y -= 10;

    // 5. CASH FLOW & EXPENSES
    ensureSpace(200);
    sectionHeader("5. Cash Flow & Expense Management");
    drawText(`Operating Expenses: $${data.finances.operatingExpenses.toLocaleString()}`, 10, true, COLORS.expense);
    y -= 5;
    data.expenseCategories.slice(0, 4).forEach((ex: any) => {
        drawText(`${ex.category}: $${Number(ex.amount || 0).toLocaleString()}`, 9, false, COLORS.neutral, margin + 20);
    });
    y -= 10;

    // 6. RISKS & CHALLENGES
    ensureSpace(150);
    sectionHeader("6. Risks & Challenges");
    if (data.finances.netProfit < 0) drawText("- PROFITABILITY RISK: Expenses exceeding gross profit.", 9, false, COLORS.expense);
    if (data.turnover < 0.3) drawText("- INVENTORY RISK: High capital lock-up in slow-moving stock.", 9, false, COLORS.expense);
    if (data.customers.returning < data.customers.new) drawText("- LOYALTY RISK: Retention rate is lower than acquisition.", 9, false, COLORS.expense);
    if (y > height - margin - 300) drawText("- No major operational risks identified this period.", 9, false, COLORS.neutral);

    // 7. RECOMMENDATIONS
    ensureSpace(150);
    sectionHeader("7. Recommendations");
    if (data.finances.netProfit < 0) drawText("- Audit top 3 expense categories and reduce non-essential spend immediately.", 9, true, COLORS.header);
    if (data.turnover < 0.5) drawText("- Launch clearance campaign for slow categories to free up working capital.", 9, true, COLORS.header);
    drawText("- Optimize stock levels in high-turnover categories.", 9, true, COLORS.header);

    const pdfBytes = await pdf.save();
    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Monthly_Business_Report_${shopId}_${month}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Monthly PDF Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
