import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { computePosAuditReport } from "@/lib/posAudit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isManagerRole(role: string | null | undefined) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin" || r === "manager" || r === "lead_manager" || r === "lead manager";
}

function ymd(date: Date) {
  return date.toISOString().split("T")[0];
}

function money(n: any) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "$0.00";
  return `$${v.toFixed(2)}`;
}

async function requireManagerForShop(shopId: string) {
  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;

  if (ownerToken) return { kind: "owner" as const };
  if (!staffToken) throw new Error("Unauthorized");

  const tokenHash = createHash("sha256").update(staffToken).digest("hex");
  const { data: session } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!session || (session.expires_at && new Date(session.expires_at).getTime() < Date.now())) throw new Error("Unauthorized");

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id, shop_id, role")
    .eq("id", session.employee_id)
    .maybeSingle();

  if (!staff?.id) throw new Error("Unauthorized");
  if (!isManagerRole(String((staff as any).role || ""))) throw new Error("Forbidden");

  // Managers can only export their own shop unless admin/owner role.
  const role = String((staff as any).role || "").toLowerCase();
  const isAdminLike = role === "admin" || role === "owner";
  if (!isAdminLike && String((staff as any).shop_id || "") !== shopId) throw new Error("Forbidden");

  return { kind: "staff" as const };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = String(url.searchParams.get("shopId") || "").trim();
    const date = String(url.searchParams.get("date") || "").trim(); // YYYY-MM-DD
    const isTest = url.searchParams.get("test") === "true";

    if (!shopId) return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    if (!isTest) {
      await requireManagerForShop(shopId);
    }

    const report = await computePosAuditReport({ shopId, dateYYYYMMDD: date });

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([595.28, 841.89]); // A4 portrait
    let y = 800;

    const ensureSpace = (need: number) => {
      if (y - need > 40) return;
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
    };

    const drawText = (txt: string, size = 11, bold = false, color = rgb(1, 1, 1)) => {
      ensureSpace(size + 8);
      page.drawText(txt, { x: 40, y, size, font: bold ? fontBold : font, color });
      y -= size + 6;
    };

    const drawKV = (k: string, v: string) => {
      ensureSpace(18);
      page.drawText(k, { x: 40, y, size: 10, font: fontBold, color: rgb(0.7, 0.7, 0.7) });
      page.drawText(v, { x: 260, y, size: 10, font, color: rgb(1, 1, 1) });
      y -= 16;
    };

    drawText(`POS FINANCE AUDIT — ${shopId.toUpperCase()}`, 18, true);
    drawText(`Date: ${report.date}  |  Generated: ${new Date(report.generatedAt).toLocaleString()}`, 10, false, rgb(0.7, 0.7, 0.7));
    y -= 6;

    drawText("Opening vs Expected", 12, true);
    drawKV("Opening entered", report.opening.amount === null ? "MISSING" : money(report.opening.amount));
    drawKV("Entered by", report.opening.enteredByName || report.opening.enteredByEmployeeId || "Unknown");
    drawKV("Expected (prev closing)", money(report.expectedOpeningFromPrevClosing.estimatedPrevClosing));
    drawKV("Variance", report.variance.amount === null ? "-" : money(report.variance.amount));
    y -= 8;

    if ((report.flags || []).length) {
      drawText("Flags", 12, true);
      for (const f of report.flags) {
        const col = f.severity === "critical" ? rgb(1, 0.4, 0.4) : f.severity === "warn" ? rgb(1, 0.75, 0.4) : rgb(0.75, 0.75, 0.75);
        drawText(`${f.code}: ${f.message}`, 9, false, col);
      }
      y -= 6;
    }

    drawText("Totals", 12, true);
    drawKV("Sales (inc tax)", money(report.totals.salesWithTax));
    drawKV("Sales (pre tax)", money(report.totals.salesBeforeTax));
    drawKV("Tax", money(report.totals.tax));
    drawKV("Cash sales", money(report.totals.cashSales));
    drawKV("EcoCash sales", money(report.totals.ecocashSales));
    drawKV("Lay-by cash", money(report.totals.laybyCash));
    drawKV("POS expenses", money(report.totals.posExpenses));
    drawKV("Drawer adjustments (net)", money(report.totals.cashDrawerAdjustmentNet));
    drawKV("Estimated closing cash", report.totals.estimatedClosingCash === null ? "-" : money(report.totals.estimatedClosingCash));
    y -= 10;

    drawText("Sales (Top 40)", 12, true);
    const sales = (report.sales || []).slice(0, 40);
    for (const s of sales) {
      const line = `${new Date(s.timestamp).toLocaleTimeString()} | ${s.employeeName || s.employeeId || "SYSTEM"} | ${s.itemName} x${s.qty} | ${money(s.totalWithTax)} | ${String(s.paymentMethod || "").toUpperCase()}`;
      drawText(line.slice(0, 120), 8, false, rgb(0.85, 0.9, 1));
    }
    y -= 8;

    drawText("Expenses (Top 40)", 12, true);
    const exps = (report.expenses || []).slice(0, 40);
    for (const e of exps) {
      const line = `${new Date(e.timestamp).toLocaleTimeString()} | ${e.employeeName || e.employeeId || "Unknown"} | ${e.category} | ${money(e.amount)} | ${String(e.description || "")}`;
      drawText(line.slice(0, 120), 8, false, rgb(1, 0.9, 0.85));
    }

    const bytes = await pdf.save();
    const filename = `POS_AUDIT_${shopId}_${report.date}_${ymd(new Date())}.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const msg = e?.message || "Failed to generate PDF";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
