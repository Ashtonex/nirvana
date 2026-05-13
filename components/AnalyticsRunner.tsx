"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Activity, AlertTriangle, CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { cn } from "@/components/ui";

type RunResult = {
  kind: string;
  ok: boolean;
  summary?: string;
  error?: string;
  warning?: string | null;
};

const labels: Record<string, string> = {
  all: "Full Snapshot",
  demand_forecast: "Forecast",
  expense_anomaly: "Expenses",
  inventory_velocity: "Inventory",
  capital_allocation: "Capital",
};

export function AnalyticsRunner() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [runningKind, setRunningKind] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const runAnalytics = (kind: string) => {
    setRunningKind(kind);
    setLastError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/analytics/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ kind }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Analytics run failed");
        }

        setResults(Array.isArray(data?.results) ? data.results : []);
        router.refresh();
      } catch (error: any) {
        setLastError(error?.message || String(error));
      } finally {
        setRunningKind(null);
      }
    });
  };

  const busy = isPending || Boolean(runningKind);

  return (
    <Card className="border-violet-500/20 bg-slate-950/70">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase italic">
            <Activity className="h-5 w-5 text-violet-400" />
            Run Analytics
          </CardTitle>
          <CardDescription>Launch the Python brains from Nirvana and save fresh snapshots.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "demand_forecast", "expense_anomaly", "inventory_velocity", "capital_allocation"].map((kind) => (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant={kind === "all" ? "default" : "outline"}
              onClick={() => runAnalytics(kind)}
              disabled={busy}
              className={cn(
                "text-[10px] font-black uppercase tracking-wider",
                kind === "all" ? "bg-violet-600 hover:bg-violet-500" : "border-slate-700 text-slate-300"
              )}
            >
              {runningKind === kind ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <PlayCircle className="mr-2 h-3 w-3" />}
              {labels[kind]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {lastError}
          </div>
        )}

        {results.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-3">
            {results.map((result) => (
              <div key={result.kind} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {labels[result.kind] || result.kind}
                  </p>
                  <Badge className={cn(
                    "text-[9px] uppercase",
                    result.ok ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                  )}>
                    {result.ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                    {result.ok ? "Works" : "Needs Fix"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-slate-300">
                  {result.ok ? result.summary : result.error}
                </p>
                {result.warning && (
                  <p className="mt-2 text-[10px] text-amber-300 line-clamp-2">{result.warning}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Run a snapshot to see which analytics jobs work and what needs attention.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
