import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("operations_drifts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ drifts: [], error: error.message });
    }

    return NextResponse.json({ drifts: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));
    
    const amount = Number(body?.amount);
    const reason = String(body?.reason || "");
    const resolveKind = String(body?.resolveKind || "explained");
    const resolveShop = String(body?.resolveShop || "");
    
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "Reason required" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);

    // Get current computed balance from ledger
    const { data: ledgerRows } = await supabaseAdmin
      .from("operations_ledger")
      .select("amount");
    
    const computedBalance = (ledgerRows || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    
    // Get current actual balance
    const { data: opsState } = await supabaseAdmin
      .from("operations_state")
      .select("actual_balance")
      .eq("id", 1)
      .maybeSingle();
    
    const currentActualBalance = Number(opsState?.actual_balance || 0);
    
    // The validated balance = computed balance (what's accounted for) + the drift amount (what was unexplained)
    // This validates the cash by saying "the drift is real money from [reason]"
    const newActualBalance = computedBalance + amount;

    // 1. Record the drift resolution explanation
    const driftRecord = {
      id,
      amount,
      reason,
      resolved_kind: resolveKind,
      resolved_shop: resolveShop,
      created_at: timestamp,
      created_by: actor.type === "staff" ? actor.employeeId : "owner",
    };

    const { data: drift, error: driftError } = await supabaseAdmin
      .from("operations_drifts")
      .insert(driftRecord)
      .select("*")
      .maybeSingle();

    if (driftError) {
      console.error("Drift insert error:", driftError);
    }

    // 2. Update actual_balance to validate the cash (NO new ledger entry)
    // The drift is validated, meaning the cash exists but was unexplained
    // We update actual_balance to match computed_balance + drift to show it's validated
    await supabaseAdmin
      .from("operations_state")
      .upsert({
        id: 1,
        actual_balance: newActualBalance,
        updated_at: timestamp,
      });

    return NextResponse.json({
      success: true,
      drift: drift || driftRecord,
      validation: {
        computedBalance,
        previousActualBalance: currentActualBalance,
        newActualBalance,
        validatedAmount: amount,
        reason,
      }
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
