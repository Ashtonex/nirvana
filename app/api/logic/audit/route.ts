import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("audit_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ entries: data || [] });
  } catch (e: any) {
    console.error("Audit API error:", e);
    return NextResponse.json({ error: e.message, entries: [] }, { status: 500 });
  }
}
