export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance, getOperationsState, listOperationsLedgerEntries } from "@/lib/operations";
import { OperationsConsole } from "@/components/OperationsConsole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui";

function monthKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function OperationsPage() {
  try {
    await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  const currentMonth = monthKeyUTC(new Date());
  const monthStart = `${currentMonth}-01`;
  const monthEnd = `${currentMonth}-31`;

  let shops: any[] = [];
  try {
    const { data } = await supabaseAdmin.from("shops").select("id,name,expenses").order("id", { ascending: true });
    shops = data || [];
  } catch {
    shops = [];
  }

  let opsState = { computedBalance: 0, actualBalance: 0, updatedAt: null as any, delta: 0 };
  let ledger: any[] = [];
  let overheadDeposits: any[] = [];

  try {
    const [computed, state, ledgerRows, oh] = await Promise.all([
      getOperationsComputedBalance(),
      getOperationsState(),
      listOperationsLedgerEntries(50),
      supabaseAdmin
        .from("operations_ledger")
        .select("shop_id, overhead_category, amount, effective_date, kind")
        .gte("effective_date", monthStart)
        .lte("effective_date", monthEnd)
        .in("kind", ["overhead_deposit"]),
    ]);

    opsState = {
      computedBalance: computed,
      actualBalance: Number((state as any)?.actual_balance || 0),
      updatedAt: (state as any)?.updated_at || null,
      delta: Number((state as any)?.actual_balance || 0) - computed,
    };
    ledger = ledgerRows;
    overheadDeposits = (oh as any)?.data || [];
  } catch {
    // Tables might not exist yet until migrations are applied.
  }

  const expectedTotals: Record<string, number> = { kipasa: 1870, tradecenter: 740, dubdub: 1740 };
  const overheadByShop: Record<string, any> = {};
  for (const row of overheadDeposits) {
    const sid = String(row.shop_id || "");
    if (!sid) continue;
    if (!overheadByShop[sid]) overheadByShop[sid] = { rent: 0, salaries: 0, utilities: 0, misc: 0, total: 0 };
    const cat = String(row.overhead_category || "misc");
    const amt = Number(row.amount || 0);
    if (cat in overheadByShop[sid]) overheadByShop[sid][cat] += amt;
    else overheadByShop[sid].misc += amt;
    overheadByShop[sid].total += amt;
  }

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Operations</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          Master Vault / Cash Pool • Month: {currentMonth}
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <Card className="bg-slate-950/40 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Shop Overhead Reconciliation</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              Targets come from `shops.expenses` (rent/salaries/utilities/misc). Expected totals enforced: Kipasa 1870, Trade Center 740, Dub Dub 1740.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {shops.length === 0 ? (
              <div className="text-center py-8 text-[10px] font-black text-slate-600 uppercase italic">
                Shops not loaded (or DB not configured yet).
              </div>
            ) : (
              <div className="space-y-2">
                {shops.map((s: any) => {
                  const ex = s.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 };
                  const target = Number(ex.rent || 0) + Number(ex.salaries || 0) + Number(ex.utilities || 0) + Number(ex.misc || 0);
                  const expected = expectedTotals[String(s.id)] ?? null;
                  const covered = overheadByShop[String(s.id)]?.total || 0;
                  const pct = target > 0 ? (covered / target) * 100 : 0;
                  const match = expected == null ? true : Math.abs(target - expected) < 0.01;
                  return (
                    <div key={s.id} className="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black uppercase italic text-white truncate">{s.name || s.id}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Target ${target.toFixed(2)} • Covered ${covered.toFixed(2)} • {pct.toFixed(0)}%
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {pct >= 100 ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Covered</Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pending</Badge>
                          )}
                          {!match && expected != null ? (
                            <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Mismatch vs {expected}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-slate-400">
                        <div>Rent: {Number(overheadByShop[String(s.id)]?.rent || 0).toFixed(0)}</div>
                        <div>Salaries: {Number(overheadByShop[String(s.id)]?.salaries || 0).toFixed(0)}</div>
                        <div>Utilities: {Number(overheadByShop[String(s.id)]?.utilities || 0).toFixed(0)}</div>
                        <div>Misc: {Number(overheadByShop[String(s.id)]?.misc || 0).toFixed(0)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <OperationsConsole shops={shops} initialLedger={ledger} />
      </div>
    </div>
  );
}

