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
    
    const reason = String(body?.reason || "");
    const allocations = body?.allocations || []; // Array of { shopId, category, amount }
    
    if (!reason) {
      return NextResponse.json({ error: "Reason required" }, { status: 400 });
    }
    
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: "At least one allocation required" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const driftId = Math.random().toString(36).substring(2, 9);

    // Get current state
    const { data: ledgerRows } = await supabaseAdmin
      .from("operations_ledger")
      .select("amount");
    
    const computedBalance = (ledgerRows || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    
    const { data: opsState } = await supabaseAdmin
      .from("operations_state")
      .select("actual_balance")
      .eq("id", 1)
      .maybeSingle();
    
    const currentActualBalance = Number(opsState?.actual_balance || 0);
    const currentDrift = currentActualBalance - computedBalance;
    
    // Total allocated amount
    const totalAllocated = allocations.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0);

    // VALIDATION: This is CASH VALIDATION, not money movement
    // The money was ALREADY in the vault (actual_balance)
    // We're just explaining where it came from
    // NO ledger entries are created
    // The drift decreases because we've explained part of it

    // Record the drift resolution with allocations
    const driftRecord = {
      id: driftId,
      amount: totalAllocated,
      reason,
      resolved_kind: "cash_validated",
      created_at: timestamp,
      created_by: actor.type === "staff" ? actor.employeeId : "owner",
      allocations: allocations.map((a: any) => ({
        shop_id: a.shopId,
        category: a.category,
        amount: Number(a.amount || 0),
      })),
    };

    const { data: drift, error: driftError } = await supabaseAdmin
      .from("operations_drifts")
      .insert(driftRecord)
      .select("*")
      .maybeSingle();

    if (driftError) {
      console.error("Drift insert error:", driftError);
    }

    // NO changes to actual_balance or ledger
    // The drift automatically reduces because:
    // - The explained amount is now recorded as "validated cash"
    // - Remaining drift = current_drift - validated_amount

    return NextResponse.json({
      success: true,
      drift: drift || driftRecord,
      validation: {
        previousActualBalance: currentActualBalance,
        previousComputedBalance: computedBalance,
        previousDrift: currentDrift,
        validatedAmount: totalAllocated,
        remainingDrift: currentDrift - totalAllocated,
        allocations: allocations,
        reason,
      }
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
