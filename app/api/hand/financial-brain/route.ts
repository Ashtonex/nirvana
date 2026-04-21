import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
    const shopMetrics = {};
    ['kipasa', 'dubdub', 'tradecenter'].forEach(shop => {
      const sales = (salesData || [])
        .filter(s => s.shop_id === shop)
        .reduce((sum, s) => sum + (s.total_with_tax || 0), 0);
      const expenses = (expensesData || [])
        .filter(e => e.shop_id === shop)
        .reduce((sum, e) => sum + (e.amount || 0), 0);
      
      shopMetrics[shop] = {
        sales,
        expenses,
        profit: sales - expenses
      };
    });

    // Determine top shop
    const topShop = Object.entries(shopMetrics).sort(
      ([, a], [, b]) => (b.profit || 0) - (a.profit || 0)
    )[0];

    const totalSales = Object.values(shopMetrics).reduce((sum, m: any) => sum + (m.sales || 0), 0);
    const totalExpenses = Object.values(shopMetrics).reduce((sum, m: any) => sum + (m.expenses || 0), 0);
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
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
