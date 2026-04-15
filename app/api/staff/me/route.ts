import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const jar = await cookies();
    const token = jar.get("nirvana_staff")?.value;
    const ownerToken = jar.get("nirvana_owner")?.value;

    console.log("[Staff /me] Checking auth, has nirvana_staff:", !!token, "has nirvana_owner:", !!ownerToken);

    if (!token) {
      if (ownerToken) {
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
      console.log("[Staff /me] No nirvana_staff cookie, returning 401");
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    console.log("[Staff /me] Token hash:", tokenHash.substring(0, 16) + "...");

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("staff_sessions")
      .select("employee_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (sessionError) {
      console.error("[Staff /me] Session lookup error:", sessionError);
      return NextResponse.json({ staff: null }, { status: 500 });
    }

    if (!session) {
      console.log("[Staff /me] No session found for token hash");
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      console.log("[Staff /me] Session expired");
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    const employeeId = String(session.employee_id || "");
    console.log("[Staff /me] Looking up employee:", employeeId);

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("employees")
      .select("id,name,surname,shop_id,role,is_active,active")
      .eq("id", employeeId)
      .maybeSingle();

    if (staffError) {
      console.error("[Staff /me] Employee lookup error:", staffError);
      return NextResponse.json({ staff: null }, { status: 500 });
    }

    if (!staff) {
      console.log("[Staff /me] Employee not found:", employeeId);
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    console.log("[Staff /me] Staff found:", staff.shop_id, staff.role);
    return NextResponse.json({ staff: staff || null });
  } catch (e: any) {
    console.error("[Staff /me] Unexpected error:", e);
    return NextResponse.json({ staff: null }, { status: 500 });
  }
}
