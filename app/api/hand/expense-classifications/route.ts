import { NextResponse } from 'next/server';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Fetch all expenses for a given month + their saved classifications
export async function GET(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    // Fetch raw expenses from both sources
    const [{ data: opsData }, { data: ledgerData }, { data: classifications }] = await Promise.all([
      supabaseAdmin
        .from('operations_ledger')
        .select('id, shop_id, amount, kind, title, notes, created_at, overhead_category')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('ledger_entries')
        .select('id, shop_id, amount, type, category, description, date')
        .eq('type', 'expense')
        .gte('date', startDate.split('T')[0])
        .lte('date', endDate.split('T')[0])
        .order('date', { ascending: false }),
      supabaseAdmin
        .from('expense_classifications')
        .select('expense_id, source, group_name, classified_at'),
    ]);

    // Build a lookup map: `${source}:${id}` → group_name
    const classMap = new Map<string, string>();
    (classifications || []).forEach((c: any) => {
      classMap.set(`${c.source}:${c.expense_id}`, c.group_name);
    });

    const keywordGroup = (text: string): string => {
      const lower = text.toLowerCase();
      if (/(rent|salary|salaries|utility|utilities|overhead)/.test(lower)) return 'Overheads';
      if (/(invest|vault|transfer|operation|deposit|withdrawal|saving|savings|blackbox)/.test(lower)) return 'Transfers';
      if (/(grocery|groceries|fuel|owner|drawing|personal)/.test(lower)) return 'Personal Use';
      return 'Other';
    };

    const opsExpenses = (opsData || []).map((exp: any) => {
      const key = `operations_ledger:${exp.id}`;
      const savedGroup = classMap.get(key) || null;
      const textForKeyword = `${exp.kind || ''} ${exp.title || ''} ${exp.overhead_category || ''} ${exp.notes || ''}`;
      return {
        id: exp.id,
        source: 'operations_ledger' as const,
        shopId: exp.shop_id,
        amount: Number(exp.amount || 0),
        description: exp.title || exp.kind || exp.overhead_category || 'Operations entry',
        detail: exp.notes || '',
        date: exp.created_at,
        savedGroup,
        suggestedGroup: savedGroup || keywordGroup(textForKeyword),
        isManuallyClassified: savedGroup !== null,
      };
    });

    const ledgerExpenses = (ledgerData || []).map((exp: any) => {
      const key = `ledger_entries:${exp.id}`;
      const savedGroup = classMap.get(key) || null;
      const textForKeyword = `${exp.type || ''} ${exp.category || ''} ${exp.description || ''}`;
      return {
        id: exp.id,
        source: 'ledger_entries' as const,
        shopId: exp.shop_id,
        amount: Number(exp.amount || 0),
        description: exp.description || exp.category || 'Ledger expense',
        detail: exp.category || '',
        date: exp.date,
        savedGroup,
        suggestedGroup: savedGroup || keywordGroup(textForKeyword),
        isManuallyClassified: savedGroup !== null,
      };
    });

    const allExpenses = [...opsExpenses, ...ledgerExpenses].sort(
      (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );

    const classified = allExpenses.filter(e => e.isManuallyClassified).length;

    return NextResponse.json({
      success: true,
      period: { year, month },
      expenses: allExpenses,
      stats: {
        total: allExpenses.length,
        classified,
        unclassified: allExpenses.length - classified,
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
    const validGroups = ['Overheads', 'Transfers', 'Personal Use', 'Other'];

    if (!validSources.includes(source)) {
      return NextResponse.json({ success: false, message: 'Invalid source' }, { status: 400 });
    }
    if (!validGroups.includes(group_name)) {
      return NextResponse.json({ success: false, message: 'Invalid group' }, { status: 400 });
    }

    // Upsert: update if exists, insert if not
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
