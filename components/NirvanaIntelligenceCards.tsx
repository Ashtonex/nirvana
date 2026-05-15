"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Brain, TrendingUp, Zap, Info, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
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

  const { next7DaysSales, dailySales } = useMemo(() => {
    const daily: { day: string; predicted: number }[] = [];
    let total = 0;
    if (salesForecast?.forecasts) {
      salesForecast.forecasts.forEach((shop: any) => {
        shop.forecast.forEach((d: any, idx: number) => {
          if (!daily[idx]) daily[idx] = { day: `D+${idx + 1}`, predicted: 0 };
          daily[idx].predicted += d.predicted_sales || 0;
        });
      });
      total = daily.reduce((sum, d) => sum + d.predicted, 0);
    }
    return { next7DaysSales: total, dailySales: daily };
  }, [salesForecast]);

  const targets = financeOptimization?.target_amounts || {};
  const allocationData = [{
    name: 'Alloc',
    ops: targets.blackbox || 0,
    safety: targets.reserves || 0,
    growth: targets.stockvel || 0
  }];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Sales Prediction Card */}
      <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/30 overflow-hidden relative group flex flex-col">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <Brain className="h-16 w-16 text-violet-400" />
        </div>
        <CardHeader className="pb-2 z-10">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-violet-400/70 flex items-center gap-1">
            <Zap className="h-3 w-3" /> Sales Forecast
          </CardDescription>
          <CardTitle className="text-sm font-black uppercase italic text-white flex justify-between items-center">
            7-Day Prediction
            <span className="text-xs text-violet-300 font-mono font-black italic">$<AnimatedNumber value={next7DaysSales} /></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col z-10 p-0 overflow-hidden">
          <div className="flex-1 min-h-[80px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySales} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#c4b5fd', fontWeight: 900 }}
                  labelStyle={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Sales']}
                />
                <Area type="monotone" dataKey="predicted" stroke="#a78bfa" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Capital Optimization Card */}
      <Card className="bg-gradient-to-br from-emerald-950/40 to-slate-950 border-emerald-500/30 overflow-hidden relative group flex flex-col">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp className="h-16 w-16 text-emerald-400" />
        </div>
        <CardHeader className="pb-2 z-10">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Capital Optimization
          </CardDescription>
          <CardTitle className="text-sm font-black uppercase italic text-white flex justify-between items-center">
            Target Allocation
            <span className="text-xs text-emerald-300 font-mono font-black italic">$<AnimatedNumber value={(targets.blackbox || 0) + (targets.reserves || 0) + (targets.stockvel || 0)} /></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-end z-10">
          <div className="h-6 w-full mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={allocationData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" hide />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ fontWeight: 900 }}
                  formatter={(value: number, name: string) => {
                    const label = name === 'ops' ? 'Operations' : name === 'safety' ? 'Safety' : 'Growth';
                    return [`$${value.toFixed(2)}`, label];
                  }}
                />
                <Bar dataKey="ops" stackId="a" fill="#f8fafc" radius={[4, 0, 0, 4]} />
                <Bar dataKey="safety" stackId="a" fill="#10b981" />
                <Bar dataKey="growth" stackId="a" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="font-black text-white flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-100"></div> Ops</span>
            <span className="font-black text-emerald-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Safety</span>
            <span className="font-black text-sky-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-sky-400"></div> Growth</span>
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
