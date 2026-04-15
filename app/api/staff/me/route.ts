import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const jar = await cookies();

    const token = jar.get("nirvana_staff")?.value;
    if (!token) {
      const ownerToken = jar.get("nirvana_owner")?.value;
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

      return NextResponse.json({ staff: null }, { status: 401 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

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
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    const employeeId = String(session.employee_id || "");
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
      return NextResponse.json({ staff: null }, { status: 401 });
    }

    return NextResponse.json({ staff: staff || null });
  } catch (e: any) {
    console.error("[Staff /me] Unexpected error:", e);
    return NextResponse.json({ staff: null }, { status: 500 });
  }
}
