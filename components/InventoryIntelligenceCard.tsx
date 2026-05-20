"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Zap, TrendingUp, AlertCircle, Loader2, RefreshCcw } from "lucide-react";

type PriorityInventoryItem = {
  item_id?: string;
  item_name?: string;
  status?: string;
  stock?: number;
  sold_units?: number;
  daily_velocity?: number;
  days_to_zero?: number | null;
  capital_tied?: number;
  reorder_point?: number;
  suggested_order_qty?: number;
  confidence?: number;
};

export function InventoryIntelligenceCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<PriorityInventoryItem[]>([]);
  const [modelComparison, setModelComparison] = useState<any>(null);
  const [source, setSource] = useState<"snapshot" | "live" | "none">("none");
  const [freshness, setFreshness] = useState("No snapshot yet");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const snapshotRes = await fetch("/api/analytics/latest?kind=inventory_velocity");
        if (snapshotRes.ok) {
          const snapshotJson = await snapshotRes.json();
          const result = snapshotJson?.results?.inventory_velocity;
          const priorityItems = result?.payload?.priority_items || [];
          if (priorityItems.length > 0) {
            setItems(priorityItems);
            setModelComparison(result?.payload?.model_comparison || null);
            setSource("snapshot");
            setFreshness(result?.generated_at ? new Date(result.generated_at).toLocaleString() : "Snapshot available");
            return;
          }
        }

        const liveRes = await fetch("/api/py/inventory/velocity");
        if (liveRes.ok) {
          const liveJson = await liveRes.json();
          const liveItems = liveJson?.priority_items || liveJson?.velocity_data || liveJson?.items || [];
          setItems(liveItems);
          setModelComparison(liveJson?.model_comparison || null);
          setSource(liveItems.length > 0 ? "live" : "none");
        }
      } catch (err) {
        console.error("Velocity fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-yellow-500" />
      </div>
    );
  }

  const topMovers = [...items]
    .sort((a, b) => Number(b.daily_velocity || 0) - Number(a.daily_velocity || 0))
    .slice(0, 4);

  return (
    <Card className="bg-slate-900/60 border-slate-800 border-dashed">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xs font-black uppercase tracking-widest text-yellow-500 flex items-center gap-2">
              <Zap className="h-4 w-4" /> Python ML Velocity Insights
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {source === "snapshot" ? `Saved snapshot: ${freshness}` : source === "live" ? "Live Python fallback" : "Waiting for analytics snapshot"}
            </CardDescription>
          </div>
          {source === "snapshot" && (
            <div className="flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400">
              <RefreshCcw className="h-3 w-3" /> Cached
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {topMovers.length > 0 ? topMovers.map((item: any, idx: number) => (
            <div key={idx} className="flex flex-col p-3 bg-slate-950/50 rounded-lg border border-slate-800">
              <span className="text-[10px] font-black uppercase text-slate-500 truncate">{item.item_name || item.name || item.item_id}</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-black text-white italic">{Number(item.daily_velocity || 0).toFixed(2)}/day</span>
                {item.status === "dead_stock" ? <AlertCircle className="h-3 w-3 text-rose-500" /> : <TrendingUp className="h-3 w-3 text-emerald-500" />}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[8px] uppercase text-slate-600">
                <span>{item.status || "velocity"}</span>
                <span>{item.days_to_zero == null ? "runway n/a" : `${item.days_to_zero}d left`}</span>
              </div>
              {item.suggested_order_qty != null && (
                <span className="mt-1 text-[8px] font-black uppercase tracking-widest text-amber-400">
                  Order {item.suggested_order_qty} @ ROP {item.reorder_point || 0}
                </span>
              )}
            </div>
          )) : (
            <div className="md:col-span-4 text-center py-4 text-slate-600 text-[10px] uppercase font-black italic">
              No saved priority inventory snapshot yet. Run analytics to populate reorder intelligence.
            </div>
          )}
        </div>
        {modelComparison?.models?.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Historical model comparison</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                Winner: {modelComparison.winner || "forming"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {modelComparison.models.slice(0, 3).map((model: any) => (
                <div key={model.model} className="rounded-md bg-slate-900/70 p-2">
                  <div className="truncate text-[9px] font-black uppercase text-slate-400">{model.model}</div>
                  <div className="mt-1 text-sm font-black text-white">{Number(model.mae_units || 0).toFixed(2)} MAE</div>
                  <div className="text-[8px] uppercase text-slate-600">{model.checks || 0} checks</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
