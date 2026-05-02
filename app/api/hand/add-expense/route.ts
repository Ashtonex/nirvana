import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      shopId,
      category,
      amount,
      date,
      description,
      autoRoute
    } = body;

    if (!shopId || !category || amount <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid expense data' }, { status: 400 });
    }

    const expenseId = Math.random().toString(36).substring(2, 9);
    const results: string[] = [];

    // 1. Add to ledger_entries
    const { error: ledgerError } = await supabaseAdmin.from('ledger_entries').insert({
      id: expenseId,
      shop_id: shopId,
      type: 'expense',
      category,
      amount,
      date,
      description: description || `${category} - Manual Recovery Entry`,
      employee_id: 'SYSTEM'
    });

    if (ledgerError) throw new Error(`Ledger error: ${ledgerError.message}`);
    results.push(`✓ Added to ledger_entries`);

    // 2. Auto-route based on category
    if (autoRoute) {
      if (category === 'rent' || category === 'salaries' || category === 'utilities' || category === 'misc') {
        // Route to operations
        const { error: opsError } = await supabaseAdmin.from('operations_ledger').insert({
          id: `ops_${expenseId}`,
          shop_id: shopId === 'global' ? null : shopId,
          amount: -amount, // Expenses are negative
          kind: category, // Keep the category as kind for tracking
          overhead_category: category,
          title: `${category} - Auto-routed`,
          notes: `Manual recovery entry for ${category}`,
          employee_id: 'SYSTEM',
          effective_date: new Date(date).toISOString().split('T')[0],
          created_at: date
        });

        if (opsError) {
          console.error('Operations routing error:', opsError);
          results.push(`⚠ Operations routing failed (not critical)`);
        } else {
          results.push(`✓ Auto-routed to Operations (${category})`);
        }
      } else if (category === 'perfume') {
        // Route to invest
        const { error: investError } = await supabaseAdmin.from('invest_deposits').insert({
          id: expenseId,
          shop_id: shopId,
          amount,
          deposited_by: 'SYSTEM',
          deposited_at: date,
          status: 'active'
        });

        if (investError) {
          console.error('Invest routing error:', investError);
          results.push(`⚠ Invest routing failed (not critical)`);
        } else {
          results.push(`✓ Auto-routed to Invest (perfume)`);
        }
      }
    }

    // 3. Add to local JSON
    try {
      const dbPath = path.join(process.cwd(), 'lib', 'db.json');
      const content = await fs.readFile(dbPath, 'utf-8');
      const db = JSON.parse(content);
      
      if (!db.ledger) db.ledger = [];
      db.ledger.push({
        id: expenseId,
        shopId,
        type: 'expense',
        category,
        amount,
        date,
        description: description || `${category} - Manual Recovery Entry`,
        employeeId: 'SYSTEM'
      });

      await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
      results.push(`✓ Backed up to Local JSON`);
    } catch (e) {
      console.error('Local JSON backup failed:', e);
      results.push(`⚠ Local JSON backup failed (not critical)`);
    }

    return NextResponse.json({
      success: true,
      message: `Expense recorded: ${category} - $${amount.toFixed(2)}`,
      details: results,
      expenseId
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
