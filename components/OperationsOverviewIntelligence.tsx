"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, Brain, LineChart, Loader2, PieChart, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/components/ui";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type AnalyticsRow = {
  id?: string;
  kind?: string;
  generated_at?: string;
  summary?: string | null;
  payload?: any;
};

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function freshness(value?: string) {
  if (!value) return "No snapshot yet";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "Snapshot time unknown";
  const hours = Math.round((Date.now() - then) / 36e5);
  if (hours < 1) return "Updated less than 1h ago";
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

export function OperationsOverviewIntelligence() {
  const [result, setResult] = useState<AnalyticsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics/latest?kind=operations_overview", { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      setResult(data?.results?.operations_overview || null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load operations analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const runSnapshot = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/analytics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: "operations_overview" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        const failure = data?.results?.find?.((row: any) => row.kind === "operations_overview" && !row.ok);
        throw new Error(failure?.error || data?.error || "Operations analytics failed");
      }
      await loadLatest();
    } catch (e: any) {
      setError(e?.message || "Failed to run operations analytics");
    } finally {
      setRunning(false);
    }
  };

  const payload = result?.payload || null;
  const accountTotals = useMemo(() => {
    const rows = Array.isArray(payload?.account_totals) ? payload.account_totals : [];
    return rows.map((row: any) => ({
      account: String(row.account || "other").toUpperCase(),
      balance: Number(row.balance || 0),
    }));
  }, [payload]);
  const anomalies = Array.isArray(payload?.anomalies) ? payload.anomalies : [];
  const forecast = Array.isArray(payload?.overhead_forecast) ? payload.overhead_forecast : [];
  const recommendations = Array.isArray(payload?.allocation?.recommendations) ? payload.allocation.recommendations : [];
  const trends = Array.isArray(payload?.account_trends) ? payload.account_trends : [];

  return (
    <Card className="bg-slate-950/70 border-emerald-500/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Brain className="h-5 w-5 text-emerald-400" />
              Operations Intelligence Engine
            </CardTitle>
            <CardDescription className="text-xs">
              pandas/NumPy ledger tables, SciPy/statsmodels forecasts, scikit-learn anomaly checks, seaborn report chart, SciPy allocation optimizer.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px] uppercase">
              {freshness(result?.generated_at)}
            </Badge>
            <Button size="sm" onClick={runSnapshot} disabled={running} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-48 grid place-items-center text-xs font-black uppercase text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mb-2" />
            Loading operations brain
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">{error}</div>
        ) : !payload ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-center">
            <p className="text-sm font-bold text-slate-300">No Operations intelligence snapshot yet.</p>
            <Button onClick={runSnapshot} disabled={running} className="mt-4 bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
              Run Operations Brain
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Metric icon={ShieldCheck} label="Rows Scanned" value={String(payload.summary?.total_operations_rows || 0)} tone="emerald" />
              <Metric icon={BarChart3} label="Monthly Overhead" value={money(payload.summary?.current_month_overhead)} tone="amber" />
              <Metric icon={AlertTriangle} label="Anomaly Flags" value={String(payload.summary?.anomalies_flagged || 0)} tone={anomalies.length ? "rose" : "emerald"} />
              <Metric icon={PieChart} label="Optimized Pool" value={money(payload.allocation?.total)} tone="sky" />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">Account Balance Model</h3>
                  <Badge className="bg-slate-800 text-slate-300 text-[9px]">pandas pivot</Badge>
                </div>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={accountTotals} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="account" tick={{ fontSize: 9 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#64748b" tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
                      <Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155" }} formatter={(v) => money(v)} />
                      <Bar dataKey="balance" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">Overhead Forecast</h3>
                  <Badge className="bg-sky-500/10 text-sky-300 text-[9px]">statsmodels</Badge>
                </div>
                {forecast.length === 0 ? (
                  <p className="text-xs text-slate-500">No overhead forecast yet.</p>
                ) : forecast.map((row: any) => (
                  <div key={row.month} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/50 p-3">
                    <div>
                      <p className="text-sm font-black text-white">{row.month}</p>
                      <p className="text-[10px] uppercase text-slate-500">{row.model}</p>
                    </div>
                    <p className="font-mono text-lg font-black text-amber-300">{money(row.predicted_overhead)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <IntelList title="Anomaly Watch" icon={AlertTriangle} badge="scikit-learn" rows={anomalies} empty="No unusual movements flagged." render={(row: any) => (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="truncate text-slate-200">{row.title || row.kind || row.account}</span>
                    <span className="font-mono text-rose-300">{money(row.amount)}</span>
                  </div>
                  <p className="mt-1 text-[10px] uppercase text-slate-500">{row.reason} | {row.shop_id || "global"}</p>
                </>
              )} />

              <IntelList title="Allocation Moves" icon={PieChart} badge="SciPy SLSQP" rows={recommendations} empty="No rebalance pressure." render={(row: any) => (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="capitalize text-slate-200">{row.action} {row.account}</span>
                    <span className="font-mono text-sky-300">{money(row.amount)}</span>
                  </div>
                  <p className="mt-1 text-[10px] uppercase text-slate-500">{row.reason}</p>
                </>
              )} />

              <IntelList title="Account Trends" icon={LineChart} badge="SciPy stats" rows={trends} empty="Need more monthly data." render={(row: any) => (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="capitalize text-slate-200">{row.account}</span>
                    <span className={cn("font-mono", row.direction === "rising" ? "text-emerald-300" : "text-rose-300")}>{row.direction}</span>
                  </div>
                  <p className="mt-1 text-[10px] uppercase text-slate-500">Slope {money(row.monthly_slope)} / month | R2 {row.r2}</p>
                </>
              )} />
            </div>

            {payload.chart_png_base64 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">Report Chart Artifact</h3>
                  <Badge className="bg-violet-500/10 text-violet-300 text-[9px]">matplotlib + seaborn</Badge>
                </div>
                <img
                  src={`data:image/png;base64,${payload.chart_png_base64}`}
                  alt="Operations analytics chart"
                  className="w-full rounded border border-slate-800"
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "emerald" | "amber" | "rose" | "sky" }) {
  const tones = {
    emerald: "text-emerald-300 border-emerald-500/20 bg-emerald-950/20",
    amber: "text-amber-300 border-amber-500/20 bg-amber-950/20",
    rose: "text-rose-300 border-rose-500/20 bg-rose-950/20",
    sky: "text-sky-300 border-sky-500/20 bg-sky-950/20",
  };
  return (
    <div className={cn("rounded-lg border p-4", tones[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-2xl font-black italic text-white font-mono">{value}</p>
    </div>
  );
}

function IntelList({ title, icon: Icon, badge, rows, empty, render }: { title: string; icon: any; badge: string; rows: any[]; empty: string; render: (row: any) => ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </h3>
        <Badge className="bg-slate-800 text-slate-300 text-[9px]">{badge}</Badge>
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">{empty}</p>
        ) : rows.slice(0, 5).map((row, idx) => (
          <div key={idx} className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs">
            {render(row)}
          </div>
        ))}
      </div>
    </div>
  );
}
