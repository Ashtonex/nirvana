import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getMonthlyReportData } from "@/app/actions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdminLikeRole(role: string | null | undefined) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

function winAnsiSafe(text: string) {
  // pdf-lib StandardFonts are WinAnsi encoded; strip unsupported unicode (emoji, etc.)
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\x20-\xFF]/g, "");
}

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

    // Staff access control: staff can only export their own shop; global requires owner/admin.
    if (!ownerToken && staffToken) {
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
        .select("id, shop_id, role")
        .eq("id", session.employee_id)
        .maybeSingle();

      if (!staff?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (shopId === "global" || shopId === "all") {
        if (!isAdminLikeRole((staff as any).role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else {
        const isAdminLike = isAdminLikeRole((staff as any).role);
        if (!isAdminLike && String((staff as any).shop_id || "") !== shopId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Fetch monthly data
    const data = await getMonthlyReportData(shopId, `${month}-01T12:00:00Z`);
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
      page.drawText(winAnsiSafe(text), { x, y, size, font: bold ? fontBold : font, color });
      y -= (size + 6);
    };

    const pText = (text: any, opts: Parameters<typeof page.drawText>[1]) => {
      page.drawText(winAnsiSafe(String(text ?? "")), opts);
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
    drawText("NIRVANA ORACLE COMMAND", 22, true, COLORS.header);
    drawText(`MONTHLY STRATEGIC REPORT | ${winAnsiSafe(data.shopName).toUpperCase()}`, 12, true, COLORS.neutral);
    drawText(`Period: ${month} | Generated: ${new Date().toLocaleString()}`, 9, false, COLORS.neutral);
    y -= 20;
    drawLine(COLORS.header, 2);

    // --- EXECUTIVE BRIEF ---
    drawText("1. EXECUTIVE BRIEF (WHAT HAPPENED THIS MONTH)", 12, true, COLORS.primary);
    y -= 5;
    page.drawRectangle({ x: margin, y: y - 85, width: width - margin * 2, height: 85, color: COLORS.bg });
    let cardY = y - 20;
    pText(`Revenue (Pre Tax):`, { x: margin + 15, y: cardY, size: 10, font });
    pText(`$${Number(data.finances.revenuePreTax || 0).toLocaleString()}`, { x: margin + 160, y: cardY, size: 10, font: fontBold });
    
    pText(`Tax Provision:`, { x: margin + 15, y: cardY - 20, size: 10, font });
    pText(`$${Number(data.finances.tax || 0).toLocaleString()}`, { x: margin + 160, y: cardY - 20, size: 10, font: fontBold, color: COLORS.neutral });

    pText(`Operating Expenses:`, { x: margin + 15, y: cardY - 40, size: 10, font });
    pText(`$${Number(data.finances.operatingExpenses || 0).toLocaleString()}`, { x: margin + 160, y: cardY - 40, size: 10, font: fontBold, color: COLORS.expense });

    pText(`Net Profit (Model):`, { x: margin + 15, y: cardY - 62, size: 12, font: fontBold });
    pText(`$${Number(data.finances.netProfit || 0).toLocaleString()}`, { x: margin + 160, y: cardY - 62, size: 12, font: fontBold, color: Number(data.finances.netProfit || 0) >= 0 ? COLORS.profit : COLORS.expense });
    y -= 95;

    // --- MOM DELTAS ---
    ensureSpace(180);
    drawText("2. MOMENTUM (VS LAST MONTH)", 12, true, COLORS.primary);
    y -= 10;
    const prev = (data as any).comparison?.prev || {};
    const delta = (data as any).comparison?.delta || {};
    const fmtDelta = (n: any) => {
      const v = Number(n || 0);
      const s = v >= 0 ? "+" : "-";
      return `${s}$${Math.abs(v).toLocaleString()}`;
    };
    drawText(`Revenue (Pre Tax): ${fmtDelta(delta.revenuePreTax)} (prev $${Number(prev.revenuePreTax || 0).toLocaleString()})`, 9, false, COLORS.neutral);
    drawText(`Operating Expenses: ${fmtDelta(delta.operatingExpenses)} (prev $${Number(prev.operatingExpenses || 0).toLocaleString()})`, 9, false, COLORS.neutral);
    drawText(`Net Profit: ${fmtDelta(delta.netProfit)} (prev $${Number(prev.netProfit || 0).toLocaleString()})`, 9, false, COLORS.neutral);
    y -= 10;

    // --- NODE BREAKDOWN (GLOBAL ONLY) ---
    if (Array.isArray((data as any).perShop) && (data as any).perShop.length > 1) {
      ensureSpace(220);
      drawText("3. NODE BREAKDOWN (WHICH SHOP CARRIED / DRAGGED)", 12, true, COLORS.primary);
      y -= 10;

      const shops = (data as any).perShop as any[];
      const col = [margin, margin + 175, margin + 325, margin + 450];
      pText("Shop", { x: col[0], y, size: 9, font: fontBold });
      pText("Revenue (Pre Tax)", { x: col[1], y, size: 9, font: fontBold });
      pText("OpEx", { x: col[2], y, size: 9, font: fontBold });
      pText("Net", { x: col[3], y, size: 9, font: fontBold });
      y -= 15;
      drawLine();

      shops.forEach((s, i) => {
        const net = Number(s.netProfit || 0);
        pText(String(s.name || s.id), { x: col[0], y, size: 9, font });
        pText(`$${Number(s.revenuePreTax || 0).toLocaleString()}`, { x: col[1], y, size: 9, font });
        pText(`$${Number(s.operatingExpenses || 0).toLocaleString()}`, { x: col[2], y, size: 9, font, color: COLORS.expense });
        pText(`$${net.toLocaleString()}`, { x: col[3], y, size: 9, font: fontBold, color: net >= 0 ? COLORS.profit : COLORS.expense });
        y -= 18;
        if (i % 2 === 0) {
          page.drawRectangle({ x: margin, y: y + 2, width: width - margin * 2, height: 18, color: COLORS.bg, opacity: 0.25 });
        }
      });
      y -= 15;
    }

    // --- WEEKLY CADENCE ---
    ensureSpace(200);
    drawText("4. WEEKLY CADENCE (HOW THE MONTH PLAYED OUT)", 12, true, COLORS.primary);
    y -= 10;
    
    // Header for table
    const colStarts = [margin, margin + 100, margin + 250, margin + 400];
    pText("Week Range", { x: colStarts[0], y, size: 9, font: fontBold });
    pText("Sales Revenue", { x: colStarts[1], y, size: 9, font: fontBold });
    pText("Expenses", { x: colStarts[2], y, size: 9, font: fontBold });
    pText("Net Contribution", { x: colStarts[3], y, size: 9, font: fontBold });
    y -= 15;
    drawLine();

    data.weeks.forEach((w: any, i: number) => {
      const startD = new Date(w.start).toLocaleDateString();
      const endD = new Date(w.end).toLocaleDateString();
      const net = w.sales - w.expenses;
      
      pText(`${startD} - ${endD.split('/')[0]}/${endD.split('/')[1]}`, { x: colStarts[0], y, size: 9, font });
      pText(`$${w.sales.toLocaleString()}`, { x: colStarts[1], y, size: 9, font });
      pText(`$${w.expenses.toLocaleString()}`, { x: colStarts[2], y, size: 9, font, color: COLORS.expense });
      pText(`$${net.toLocaleString()}`, { x: colStarts[3], y, size: 9, font: fontBold, color: net >= 0 ? COLORS.profit : COLORS.expense });
      y -= 18;
      
      if (i % 2 === 0) {
          page.drawRectangle({ x: margin, y: y + 2, width: width - margin * 2, height: 18, color: COLORS.bg, opacity: 0.3 });
      }
    });
    y -= 20;

    // --- CATEGORY ANALYSIS ---
    ensureSpace(200);
    drawText("5. CATEGORY SIGNALS (WHERE PROFIT REALLY CAME FROM)", 12, true, COLORS.primary);
    y -= 10;
    data.categories.sort((a, b) => b.revenue - a.revenue).slice(0, 5).forEach((cat: any) => {
        const barW = (cat.revenue / data.finances.revenuePreTax) * 300;
        pText(cat.name, { x: margin, y, size: 9, font: fontBold });
        page.drawRectangle({ x: margin + 100, y: y - 2, width: 300, height: 10, color: rgb(0.9, 0.9, 0.9) });
        page.drawRectangle({ x: margin + 100, y: y - 2, width: Math.max(1, barW), height: 10, color: COLORS.primary });
        pText(`$${cat.revenue.toLocaleString()}`, { x: margin + 410, y, size: 9, font });
        y -= 15;
    });
    y -= 20;

    // --- EXPENSE DRIVERS ---
    ensureSpace(220);
    drawText("6. EXPENSE DRIVERS (WHAT YOU PAID FOR)", 12, true, COLORS.primary);
    y -= 10;
    const expenseCats = Array.isArray((data as any).expenseCategories) ? (data as any).expenseCategories.slice(0, 6) : [];
    if (expenseCats.length === 0) {
      drawText("No expense entries recorded for this period.", 9, false, COLORS.neutral);
    } else {
      expenseCats.forEach((c: any) => {
        const amt = Number(c.amount || 0);
        drawText(`${winAnsiSafe(String(c.category))}: $${amt.toLocaleString()}`, 9, false, amt > 0 ? COLORS.expense : COLORS.neutral);
      });
    }
    y -= 10;

    // --- DECISION SIGNALS ---
    ensureSpace(250);
    drawText("7. DECISION SIGNALS (CUSTOMERS, INVENTORY, CASH)", 12, true, COLORS.primary);
    y -= 10;
    
    const insights = [
        { label: "New Customers Acquired", value: data.customers.new },
        { label: "Returning Client Base", value: data.customers.returning },
        { label: "Inventory Value (Allocated)", value: `$${Number((data as any).finances?.inventoryValue || 0).toLocaleString()}` },
        { label: "Days of Inventory (Model)", value: Number((data as any).finances?.daysOfInventory || 0).toFixed(0) }
    ];

    insights.forEach((ins, i) => {
        const ix = i % 2 === 0 ? margin : margin + (width - margin * 2) / 2;
        const iy = y - (Math.floor(i / 2) * 50);
        page.drawRectangle({ x: ix, y: iy - 40, width: (width - margin * 2) / 2 - 10, height: 40, color: COLORS.bg });
        pText(`${ins.label}`, { x: ix + 10, y: iy - 15, size: 8, font: fontBold, color: COLORS.neutral });
        pText(String(ins.value), { x: ix + 10, y: iy - 32, size: 12, font: fontBold, color: COLORS.header });
    });
    y -= 110;

    // --- OWNER ACTIONS + SIMULATION ---
    ensureSpace(150);
    drawText("8. OWNER ACTIONS (DO NEXT, NOT LATER)", 12, true, COLORS.primary);
    y -= 5;
    const advisories = [];
    const netProfit = Number(data.finances.netProfit || 0);
    const opEx = Number((data as any).finances?.operatingExpenses || 0);
    const revPT = Number(data.finances.revenuePreTax || 0);
    const opExRatio = revPT > 0 ? (opEx / revPT) * 100 : 0;

    if (netProfit < 0) advisories.push("Profit is negative. Freeze discretionary spend and audit the top expense categories first.");
    if (opExRatio > 55) advisories.push(`OpEx is ${opExRatio.toFixed(0)}% of pre-tax revenue. Set a weekly cap and enforce approvals.`);
    if (Number(data.turnover || 0) < 0.5) advisories.push("Inventory turnover is low. Run clearance on aged stock and stop over-ordering slow categories.");
    if (data.customers.returning < data.customers.new) advisories.push("Retention is lagging. Add a simple return incentive and track returning rate weekly.");
    if (advisories.length === 0) advisories.push("Stable month. Push margin: bundle high-margin add-ons and tighten discounting rules.");

    advisories.forEach(adv => {
        page.drawText(`- ${winAnsiSafe(adv)}`, { x: margin + 10, y, size: 9, font: fontItalic, color: COLORS.neutral, maxWidth: width - margin * 2 - 20 });
        y -= 25;
    });

    // Simple scenario simulation (5% revenue lift, expenses held)
    const simRevenuePT = revPT * 1.05;
    const simGrossProfit = simRevenuePT * 0.65;
    const simNet = simGrossProfit - opEx;
    y -= 5;
    drawText("Simulation (if +5% pre-tax revenue, expenses constant):", 9, true, COLORS.neutral);
    drawText(`Projected Net: $${simNet.toLocaleString()} (today $${netProfit.toLocaleString()})`, 9, false, simNet >= 0 ? COLORS.profit : COLORS.expense);

    // Save PDF
    const pdfBytes = await pdf.save();

    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Monthly_Strategic_Report_${shopId}_${month}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Monthly PDF Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
