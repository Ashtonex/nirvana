"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Zap, TrendingUp, AlertCircle, Loader2 } from "lucide-react";

export function InventoryIntelligenceCard() {
  const [velocityData, setVelocityData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/py/inventory/velocity");
        if (res.ok) setVelocityData(await res.json());
      } catch (err) {
        console.error("Velocity fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-yellow-500" />
      </div>
    );
  }

  const items = velocityData?.velocity_data || [];
  const topMovers = [...items]
    .sort((a, b) => b.daily_velocity - a.daily_velocity)
    .slice(0, 3);

  return (
    <Card className="bg-slate-900/60 border-slate-800 border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-yellow-500 flex items-center gap-2">
          <Zap className="h-4 w-4" /> Python ML Velocity Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topMovers.length > 0 ? topMovers.map((item: any, idx: number) => (
            <div key={idx} className="flex flex-col p-3 bg-slate-950/50 rounded-lg border border-slate-800">
              <span className="text-[10px] font-black uppercase text-slate-500 truncate">{item.item_name}</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-black text-white italic">{item.daily_velocity.toFixed(2)}/day</span>
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              </div>
              <span className="text-[8px] text-slate-600 mt-1 uppercase">Shop: {item.shop_id}</span>
            </div>
          )) : (
            <div className="col-span-3 text-center py-4 text-slate-600 text-[10px] uppercase font-black italic">
              Insufficient sales data for velocity modeling
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
