import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
      pendingTransfers: (operationsData || []).filter(o => o.status === 'pending').length,
      balanceIssues: (balances || []).filter(b => b.total < 0).length,
      operationsCount: operationsCount || 0,
      lastAnalyzed: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
