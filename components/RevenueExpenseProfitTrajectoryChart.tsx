"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { BarChart3, AlertCircle } from "lucide-react";

interface RevenueExpenseProfitTrajectoryChartProps {
  // keys: global + shop ids
  datasets: Record<string, any[]>;
}

export function RevenueExpenseProfitTrajectoryChart({ datasets }: RevenueExpenseProfitTrajectoryChartProps) {
  const availableShops = useMemo(() => {
    const keys = Object.keys(datasets || {});
    const preferredOrder = ["kipasa", "dubdub", "tradecenter", "global"];
    return keys.sort((a, b) => {
      const ai = preferredOrder.indexOf(a);
      const bi = preferredOrder.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.localeCompare(b);
    });
  }, [datasets]);

  const defaultTab = useMemo(() => {
    if (!availableShops.length) return "global";
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("nirvana.revexp.activeShop") : null;
      if (stored && availableShops.includes(stored)) return stored;
    } catch { /* ignore */ }
    const firstNonGlobal = availableShops.find((k) => k !== "global");
    return firstNonGlobal || availableShops[0] || "global";
  }, [availableShops]);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const data = datasets?.[activeTab] || [];

  useEffect(() => {
    if (!availableShops.includes(activeTab)) setActiveTab(defaultTab);
  }, [activeTab, availableShops, defaultTab]);

  const onTabChange = (next: string) => {
    setActiveTab(next);
    try {
      window.localStorage.setItem("nirvana.revexp.activeShop", next);
    } catch { /* ignore */ }
  };

  const getShopDisplayName = (key: string) => {
    const nameMap: Record<string, string> = {
      global: "Global",
      kipasa: "Kipasa",
      dubdub: "Dub Dub",
      tradecenter: "TC",
    };
    return nameMap[key] || key;
  };

  return (
    <Card className="col-span-full border-emerald-500/20 bg-slate-900/50 backdrop-blur-md">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 pb-6">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-black uppercase italic">
            <BarChart3 className="text-emerald-400" /> Revenue vs Expenses vs Profit (Daily)
          </CardTitle>
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Month-to-date growth. Expenses include fixed overhead projection plus actual logged expenses by day.
          </CardDescription>
        </div>
        <Tabs value={activeTab} onValueChange={onTabChange} className="bg-slate-950/50 p-1 rounded-xl border border-slate-800">
          <TabsList className="bg-transparent border-0 h-9">
            {availableShops.map((shop) => {
              const colors: Record<string, string> = {
                global: "data-[state=active]:bg-emerald-700",
                kipasa: "data-[state=active]:bg-emerald-600",
                dubdub: "data-[state=active]:bg-sky-600",
                tradecenter: "data-[state=active]:bg-amber-600",
              };
              return (
                <TabsTrigger
                  key={shop}
                  value={shop}
                  className={`${colors[shop] || "data-[state=active]:bg-emerald-600"} data-[state=active]:text-white uppercase text-[10px] font-black italic tracking-widest px-3`}
                >
                  {getShopDisplayName(shop)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        {!data || data.length === 0 ? (
          <div className="w-full h-[380px] mt-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50">
            <AlertCircle className="h-12 w-12 text-slate-500 mb-3" />
            <p className="text-slate-400 font-medium">No data available for {getShopDisplayName(activeTab)}</p>
          </div>
        ) : (
          <div className="w-full mt-2" style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "12px",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "bold", marginBottom: "4px" }}
                  formatter={(val: any) => [`$${(Number(val || 0)).toLocaleString()}`]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}
                />
                <Line name="Cumulative Expenses" type="monotone" dataKey="expenses" stroke="#f97316" strokeWidth={3} dot={false} />
                <Line name="Cumulative Revenue" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={4} dot={{ r: 3 }} connectNulls={false} />
                <Line name="Cumulative Profit" type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

