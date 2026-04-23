import { NextResponse } from 'next/server';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';
import { getOperationsState, getOperationsComputedBalance, setOperationsActualBalance } from '@/lib/operations';

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

    // Insert into operations_drifts
    const { error: driftError } = await supabaseAdmin.from('operations_drifts').insert({
      amount: delta,
      reason: `Rationalisation reset to align Actual with Computed Ledger (Actual was ${actualBalance}, Computed was ${computed})`,
      resolved_kind: 'system_reset',
      resolved_shop: 'global'
    });

    if (driftError) {
      throw new Error(`Failed to log drift: ${driftError.message}`);
    }

    // Update actual balance to match computed
    await setOperationsActualBalance(computed);

    return NextResponse.json({ 
      success: true, 
      message: `Variance of ${delta} reset. Actual Vault is now aligned to Computed Ledger (${computed}).` 
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
