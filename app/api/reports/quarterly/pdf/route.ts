import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getQuarterlyReportData } from "@/app/actions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function winAnsiSafe(text: any) {
  // pdf-lib StandardFonts are WinAnsi encoded; aggressively strip unsupported unicode (emoji, private-use, etc.)
  // Use code-point iteration to reliably remove astral symbols (surrogate pairs).
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

function isAdminLikeRole(role: string | null | undefined) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
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

    // Fetch quarterly data
    const data = await getQuarterlyReportData(shopId, `${month}-01T12:00:00Z`, { skipAuth: true });
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
    drawText(`QUARTERLY STRATEGIC REVIEW | ${winAnsiSafe(data.shopName).toUpperCase()}`, 12, true, COLORS.neutral);
    const rangeStart = new Date(data.period.start).toLocaleDateString();
    const rangeEnd = new Date(data.period.end).toLocaleDateString();
    drawText(`Quarter Range: ${rangeStart} - ${rangeEnd} | Generated: ${new Date().toLocaleString()}`, 9, false, COLORS.neutral);
    y -= 20;
    drawLine(COLORS.header, 2);

    // --- QUARTER SNAPSHOT ---
    drawText("1. QUARTER SNAPSHOT (WHERE YOU ENDED UP)", 12, true, COLORS.primary);
    y -= 5;
    page.drawRectangle({ x: margin, y: y - 85, width: width - margin * 2, height: 85, color: COLORS.bg });
    let cardY = y - 20;
    pText(`Revenue (Pre Tax):`, { x: margin + 15, y: cardY, size: 10, font });
    pText(`$${Number(data.finances.revenuePreTax || 0).toLocaleString()}`, { x: margin + 160, y: cardY, size: 10, font: fontBold });
    
    pText(`Tax Provision:`, { x: margin + 15, y: cardY - 20, size: 10, font });
    pText(`$${Number(data.finances.tax || 0).toLocaleString()}`, { x: margin + 160, y: cardY - 20, size: 10, font: fontBold, color: COLORS.neutral });

    pText(`Operating Expenses:`, { x: margin + 15, y: cardY - 40, size: 10, font });
    pText(`$${Number((data as any).finances?.operatingExpenses || 0).toLocaleString()}`, { x: margin + 160, y: cardY - 40, size: 10, font: fontBold, color: COLORS.expense });

    pText(`Net Profit (Model):`, { x: margin + 15, y: cardY - 62, size: 12, font: fontBold });
    pText(`$${Number(data.finances.netProfit || 0).toLocaleString()}`, { x: margin + 160, y: cardY - 62, size: 12, font: fontBold, color: Number(data.finances.netProfit || 0) >= 0 ? COLORS.profit : COLORS.expense });
    y -= 95;

    // --- GLOBAL NODE BREAKDOWN ---
    if (Array.isArray((data as any).perShop) && (data as any).perShop.length > 1) {
      ensureSpace(220);
      drawText("2. NODE BREAKDOWN (PROFIT BY SHOP)", 12, true, COLORS.primary);
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

    // --- QUARTERLY MONTH-BY-MONTH TRENDS ---
    ensureSpace(200);
    drawText("3. MONTHLY TRAJECTORY (HOW THE QUARTER MOVED)", 12, true, COLORS.primary);
    y -= 10;
    
    // Header for table
    const colStarts = [margin, margin + 140, margin + 290, margin + 420];
    pText("Month", { x: colStarts[0], y, size: 9, font: fontBold });
    pText("Rev (PreTax)", { x: colStarts[1], y, size: 9, font: fontBold });
    pText("Ledger Exp", { x: colStarts[2], y, size: 9, font: fontBold });
    pText("Net (Pre OH)", { x: colStarts[3], y, size: 9, font: fontBold });
    y -= 15;
    drawLine();

    data.months.forEach((w: any, i: number) => {
      const d = new Date(w.start);
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const net = Number(w.salesPreTax || 0) * 0.65 - Number(w.expenses || 0);
      
      pText(label, { x: colStarts[0], y, size: 9, font });
      pText(`$${Number(w.salesPreTax || 0).toLocaleString()}`, { x: colStarts[1], y, size: 9, font });
      pText(`$${w.expenses.toLocaleString()}`, { x: colStarts[2], y, size: 9, font, color: COLORS.expense });
      pText(`$${net.toLocaleString()}`, { x: colStarts[3], y, size: 9, font: fontBold, color: net >= 0 ? COLORS.profit : COLORS.expense });
      y -= 18;
      
      if (i % 2 === 0) {
          page.drawRectangle({ x: margin, y: y + 2, width: width - margin * 2, height: 18, color: COLORS.bg, opacity: 0.3 });
      }
    });
    y -= 20;

    // --- EXPENSE DRIVERS ---
    ensureSpace(200);
    drawText("4. EXPENSE DRIVERS (TOP COST CENTERS)", 12, true, COLORS.primary);
    y -= 10;
    const expenseCats = Array.isArray((data as any).expenseCategories) ? (data as any).expenseCategories.slice(0, 6) : [];
    if (expenseCats.length === 0) {
      drawText("No expense entries recorded for this quarter.", 9, false, COLORS.neutral);
    } else {
      expenseCats.forEach((c: any) => {
        const amt = Number(c.amount || 0);
        drawText(`${winAnsiSafe(String(c.category))}: $${amt.toLocaleString()}`, 9, false, amt > 0 ? COLORS.expense : COLORS.neutral);
      });
    }
    y -= 10;

    // --- CATEGORY ANALYSIS ---
    ensureSpace(200);
    drawText("5. CATEGORY SIGNALS (WHERE PROFIT CAME FROM)", 12, true, COLORS.primary);
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

    // --- DECISION SIGNALS + NEXT QUARTER ---
    ensureSpace(250);
    drawText("6. DECISION SIGNALS + NEXT QUARTER PLAN", 12, true, COLORS.primary);
    y -= 10;
    
    const insights = [
        { label: "New Customers Acquired", value: data.customers.new },
        { label: "Returning Client Base", value: data.customers.returning },
        { label: "Inventory Value (Allocated)", value: `$${Number((data as any).finances?.inventoryValue || 0).toLocaleString()}` },
        { label: "Inventory Turnover (Model)", value: Number(data.turnover || 0).toFixed(2) }
    ];

    insights.forEach((ins, i) => {
        const ix = i % 2 === 0 ? margin : margin + (width - margin * 2) / 2;
        const iy = y - (Math.floor(i / 2) * 50);
        page.drawRectangle({ x: ix, y: iy - 40, width: (width - margin * 2) / 2 - 10, height: 40, color: COLORS.bg });
        pText(`${ins.label}`, { x: ix + 10, y: iy - 15, size: 8, font: fontBold, color: COLORS.neutral });
        pText(String(ins.value), { x: ix + 10, y: iy - 32, size: 12, font: fontBold, color: COLORS.header });
    });
    y -= 110;

    // --- OWNER ACTIONS ---
    ensureSpace(150);
    drawText("7. OWNER ACTIONS (NEXT 90 DAYS)", 12, true, COLORS.primary);
    y -= 5;
    const advisories = [];
    const netProfit = Number(data.finances.netProfit || 0);
    const opEx = Number((data as any).finances?.operatingExpenses || 0);
    const revPT = Number(data.finances.revenuePreTax || 0);
    const opExRatio = revPT > 0 ? (opEx / revPT) * 100 : 0;

    if (netProfit < 0) advisories.push("Quarter ended negative. Reduce fixed commitments or increase revenue capacity before expanding.");
    if (opExRatio > 55) advisories.push(`OpEx is ${opExRatio.toFixed(0)}% of pre-tax revenue. Tighten approvals and renegotiate recurring costs.`);
    if (Number(data.turnover || 0) < 0.5) advisories.push("Inventory turnover is low. Stop buying slow lines and clear aged stock aggressively.");
    if (data.customers.returning < data.customers.new) advisories.push("Retention underperforms. Introduce loyalty capture and measure repeat rate monthly.");
    if (advisories.length === 0) advisories.push("Healthy quarter. Focus next quarter on margin expansion and inventory discipline.");

    advisories.forEach(adv => {
        page.drawText(`- ${winAnsiSafe(adv)}`, { x: margin + 10, y, size: 9, font: fontItalic, color: COLORS.neutral, maxWidth: width - margin * 2 - 20 });
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
