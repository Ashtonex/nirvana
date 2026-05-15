import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { runOracleValidation } from "@/lib/oracleValidation";

export const dynamic = "force-dynamic";

type SaleRow = {
  total_with_tax: number | null;
  quantity: number | null;
  item_name: string | null;
  shop_id: string | null;
  date: string | null;
};

type LedgerRow = {
  amount: number | null;
  type: string | null;
  category: string | null;
  shop_id: string | null;
  date: string | null;
};

type OperationRow = {
  amount: number | null;
  kind: string | null;
  shop_id: string | null;
  effective_date: string | null;
};

type ShopRow = {
  id: string;
  name: string;
  expenses?: Record<string, number | string | null> | null;
};

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
      supabaseAdmin.from('shops').select('*'),
      supabaseAdmin.from('analytics_results').select('kind, payload').order('generated_at', { ascending: false }).limit(10)
    ]);

    if (salesRes.error || ledgerRes.error || opsRes.error || !shopsRes.data) {
      console.error("Pulse Fetch Error:", { sales: salesRes.error, ledger: ledgerRes.error, ops: opsRes.error });
      return NextResponse.json({ error: "Master pulse data unavailable" }, { status: 500 });
    }

    const sales: SaleRow[] = salesRes.data || [];
    const ledger: LedgerRow[] = ledgerRes.data || [];
    const operations: OperationRow[] = opsRes.data || [];
    const shops: ShopRow[] = shopsRes.data || [];
    const analytics = analyticsRes.data || [];

    const velocityPayload = analytics.find(a => a.kind === 'inventory_velocity')?.payload as any;
    const expensePayload = analytics.find(a => a.kind === 'expense_anomaly')?.payload as any;

    const deadCapital = velocityPayload?.priority_items
      ?.filter((i: any) => i.status === 'dead_stock')
      ?.reduce((sum: number, i: any) => sum + (i.capital_tied || 0), 0) || 0;
    
    const zombieCount = velocityPayload?.priority_items?.filter((i: any) => i.status === 'dead_stock')?.length || 0;

    // Aggregations
    let totalRevenue = 0;
    let totalUnits = 0;
    const categoryBreakdown: Record<string, number> = {};
    const shopPerformance: Array<{
      id: string;
      name: string;
      revenue: number;
      expenses: number;
      deposits: number;
      progress: number;
    }> = [];

    // Calculate Global Stats
    sales.forEach((s: SaleRow) => {
      totalRevenue += Number(s.total_with_tax || 0);
      totalUnits += Number(s.quantity || 1);
      
      // Breakdown category mapping (Approximation from unit name if not present in item metadata)
      const cat = s.item_name?.split(' ')?.[0] || "General";
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Number(s.total_with_tax || 0);
    });

    const totalExpenses = ledger
      .filter((l: LedgerRow) => l.type === 'expense')
      .reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0);

    // Process Shop Performance: deposits from operations (for visibility) but burn rate excludes ops
    shops.forEach((shop: ShopRow) => {
      const shopSales = sales.filter((s: SaleRow) => s.shop_id === shop.id);
      const shopRevenue = shopSales.reduce((sum: number, s: SaleRow) => sum + Number(s.total_with_tax || 0), 0);
      
      const shopDeposits = operations
        .filter((o: OperationRow) => o.shop_id === shop.id && (o.kind === 'eod_deposit' || o.kind === 'overhead_contribution'))
        .reduce((sum: number, o: OperationRow) => sum + Number(o.amount || 0), 0);

      const shopExpenses = shop.expenses || {};
      const overheadTarget = Object.values(shopExpenses).reduce((acc: number, val) => acc + Number(val || 0), 0);
      
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
      deadCapital,
      zombieCount,
      recentEmails: [],
      anomalies: expensePayload?.anomalies || [],
      dataIntegrity: await runOracleValidation().catch(() => null)
    });

  } catch (e: unknown) {
    console.error("Oracle pulse migration error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
