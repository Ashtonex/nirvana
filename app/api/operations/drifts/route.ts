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
    const allocations = body?.allocations || [];
    const committed = Boolean(body?.committed); // true = money moved to vault, false = money was already in vault

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

    // Record the drift resolution
    const driftRecord = {
      id: driftId,
      amount: totalAllocated,
      reason,
      resolved_kind: committed ? "cash_committed" : "cash_validated",
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

    // If COMMITTED: money is being moved from drift pool to tracked vault
    // Create ledger entries to account for this money
    // computed_balance increases, drift decreases
    // actual_balance stays the same (money was already counted)
    if (committed) {
      for (const alloc of allocations) {
        await supabaseAdmin.from("operations_ledger").insert({
          amount: Number(alloc.amount || 0),
          kind: "overhead_payment",
          shop_id: String(alloc.shopId || ""),
          overhead_category: String(alloc.category || "misc"),
          title: `Drift Commit: ${reason}`,
          notes: reason,
          effective_date: timestamp.split("T")[0],
          metadata: {
            type: "drift_commit",
            drift_id: driftId,
            reason,
          },
          created_at: timestamp,
        });
      }
    }
    // If NOT committed: money was already in vault, just explaining it
    // No ledger entries, no balance changes
    // Drift just gets "validated" (marked as explained)

    return NextResponse.json({
      success: true,
      drift: drift || driftRecord,
      validation: {
        committed,
        previousActualBalance: currentActualBalance,
        previousComputedBalance: computedBalance,
        previousDrift: currentDrift,
        validatedAmount: totalAllocated,
        remainingDrift: currentDrift - totalAllocated,
        reason,
      }
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
