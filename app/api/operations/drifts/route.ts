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
    
    // Total allocated amount
    const totalAllocated = allocations.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0);

    // Create ledger entries for each allocation
    const ledgerEntries = [];
    for (const alloc of allocations) {
      const ledgerId = Math.random().toString(36).substring(2, 9);
      const entry = {
        id: ledgerId,
        amount: Number(alloc.amount || 0),
        kind: "overhead_payment",
        shop_id: String(alloc.shopId || ""),
        overhead_category: String(alloc.category || "misc"),
        title: `Drift Resolution: ${reason}`,
        notes: reason,
        effective_date: timestamp.split("T")[0],
        metadata: {
          type: "drift_resolution",
          drift_id: driftId,
          reason,
        },
        created_at: timestamp,
      };
      
      const { error: ledgerError } = await supabaseAdmin
        .from("operations_ledger")
        .insert(entry);
      
      if (!ledgerError) {
        ledgerEntries.push(entry);
      }
    }

    // Record the drift resolution
    const driftRecord = {
      id: driftId,
      amount: totalAllocated,
      reason,
      resolved_kind: "overhead_linked",
      created_at: timestamp,
      created_by: actor.type === "staff" ? actor.employeeId : "owner",
      allocations: allocations,
    };

    const { data: drift, error: driftError } = await supabaseAdmin
      .from("operations_drifts")
      .insert(driftRecord)
      .select("*")
      .maybeSingle();

    if (driftError) {
      console.error("Drift insert error:", driftError);
    }

    // Update actual_balance to match computed_balance (drift becomes 0)
    // The allocations have been added to ledger, so computed will now include them
    const newComputedBalance = computedBalance + totalAllocated;
    
    await supabaseAdmin
      .from("operations_state")
      .upsert({
        id: 1,
        actual_balance: newComputedBalance,
        updated_at: timestamp,
      });

    return NextResponse.json({
      success: true,
      drift: drift || driftRecord,
      ledgerEntries,
      validation: {
        previousComputedBalance: computedBalance,
        previousActualBalance: currentActualBalance,
        totalAllocated,
        newComputedBalance,
        newActualBalance: newComputedBalance,
        driftResolved: Math.abs(currentActualBalance - computedBalance - totalAllocated) < 0.01,
        reason,
      }
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
