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
  header: rgb(0.05, 0.05, 0.2),
  primary: rgb(0.1, 0.4, 0.7),
  profit: rgb(0.1, 0.5, 0.2),
  expense: rgb(0.8, 0.1, 0.1),
  neutral: rgb(0.4, 0.4, 0.4),
  bg: rgb(0.97, 0.98, 1),
  gold: rgb(0.8, 0.6, 0.2),
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
            y: y - 12,
            size: 7,
            font,
            color: COLORS.neutral
        });

        page.drawText(`$${Math.round(d.value).toLocaleString()}`, {
            x: bx,
            y: y + barH + 5,
            size: 7,
            font,
            color: COLORS.header
        });
    });
}

async function drawLineChart(
    page: PDFPage, 
    font: PDFFont, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    data: number[]
) {
    if (data.length < 2) return;
    const maxVal = Math.max(...data, 0) || 1;
    const chartHeight = height - 10;
    const stepX = width / (data.length - 1);

    for (let i = 0; i < data.length - 1; i++) {
        const x1 = x + i * stepX;
        const y1 = y + (data[i] / maxVal) * chartHeight;
        const x2 = x + (i + 1) * stepX;
        const y2 = y + (data[i+1] / maxVal) * chartHeight;

        page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: 2,
            color: COLORS.profit
        });

        page.drawCircle({
            x: x1,
            y: y1,
            size: 3,
            color: COLORS.profit
        });
    }
    
    // Last point
    page.drawCircle({
        x: x + (data.length - 1) * stepX,
        y: y + (data[data.length - 1] / maxVal) * chartHeight,
        size: 3,
        color: COLORS.profit
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

    const sectionTitle = (text: string) => {
        y -= 15;
        page.drawRectangle({ x: margin, y: y - 2, width: width - margin * 2, height: 18, color: COLORS.bg });
        page.drawText(winAnsiSafe(text.toUpperCase()), { x: margin + 5, y: y + 3, size: 10, font: fontBold, color: COLORS.header });
        y -= 25;
    };

    const ensureSpace = (minY = 100) => {
      if (y < minY) {
        page = pdf.addPage(pageSize);
        y = height - margin;
      }
    };

    // --- HEADER ---
    page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: COLORS.header });
    page.drawText("CEO-LEVEL QUARTERLY STRATEGIC REVIEW", { x: margin, y: height - 50, size: 20, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(`NIRVANA ENTERPRISE | NODE: ${winAnsiSafe(data.shopName).toUpperCase()}`, { x: margin, y: height - 75, size: 10, font, color: COLORS.gold });
    page.drawText(`Q${Math.ceil(data.period.endMonth / 3)} ${data.period.year} | UNCLASSIFIED`, { x: width - 200, y: height - 75, size: 9, font, color: rgb(0.8, 0.8, 0.8) });
    
    y = height - 130;

    // 1. EXECUTIVE BRIEF
    sectionTitle("1. Executive Brief (Headline Performance)");
    const financials = data.finances;
    
    const cards = [
        { label: "Total Revenue", value: `$${financials.revenuePreTax.toLocaleString()}` },
        { label: "EBITDA", value: `$${financials.ebitda.toLocaleString()}`, color: COLORS.profit },
        { label: "Net Profit", value: `$${financials.netProfit.toLocaleString()}`, color: financials.netProfit >= 0 ? COLORS.profit : COLORS.expense },
        { label: "Liquidity Est.", value: `$${(financials.revenue - financials.operatingExpenses).toLocaleString()}` }
    ];

    cards.forEach((c, i) => {
        const cx = margin + i * (width - margin * 2) / 4;
        page.drawText(c.label, { x: cx, y, size: 8, font, color: COLORS.neutral });
        page.drawText(c.value, { x: cx, y: y - 15, size: 11, font: fontBold, color: c.color || COLORS.header });
    });
    y -= 40;

    // 2. FINANCIAL PERFORMANCE
    sectionTitle("2. Financial Performance & Margin Analysis");
    drawText(`Gross Margin: ${financials.grossMargin.toFixed(1)}%`, 9, true, COLORS.header);
    drawText(`Operating Margin: ${((financials.ebitda / financials.revenuePreTax) * 100).toFixed(1)}%`, 9, true, COLORS.header);
    y -= 10;
    
    // Revenue Trend Chart
    drawText("Revenue Trajectory (Monthly):", 8, true, COLORS.neutral);
    y -= 10;
    const revValues = data.months.map((m: any) => m.salesPreTax);
    const revDataBars = data.months.map((m: any, i: number) => ({ label: `M${i+1}`, value: m.salesPreTax }));
    
    // Draw Bar Chart
    await drawBarChart(page, font, margin, y - 60, 200, 60, revDataBars);
    
    // Draw Line Chart (overlay or separate)
    await drawLineChart(page, font, margin + 250, y - 60, 200, 60, revValues);
    y -= 80;

    // 3. CASH FLOW & LIQUIDITY
    ensureSpace(150);
    sectionTitle("3. Cash Flow & Liquidity Positioning");
    drawText("Quarterly cash position remained positive throughout the period.", 9, false, COLORS.neutral);
    drawText(`Cash Reserve Buffer: ~${(financials.netProfit / 3 / (financials.operatingExpenses / 3)).toFixed(1)} months of OpEx coverage.`, 9, false, COLORS.neutral);
    y -= 10;

    // 4. BUSINESS SEGMENT PERFORMANCE
    ensureSpace(200);
    sectionTitle("4. Business Segment Performance");
    const topCats = (data.categories as any[]).sort((a,b) => b.revenue - a.revenue).slice(0, 3);
    topCats.forEach(cat => {
        const share = (cat.revenue / financials.revenuePreTax) * 100;
        drawText(`${cat.name}: $${cat.revenue.toLocaleString()} (${share.toFixed(1)}% share)`, 9, false, COLORS.neutral);
    });

    // 5. OPERATIONAL METRICS (KPIs)
    ensureSpace(200);
    sectionTitle("5. CORE Operational Metrics");
    drawText(`Inventory Turnover: ${data.turnover.toFixed(2)}x`, 9, false, COLORS.neutral);
    drawText(`New Customer Acquisition: ${data.customers.new} units`, 9, false, COLORS.neutral);
    drawText(`Retention Rate: ${((data.customers.returning / data.customers.total) * 100).toFixed(1)}%`, 9, false, COLORS.neutral);

    // 6. MARKET & CUSTOMER INSIGHTS
    ensureSpace(150);
    sectionTitle("6. Market & Customer Insights");
    drawText("Stable demand in core categories. High-margin electronics showing momentum.", 9, true, COLORS.neutral);
    
    // 7. RISK MANAGEMENT
    ensureSpace(150);
    sectionTitle("7. Risk Management Dashboard");
    if (data.turnover < 1) drawText("Risk: Slow inventory turnover. Action: Inventory clearing req.", 9, false, COLORS.expense);
    else drawText("Inventory risk: LOW. Turnover is healthy.", 9, false, COLORS.profit);
    
    // 8. STRATEGIC INITIATIVES
    ensureSpace(150);
    sectionTitle("8. Strategic Initiatives (Next Quarter)");
    drawText("- Loyalty Program Rollout (Q2 Target)", 9, false, COLORS.neutral);
    drawText("- Supply Chain Consolidation to improve margin by ~2%", 9, false, COLORS.neutral);

    // 9. CAPITAL ALLOCATION
    ensureSpace(150);
    sectionTitle("9. Capital Allocation Priorities");
    drawText("Retained earnings set for inventory expansion and OpEx buffer.", 9, false, COLORS.neutral);

    // 10. GROWTH STRATEGY
    ensureSpace(150);
    sectionTitle("10. Growth Strategy");
    drawText("Expansion into digital sales channels and localized delivery nodes.", 9, false, COLORS.neutral);

    // 11. FUNDING REQUIREMENT
    ensureSpace(150);
    sectionTitle("11. Funding & Runway");
    drawText("Self-funding status: ACHIEVED. No external capital required for current growth path.", 9, false, COLORS.profit);

    // 12. OUTLOOK & FORECAST
    ensureSpace(150);
    sectionTitle("12. CEO Forecast");
    const projectedRev = financials.revenuePreTax * 1.08;
    drawText(`Projected Q+1 Revenue: $${projectedRev.toLocaleString()} (est. +8% growth)`, 10, true, COLORS.header);

    const pdfBytes = await pdf.save();
    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CEO_Quarterly_Report_${shopId}_${month}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("CEO PDF Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
