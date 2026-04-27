import { NextResponse } from 'next/server';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';
import { isSavingsOrBlackboxTransferEntry } from '@/lib/transfer-classification';

export const dynamic = 'force-dynamic';

// Accounting/system entries that are NOT real cash-out expenses — exclude from classification view
const NON_CASH_CATEGORIES = new Set([
  'Cash Drawer Opening',
  'Cash Drawer Adjustment',
  'Stock Adjustment',
  'Operations Transfer',
  'Inventory Acquisition',
  'Shipping & Logistics',
  'Lay-by Completed',
  'Lay-by Pending',
  'Lay-by Payment',
  'Return',
  'Refund',
]);

const keywordGroup = (text: string): string => {
  const lower = text.toLowerCase();
  if (/(rent|salary|salaries|utility|utilities|overhead)/.test(lower)) return 'Overheads';
  if (/(stock|order|purchase|supplier|restock|supply|supplies)/.test(lower)) return 'Stock Orders';
  if (/(invest|vault|transfer|saving|savings|blackbox|deposit|withdrawal)/.test(lower)) return 'Transfers';
  if (/(grocery|groceries|fuel|owner|drawing|personal)/.test(lower)) return 'Personal Use';
  return 'Other';
};

// GET: Fetch real POS-level expenses for a given month + their saved classifications
export async function GET(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());

    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const [{ data: ledgerData }, { data: classifications }] = await Promise.all([
      // Only shop-scoped expense entries from POS — NOT operations_ledger
      supabaseAdmin
        .from('ledger_entries')
        .select('id, shop_id, amount, type, category, description, date')
        .not('shop_id', 'is', null)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false }),
      supabaseAdmin
        .from('expense_classifications')
        .select('expense_id, source, group_name, classified_at'),
    ]);

    const classMap = new Map<string, string>();
    (classifications || []).forEach((c: any) => {
      classMap.set(`${c.source}:${c.expense_id}`, c.group_name);
    });

    // Filter out accounting noise — only show real cash-out expenses
    const expenses = (ledgerData || [])
      .filter((e: any) => (String(e.type || '').toLowerCase() === 'expense' || isSavingsOrBlackboxTransferEntry(e)) && !NON_CASH_CATEGORIES.has(e.category || ''))
      .map((exp: any) => {
        const key = `ledger_entries:${exp.id}`;
        const savedGroup = classMap.get(key) || null;
        const textForKeyword = `${exp.category || ''} ${exp.description || ''}`;
        return {
          id: exp.id,
          source: 'ledger_entries' as const,
          shopId: exp.shop_id,
          amount: Number(exp.amount || 0),
          description: exp.description || exp.category || 'Expense',
          detail: exp.category || '',
          date: exp.date,
          savedGroup,
          suggestedGroup: savedGroup || keywordGroup(textForKeyword),
          isManuallyClassified: savedGroup !== null,
        };
      });

    const classified = expenses.filter((e: any) => e.isManuallyClassified).length;

    return NextResponse.json({
      success: true,
      period: { year, month },
      expenses,
      stats: {
        total: expenses.length,
        classified,
        unclassified: expenses.length - classified,
      },
    });
  } catch (e: any) {
    console.error('[expense-classifications GET]', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// POST: Save or update a single expense classification
export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const { expense_id, source, group_name } = await request.json();

    if (!expense_id || !source || !group_name) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const validSources = ['operations_ledger', 'ledger_entries'];
    const validGroups = ['Overheads', 'Stock Orders', 'Transfers', 'Personal Use', 'Other'];

    if (!validSources.includes(source)) {
      return NextResponse.json({ success: false, message: 'Invalid source' }, { status: 400 });
    }
    if (!validGroups.includes(group_name)) {
      return NextResponse.json({ success: false, message: 'Invalid group' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('expense_classifications')
      .upsert(
        {
          expense_id,
          source,
          group_name,
          classified_by: 'owner',
          classified_at: new Date().toISOString(),
        },
        { onConflict: 'expense_id,source' }
      );

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, message: 'Classification saved' });
  } catch (e: any) {
    console.error('[expense-classifications POST]', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// DELETE: Remove a classification (revert to keyword auto-detection)
export async function DELETE(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const { expense_id, source } = await request.json();
    const { error } = await supabaseAdmin
      .from('expense_classifications')
      .delete()
      .eq('expense_id', expense_id)
      .eq('source', source);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, message: 'Classification removed' });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
