import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { isSavingsOrBlackboxTransferEntry } from '@/lib/transfer-classification';

export async function GET() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    // Get sales count
    const { count: salesCount } = await supabaseAdmin
      .from('sales')
      .select('*', { count: 'exact' });

    // Get expense-like ledger rows, including historical savings/blackbox transfers
    const { data: expenseRows } = await supabaseAdmin
      .from('ledger_entries')
      .select('id, type, category, description');

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
      expensesCount: (expenseRows || []).filter((row: any) => String(row.type || '').toLowerCase() === 'expense' || isSavingsOrBlackboxTransferEntry(row)).length,
      cashEntries: cashEntries || 0,
      operationsCount: operationsCount || 0
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
