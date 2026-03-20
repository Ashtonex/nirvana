import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: opsState } = await supabaseAdmin
      .from("operations_state")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    const { data: ledgerRows } = await supabaseAdmin
      .from("operations_ledger")
      .select("amount, kind, shop_id, overhead_category");

    const computedBalance = (ledgerRows || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
    
    const shopTotals: Record<string, number> = {};
    const overheadTotals: Record<string, number> = {};
    (ledgerRows || []).forEach((r: any) => {
      if (r.shop_id) {
        shopTotals[r.shop_id] = (shopTotals[r.shop_id] || 0) + Number(r.amount || 0);
      }
      if (r.overhead_category) {
        overheadTotals[r.overhead_category] = (overheadTotals[r.overhead_category] || 0) + Number(r.amount || 0);
      }
    });

    const { data: investRows } = await supabaseAdmin
      .from("invest_deposits")
      .select("amount, withdrawn_amount, shop_id");

    const investByShop: Record<string, { total: number; withdrawn: number; available: number }> = {};
    let totalInvest = 0;
    let totalInvestWithdrawn = 0;

    (investRows || []).forEach((d: any) => {
      const shop = d.shop_id || "unknown";
      const amount = Number(d.amount || 0);
      const withdrawn = Number(d.withdrawn_amount || 0);
      
      if (!investByShop[shop]) {
        investByShop[shop] = { total: 0, withdrawn: 0, available: 0 };
      }
      investByShop[shop].total += amount;
      investByShop[shop].withdrawn += withdrawn;
      investByShop[shop].available += (amount - withdrawn);
      
      totalInvest += amount;
      totalInvestWithdrawn += withdrawn;
    });

    const { data: opsLedgerRows } = await supabaseAdmin
      .from("operations_ledger")
      .select("amount, kind, shop_id");

    const opsSavingsByShop: Record<string, number> = {};
    (opsLedgerRows || []).forEach((r: any) => {
      if (r.shop_id && (r.kind === "eod_deposit" || r.kind === "savings_contribution")) {
        const shop = r.shop_id;
        if (!opsSavingsByShop[shop]) opsSavingsByShop[shop] = 0;
        opsSavingsByShop[shop] += Number(r.amount || 0);
      }
    });

    const totalInvestAvailable = totalInvest - totalInvestWithdrawn;
    const combinedTotal = (opsState?.actual_balance || 0) + totalInvestAvailable;

    const currentMonth = new Date().toISOString().split('T')[0].substring(0, 7);
    const { data: monthlyOverhead } = await supabaseAdmin
      .from("operations_ledger")
      .select("amount, overhead_category, shop_id")
      .eq("kind", "overhead_payment")
      .like("effective_date", `${currentMonth}%`);

    const monthlyOverheadByShop: Record<string, number> = {};
    (monthlyOverhead || []).forEach((r: any) => {
      if (r.shop_id) {
        monthlyOverheadByShop[r.shop_id] = (monthlyOverheadByShop[r.shop_id] || 0) + Number(r.amount || 0);
      }
    });

    const { data: shops } = await supabaseAdmin.from("shops").select("id, name, expenses");

    const shopTargets = (shops || []).map((s: any) => {
      const expenses = s.expenses || {};
      const target = Object.values(expenses).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
      const tracked = monthlyOverheadByShop[s.id] || 0;
      const progress = target > 0 ? (tracked / target) * 100 : 0;
      
      return {
        id: s.id,
        name: s.name,
        target,
        tracked,
        progress,
        remaining: Math.max(0, target - tracked)
      };
    });

    return NextResponse.json({
      computedBalance,
      actualBalance: opsState?.actual_balance || 0,
      updatedAt: opsState?.updated_at || null,
      delta: (opsState?.actual_balance || 0) - computedBalance,
      shopTotals,
      overheadTotals,
      invest: {
        total: totalInvest,
        withdrawn: totalInvestWithdrawn,
        available: totalInvestAvailable,
        byShop: investByShop
      },
      savings: {
        byShop: opsSavingsByShop
      },
      combinedTotal,
      overheadTracking: {
        currentMonth,
        byShop: monthlyOverheadByShop,
        shopTargets
      }
    });
  } catch (e: any) {
    console.error("Operations state error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));
    const actualBalance = Number(body?.actualBalance);
    if (!Number.isFinite(actualBalance)) {
      return NextResponse.json({ error: "Invalid actualBalance" }, { status: 400 });
    }
    
    const { data, error } = await supabaseAdmin
      .from("operations_state")
      .upsert({ id: 1, actual_balance: actualBalance, updated_at: new Date().toISOString() })
      .select()
      .maybeSingle();
    
    if (error) throw error;
    return NextResponse.json({ success: true, state: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
