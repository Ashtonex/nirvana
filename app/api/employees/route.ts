import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, shop_id, role")
      .order("name");

    if (error) throw error;

    return NextResponse.json({ employees: employees || [] });
  } catch (e: any) {
    console.error("Employees API Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
