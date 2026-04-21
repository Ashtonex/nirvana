import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

type SalesRow = {
  shop_id: string | null;
  total_with_tax: number | null;
  date: string | null;
};

type ExpenseRow = {
  shop_id: string | null;
  amount: number | null;
  date: string | null;
};

type ShopMetric = {
  sales: number;
  expenses: number;
  profit: number;
};

export async function POST() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    // Get sales data
    const { data: salesData } = await supabaseAdmin
      .from('sales')
      .select('shop_id, total_with_tax, date')
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Get expenses data
    const { data: expensesData } = await supabaseAdmin
      .from('ledger_entries')
      .select('shop_id, amount, date')
      .eq('type', 'expense')
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    // Calculate metrics by shop
    const shopMetrics: Record<string, ShopMetric> = {};
    ['kipasa', 'dubdub', 'tradecenter'].forEach((shop) => {
      const sales = ((salesData || []) as SalesRow[])
        .filter((s: SalesRow) => s.shop_id === shop)
        .reduce((sum: number, s: SalesRow) => sum + Number(s.total_with_tax || 0), 0);
      const expenses = ((expensesData || []) as ExpenseRow[])
        .filter((e: ExpenseRow) => e.shop_id === shop)
        .reduce((sum: number, e: ExpenseRow) => sum + Number(e.amount || 0), 0);
      
      shopMetrics[shop] = {
        sales,
        expenses,
        profit: sales - expenses
      };
    });

    // Determine top shop
    const topShop = Object.entries(shopMetrics).sort(([, a], [, b]) => b.profit - a.profit)[0] || ['n/a', { sales: 0, expenses: 0, profit: 0 }];

    const totalSales = Object.values(shopMetrics).reduce((sum: number, metric: ShopMetric) => sum + metric.sales, 0);
    const totalExpenses = Object.values(shopMetrics).reduce((sum: number, metric: ShopMetric) => sum + metric.expenses, 0);
    const profitMargin = totalSales > 0 ? ((totalSales - totalExpenses) / totalSales * 100).toFixed(1) : 0;

    const brain = {
      insight: `Last 30 days: ${totalSales > totalExpenses ? '📈 Profitable' : '📉 Losses'} | Top performer: ${topShop[0].toUpperCase()}`,
      revenueTrend: totalSales > 10000 ? '📈 UP' : '📉 DOWN',
      expenseTrend: totalExpenses > 5000 ? '⬆️ RISING' : '⬇️ STABLE',
      profitMargin,
      topShop: (topShop[0] || 'N/A').toUpperCase()
    };

    return NextResponse.json({
      success: true,
      brain
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
