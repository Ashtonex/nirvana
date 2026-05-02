import { NextResponse } from 'next/server';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';
import { getOperationsState, getOperationsComputedBalance, createOperationsLedgerEntry } from '@/lib/operations';

export async function POST() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const [opsState, computedBalance] = await Promise.all([
      getOperationsState(),
      getOperationsComputedBalance()
    ]);

    const actualBalance = Number(opsState?.actual_balance || 0);
    const computed = Number(computedBalance || 0);
    const delta = actualBalance - computed;

    if (Math.abs(delta) < 0.01) {
      return NextResponse.json({ success: true, message: 'Variance is already 0. Nothing to rationalize.' });
    }

    // Insert balancing entry into the ledger
    await createOperationsLedgerEntry({
      amount: delta,
      kind: 'adjustment',
      title: 'System Variance Reset',
      notes: `Rationalisation reset to align Computed Ledger with Actual Reality. Computed was ${computed}, Actual was ${actualBalance}.`,
      employeeId: 'SYSTEM'
    });

    // Insert into operations_drifts for permanent history
    const { error: driftError } = await supabaseAdmin.from('operations_drifts').insert({
      amount: delta,
      reason: `Rationalisation reset. Computed Ledger pulled to match Actual Vault (${actualBalance}).`,
      resolved_kind: 'system_reset',
      resolved_shop: 'global'
    });

    if (driftError) {
      throw new Error(`Failed to log drift: ${driftError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Variance of $${delta.toFixed(2)} reset. Computed Ledger is now aligned to Actual Vault ($${actualBalance.toFixed(2)}).` 
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
