import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { buildCashReconciliation } from '@/lib/cash-reconciliation';
import { getOperationsComputedBalance, getOperationsState } from '@/lib/operations';
import { supabaseAdmin } from '@/lib/supabase';
import { isSavingsOrBlackboxTransferEntry } from '@/lib/transfer-classification';

const SHOPS = [
  { id: 'kipasa', name: 'Kipasa' },
  { id: 'dubdub', name: 'Dub Dub' },
  { id: 'tradecenter', name: 'Trade Center' },
] as const;

type ShopId = (typeof SHOPS)[number]['id'];

type SaleRow = {
  shop_id: string | null;
  total_with_tax: number | null;
  total_before_tax: number | null;
  quantity: number | null;
  payment_method?: string | null;
  date: string | null;
};

type LedgerRow = {
  id: string;
  shop_id: string | null;
  amount: number | null;
  type: string | null;
  category: string | null;
  description: string | null;
  date: string | null;
};

type OperationsRow = {
  id: string;
  shop_id: string | null;
  amount: number | null;
  kind: string | null;
  overhead_category?: string | null;
  title: string | null;
  notes: string | null;
  created_at: string | null;
  status?: string | null;
};

type InvestRow = {
  shop_id: string | null;
  amount: number | null;
  withdrawn_amount: number | null;
};

type InventoryRow = {
  id: string;
  name: string | null;
  shop_id: string | null;
  quantity: number | null;
  reorder_level: number | null;
  created_at: string | null;
};

type OpeningBalanceRow = {
  shop_id: ShopId;
  opening_balance: number | null;
};

type EmployeeRow = {
  id: string;
  shop_id: string | null;
};

type StaffSessionRow = {
  employee_id: string | null;
  created_at: string | null;
};

function sum(values: Array<number | string | null | undefined>) {
  return values.reduce((total: number, value) => total + Number(value || 0), 0);
}

function isOverheadLike(text: string) {
  return /(rent|salary|salaries|utility|utilities|overhead)/i.test(text);
}

function detectOverheadCategory(entry: Pick<OperationsRow, 'overhead_category' | 'kind' | 'title' | 'notes'>) {
  const stored = String(entry.overhead_category || '').toLowerCase();
  if (stored === 'rent' || stored === 'salaries' || stored === 'utilities' || stored === 'misc') {
    return stored;
  }

  const text = `${entry.kind || ''} ${entry.title || ''} ${entry.notes || ''}`.toLowerCase();
  if (text.includes('rent')) return 'rent';
  if (text.includes('utilit') || text.includes('electric') || text.includes('water')) return 'utilities';
  if (text.includes('salar') || text.includes('wage') || text.includes('payroll')) return 'salaries';
  if (text.includes('misc')) return 'misc';
  return 'other';
}

function isHandOperationalExpense(entry: Pick<LedgerRow, 'type' | 'category' | 'description'>) {
  if (String(entry.type || '').toLowerCase() !== 'expense') return false;
  if (isSavingsOrBlackboxTransferEntry(entry)) return false;

  const category = String(entry.category || '');
  const text = `${entry.category || ''} ${entry.description || ''}`.toLowerCase();

  if (category === 'Perfume' || category === 'Transfer') return false;
  if (text.includes('perfume')) return false;

  return true;
}

function hoursSince(dateValue: string | null | undefined) {
  if (!dateValue) return Infinity;
  return (Date.now() - new Date(dateValue).getTime()) / (1000 * 60 * 60);
}

