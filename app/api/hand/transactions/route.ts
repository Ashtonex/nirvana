import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    // Get recent ledger entries (transactions)
    const { data: ledgerData } = await supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);

    const transactions = (ledgerData || []).map(t => ({
      id: t.id,
      date: t.date,
      type: t.type,
      amount: t.amount,
      shop: t.shop_id,
      description: t.description || '',
      category: t.category || ''
    }));

    return NextResponse.json({
      success: true,
      transactions,
      count: transactions.length
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
