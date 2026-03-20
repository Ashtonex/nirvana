import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePrivilegedActor();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Handshake ID required" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const acknowledgedBy = actor.type === "staff" ? actor.employeeId : "owner";

    const { data, error } = await supabaseAdmin
      .from("operations_handshakes")
      .update({
        status: "acknowledged",
        acknowledged_at: timestamp,
        acknowledged_by: acknowledgedBy,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, handshake: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
