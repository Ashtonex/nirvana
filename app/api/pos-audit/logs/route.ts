import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    const { data: logs, error } = await supabaseAdmin
      .from("pos_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ logs: logs || [] });
  } catch (e: any) {
    console.error("Audit Logs API Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