async function fetchAllLedgerRows() {
  const rows: LedgerRow[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .select('id, shop_id, amount, type, category, description, date')
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    rows.push(...(data as LedgerRow[]));
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

async function fetchAllSalesRows() {
  const rows: SaleRow[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('sales')
      .select('shop_id, total_with_tax, total_before_tax, quantity, payment_method, date')
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    rows.push(...(data as SaleRow[]));
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

export async function GET() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const deadStockCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const [
      allSales,
      allLedger,
      { data: sales30dData },
      { data: ledger30dData },
      { data: operationsData },
      { data: driftsData },
      { data: investData },
      { data: inventoryData },
      { data: openingBalanceData },
      { data: employeeData },
      { data: sessionData },
      { data: unreadMessages },
      { data: pendingStockRequests },
      { data: settingsData },
      opsComputedBalance,
      opsState,
    ] = await Promise.all([
      fetchAllSalesRows(),
      fetchAllLedgerRows(),
      supabaseAdmin
        .from('sales')
        .select('shop_id, total_with_tax, total_before_tax, quantity, payment_method, date')
        .is('deleted_at', null)
        .gte('date', thirtyDaysAgo),
      supabaseAdmin
        .from('ledger_entries')
        .select('id, shop_id, amount, type, category, description, date')
        .is('deleted_at', null)
        .gte('date', thirtyDaysAgo),
      supabaseAdmin
        .from('operations_ledger')
        .select('id, shop_id, amount, kind, overhead_category, title, notes, created_at, status'),
      supabaseAdmin
        .from('operations_drifts')
        .select('id, amount, reason, resolved_kind, resolved_shop, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('invest_deposits')
        .select('shop_id, amount, withdrawn_amount'),
      supabaseAdmin
        .from('inventory_items')
        .select('id, name, shop_id, quantity, reorder_level, created_at'),
      supabaseAdmin
        .from('shop_settings')
        .select('shop_id, opening_balance'),
      supabaseAdmin
        .from('employees')
        .select('id, shop_id')
        .not('shop_id', 'is', null),
      supabaseAdmin
        .from('staff_sessions')
        .select('employee_id, created_at')
        .gte('created_at', fiveMinutesAgo),
      supabaseAdmin
        .from('chat_messages')
        .select('id')
        .eq('read', false)
        .gte('created_at', twentyFourHoursAgo),
      supabaseAdmin
        .from('stock_requests')
        .select('id')
        .eq('status', 'pending')
        .gte('created_at', twentyFourHoursAgo),
      supabaseAdmin
        .from('oracle_settings')
        .select('*')
        .single(),
      getOperationsComputedBalance().catch(() => 0),
      getOperationsState().catch(() => ({ actual_balance: 0, updated_at: null })),
    ]);

    let localJsonReady = false;
    try {
      await fs.access(path.join(process.cwd(), 'lib', 'db.json'));
      localJsonReady = true;
    } catch {
      localJsonReady = false;
    }

    const sales = allSales as SaleRow[];
    const ledger = allLedger as LedgerRow[];
    const sales30d = (sales30dData || []) as SaleRow[];
    const ledger30d = (ledger30dData || []) as LedgerRow[];
    const operations = (operationsData || []) as OperationsRow[];
    const drifts = driftsData || [];
    const investDeposits = (investData || []) as InvestRow[];
    const inventory = (inventoryData || []) as InventoryRow[];
    const openingBalances = (openingBalanceData || []) as OpeningBalanceRow[];
    const employees = (employeeData || []) as EmployeeRow[];
    const sessions = (sessionData || []) as StaffSessionRow[];

    const employeeShopMap = new Map<string, string>();
    employees.forEach((employee) => {
      if (employee.id && employee.shop_id) {
        employeeShopMap.set(employee.id, employee.shop_id);
      }
    });

    const activeStaffByShop = new Map<string, number>();
    sessions.forEach((session) => {
      const shopId = session.employee_id ? employeeShopMap.get(session.employee_id) : null;
      if (shopId) {
        activeStaffByShop.set(shopId, (activeStaffByShop.get(shopId) || 0) + 1);
      }
    });

    const investAvailable = investDeposits.reduce(
      (total, deposit) => total + Number(deposit.amount || 0) - Number(deposit.withdrawn_amount || 0),
      0
    );

    const cashMap = buildCashReconciliation({
      ledger: ledger as unknown as Record<string, unknown>[],
      sales: sales as unknown as Record<string, unknown>[],
      operationsActualBalance: Number((opsState as { actual_balance?: number | null })?.actual_balance || 0),
      operationsComputedBalance: Number(opsComputedBalance || 0),
      investAvailable,
    });

    const openingBalanceMap = SHOPS.reduce<Record<ShopId, number>>((acc, shop) => {
      acc[shop.id] = 0;
      return acc;
    }, {} as Record<ShopId, number>);

    openingBalances.forEach((row) => {
      openingBalanceMap[row.shop_id] = Number(row.opening_balance || 0);
    });

    const recentTransactions = [...ledger]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 12)
      .map((entry) => ({
        id: entry.id,
        source: 'ledger',
        shopId: entry.shop_id,
        type: entry.type,
        category: entry.category,
        amount: Number(entry.amount || 0),
        when: entry.date,
        description: entry.description || entry.category || entry.type || 'Transaction',
      }));

    const recentOperations = [...operations]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 10)
      .map((entry) => ({
        id: entry.id,
        shopId: entry.shop_id,
        kind: entry.kind,
        amount: Number(entry.amount || 0),
        when: entry.created_at,
        title: entry.title || entry.kind || 'Operations entry',
        notes: entry.notes || '',
      }));

    const operations30d = operations.filter((entry) => (entry.created_at || '') >= thirtyDaysAgo);

    const overheadContributed30d = operations30d
      .filter((entry) => Number(entry.amount || 0) > 0)
      .filter((entry) => isOverheadLike(`${entry.kind || ''} ${entry.title || ''} ${entry.notes || ''}`))
      .reduce((total, entry) => total + Number(entry.amount || 0), 0);

    const overheadPaid30d = operations30d
      .filter((entry) => Number(entry.amount || 0) < 0)
      .filter((entry) => isOverheadLike(`${entry.kind || ''} ${entry.title || ''} ${entry.notes || ''}`))
      .reduce((total, entry) => total + Math.abs(Number(entry.amount || 0)), 0);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    const operationsByShop = SHOPS.map((shop) => {
      const categoryTotals = {
        rent: 0,
        salaries: 0,
        utilities: 0,
        misc: 0,
        other: 0,
      };

      let totalContributed = 0;
      let totalPaid = 0;

      operations
        .filter((entry) => entry.shop_id === shop.id && (entry.created_at || '') >= monthStartIso)
        .forEach((entry) => {
          const amount = Number(entry.amount || 0);
          const category = detectOverheadCategory(entry);
          // Kinds that represent a shop sending money to operations (vault + overhead)
          const contributionKinds = [
            'overhead_contribution', 'rent', 'salaries',
            'eod_deposit', 'overhead_deposit',
            'savings_contribution', 'savings_deposit', 'savings',
            'blackbox', 'black_box',
          ];
          if (
            amount > 0 && (
              contributionKinds.includes(String(entry.kind || '').toLowerCase()) ||
              isOverheadLike(`${entry.kind || ''} ${entry.title || ''} ${entry.notes || ''}`)
            )
          ) {
            totalContributed += amount;
          }
          // Kinds that represent an actual payment out of the overhead pool
          const paymentKinds = ['overhead_payment', 'rent', 'salaries', 'utilities'];
          if (
            amount < 0 && (
              paymentKinds.includes(String(entry.kind || '').toLowerCase()) ||
              isOverheadLike(`${entry.kind || ''} ${entry.title || ''} ${entry.notes || ''}`) ||
              category !== 'other'
            )
          ) {
            totalPaid += Math.abs(amount);
            categoryTotals[category as keyof typeof categoryTotals] += Math.abs(amount);
          }
        });

      return {
        shopId: shop.id,
        shopName: shop.name,
        totalContributed,
        totalPaid,
        availableForOverheads: totalContributed - totalPaid,
        categories: categoryTotals,
      };
    });

    const shopSnapshots = SHOPS.map((shop) => {
      const shopSales = sales.filter((sale) => sale.shop_id === shop.id);
      const shopSales30d = sales30d.filter((sale) => sale.shop_id === shop.id);
      const shopLedger = ledger.filter((entry) => entry.shop_id === shop.id);
      const shopLedger30d = ledger30d.filter((entry) => entry.shop_id === shop.id);
      const shopInventory = inventory.filter((item) => item.shop_id === shop.id);
      const lowStockCount = shopInventory.filter((item) => Number(item.quantity || 0) > 0 && Number(item.quantity || 0) <= Number(item.reorder_level || 5)).length;
      const zeroStockCount = shopInventory.filter((item) => Number(item.quantity || 0) <= 0).length;
      const deadStockCount = shopInventory.filter((item) => Number(item.quantity || 0) > 0 && item.created_at && item.created_at < deadStockCutoff).length;
      const openingEntries = sum(shopLedger.filter((entry) => entry.category === 'Cash Drawer Opening').map((entry) => entry.amount));
      const salesValue = sum(shopSales.map((sale) => sale.total_with_tax));
      const salesValue30d = sum(shopSales30d.map((sale) => sale.total_with_tax));
      const expenseValue = sum(
        shopLedger
          .filter((entry) => String(entry.type || '').toLowerCase() === 'expense' || isSavingsOrBlackboxTransferEntry(entry))
          .map((entry) => entry.amount)
      );
      const expenseValue30d = sum(
        shopLedger30d
          .filter((entry) => isHandOperationalExpense(entry))
          .map((entry) => entry.amount)
      );
      const opsTransfers = sum(
        shopLedger
          .filter((entry) => entry.category === 'Operations Transfer')
          .map((entry) => entry.amount)
      );
      const expectedDrawerCash = openingEntries + salesValue - expenseValue - opsTransfers;
      const lastSaleAt = [...shopSales].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0]?.date || null;
      const lastLedgerAt = [...shopLedger].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0]?.date || null;
      const activeStaff = activeStaffByShop.get(shop.id) || 0;
      const staleHours = Math.min(hoursSince(lastSaleAt), hoursSince(lastLedgerAt));

      const issues: string[] = [];
      if (expectedDrawerCash < 0) issues.push('Expected drawer cash is negative.');
      if (lowStockCount > 5) issues.push(`Low stock pressure on ${lowStockCount} items.`);
      if (zeroStockCount > 0) issues.push(`${zeroStockCount} items are fully out of stock.`);
      if (deadStockCount > 0) issues.push(`${deadStockCount} items have gone stale in stock.`);
      if (activeStaff === 0 && staleHours > 24) issues.push('No live staff session and no recent activity in 24h.');

      let status: 'online' | 'watch' | 'offline' = 'online';
      if (activeStaff === 0 && staleHours > 24) status = 'offline';
      else if (issues.length > 0 || activeStaff === 0) status = 'watch';

      return {
        id: shop.id,
        name: shop.name,
        sales30d: Number(salesValue30d),
        expenses30d: Number(expenseValue30d),
        expectedDrawerCash: Number(expectedDrawerCash),
        openingBalance: Number(openingBalanceMap[shop.id]),
        activeStaff,
        lastSaleAt,
        lastLedgerAt,
        transactions7d: shopLedger.filter((entry) => (entry.date || '') >= sevenDaysAgo).length,
        lowStockCount,
        zeroStockCount,
        deadStockCount,
        status,
        issues,
      };
    });

    const totalSales30d = Number(sum(sales30d.map((sale) => sale.total_with_tax)));
    const totalExpenses30d = Number(sum(
      ledger30d
        .filter((entry) => isHandOperationalExpense(entry))
        .map((entry) => entry.amount)
    ));
    const profit30d = totalSales30d - totalExpenses30d;
    const profitMargin = totalSales30d > 0 ? (profit30d / totalSales30d) * 100 : 0;
    const topShop = [...shopSnapshots].sort((a, b) => (b.sales30d - b.expenses30d) - (a.sales30d - a.expenses30d))[0];

    const risks: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; message: string }> = [];
    if (cashMap.operationsDelta !== 0) {
      risks.push({
        severity: Math.abs(cashMap.operationsDelta) > 50 ? 'critical' : 'warning',
        title: 'Operations vault mismatch',
        message: `Actual vault and computed ledger differ by $${cashMap.operationsDelta.toFixed(2)}.`,
      });
    }
    if (overheadPaid30d > overheadContributed30d) {
      risks.push({
        severity: 'warning',
        title: 'Overheads are outrunning contributions',
        message: `Paid $${overheadPaid30d.toFixed(2)} against only $${overheadContributed30d.toFixed(2)} contributed in the same window.`,
      });
    }
    if (profitMargin < 15) {
      risks.push({
        severity: profitMargin < 0 ? 'critical' : 'warning',
        title: 'Profit margin compression',
        message: `The last 30-day profit margin is ${profitMargin.toFixed(1)}%.`,
      });
    }
    shopSnapshots.forEach((shop) => {
      if (shop.status === 'offline') {
        risks.push({
          severity: 'critical',
          title: `${shop.name} looks offline`,
          message: 'No live session and no recent commercial activity detected.',
        });
      } else if (shop.issues.length > 0) {
        risks.push({
          severity: 'info',
          title: `${shop.name} needs attention`,
          message: shop.issues[0],
        });
      }
    });

    const forecasts: string[] = [];
    if (cashMap.operationsActualBalance < overheadPaid30d) {
      forecasts.push('Operations cash is below the last 30-day overhead payment pace. Build the vault before the next major bill lands.');
    }
    if (shopSnapshots.some((shop) => shop.lowStockCount > 5)) {
      forecasts.push('One or more shops are heading into a low-stock squeeze. Reallocate from global inventory before sales slow down.');
    }
    if (shopSnapshots.some((shop) => shop.expectedDrawerCash < 0)) {
      forecasts.push('A drawer is modeled below zero. Audit past postings or transfers before the next closeout compounds the error.');
    }
    if (forecasts.length === 0) {
      forecasts.push('System pressure is stable right now. Keep contributions ahead of overhead and keep inactive shops under watch.');
    }

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      owner: {
        email: 'flectere@dev.com',
        clearance: 'LEVEL_5',
      },
      system: {
        supabase: true,
        localJsonReady,
        activeStaffCount: Array.from(activeStaffByShop.values()).reduce((total, count) => total + count, 0),
        unreadMessagesCount: unreadMessages?.length || 0,
        pendingStockRequestsCount: pendingStockRequests?.length || 0,
      },
      money: {
        sales30d: totalSales30d,
        expenses30d: totalExpenses30d,
        profit30d,
        profitMargin,
        totalTrackedCash: cashMap.totalTrackedCash,
        drawerExpectedCash: cashMap.drawerExpectedCash,
        operationsActualBalance: cashMap.operationsActualBalance,
        operationsComputedBalance: cashMap.operationsComputedBalance,
        operationsDelta: cashMap.operationsDelta,
        investAvailable: cashMap.investAvailable,
        overheadContributed30d,
        overheadPaid30d,
      },
      operations: {
        actualBalance: cashMap.operationsActualBalance,
        computedBalance: cashMap.operationsComputedBalance,
        delta: cashMap.operationsDelta,
        updatedAt: (opsState as { updated_at?: string | null })?.updated_at || null,
        byShop: operationsByShop,
      },
      brain: {
        topShop: topShop?.name || 'Unknown',
        insight: profit30d >= 0
          ? `${topShop?.name || 'A shop'} is carrying the business, but operations discipline still decides whether that profit survives.`
          : 'The system is earning money but bleeding too much of it back out. Audit expenses and vault movement immediately.',
        revenueTrend: totalSales30d >= totalExpenses30d ? 'stable_to_up' : 'under_pressure',
        expenseTrend: overheadPaid30d > overheadContributed30d ? 'danger' : 'contained',
      },
      openingBalances: openingBalanceMap,
      shops: shopSnapshots,
      risks: risks.slice(0, 10),
      forecasts,
      recentTransactions,
      recentOperations,
      drifts,
      settings: {
        taxRate: Number(settingsData?.tax_rate || 0.155),
        taxThreshold: Number(settingsData?.tax_threshold || 100),
        taxMode: settingsData?.tax_mode || 'all',
        zombieDays: Number(settingsData?.zombie_days || 60),
        currencySymbol: settingsData?.currency_symbol || "$"
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
