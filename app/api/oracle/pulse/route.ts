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
      totalUnits: metrics.totalUnits,
      categoryBreakdown: metrics.categoryBreakdown,
      finances: { 
        revenue: metrics.finances.revenue, 
        tax: metrics.finances.tax, 
        grossProfit: metrics.finances.grossProfit, 
        netIncome: metrics.finances.grossProfit, 
        monthlyBurn: 0 
      },
      shopPerformance: (shops || []).map((s: any) => {
        const perf = (metrics.shopPerformance || []).find((p: any) => p.id === s.id) || { revenue: 0, deposits: 0 };
        const overheadTarget = calculateShopOverheadTarget(s.id);
        const coverageAmount = Number(perf.revenue) + Number(perf.deposits);
        const progress = overheadTarget > 0 ? (coverageAmount / overheadTarget) * 100 : 100;
        
        return {
            id: s.id,
            name: s.name,
            revenue: Number(perf.revenue),
            expenses: overheadTarget,
            deposits: Number(perf.deposits),
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
