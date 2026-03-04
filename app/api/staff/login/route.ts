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

  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .select("*")
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const active = (employee as any).is_active ?? (employee as any).active ?? true;
  if (!active) {
    return NextResponse.json({ error: "Employee inactive" }, { status: 403 });
  }

  const shopId = (employee as any).shop_id;
  const pinString = String(pin).trim();
  const SHOP_PINS: Record<string, string> = {
    kipasa: process.env.NIRVANA_PIN_KIPASA || "1234",
    dubdub: process.env.NIRVANA_PIN_DUBDUB || "5678",
    tradecenter: process.env.NIRVANA_PIN_TRADECENTER || "0000",
  };

  if (!shopId || !SHOP_PINS[shopId]) {
    return NextResponse.json({ error: "Employee shop not configured" }, { status: 400 });
  }

  if (pinString !== SHOP_PINS[shopId]) {
    return NextResponse.json({ error: "Invalid device PIN" }, { status: 401 });
  }

  // Create staff session
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const insert = await supabaseAdmin.from("staff_sessions").insert({
    employee_id: employee.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (insert.error) {
    return NextResponse.json({ error: insert.error.message }, { status: 500 });
  }

  (await cookies()).set("nirvana_staff", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });

  return NextResponse.json({
    success: true,
    shopId: (employee as any).shop_id,
    role: (employee as any).role,
  });
}
