import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch data for the "Brain" to analyze
    const [
      { data: sales },
      { data: inventory },
      { data: shops },
      { data: operationsState },
      { data: ledgerEntries }
    ] = await Promise.all([
      supabaseAdmin.from('sales').select('*').gte('date', ninetyDaysAgo),
      supabaseAdmin.from('inventory_items').select('*'),
      supabaseAdmin.from('shops').select('*'),
      supabaseAdmin.from('operations_state').select('*').eq('id', 1).maybeSingle(),
      supabaseAdmin.from('operations_ledger').select('*').gte('created_at', thirtyDaysAgo)
    ]);

    const salesRows = sales || [];
    const inventoryRows = inventory || [];
    const shopRows = shops || [];
    const actualVault = Number(operationsState?.actual_balance || 0);

    // Calculate budget based on recent performance and overhead needs
    const recentRevenue = salesRows
      .filter(s => s.date >= thirtyDaysAgo)
      .reduce((sum, s) => sum + Number(s.total_with_tax || 0), 0);
    
    const monthlyOverhead = shopRows.reduce((sum, shop) => {
      const exp = (shop.expenses as Record<string, number>) || {};
      return sum + Object.values(exp).reduce((a, b) => a + (b || 0), 0);
    }, 0);

    // AI/Autonomous Logic: Define orderable budget (e.g., 30% of profit after overhead)
    const projectedProfit = recentRevenue - monthlyOverhead;
    const stockOrderBudget = Math.max(0, projectedProfit * 0.4); // Reinvest 40% of net into growth

    // 1. Analyze Sales Velocity & Profitability
    const itemStats = new Map();
    salesRows.forEach(sale => {
      const name = sale.item_name;
      const stats = itemStats.get(name) || { 
        name, 
        qtySold30d: 0, 
        qtySold90d: 0, 
        revenue: 0, 
        profit: 0, 
        lastSold: sale.date 
      };
      
      const qty = Number(sale.quantity || 0);
      const rev = Number(sale.total_with_tax || 0);
      const cost = Number(sale.total_before_tax || 0) * 0.7; // Fallback cost estimate

      if (sale.date >= thirtyDaysAgo) stats.qtySold30d += qty;
      stats.qtySold90d += qty;
      stats.revenue += rev;
      stats.profit += (rev - cost);
      if (sale.date > stats.lastSold) stats.lastSold = sale.date;
      
      itemStats.set(name, stats);
    });

    // 2. Generate Autonomous Order Recommendations
    const recommendations = Array.from(itemStats.values()).map(stats => {
      const currentStock = inventoryRows
        .filter(i => i.name === stats.name)
        .reduce((sum, i) => sum + Number(i.quantity || 0), 0);
      
      const velocity = stats.qtySold30d / 30; // units per day
      const daysLeft = velocity > 0 ? currentStock / velocity : Infinity;
      
      let recommendation = 'hold';
      let reason = 'Stock levels healthy';
      let priority = 'low';

      if (daysLeft < 7 && stats.qtySold30d > 0) {
        recommendation = 'order';
        reason = `High velocity (${velocity.toFixed(2)}/day). Runs out in ${daysLeft.toFixed(0)} days.`;
        priority = 'high';
      } else if (stats.qtySold90d > 10 && currentStock < 5) {
        recommendation = 'order';
        reason = 'Consistent performer with low baseline stock.';
        priority = 'medium';
      } else if (stats.qtySold90d === 0 && currentStock > 10) {
        recommendation = 'liquidate';
        reason = 'No sales in 90 days. Dead stock. Suggest 20% discount.';
        priority = 'info';
      }

      // Calculate suggested order quantity (to last 45 days)
      const targetStock = Math.ceil(velocity * 45);
      const orderQty = recommendation === 'order' ? Math.max(0, targetStock - currentStock) : 0;

      return {
        ...stats,
        currentStock,
        velocity,
        daysLeft,
        recommendation,
        reason,
        priority,
        suggestedQty: orderQty,
        estimatedCost: orderQty * (stats.revenue / stats.qtySold90d) * 0.6 // rough cost estimate
      };
    });

    // 3. Shop Allocations Logic (based on shop-specific sales)
    const shopAllocations = shopRows.map(shop => {
      const shopSales = salesRows.filter(s => s.shop_id === shop.id);
      const topSellers = new Map();
      shopSales.forEach(s => {
        topSellers.set(s.item_name, (topSellers.get(s.item_name) || 0) + Number(s.quantity || 0));
      });
      
      return {
        shopId: shop.id,
        shopName: shop.name,
        needs: Array.from(topSellers.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, qty]) => ({ name, weight: qty / shopSales.length }))
      };
    });

    return NextResponse.json({
      success: true,
      analysis: {
        totalRevenue30d: recentRevenue,
        monthlyOverhead,
        projectedNet: projectedProfit,
        suggestedBudget: stockOrderBudget,
        actualVaultBalance: actualVault
      },
      recommendations: recommendations.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        return b.profit - a.profit;
      }),
      shopAllocations
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
