import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance } from "@/lib/operations";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const scenario = body.scenario || "Recession";
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return NextResponse.json({
      jobId,
      scenario,
      status: "started",
      message: "Simulation job created. Poll /api/logic/stress-test/stream for progress."
    });
  } catch (e: any) {
    console.error("Stress test start error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
