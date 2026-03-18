import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { createOperationsLedgerEntry } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
    const url = new URL(req.url);
    const cycleId = url.searchParams.get("cycleId") || "";
    if (!cycleId) return NextResponse.json({ error: "Missing cycleId" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("peer_cycle_events")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("event_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ events: data || [] });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));
    const cycleId = String(body?.cycleId || "");
    const direction = String(body?.direction || "").toLowerCase(); // 'in' | 'out'
    const amountAbs = Number(body?.amount || 0);
    const eventDate = body?.eventDate ? String(body.eventDate) : null;
    const title = body?.title ? String(body.title) : null;
    const notes = body?.notes ? String(body.notes) : null;

    if (!cycleId) return NextResponse.json({ error: "Missing cycleId" }, { status: 400 });
    if (direction !== "in" && direction !== "out") return NextResponse.json({ error: "direction must be in|out" }, { status: 400 });
    if (!Number.isFinite(amountAbs) || amountAbs <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    const amount = direction === "out" ? -Math.abs(amountAbs) : Math.abs(amountAbs);

    const { data, error } = await supabaseAdmin
      .from("peer_cycle_events")
      .insert({
        cycle_id: cycleId,
        direction,
        amount,
        event_date: eventDate,
        title,
        notes,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Mirror into Operations ledger so the business vault sees it.
    await createOperationsLedgerEntry({
      amount,
      kind: direction === "out" ? "peer_contribution" : "peer_payout",
      title: title || (direction === "out" ? "Peer contribution" : "Peer payout"),
      notes,
      effectiveDate: eventDate,
      employeeId: actor.type === "staff" ? actor.employeeId : null,
      metadata: { cycleId, eventId: data?.id || null },
    });

    return NextResponse.json({ success: true, event: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

