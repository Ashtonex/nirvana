import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));

    const depositId = String(body?.depositId || "");
    if (!depositId) {
      return NextResponse.json({ error: "Deposit ID required" }, { status: 400 });
    }

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const title = String(body?.title || "Withdrawal");
    const withdrawnBy = actor.type === "staff" ? actor.employeeId : "owner";

    const { data: deposit, error: fetchError } = await supabaseAdmin
      .from("invest_deposits")
      .select("*")
      .eq("id", depositId)
      .maybeSingle();

    if (fetchError || !deposit) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    const available = Number(deposit.amount) - Number(deposit.withdrawn_amount || 0);
    if (amount > available) {
      return NextResponse.json({ error: `Only ${available.toFixed(2)} available` }, { status: 400 });
    }

    const newWithdrawn = Number(deposit.withdrawn_amount || 0) + amount;
    const status = newWithdrawn >= Number(deposit.amount) ? "withdrawn" : "partial";

    const { data, error } = await supabaseAdmin
      .from("invest_deposits")
      .update({
        withdrawn_amount: newWithdrawn,
        withdrawn_at: new Date().toISOString(),
        withdrawn_by: withdrawnBy,
        withdraw_title: title,
        status,
      })
      .eq("id", depositId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, deposit: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
