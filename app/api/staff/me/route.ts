import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
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

  const { data: session, error } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  const employeeId = String(session.employee_id || "").trim();
  if (!employeeId) {
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id,name,surname,shop_id,role,is_active,active")
    .eq("id", employeeId)
    .maybeSingle();

  if (!staff) {
    const { data: allStaff } = await supabaseAdmin
      .from("employees")
      .select("id,name,surname,shop_id,role,is_active,active")
      .limit(5);
    console.error("[/api/staff/me] Employee not found for id:", employeeId, "Available:", allStaff?.map((e: any) => e.id));
    return NextResponse.json({ staff: null }, { status: 401 });
  }

  const active = Boolean(staff.is_active ?? staff.active ?? true);
  if (!active) {
    return NextResponse.json({ staff: null }, { status: 403 });
  }

  return NextResponse.json({ staff });
}
