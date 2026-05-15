"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Brain, TrendingUp, Zap, Info, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  
  useEffect(() => {
    const start = 0;
    const end = value;
    const duration = 1000;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);
  
  return <span>{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{suffix}</span>;
}

export function NirvanaIntelligenceCards() {
  const [salesForecast, setSalesForecast] = useState<any>(null);
  const [financeOptimization, setFinanceOptimization] = useState<any>(null);
  const [expenseAnomalies, setExpenseAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/analytics/latest");
        if (res.ok) {
          const json = await res.json();
          setSalesForecast(json.results?.demand_forecast?.payload || null);
          setFinanceOptimization(json.results?.capital_allocation?.payload || null);
          setExpenseAnomalies(json.results?.expense_anomaly?.payload?.anomalies || []);
        }
      } catch (err) {
        console.error("Intelligence fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const next7DaysSales = salesForecast?.forecasts?.reduce((acc: number, f: any) => {
    const sum = f.forecast.reduce((s: number, d: any) => s + d.predicted_sales, 0);
    return acc + sum;
  }, 0) || 0;

  const targets = financeOptimization?.metrics?.targets || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Sales Prediction Card */}
      <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/30 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <Brain className="h-16 w-16 text-violet-400" />
        </div>
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-violet-400/70 flex items-center gap-1">
            <Zap className="h-3 w-3" /> Sales Forecast
          </CardDescription>
          <CardTitle className="text-sm font-black uppercase italic text-white">7-Day Prediction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black italic text-violet-300 font-mono">
            $<AnimatedNumber value={next7DaysSales} />
          </div>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-500">
            <Info className="h-3 w-3" />
            <span>Based on 90-day seasonal trend analysis</span>
          </div>
        </CardContent>
      </Card>

      {/* Capital Optimization Card */}
      <Card className="bg-gradient-to-br from-emerald-950/40 to-slate-950 border-emerald-500/30 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp className="h-16 w-16 text-emerald-400" />
        </div>
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Capital Optimization
          </CardDescription>
          <CardTitle className="text-sm font-black uppercase italic text-white">Target Allocation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">Operations (3m)</span>
            <span className="text-xs font-black text-white">$<AnimatedNumber value={targets.operational_buffer || 0} /></span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">Safety Reserve</span>
            <span className="text-xs font-black text-emerald-400">$<AnimatedNumber value={targets.safety_reserve || 0} /></span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">Growth Pool</span>
            <span className="text-xs font-black text-sky-400">$<AnimatedNumber value={targets.growth_pool || 0} /></span>
          </div>
        </CardContent>
      </Card>

      {/* Risk Analysis Card */}
      <Card className="bg-gradient-to-br from-amber-950/40 to-slate-950 border-amber-500/30 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <AlertTriangle className={cn("h-16 w-16", expenseAnomalies.length > 0 ? "text-amber-400" : "text-emerald-400")} />
        </div>
        <CardHeader className="pb-2">
          <CardDescription className={cn("text-[10px] font-black uppercase tracking-widest flex items-center gap-1", expenseAnomalies.length > 0 ? "text-amber-400/70" : "text-emerald-400/70")}>
            <Brain className="h-3 w-3" /> Risk Analysis
          </CardDescription>
          <CardTitle className="text-sm font-black uppercase italic text-white">System Integrity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-black italic uppercase", expenseAnomalies.length > 0 ? "text-amber-400" : "text-emerald-400")}>
            {expenseAnomalies.length > 0 ? `${expenseAnomalies.length} Flagged` : "Nominal"}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            {expenseAnomalies.length > 0
              ? `${expenseAnomalies.length} spending anomalies detected.`
              : "No spending anomalies detected in the last snapshot."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
