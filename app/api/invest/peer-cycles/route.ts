import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
    const { data, error } = await supabaseAdmin
      .from("peer_cycles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ cycles: data || [] });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const peersCount = Number(body?.peersCount || 0);
    const contributionAmount = Number(body?.contributionAmount || 0);
    const yourPosition = body?.yourPosition == null ? null : Number(body.yourPosition);
    const frequencyDays = Number(body?.frequencyDays || 7);
    const startDate = body?.startDate ? String(body.startDate) : null;
    const notes = body?.notes ? String(body.notes) : null;

    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
    if (!Number.isFinite(peersCount) || peersCount < 2) return NextResponse.json({ error: "Invalid peersCount" }, { status: 400 });
    if (!Number.isFinite(contributionAmount) || contributionAmount <= 0) return NextResponse.json({ error: "Invalid contributionAmount" }, { status: 400 });
    if (!Number.isFinite(frequencyDays) || frequencyDays <= 0) return NextResponse.json({ error: "Invalid frequencyDays" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("peer_cycles")
      .insert({
        name,
        peers_count: peersCount,
        contribution_amount: contributionAmount,
        your_position: Number.isFinite(yourPosition as any) ? yourPosition : null,
        frequency_days: frequencyDays,
        start_date: startDate,
        notes,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, cycle: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

