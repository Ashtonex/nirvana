import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { workEmail, code } = await req.json();
  if (!workEmail || !code) {
    return NextResponse.json({ error: "Missing workEmail or code" }, { status: 400 });
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

  const codeHash = createHash("sha256").update(String(code)).digest("hex");

  const { data: record } = await supabaseAdmin
    .from("staff_login_codes")
    .select("id,expires_at")
    .eq("employee_id", employee.id)
    .eq("code_hash", codeHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Code expired" }, { status: 400 });
  }

  // Create staff session
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.from("staff_sessions").insert({
    employee_id: employee.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  // Consume code
  await supabaseAdmin.from("staff_login_codes").delete().eq("id", record.id);

  // Log the login action for staff status tracking
  try {
    await supabaseAdmin.from("staff_logs").insert({
      employee_id: employee.id,
      employee_name: `${employee.name || ""} ${employee.surname || ""}`.trim() || employee.email,
      shop_id: (employee as any).shop_id || null,
      action: "login",
    });
  } catch (e) {
    console.error("Failed to create staff log:", e);
  }

  (await cookies()).set("nirvana_staff", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });

  return NextResponse.json({ success: true });
}
