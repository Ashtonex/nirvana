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
      .filter((s: any) => s.date >= thirtyDaysAgo)
      .reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    
    const monthlyOverhead = shopRows.reduce((sum: number, shop: any) => {
      const exp = (shop.expenses as Record<string, number>) || {};
      return sum + Object.values(exp).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    }, 0);

    // AI/Autonomous Logic: Define orderable budget (e.g., 30% of profit after overhead)
    const projectedProfit = recentRevenue - monthlyOverhead;
    const stockOrderBudget = Math.max(0, projectedProfit * 0.4); // Reinvest 40% of net into growth

    // Seasonal Logic
    const currentMonth = new Date().getUTCMonth();
    const isWinter = currentMonth >= 4 && currentMonth <= 7; // May to Aug (Southern Hemisphere)
    const season = isWinter ? 'Winter' : 'Summer';

    // 1. Analyze Sales Velocity & Profitability with Seasonal Weighting
    const itemStats = new Map<string, any>();
    salesRows.forEach((sale: any) => {
      const name = sale.item_name;
      const stats = itemStats.get(name) || { 
        name, 
        qtySold30d: 0, 
        qtySold90d: 0, 
        revenue: 0, 
        profit: 0, 
        lastSold: sale.date,
        seasonalScore: 0 // higher if sold in current season
      };
      
      const qty = Number(sale.quantity || 0);
      const rev = Number(sale.total_with_tax || 0);
      
      // True COGS attempt
      const invItem = inventoryRows.find((i: any) => i.name === name);
      const unitCost = Number(invItem?.landed_cost || invItem?.acquisition_price || (rev / (qty || 1)) * 0.6);
      const cost = unitCost * qty;

      if (sale.date >= thirtyDaysAgo) stats.qtySold30d += qty;
      stats.qtySold90d += qty;
      stats.revenue += rev;
      stats.profit += (rev - cost);
      if (sale.date > stats.lastSold) stats.lastSold = sale.date;
      
      // Basic seasonality: If sold recently, it's 'in season'
      if (sale.date >= thirtyDaysAgo) stats.seasonalScore += 1;
      
      itemStats.set(name, stats);
    });

    // 2. Generate Autonomous Order Recommendations
    const recommendations = Array.from(itemStats.values()).map((stats: any) => {
      const invItem = inventoryRows.find((i: any) => i.name === stats.name);
      const currentStock = inventoryRows
        .filter((i: any) => i.name === stats.name)
        .reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0);
      
      const velocity = stats.qtySold30d / 30; // units per day
      const daysLeft = velocity > 0 ? currentStock / velocity : (currentStock > 0 ? 999 : 0);
      
      let recommendation = 'hold';
      let reason = 'Stock levels healthy for current demand.';
      let priority = 'low';

      if (daysLeft < 10 && stats.qtySold30d > 0) {
        recommendation = 'order';
        reason = `High velocity (${velocity.toFixed(2)}/day). Runs out in ${daysLeft.toFixed(0)} days. Priority replenishment needed.`;
        priority = 'high';
      } else if (stats.qtySold90d > 15 && currentStock < (velocity * 14)) {
        recommendation = 'order';
        reason = 'Steady performer. Buffer stock is below 14-day safety threshold.';
        priority = 'medium';
      } else if (stats.qtySold90d === 0 && currentStock > 0) {
        recommendation = 'liquidate';
        reason = `Stale stock (${season}). No sales in 90 days. Recommend 25% discount to clear shelf space.`;
        priority = 'info';
      }

      // Smart order quantity: Enough to last 60 days of current velocity
      const targetStock = Math.ceil(velocity * 60);
      let orderQty = recommendation === 'order' ? Math.max(0, targetStock - currentStock) : 0;
      
      // Round up to case packs if applicable (assume 6 for now)
      if (orderQty > 0) orderQty = Math.ceil(orderQty / 6) * 6;

      return {
        ...stats,
        currentStock,
        velocity,
        daysLeft,
        recommendation,
        reason,
        priority,
        suggestedQty: orderQty,
        category: invItem?.category || 'General',
        estimatedCost: orderQty * (invItem?.landed_cost || (stats.revenue / stats.qtySold90d) * 0.6)
      };
    });

    // 3. Shop Allocations Logic (based on shop-specific sales)
    const shopAllocations = shopRows.map((shop: any) => {
      const shopSales = salesRows.filter((s: any) => s.shop_id === shop.id);
      const topSellers = new Map<string, number>();
      shopSales.forEach((s: any) => {
        topSellers.set(s.item_name, (topSellers.get(s.item_name) || 0) + Number(s.quantity || 0));
      });
      
      return {
        shopId: shop.id,
        shopName: shop.name,
        needs: Array.from(topSellers.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, qty]) => ({ name, weight: qty / (shopSales.length || 1) }))
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
