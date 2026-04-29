import { NextResponse } from 'next/server';

import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { getOperationsComputedBalance, getOperationsState, setOperationsActualBalance } from '@/lib/operations';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const actualBalance = Number(body?.actualBalance);
    const note = String(body?.note || '').trim();

    if (!Number.isFinite(actualBalance) || actualBalance < 0) {
      return NextResponse.json({ success: false, message: 'Actual vault balance must be a valid non-negative number.' }, { status: 400 });
    }

    const [currentState, computedBalance] = await Promise.all([
      getOperationsState(),
      getOperationsComputedBalance(),
    ]);

    const previousActual = Number(currentState?.actual_balance || 0);
    const computed = Number(computedBalance || 0);

    await setOperationsActualBalance(actualBalance);

    const deltaAfterUpdate = actualBalance - computed;
    const reasonParts = [
      `Manual vault override from ${previousActual} to ${actualBalance}.`,
      `Computed ledger at override time was ${computed}.`,
    ];
    if (note) reasonParts.push(`Note: ${note}`);

    const { error: driftError } = await supabaseAdmin.from('operations_drifts').insert({
      amount: deltaAfterUpdate,
      reason: reasonParts.join(' '),
      resolved_kind: 'manual_vault_override',
      resolved_shop: 'global',
    });

    if (driftError) {
      throw new Error(`Vault updated but drift log failed: ${driftError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Actual vault balance set to ${actualBalance}. Current delta versus computed ledger is ${deltaAfterUpdate}.`,
      state: {
        actualBalance,
        previousActual,
        computedBalance: computed,
        delta: deltaAfterUpdate,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
