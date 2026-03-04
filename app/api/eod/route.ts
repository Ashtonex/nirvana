import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { ORACLE_RECIPIENT } from "@/lib/resend";
import { sendEmail } from "@/lib/email";

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const shopId = body?.shopId;
  const sendEmailEnabled = body?.sendEmail !== false;
  if (!shopId) {
    return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
  }

  // Staff auth only (device usage)
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
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date")
    .eq("shop_id", shopId)
    .gte("date", since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = sales || [];
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);

  const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
  for (const s of rows as any[]) {
    const key = s.item_name || "Unknown";
    const cur = itemMap.get(key) || { name: key, qty: 0, gross: 0 };
    cur.qty += Number(s.quantity || 0);
    cur.gross += Number(s.total_with_tax || 0);
    itemMap.set(key, cur);
  }
  const topItems = [...itemMap.values()]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 8);

  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  let emailed = false;
  if (sendEmailEnabled) {
    try {
      await sendEmail({
        to: recipient,
        subject: `[EOD] ${shopId.toUpperCase()} — ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
            <h2 style="margin:0 0 12px;">End of Day Report — ${shopId.toUpperCase()}</h2>
            <p style="color:#64748b;margin:0 0 16px;">Generated: ${new Date().toLocaleString()}</p>

            <div style="background:#f1f5f9;padding:16px;border-radius:12px;">
              <p style="margin:0;"><b>Transactions:</b> ${rows.length}</p>
              <p style="margin:4px 0 0;"><b>Total (inc tax):</b> $${totalWithTax.toFixed(2)}</p>
              <p style="margin:4px 0 0;"><b>Total (pre tax):</b> $${totalBeforeTax.toFixed(2)}</p>
              <p style="margin:4px 0 0;"><b>Tax:</b> $${totalTax.toFixed(2)}</p>
            </div>

            <h3 style="margin:18px 0 8px;">Top Items</h3>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:8px;">Item</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:8px;">Qty</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:8px;">Gross</th>
                </tr>
              </thead>
              <tbody>
                ${topItems
                  .map(
                    (i) => `
                      <tr>
                        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i.name}</td>
                        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${i.qty}</td>
                        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">$${i.gross.toFixed(2)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `,
      });
      emailed = true;
    } catch (e: any) {
      console.error("[EOD] Email send failed:", e?.message || e);
    }
  }

  return NextResponse.json({
    success: true,
    emailed,
    totals: { totalWithTax, totalBeforeTax, totalTax, count: rows.length },
    topItems,
  });
}
