import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const { workEmail, pin } = await req.json();
  if (!workEmail || !pin) {
    return NextResponse.json({ error: "Missing workEmail or pin" }, { status: 400 });
  }

  const email = String(workEmail).trim().toLowerCase();
  console.log("[/api/staff/login] Login attempt for:", email);

  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .select("*")
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    console.log("[/api/staff/login] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!employee) {
    console.log("[/api/staff/login] Employee not found");
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const active = (employee as any).is_active ?? (employee as any).active ?? true;
  if (!active) {
    console.log("[/api/staff/login] Employee inactive");
    return NextResponse.json({ error: "Employee inactive" }, { status: 403 });
  }

  const shopId = (employee as any).shop_id;
  console.log("[/api/staff/login] Employee shop_id:", shopId);
  const pinString = String(pin).trim();
  const SHOP_PINS: Record<string, string> = {
    kipasa: process.env.NIRVANA_PIN_KIPASA || "1234",
    dubdub: process.env.NIRVANA_PIN_DUBDUB || "5678",
    tradecenter: process.env.NIRVANA_PIN_TRADECENTER || "0000",
  };

  if (!shopId || !SHOP_PINS[shopId]) {
    console.log("[/api/staff/login] Shop not configured:", shopId);
    return NextResponse.json({ error: "Employee shop not configured" }, { status: 400 });
  }

  console.log("[/api/staff/login] PIN check, expected:", SHOP_PINS[shopId], "got:", pinString);
  if (pinString !== SHOP_PINS[shopId]) {
    console.log("[/api/staff/login] Invalid PIN");
    return NextResponse.json({ error: "Invalid device PIN" }, { status: 401 });
  }

  // Create staff session
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  console.log("[/api/staff/login] Creating session with hash:", tokenHash.substring(0, 8) + "...", "expires:", expiresAt);

  const insert = await supabaseAdmin.from("staff_sessions").insert({
    employee_id: employee.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (insert.error) {
    console.log("[/api/staff/login] Session insert error:", insert.error.message);
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }
  console.log("[/api/staff/login] Session created successfully");

  // Avoid auth conflicts: if this browser previously had an owner cookie, clear it so staff auth can be detected.
  // (AccessGate relies on /api/staff/me which should prefer staff sessions.)
  (await cookies()).set("nirvana_owner", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  (await cookies()).set("nirvana_staff", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  console.log("[/api/staff/login] Cookies set successfully");

  return NextResponse.json({
    success: true,
    shopId: (employee as any).shop_id,
    role: (employee as any).role,
  });
}
