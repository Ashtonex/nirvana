import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const jar = await cookies();

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

  const token = jar.get("nirvana_staff")?.value;
  if (!token) {
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

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id,name,surname,shop_id,role,is_active,active")
    .eq("id", session.employee_id)
    .maybeSingle();

  return NextResponse.json({ staff: staff || null });
}
