import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const jar = await cookies();

  const token = jar.get("nirvana_staff")?.value;
  console.log("[/api/staff/me] Token found:", !!token);
  if (!token) {
    const ownerToken = jar.get("nirvana_owner")?.value;
    if (ownerToken) {
      console.log("[/api/staff/me] No staff token, but has owner token - returning owner");
      return NextResponse.json({
        staff: {
          id: "owner",
          name: "Owner",
          surname: "",
          shop_id: null,
          role: "owner",
          is_active: true,
          active: true,
        },
      });
    }

    console.log("[/api/staff/me] No tokens found - returning 401");
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  console.log("[/api/staff/me] Looking up session with hash:", tokenHash.substring(0, 8) + "...");

  const { data: session, error } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  console.log("[/api/staff/me] Session lookup result:", { session: !!session, error: error?.message });
  if (error || !session) {
    console.log("[/api/staff/me] Session not found or error - returning 401");
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  console.log("[/api/staff/me] Session expires_at:", session.expires_at, "Now:", new Date().toISOString());
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    console.log("[/api/staff/me] Session expired - returning 401");
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id,name,surname,shop_id,role,is_active,active")
    .eq("id", session.employee_id)
    .maybeSingle();

  console.log("[/api/staff/me] session.employee_id:", session.employee_id);
  console.log("[/api/staff/me] Staff data:", JSON.stringify(staff));
  return NextResponse.json({ staff: staff || null });
}
