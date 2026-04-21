import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get sales count
    const { count: salesCount } = await supabaseAdmin
      .from('sales')
      .select('*', { count: 'exact' });

    // Get expenses count
    const { count: expensesCount } = await supabaseAdmin
      .from('ledger_entries')
      .select('*', { count: 'exact' })
      .eq('type', 'expense');

    // Get cash entries
    const { count: cashEntries } = await supabaseAdmin
      .from('ledger_entries')
      .select('*', { count: 'exact' })
      .in('category', ['Cash Drawer Opening', 'Cash Drawer Closing']);

    // Get operations count
    const { count: operationsCount } = await supabaseAdmin
      .from('operations_ledger')
      .select('*', { count: 'exact' });

    return NextResponse.json({
      salesCount: salesCount || 0,
      expensesCount: expensesCount || 0,
      cashEntries: cashEntries || 0,
      operationsCount: operationsCount || 0
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
