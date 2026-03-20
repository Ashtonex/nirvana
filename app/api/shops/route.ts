import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
    
    const { data, error } = await supabaseAdmin
      .from("shops")
      .select("id, name")
      .order("id", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ shops: data || [] });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg, shops: [] }, { status });
  }
}
