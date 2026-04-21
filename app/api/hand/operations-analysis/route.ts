import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

type OperationRow = {
  status: string | null;
};

type BalanceRow = {
  shop_id: string | null;
  total: number | null;
};

export async function POST() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    // Analyze operations ledger
    const { data: operationsData } = await supabaseAdmin
      .from('operations_ledger')
      .select('*');

    // Check for balance issues
    const { data: balances } = await supabaseAdmin
      .from('ledger_entries')
      .select('shop_id, SUM(amount) as total');

    const { count: operationsCount } = await supabaseAdmin
      .from('operations_ledger')
      .select('*', { count: 'exact' });

    const analysis = {
      pendingTransfers: ((operationsData || []) as OperationRow[]).filter((o: OperationRow) => o.status === 'pending').length,
      balanceIssues: ((balances || []) as BalanceRow[]).filter((b: BalanceRow) => Number(b.total || 0) < 0).length,
      operationsCount: operationsCount || 0,
      lastAnalyzed: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
