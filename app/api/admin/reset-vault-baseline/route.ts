import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confirm } = body;

    if (confirm !== "RESET_VAULT_BASELINE") {
      return NextResponse.json(
        { error: "Must confirm with RESET_VAULT_BASELINE" },
        { status: 400 }
      );
    }

    const { data: opsState, error: stateError } = await supabaseAdmin
      .from("operations_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (stateError) throw stateError;

    const actualVault = Number(opsState?.actual_balance || 0);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: opsEntries, error: entriesError } = await supabaseAdmin
      .from("operations_ledger")
      .select("*")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (entriesError) throw entriesError;

    const computedVault = (opsEntries || []).reduce(
      (sum: number, e: any) => sum + Number(e.amount || 0),
      0
    );

    const drift = actualVault - computedVault;

    if (Math.abs(drift) < 1) {
      return NextResponse.json({
        message: "Vault is already balanced. No drift to fix.",
        actualVault,
        computedVault,
        drift,
        action: "none"
      });
    }

    const { data: insertData, error: insertError } = await supabaseAdmin
      .from("operations_ledger")
      .insert({
        title: "Vault Baseline Reset",
        kind: "vault_baseline",
        amount: drift,
        shop_id: null,
        notes: `Baseline reset: computed was $${computedVault.toFixed(2)}, actual was $${actualVault.toFixed(2)}. Inserted $${drift.toFixed(2)} to balance. Drift reset to 0 on ${now.toISOString()}`,
        effective_date: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      message: "Vault baseline reset successfully",
      actualVault,
      computedVault,
      drift,
      balancingEntry: drift,
      newComputedBalance: actualVault,
      entryId: insertData.id,
      action: "reset"
    });
  } catch (error: any) {
    console.error("[Vault Baseline Reset]", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset vault baseline" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { data: opsState } = await supabaseAdmin
      .from("operations_state")
      .select("*")
      .eq("id", 1)
      .single();

    const actualVault = Number(opsState?.actual_balance || 0);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: opsEntries } = await supabaseAdmin
      .from("operations_ledger")
      .select("*")
      .gte("created_at", thirtyDaysAgo.toISOString());

    const computedVault = (opsEntries || []).reduce(
      (sum: number, e: any) => sum + Number(e.amount || 0),
      0
    );

    const drift = actualVault - computedVault;

    return NextResponse.json({
      actualVault,
      computedVault,
      drift,
      message: Math.abs(drift) < 1
        ? "Vault is balanced"
        : `Drift of $${drift.toFixed(2)} detected. POST with { confirm: "RESET_VAULT_BASELINE" } to reset.`,
      entriesCount: opsEntries?.length || 0
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to check vault status" },
      { status: 500 }
    );
  }
}
