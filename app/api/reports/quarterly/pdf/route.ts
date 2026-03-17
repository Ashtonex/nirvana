import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getQuarterlyReportData } from "@/app/actions";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLORS = {
  header: rgb(0.1, 0.1, 0.4),
  primary: rgb(0.1, 0.4, 0.7),
  profit: rgb(0.1, 0.5, 0.2),
  expense: rgb(0.8, 0.1, 0.1),
  neutral: rgb(0.4, 0.4, 0.4),
  bg: rgb(0.97, 0.98, 1),
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId") || "";
    const month = url.searchParams.get("month") || new Date().toISOString().substring(0, 7); // YYYY-MM

    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    // Auth check (Simplified for this task, matches EOD pattern)
    const cookieStore = await cookies();
    const ownerToken = cookieStore.get("nirvana_owner")?.value;
    const staffToken = cookieStore.get("nirvana_staff")?.value;

    if (!ownerToken && !staffToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch quarterly data
    const data = await getQuarterlyReportData(shopId, `${month}-01T12:00:00Z`);
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch report data" }, { status: 500 });
    }

    // Create PDF
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
      page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
      y -= (size + 6);
    };

    const drawLine = (color = rgb(0.8, 0.8, 0.8), thickness = 1) => {
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness,
        color
      });
      y -= 15;
    };

    const ensureSpace = (minY = 100) => {
      if (y < minY) {
        page = pdf.addPage(pageSize);
        y = height - margin;
      }
    };

    // --- TITLE SECTION ---
    drawText("NIRVANA STRATEGIC COMMAND", 22, true, COLORS.header);
    drawText(`Quarterly Performance Report | ${data.shopName.toUpperCase()}`, 12, true, COLORS.neutral);
    drawText(`Fiscal Period: ${month}`, 10, false, COLORS.neutral);
    y -= 20;
    drawLine(COLORS.header, 2);

    // --- EXECUTIVE SUMMARY ---
    drawText("1. EXECUTIVE SUMMARY (STRATEGIC PULSE)", 12, true, COLORS.primary);
    y -= 5;
    page.drawRectangle({ x: margin, y: y - 85, width: width - margin * 2, height: 85, color: COLORS.bg });
    let cardY = y - 20;
    page.drawText(`Monthly Gross Revenue:`, { x: margin + 15, y: cardY, size: 10, font });
    page.drawText(`$${data.finances.revenue.toLocaleString()}`, { x: margin + 160, y: cardY, size: 10, font: fontBold });
    
    page.drawText(`Est. Cost of Goods (35%):`, { x: margin + 15, y: cardY - 20, size: 10, font });
    page.drawText(`-$${data.finances.estimatedCOGS.toLocaleString()}`, { x: margin + 160, y: cardY - 20, size: 10, font: fontBold, color: COLORS.expense });

    page.drawText(`Gross Profit Margin:`, { x: margin + 15, y: cardY - 40, size: 10, font });
    page.drawText(`${data.finances.grossMargin.toFixed(1)}%`, { x: margin + 160, y: cardY - 40, size: 10, font: fontBold, color: COLORS.profit });

    page.drawText(`Strategic Net Position:`, { x: margin + 15, y: cardY - 62, size: 12, font: fontBold });
    page.drawText(`$${data.finances.netProfit.toLocaleString()}`, { x: margin + 160, y: cardY - 62, size: 12, font: fontBold, color: data.finances.netProfit >= 0 ? COLORS.profit : COLORS.expense });
    y -= 95;

    // --- QUARTERLY MONTH-BY-MONTH TRENDS ---
    ensureSpace(200);
    drawText("2. MONTHLY PERFORMANCE BREAKDOWN", 12, true, COLORS.primary);
    y -= 10;
    
    // Header for table
    const colStarts = [margin, margin + 100, margin + 250, margin + 400];
    page.drawText("Month Range", { x: colStarts[0], y, size: 9, font: fontBold });
    page.drawText("Sales Revenue", { x: colStarts[1], y, size: 9, font: fontBold });
    page.drawText("Expenses", { x: colStarts[2], y, size: 9, font: fontBold });
    page.drawText("Net Contribution", { x: colStarts[3], y, size: 9, font: fontBold });
    y -= 15;
    drawLine();

    data.months.forEach((w: any, i: number) => {
      const startD = new Date(w.start).toLocaleDateString();
      const endD = new Date(w.end).toLocaleDateString();
      const net = w.sales - w.expenses;
      
      page.drawText(`${startD} - ${endD.split('/')[0]}/${endD.split('/')[1]}`, { x: colStarts[0], y, size: 9, font });
      page.drawText(`$${w.sales.toLocaleString()}`, { x: colStarts[1], y, size: 9, font });
      page.drawText(`$${w.expenses.toLocaleString()}`, { x: colStarts[2], y, size: 9, font, color: COLORS.expense });
      page.drawText(`$${net.toLocaleString()}`, { x: colStarts[3], y, size: 9, font: fontBold, color: net >= 0 ? COLORS.profit : COLORS.expense });
      y -= 18;
      
      if (i % 2 === 0) {
          page.drawRectangle({ x: margin, y: y + 2, width: width - margin * 2, height: 18, color: COLORS.bg, opacity: 0.3 });
      }
    });
    y -= 20;

    // --- CATEGORY ANALYSIS ---
    ensureSpace(200);
    drawText("3. PRODUCT CATEGORY HEROES & LAGGARDS", 12, true, COLORS.primary);
    y -= 10;
    data.categories.sort((a, b) => b.revenue - a.revenue).slice(0, 5).forEach((cat: any) => {
        const barW = (cat.revenue / data.finances.revenuePreTax) * 300;
        page.drawText(cat.name, { x: margin, y, size: 9, font: fontBold });
        page.drawRectangle({ x: margin + 100, y: y - 2, width: 300, height: 10, color: rgb(0.9, 0.9, 0.9) });
        page.drawRectangle({ x: margin + 100, y: y - 2, width: Math.max(1, barW), height: 10, color: COLORS.primary });
        page.drawText(`$${cat.revenue.toLocaleString()}`, { x: margin + 410, y, size: 9, font });
        y -= 15;
    });
    y -= 20;

    // --- STRATEGIC INSIGHTS ---
    ensureSpace(250);
    drawText("4. OPERATIONAL INTELLIGENCE & STRATEGY", 12, true, COLORS.primary);
    y -= 10;
    
    const insights = [
        { label: "New Customers Acquired", value: data.customers.new, icon: "👤" },
        { label: "Returning Client Base", value: data.customers.returning, icon: "🔄" },
        { label: "Fixed Overhead (Salaries/Rent)", value: `$${data.finances.fixedCosts.toLocaleString()}`, icon: "🏢" },
        { label: "Inventory Turnover Ratio", value: data.turnover.toFixed(2), icon: "📦" }
    ];

    insights.forEach((ins, i) => {
        const ix = i % 2 === 0 ? margin : margin + (width - margin * 2) / 2;
        const iy = y - (Math.floor(i / 2) * 50);
        page.drawRectangle({ x: ix, y: iy - 40, width: (width - margin * 2) / 2 - 10, height: 40, color: COLORS.bg });
        page.drawText(`${ins.icon} ${ins.label}`, { x: ix + 10, y: iy - 15, size: 8, font: fontBold, color: COLORS.neutral });
        page.drawText(String(ins.value), { x: ix + 10, y: iy - 32, size: 12, font: fontBold, color: COLORS.header });
    });
    y -= 110;

    // --- RECOMMENDATIONS ---
    ensureSpace(150);
    drawText("5. COMMAND ADVISORY (ACTIONABLE STEPS)", 12, true, COLORS.primary);
    y -= 5;
    const advisories = [];
    if (data.finances.grossMargin < 60) advisories.push("MARGIN WARNING: Actual COGS might be exceeding the 35% estimate. Review supplier pricing.");
    if (data.turnover < 0.5) advisories.push("INVENTORY STAGNATION: Turnover is low. Run a 'Zombie Clearance' event for products older than 60 days.");
    if (data.customers.new > data.customers.returning) advisories.push("RETENTION OPPORTUNITY: New acquisitions are high. Implement a loyalty or referral scheme for returning clients.");
    if (data.finances.netProfit < 0) advisories.push("FISCAL ALERT: Monthly burn rate is unsustainable. reduce variable costs or increase average basket size.");
    if (advisories.length === 0) advisories.push("OPTIMAL PERFORMANCE: Maintain current trajectory. Focus on upselling high-margin accessories.");

    advisories.forEach(adv => {
        page.drawText(`• ${adv}`, { x: margin + 10, y, size: 9, font: fontItalic, color: COLORS.neutral, maxWidth: width - margin * 2 - 20 });
        y -= 25;
    });

    // Save PDF
    const pdfBytes = await pdf.save();

    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Quarterly_Strategic_Report_${shopId}_${month}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Quarterly PDF Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
