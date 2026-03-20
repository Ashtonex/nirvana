import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));

    const newBalance = Number(body?.newBalance);
    const reason = String(body?.reason || "");

    if (!Number.isFinite(newBalance) || newBalance < 0) {
      return NextResponse.json({ error: "Invalid balance" }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ error: "Reason required for adjustment" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // Get current state
    const { data: opsState } = await supabaseAdmin
      .from("operations_state")
      .select("actual_balance, updated_at")
      .eq("id", 1)
      .maybeSingle();

    const previousBalance = Number(opsState?.actual_balance || 0);
    const balanceChange = newBalance - previousBalance;

    // Create adjustment record
    const adjustmentId = Math.random().toString(36).substring(2, 9);
    const adjustmentRecord = {
      id: adjustmentId,
      amount: balanceChange,
      previous_balance: previousBalance,
      new_balance: newBalance,
      reason,
      created_at: timestamp,
      created_by: actor.type === "staff" ? actor.employeeId : "owner",
    };

    // Store as a drift record for audit trail
    const { data: drift, error: driftError } = await supabaseAdmin
      .from("operations_drifts")
      .insert({
        id: adjustmentId,
        amount: Math.abs(balanceChange),
        reason: `[VAULT ADJUSTMENT] ${reason}`,
        resolved_kind: balanceChange >= 0 ? "vault_increase" : "vault_decrease",
        created_at: timestamp,
        created_by: actor.type === "staff" ? actor.employeeId : "owner",
        allocations: [{
          category: "vault_adjustment",
          adjustment_id: adjustmentId,
          previous_balance: previousBalance,
          new_balance: newBalance,
        }],
      })
      .select("*")
      .maybeSingle();

    if (driftError) {
      console.error("Adjustment drift error:", driftError);
    }

    // Update actual_balance
    await supabaseAdmin
      .from("operations_state")
      .upsert({
        id: 1,
        actual_balance: newBalance,
        updated_at: timestamp,
      });

    // Record the adjustment in ledger for tracking
    if (balanceChange !== 0) {
      await supabaseAdmin.from("operations_ledger").insert({
        amount: balanceChange,
        kind: "adjustment",
        title: `Vault Adjustment: ${reason}`,
        notes: `Previous: $${previousBalance.toFixed(2)} → New: $${newBalance.toFixed(2)}`,
        effective_date: timestamp.split("T")[0],
        metadata: {
          type: "vault_adjustment",
          adjustment_id: adjustmentId,
          previous_balance: previousBalance,
          new_balance: newBalance,
          change: balanceChange,
          created_by: actor.type === "staff" ? actor.employeeId : "owner",
        },
        created_at: timestamp,
      });
    }

    return NextResponse.json({
      success: true,
      adjustment: adjustmentRecord,
      vault: {
        previousBalance,
        newBalance,
        change: balanceChange,
        reason,
      }
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
