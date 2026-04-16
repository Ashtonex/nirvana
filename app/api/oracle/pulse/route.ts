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
    const { data: metrics, error: rpcError } = await supabaseAdmin.rpc('get_oracle_pulse_metrics', { 
        days_limit_int: 60 
    });

    const { data: shops } = await supabaseAdmin.from('shops').select('*');

    if (rpcError || !metrics || !shops) {
      console.error("Oracle RPC error:", rpcError);
      return NextResponse.json({ error: rpcError?.message || "Critical failure: Master pulse metrics unavailable" }, { status: 500 });
    }

    const calculateShopOverheadTarget = (shopId: string) => {
        const shopExpenses = shops?.find((s: any) => s.id === shopId)?.expenses || {};
        return Object.values(shopExpenses).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
    };

    return NextResponse.json({
      totalUnits: Number(metrics.totalUnits || 0),
      categoryBreakdown: metrics.categoryBreakdown || {},
      finances: { 
        revenue: Number(metrics.finances?.revenue || 0), 
        tax: Number(metrics.finances?.tax || 0), 
        grossProfit: Number(metrics.finances?.grossProfit || 0), 
        netIncome: Number(metrics.finances?.grossProfit || 0), 
        monthlyBurn: 0 
      },
      shopPerformance: (shops || []).map((s: any) => {
        const perf = (metrics.shopPerformance || []).find((p: any) => p.id === s.id) || { revenue: 0, deposits: 0 };
        const overheadTarget = calculateShopOverheadTarget(s.id);
        const coverageAmount = Number(perf.revenue || 0) + Number(perf.deposits || 0);
        const progress = overheadTarget > 0 ? (coverageAmount / overheadTarget) * 100 : 100;
        
        return {
            id: s.id,
            name: s.name,
            revenue: Number(perf.revenue || 0),
            expenses: overheadTarget,
            deposits: Number(perf.deposits || 0),
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
