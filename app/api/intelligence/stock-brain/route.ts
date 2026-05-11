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
      { data: shipments },
      { data: shops },
      { data: operationsState },
      { data: ledgerEntries }
    ] = await Promise.all([
      supabaseAdmin.from('sales').select('*'),
      supabaseAdmin.from('inventory_items').select('*'),
      supabaseAdmin.from('shipments').select('*'),
      supabaseAdmin.from('shops').select('*'),
      supabaseAdmin.from('operations_state').select('*').eq('id', 1).maybeSingle(),
      supabaseAdmin.from('operations_ledger').select('*').gte('created_at', thirtyDaysAgo)
    ]);

    const salesRows = sales || [];
    const inventoryRows = inventory || [];
    const shipmentRows = shipments || [];
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

    // 4. Shipment-level truth: every batch gets its own mini P&L.
    const itemById = new Map<string, any>(inventoryRows.map((item: any) => [String(item.id), item]));
    const shipmentMap = new Map<string, any>();

    shipmentRows.forEach((shipment: any) => {
      const id = String(shipment.id || shipment.shipment_number || 'UNKNOWN');
      shipmentMap.set(id, {
        id,
        shipmentNumber: shipment.shipment_number || id,
        supplier: shipment.supplier || 'Unknown supplier',
        date: shipment.date || null,
        recordedCost:
          Number(shipment.purchase_price || 0) +
          Number(shipment.shipping_cost || 0) +
          Number(shipment.duty_cost || 0) +
          Number(shipment.misc_cost || 0),
        itemCount: 0,
        currentUnits: 0,
        soldUnits: 0,
        recentSoldUnits: 0,
        estimatedOriginalUnits: 0,
        estimatedCost: 0,
        remainingCost: 0,
        revenue: 0,
        grossProfit: 0,
        lastSold: null,
        fastestMover: null,
        slowestMover: null,
        items: new Map<string, any>(),
      });
    });

    inventoryRows.forEach((item: any) => {
      const shipmentId = String(item.shipment_id || 'UNASSIGNED');
      if (!shipmentMap.has(shipmentId)) {
        shipmentMap.set(shipmentId, {
          id: shipmentId,
          shipmentNumber: shipmentId,
          supplier: shipmentId.includes('ADHOC') || shipmentId.includes('UNTRACKED') ? 'Ad-hoc / POS created' : 'Unknown supplier',
          date: item.date_added || null,
          recordedCost: 0,
          itemCount: 0,
          currentUnits: 0,
          soldUnits: 0,
          recentSoldUnits: 0,
          estimatedOriginalUnits: 0,
          estimatedCost: 0,
          remainingCost: 0,
          revenue: 0,
          grossProfit: 0,
          lastSold: null,
          fastestMover: null,
          slowestMover: null,
          items: new Map<string, any>(),
        });
      }

      const shipment = shipmentMap.get(shipmentId);
      const currentQty = Number(item.quantity || 0);
      const unitCost = Number(item.landed_cost || item.acquisition_price || 0);
      shipment.itemCount += 1;
      shipment.currentUnits += currentQty;
      shipment.remainingCost += currentQty * unitCost;
      shipment.items.set(String(item.id), {
        id: String(item.id),
        name: item.name || 'Unknown item',
        category: item.category || 'General',
        currentQty,
        soldQty: 0,
        recentSoldQty: 0,
        unitCost,
        revenue: 0,
        grossProfit: 0,
        lastSold: null,
      });
    });

    salesRows.forEach((sale: any) => {
      const item = itemById.get(String(sale.item_id || ''));
      if (!item) return;

      const shipmentId = String(item.shipment_id || 'UNASSIGNED');
      const shipment = shipmentMap.get(shipmentId);
      if (!shipment) return;

      const itemStats = shipment.items.get(String(item.id));
      if (!itemStats) return;

      const qty = Number(sale.quantity || 0);
      const revenue = Number(sale.total_with_tax || 0);
      const cost = Number(item.landed_cost || item.acquisition_price || 0) * qty;

      shipment.soldUnits += qty;
      if (sale.date >= ninetyDaysAgo) shipment.recentSoldUnits += qty;
      shipment.revenue += revenue;
      shipment.grossProfit += revenue - cost;
      shipment.lastSold = !shipment.lastSold || sale.date > shipment.lastSold ? sale.date : shipment.lastSold;

      itemStats.soldQty += qty;
      if (sale.date >= ninetyDaysAgo) itemStats.recentSoldQty += qty;
      itemStats.revenue += revenue;
      itemStats.grossProfit += revenue - cost;
      itemStats.lastSold = !itemStats.lastSold || sale.date > itemStats.lastSold ? sale.date : itemStats.lastSold;
    });

    const shipmentAnalysis = Array.from(shipmentMap.values()).map((shipment: any) => {
      const itemList = Array.from(shipment.items.values()).map((item: any) => {
        const originalQty = item.currentQty + item.soldQty;
        const sellThrough = originalQty > 0 ? (item.soldQty / originalQty) * 100 : 0;
        return {
          ...item,
          originalQty,
          sellThrough,
        };
      });

      itemList.forEach((item: any) => {
        shipment.estimatedOriginalUnits += item.originalQty;
        shipment.estimatedCost += item.originalQty * item.unitCost;
      });

      const activeItems = itemList.filter((item: any) => item.originalQty > 0);
      shipment.fastestMover = [...activeItems].sort((a: any, b: any) => b.sellThrough - a.sellThrough)[0] || null;
      shipment.slowestMover = [...activeItems].sort((a: any, b: any) => a.sellThrough - b.sellThrough)[0] || null;

      const costBasis = shipment.estimatedCost || shipment.recordedCost;
      const sellThrough = shipment.estimatedOriginalUnits > 0
        ? (shipment.soldUnits / shipment.estimatedOriginalUnits) * 100
        : 0;
      const recoveredPct = costBasis > 0 ? (shipment.revenue / costBasis) * 100 : 0;
      const roi = costBasis > 0 ? (shipment.grossProfit / costBasis) * 100 : 0;
      const dailyVelocity = shipment.recentSoldUnits / 90;
      const daysLeft = dailyVelocity > 0 ? shipment.currentUnits / dailyVelocity : (shipment.currentUnits > 0 ? 999 : 0);

      let status = 'monitor';
      const flags: string[] = [];
      if (roi > 25 && sellThrough > 50) {
        status = 'winning';
        flags.push('Profitable shipment with healthy sell-through.');
      }
      if (recoveredPct < 70 && sellThrough > 60) {
        status = 'margin-risk';
        flags.push('Units are moving but shipment cost is not recovered fast enough.');
      }
      if (sellThrough < 25 && shipment.currentUnits > 0) {
        status = 'slow';
        flags.push('Slow sell-through; consider price, display, or transfer action.');
      }
      if (daysLeft < 14 && shipment.currentUnits > 0) {
        flags.push(`Running out soon: about ${daysLeft.toFixed(0)} days left at current velocity.`);
      }
      if (shipment.currentUnits === 0 && roi > 0) {
        status = 'sold-through';
        flags.push('Sold through with positive return.');
      }

      return {
        id: shipment.id,
        shipmentNumber: shipment.shipmentNumber,
        supplier: shipment.supplier,
        date: shipment.date,
        itemCount: shipment.itemCount,
        originalUnits: shipment.estimatedOriginalUnits,
        soldUnits: shipment.soldUnits,
        currentUnits: shipment.currentUnits,
        costBasis,
        remainingCost: shipment.remainingCost,
        revenue: shipment.revenue,
        grossProfit: shipment.grossProfit,
        roi,
        recoveredPct,
        sellThrough,
        daysLeft,
        status,
        flags,
        fastestMover: shipment.fastestMover,
        slowestMover: shipment.slowestMover,
        items: itemList.sort((a: any, b: any) => b.grossProfit - a.grossProfit).slice(0, 8),
      };
    }).sort((a: any, b: any) => {
      const statusWeight: Record<string, number> = { winning: 4, 'margin-risk': 3, slow: 2, monitor: 1, 'sold-through': 0 };
      return (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0) || b.grossProfit - a.grossProfit;
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
      shopAllocations,
      shipmentAnalysis
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
