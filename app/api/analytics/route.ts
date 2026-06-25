import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    try {
      await requirePrivilegedActor();
    } catch {
      await requireStaffActor();
    }
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    if (!kind) {
      return NextResponse.json({ error: "Kind required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("analytics_results")
      .select("id, kind, status, generated_at, summary, payload, created_at")
      .eq("kind", kind)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return NextResponse.json({ result: data || null });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
