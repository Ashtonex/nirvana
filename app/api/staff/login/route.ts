import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeShopKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export async function POST(req: Request) {
  try {
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
      console.error("[Staff Login] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const employeeRecord = employee as Record<string, unknown>;
    const active = employeeRecord.is_active ?? employeeRecord.active ?? true;
    if (!active) {
      return NextResponse.json({ error: "Employee inactive" }, { status: 403 });
    }

    const shopId = String(employeeRecord.shop_id || "");
    const normalizedShopId = normalizeShopKey(shopId);
    const pinString = String(pin).trim();
    
    const SHOP_PINS: Record<string, string> = {
      kipasa: process.env.NIRVANA_PIN_KIPASA || "1234",
      dubdub: process.env.NIRVANA_PIN_DUBDUB || "5678",
      tradecenter: process.env.NIRVANA_PIN_TRADECENTER || "0000",
    };

    if (!normalizedShopId) {
      console.error("[Staff Login] Employee has no shop_id:", employee.id, email);
      return NextResponse.json({ error: "Employee shop not configured" }, { status: 400 });
    }

    if (!SHOP_PINS[normalizedShopId]) {
      console.error("[Staff Login] Shop not in PIN config:", normalizedShopId, "employee:", email);
      return NextResponse.json({ error: "Employee shop not configured" }, { status: 400 });
    }

    if (pinString !== SHOP_PINS[normalizedShopId]) {
      return NextResponse.json({ error: "Invalid device PIN" }, { status: 401 });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const insert = await supabaseAdmin.from("staff_sessions").insert({
      employee_id: employee.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (insert.error) {
      console.error("[Staff Login] Session insert error:", insert.error);
      return NextResponse.json({ error: insert.error.message }, { status: 500 });
    }

    console.log("[Staff Login] Session created for:", email, "shop:", shopId, "tokenHash:", tokenHash.substring(0, 16) + "...");

    const isProduction = process.env.NODE_ENV === "production";
    
    const response = NextResponse.json({
      success: true,
      shopId,
      role: employeeRecord.role,
      tokenPrefix: token.substring(0, 8),
    });

    response.cookies.set("nirvana_owner", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    response.cookies.set("nirvana_staff", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });

    console.log("[Staff Login] Cookie set, secure:", isProduction);

    return response;
  } catch (e: any) {
    console.error("[Staff Login] Unexpected error:", e);
    return NextResponse.json({ error: e.message || "Login failed" }, { status: 500 });
  }
}
