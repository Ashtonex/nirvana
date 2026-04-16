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
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*, inventory_allocations(*)');
    // Using explicit 20000 limits to ensure we pick up fresh activity beyond the default 1000 row limits
    const { data: sales } = await supabaseAdmin.from('sales').select('*').order('date', { ascending: false }).limit(20000);
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    const { data: ledger } = await supabaseAdmin.from('ledger_entries').select('*').order('date', { ascending: false }).limit(20000);
    const { data: investDeposits } = await supabaseAdmin.from('invest_deposits').select('*').order('created_at', { ascending: false }).limit(20000);

    if (!inventory || !sales || !shops || !settings) {
      return NextResponse.json({ error: "Missing data" }, { status: 500 });
    }

    const totalRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax), 0);
    const totalTax = sales.reduce((sum: number, s: any) => sum + Number(s.tax), 0);
    const grossProfit =
        sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax), 0) -
        sales.reduce((sum: number, s: any) => {
            const item = inventory.find((i: any) => i.id === s.item_id);
            return sum + (item ? Number(item.landed_cost) * s.quantity : 0);
        }, 0);

    const calculateShopOverheadTarget = (shopId: string) => {
        const shopExpenses = shops?.find((s: any) => s.id === shopId)?.expenses || {};
        return Object.values(shopExpenses).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
    };

    const calculateShopInvestDeposits = (shopId: string) => {
        return (investDeposits || [])
            .filter((d: any) => d.shop_id === shopId)
            .reduce((acc: number, d: any) => {
                const deposited = Number(d.amount || 0);
                const withdrawn = Number(d.withdrawn_amount || 0);
                return acc + Math.max(0, deposited - withdrawn);
            }, 0);
    };

    return NextResponse.json({
      totalUnits: inventory.reduce((sum: number, i: any) => sum + i.quantity, 0),
      categoryBreakdown: (inventory || []).reduce((acc: Record<string, number>, item: any) => {
        const category = item.category || "Uncategorized";
        acc[category] = (acc[category] || 0) + Number(item.quantity || 0);
        return acc;
      }, {}),
      finances: { 
        revenue: totalRevenue, 
        tax: totalTax, 
        grossProfit, 
        netIncome: grossProfit, 
        monthlyBurn: 0 
      },
      shopPerformance: (shops || []).map((s: any) => {
        const shopRevenue = (sales || [])
            .filter((sa: any) => sa.shop_id === s.id)
            .reduce((acc: number, sa: any) => acc + Number(sa.total_with_tax || 0), 0);
        
        const overheadTarget = calculateShopOverheadTarget(s.id);
        const perfumeDeposits = calculateShopInvestDeposits(s.id);
        const coverageAmount = shopRevenue + perfumeDeposits;
        const progress = overheadTarget > 0 ? (coverageAmount / overheadTarget) * 100 : 100;
        
        return {
            id: s.id,
            name: s.name,
            revenue: shopRevenue,
            expenses: overheadTarget,
            deposits: perfumeDeposits,
            progress
        };
      }),
      deadCapital: 0,
      zombieCount: 0,
      recentEmails: [],
      dataIntegrity: await runOracleValidation().catch(() => null)
    });
  } catch (e: any) {
    console.error("Oracle pulse error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
