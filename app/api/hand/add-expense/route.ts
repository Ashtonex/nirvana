import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { postFundTransaction, type BucketKey, type FundDirection } from '@/lib/cash-pools';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Overhead',
  salaries: 'Overhead',
  utilities: 'POS Expense',
  stock_orders: 'Stock Orders',
  stock: 'Stock Orders',
  perfume: 'Perfume',
  business_expense: 'POS Expense',
  transport: 'POS Expense',
  groceries: 'Groceries',
  personal: 'Personal Use',
  tithe: 'Tithe',
  misc: 'POS Expense',
};

function normalizeCategory(value: unknown) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function ledgerCategoryFor(category: string) {
  const key = category.replace(/\s+/g, '_');
  return CATEGORY_LABELS[key] || CATEGORY_LABELS[category] || category;
}

function routeForCategory(category: string): {
  bucketKey: BucketKey;
  direction: FundDirection;
  overheadCategory?: 'rent' | 'salaries' | 'utilities' | 'misc';
} | null {
  const normalized = normalizeCategory(category);
  if (normalized === 'perfume' || normalized === 'perfumes' || normalized === 'invest' || normalized === 'perfumes invest') {
    return { bucketKey: 'invest_perfumes', direction: 'deposit' };
  }
  // Stock is its own pre-funded bucket now, regardless of which legacy pool would previously
  // have funded it — no funding-pool selection needed any more.
  if (normalized === 'stock' || normalized === 'stock orders' || normalized === 'stock order') {
    return { bucketKey: 'stock', direction: 'withdrawal' };
  }
  if (normalized === 'rent') {
    return { bucketKey: 'rent', direction: 'withdrawal', overheadCategory: 'rent' };
  }
  if (normalized === 'salaries' || normalized === 'salary' || normalized === 'wages') {
    return { bucketKey: 'salaries', direction: 'withdrawal', overheadCategory: 'salaries' };
  }
  // Utilities fold into the Rent bucket per the approved bucket design.
  if (normalized === 'utilities' || normalized === 'utility') {
    return { bucketKey: 'rent', direction: 'withdrawal', overheadCategory: 'utilities' };
  }
  if (normalized === 'transport') {
    return { bucketKey: 'general', direction: 'withdrawal' };
  }
  if (normalized === 'groceries' || normalized === 'grocery' || normalized === 'personal' || normalized === 'personal use' || normalized === 'tithe') {
    return { bucketKey: 'general', direction: 'withdrawal' };
  }
  if (normalized === 'misc' || normalized === 'other' || normalized === 'other expense' || normalized === 'business expense') {
    return { bucketKey: 'general', direction: 'withdrawal' };
  }
  return null;
}

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
      autoRoute,
      fundingPool,
    } = body;

    const numericAmount = Number(amount);
    if (!shopId || !category || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid expense data' }, { status: 400 });
    }

    const expenseId = crypto.randomUUID();
    const timestamp = date ? new Date(date).toISOString() : new Date().toISOString();
    const ledgerCategory = ledgerCategoryFor(String(category));
    const results: string[] = [];

    // 1. Add to ledger_entries
    const { error: ledgerError } = await supabaseAdmin.from('ledger_entries').insert({
      id: expenseId,
      shop_id: shopId,
      type: 'expense',
      category: ledgerCategory,
      amount: numericAmount,
      date: timestamp,
      description: description || `${ledgerCategory} - Manual Recovery Entry`,
      employee_id: 'SYSTEM'
    });

    if (ledgerError) throw new Error(`Ledger error: ${ledgerError.message}`);
    results.push('Added to ledger_entries');

    // 2. Auto-route based on category
    if (autoRoute) {
      const route = routeForCategory(String(category));
      if (route) {
        const fundResult = await postFundTransaction({
          amount: numericAmount,
          direction: route.direction,
          bucketKey: route.bucketKey,
          shopId: shopId === 'global' ? null : shopId,
          title: description || `${ledgerCategory} - Hand override`,
          notes: `Manual Hand recovery entry for ${ledgerCategory}`,
          overheadCategory: route.overheadCategory || null,
          sourceLedgerEntryId: expenseId,
          actor: { type: 'owner', employeeId: 'SYSTEM' },
          metadata: {
            source: 'hand_manual_expense',
            handExpenseId: expenseId,
            ledgerCategory,
            originalCategory: category,
            legacyFundingPool: fundingPool || null,
          },
        });
        results.push(`Auto-routed to ${fundResult.bucketKey} bucket`);
      } else {
        results.push('No fund-bucket route configured for this category');
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
        category: ledgerCategory,
        amount: numericAmount,
        date: timestamp,
        description: description || `${ledgerCategory} - Manual Recovery Entry`,
        employeeId: 'SYSTEM'
      });

      await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
      results.push('Backed up to Local JSON');
    } catch (e) {
      console.error('Local JSON backup failed:', e);
      results.push('Local JSON backup failed (not critical)');
    }

    return NextResponse.json({
      success: true,
      message: `Expense recorded: ${ledgerCategory} - $${numericAmount.toFixed(2)}`,
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
