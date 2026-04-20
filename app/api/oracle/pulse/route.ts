import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { runOracleValidation } from "@/lib/oracleValidation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateStr = sixtyDaysAgo.toISOString();

    // Direct Data Feed: Bypassing the database RPC for extreme reliability
    const [salesRes, ledgerRes, opsRes, shopsRes] = await Promise.all([
      supabaseAdmin.from('sales').select('total_with_tax, quantity, item_name, shop_id, date').gte('date', dateStr),
      supabaseAdmin.from('ledger_entries').select('amount, type, category, shop_id, date').gte('date', dateStr),
      supabaseAdmin.from('operations_ledger').select('amount, kind, shop_id, effective_date').gte('created_at', dateStr),
      supabaseAdmin.from('shops').select('*')
    ]);

    if (salesRes.error || ledgerRes.error || opsRes.error || !shopsRes.data) {
      console.error("Pulse Fetch Error:", { sales: salesRes.error, ledger: ledgerRes.error, ops: opsRes.error });
      return NextResponse.json({ error: "Master pulse data unavailable" }, { status: 500 });
    }

    const sales = salesRes.data || [];
    const ledger = ledgerRes.data || [];
    const operations = opsRes.data || [];
    const shops = shopsRes.data || [];

    // Aggregations
    let totalRevenue = 0;
    let totalUnits = 0;
    const categoryBreakdown: Record<string, number> = {};
    const shopPerformance: any[] = [];

    // Calculate Global Stats
    sales.forEach(s => {
      totalRevenue += Number(s.total_with_tax || 0);
      totalUnits += Number(s.quantity || 1);
      
      // Breakdown category mapping (Approximation from unit name if not present in item metadata)
      const cat = s.item_name?.split(' ')?.[0] || "General";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Number(s.total_with_tax || 0);
    });

    const totalExpenses = ledger
      .filter(l => l.type === 'expense')
      .reduce((sum, l) => sum + Number(l.amount || 0), 0);

    // Process Shop Performance: deposits from operations (for visibility) but burn rate excludes ops
    shops.forEach(shop => {
      const shopSales = sales.filter(s => s.shop_id === shop.id);
      const shopRevenue = shopSales.reduce((sum, s) => sum + Number(s.total_with_tax || 0), 0);
      
      const shopDeposits = operations
        .filter(o => o.shop_id === shop.id && (o.kind === 'eod_deposit' || o.kind === 'overhead_contribution'))
        .reduce((sum, o) => sum + Number(o.amount || 0), 0);

      const shopExpenses = shop.expenses || {};
      const overheadTarget = Object.values(shopExpenses).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
      
      const coverageAmount = shopRevenue + shopDeposits;
      const progress = overheadTarget > 0 ? (coverageAmount / (overheadTarget * 2)) * 100 : 100; // *2 because 60 days

      shopPerformance.push({
        id: shop.id,
        name: shop.name,
        revenue: shopRevenue,
        expenses: overheadTarget * 2,
        deposits: shopDeposits,
        progress: Math.min(100, progress)
      });
    });

    return NextResponse.json({
      totalUnits,
      categoryBreakdown,
      finances: { 
        revenue: totalRevenue, 
        tax: totalRevenue * 0.155, // 15.5% Default
        grossProfit: totalRevenue - (totalRevenue * 0.6), // 40% Margin Assumption
        netIncome: totalRevenue - totalExpenses, 
        monthlyBurn: totalExpenses / 2 
      },
      shopPerformance,
      deadCapital: 0,
      zombieCount: 0,
      recentEmails: [],
      dataIntegrity: await runOracleValidation().catch(() => null)
    });

  } catch (e: any) {
    console.error("Oracle pulse migration error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
