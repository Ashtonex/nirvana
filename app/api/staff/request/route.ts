import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  const { workEmail } = await req.json();
  if (!workEmail) {
    return NextResponse.json({ error: "Missing workEmail" }, { status: 400 });
  }

  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("*")
    .eq("email", workEmail)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const active = (employee as any).is_active ?? (employee as any).active ?? true;
  if (!active) {
    return NextResponse.json({ error: "Employee inactive" }, { status: 403 });
  }

  const personalEmail = (employee as any).personal_email;
  if (!personalEmail) {
    return NextResponse.json({ error: "Missing personal email for employee" }, { status: 400 });
  }

  const code = String(randomInt(100000, 999999));
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin.from("staff_login_codes").insert({
    employee_id: employee.id,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  await sendEmail({
    to: personalEmail,
    subject: "Your Nirvana login code",
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2>Your Nirvana login code</h2>
        <p>Hi ${employee.name},</p>
        <p>Use this code to log in:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:6px;padding:16px;background:#f1f5f9;border-radius:12px;display:inline-block;">
          ${code}
        </div>
        <p style="margin-top:16px;color:#64748b;font-size:12px;">This code expires in 10 minutes.</p>
      </div>
    `,
  });

  return NextResponse.json({ success: true });
}
