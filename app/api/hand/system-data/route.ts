import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

type SalesRow = {
  total_with_tax: number | null;
};

type ExpenseRow = {
  amount: number | null;
};

export async function GET() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const [
      { data: salesData, count: salesCount },
      { data: expenseData, count: expenseCount },
      { count: itemsCount }
    ] = await Promise.all([
      supabaseAdmin.from('sales').select('*', { count: 'exact' }),
      supabaseAdmin.from('ledger_entries').select('*', { count: 'exact' }).eq('type', 'expense'),
      supabaseAdmin.from('inventory_items').select('*', { count: 'exact' })
    ]);

    // Calculate totals
    const totalSales = ((salesData || []) as SalesRow[]).reduce(
      (sum: number, s: SalesRow) => sum + Number(s.total_with_tax || 0),
      0
    );
    const totalExpenses = ((expenseData || []) as ExpenseRow[]).reduce(
      (sum: number, e: ExpenseRow) => sum + Number(e.amount || 0),
      0
    );
    const netBalance = totalSales - totalExpenses;

    return NextResponse.json({
      success: true,
      data: {
        totalSales: `$${totalSales.toFixed(2)}`,
        totalExpenses: `$${totalExpenses.toFixed(2)}`,
        netBalance: `$${netBalance.toFixed(2)}`,
        activeItems: itemsCount || 0,
        totalSalesCount: salesCount || 0,
        totalExpenseCount: expenseCount || 0
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
