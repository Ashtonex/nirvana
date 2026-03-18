export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance, getOperationsState, listOperationsLedgerEntries } from "@/lib/operations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui";

export default async function LogicPage() {
  try {
    await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  let ops = { computed: 0, actual: 0, delta: 0 };
  let ledger: any[] = [];
  let audit: any[] = [];
  let sessions: any[] = [];

  try {
    const [computed, state, ledgerRows] = await Promise.all([
      getOperationsComputedBalance(),
      getOperationsState(),
      listOperationsLedgerEntries(20),
    ]);
    ops = {
      computed,
      actual: Number((state as any)?.actual_balance || 0),
      delta: Number((state as any)?.actual_balance || 0) - computed,
    };
    ledger = ledgerRows;
  } catch {
    // ops tables may not exist until migrations are applied
  }

  try {
    const [a, s] = await Promise.all([
      supabaseAdmin.from("audit_log").select("*").order("timestamp", { ascending: false }).limit(50),
      supabaseAdmin.from("staff_sessions").select("employee_id, expires_at, created_at").order("created_at", { ascending: false }).limit(25),
    ]);
    audit = (a as any)?.data || [];
    sessions = (s as any)?.data || [];
  } catch {
    audit = [];
    sessions = [];
  }

  const drift = Math.abs(ops.delta || 0);
  const driftBadge =
    drift < 0.01 ? (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Balanced</Badge>
    ) : drift < 50 ? (
      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Drift</Badge>
    ) : (
      <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Critical Drift</Badge>
    );

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Logic</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          System Integrity • Audit Trace • Real-time sanity checks (polled)
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Operations Integrity</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              If drift grows, reconcile Operations actual balance vs ledger sum.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-800 text-slate-200 border-slate-700">
              Computed: ${Number(ops.computed || 0).toFixed(2)}
            </Badge>
            <Badge className="bg-slate-800 text-slate-200 border-slate-700">
              Actual: ${Number(ops.actual || 0).toFixed(2)}
            </Badge>
            <Badge className="bg-slate-800 text-slate-200 border-slate-700">
              Delta: {Number(ops.delta || 0).toFixed(2)}
            </Badge>
            {driftBadge}
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Recent Operations Movements</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">Latest 20 ledger entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ledger.length === 0 ? (
              <div className="text-center py-6 text-[10px] font-black text-slate-600 uppercase italic">
                No Operations ledger data (run migrations first).
              </div>
            ) : (
              ledger.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">
                      {r.effective_date} • {r.kind} {r.shop_id ? `• ${r.shop_id}` : ""} {r.overhead_category ? `• ${r.overhead_category}` : ""}
                    </div>
                    <div className="text-sm font-black text-white truncate">{r.title || r.notes || "—"}</div>
                  </div>
                  <div className={`text-right text-sm font-black font-mono ${Number(r.amount) >= 0 ? "text-emerald-300" : "text-rose-400"}`}>
                    {Number(r.amount) >= 0 ? "+" : ""}
                    {Number(r.amount || 0).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Audit Log</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              Who did what (DB-level audit table).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {audit.length === 0 ? (
              <div className="text-center py-6 text-[10px] font-black text-slate-600 uppercase italic">
                No audit entries found.
              </div>
            ) : (
              audit.slice(0, 30).map((a) => (
                <div key={a.id} className="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {new Date(a.timestamp).toLocaleString()} • {a.action || "action"} • {a.table_name || a.table || "table"}
                  </div>
                  <div className="text-sm font-black text-white truncate">{a.description || a.message || "—"}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    actor: {a.user_id || a.employee_id || "unknown"} • record: {a.record_id || "—"}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Session Watch</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              Recent staff sessions (IP capture can be added next).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.length === 0 ? (
              <div className="text-center py-6 text-[10px] font-black text-slate-600 uppercase italic">
                No staff sessions found.
              </div>
            ) : (
              sessions.map((s) => (
                <div key={`${s.employee_id}-${s.created_at}`} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {new Date(s.created_at).toLocaleString()}
                    </div>
                    <div className="text-sm font-black text-white truncate">employee: {s.employee_id}</div>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    exp: {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

