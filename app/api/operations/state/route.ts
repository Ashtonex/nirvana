import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor, isPrivilegedRole } from "@/lib/apiAuth";
import { classifyOperationsAccount, getOperationsComputedBalance, isOverheadContributionKind, isOverheadPaymentKind } from "@/lib/operations";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let actor: any;
  try {
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actorShopId = actor?.type === "staff" && !isPrivilegedRole(actor.role) ? actor.shopId : null;
    const { data: opsState } = await supabaseAdmin
      .from("operations_state")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    let ledgerQuery = supabaseAdmin
      .from("operations_ledger")
      .select("amount, kind, shop_id, overhead_category, title, notes, metadata");
    if (actorShopId) ledgerQuery = ledgerQuery.eq("shop_id", actorShopId);
    const { data: ledgerRows } = await ledgerQuery;

    const computedBalance = actorShopId
      ? (ledgerRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
      : await getOperationsComputedBalance();
    
    const shopTotals: Record<string, number> = {};
    const overheadTotals: Record<string, number> = {};
    const accountTotals = {
      savings: 0,
      overhead: 0,
      invest: 0,
      stockvel: 0,
      round: 0,
      tshirts: 0,
    };
    const monthlyAccountTotals = {
      overhead: 0,
    };
    const accountByShop: Record<string, Record<string, number>> = {};

    (ledgerRows || []).forEach((r: any) => {
      if (r.shop_id) {
        shopTotals[r.shop_id] = (shopTotals[r.shop_id] || 0) + Number(r.amount || 0);
      }
      if (r.overhead_category) {
        overheadTotals[r.overhead_category] = (overheadTotals[r.overhead_category] || 0) + Number(r.amount || 0);
      }
      const account = classifyOperationsAccount(r);
      if (account in accountTotals) {
        const amount = Number(r.amount || 0);
        accountTotals[account as keyof typeof accountTotals] += amount;
        const shop = r.shop_id || "global";
        if (!accountByShop[shop]) accountByShop[shop] = {};
        accountByShop[shop][account] = (accountByShop[shop][account] || 0) + amount;
      }
    });

    let investQuery = supabaseAdmin
      .from("invest_deposits")
      .select("amount, withdrawn_amount, shop_id");
    if (actorShopId) investQuery = investQuery.eq("shop_id", actorShopId);
    const { data: investRows } = await investQuery;

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
    accountTotals.invest += (totalInvest - totalInvestWithdrawn);

    const opsSavingsByShop: Record<string, number> = {};
    (ledgerRows || []).forEach((r: any) => {
      const shop = r.shop_id || "unknown";
      if (classifyOperationsAccount(r) === "savings") {
        if (!opsSavingsByShop[shop]) opsSavingsByShop[shop] = 0;
        opsSavingsByShop[shop] += Number(r.amount || 0);
      }
    });

    let teesSalesQuery = supabaseAdmin
      .from("sales")
      .select("total_with_tax, shop_id")
      .eq("shop_id", "tshirts");
    const { data: teeSalesRows } = await teesSalesQuery;
    const teesTotal = actorShopId ? 0 : (teeSalesRows || []).reduce((sum: number, row: any) => sum + Number(row.total_with_tax || 0), 0);
    accountTotals.tshirts = teesTotal;

    const totalInvestAvailable = totalInvest - totalInvestWithdrawn;
    const combinedTotal = (opsState?.actual_balance || 0) + totalInvestAvailable;

    const currentMonth = new Date().toISOString().split('T')[0].substring(0, 7);
    let monthlyOverheadQuery = supabaseAdmin
      .from("operations_ledger")
      .select("amount, kind, overhead_category, shop_id")
      .like("effective_date", `${currentMonth}%`);
    if (actorShopId) monthlyOverheadQuery = monthlyOverheadQuery.eq("shop_id", actorShopId);
    const { data: monthlyOverhead } = await monthlyOverheadQuery;

    const monthlyOverheadByShop: Record<string, number> = {};
    (monthlyOverhead || []).forEach((r: any) => {
      if (classifyOperationsAccount(r) !== "overhead") return;
      if (r.shop_id) {
        const amount = Number(r.amount || 0);
        const key = amount < 0 || isOverheadPaymentKind((r as any).kind) ? "paid" : "contributed";
        monthlyOverheadByShop[r.shop_id] = (monthlyOverheadByShop[r.shop_id] || 0) + (key === "paid" ? -Math.abs(amount) : amount);
        if (isOverheadContributionKind((r as any).kind) && amount > 0) {
          monthlyAccountTotals.overhead += amount;
        }
      }
    });

    let shopsQuery = supabaseAdmin.from("shops").select("id, name, expenses");
    if (actorShopId) shopsQuery = shopsQuery.eq("id", actorShopId);
    const { data: shops } = await shopsQuery;

    const shopTargets = (shops || []).map((s: any) => {
      const expenses = s.expenses || {};
      const target = Object.values(expenses).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
      const tracked = Math.max(0, monthlyOverheadByShop[s.id] || 0);
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
      accounts: {
        ...accountTotals,
        overhead: monthlyAccountTotals.overhead,
        byShop: accountByShop
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
