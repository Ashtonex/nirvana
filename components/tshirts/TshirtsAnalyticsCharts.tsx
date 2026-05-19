"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { TshirtsAnalytics } from "@/lib/tshirts-analytics";

export function TshirtsAnalyticsCharts({ data }: { data: TshirtsAnalytics }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        Loading charts…
      </div>
    );
  }

  const chartData = data.dailyRevenue.map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  const lineChartData = data.lineBreakdown.map((l) => ({
    name: l.line === "plain" ? "Plain T-Shirt" : "Plain Golf T-Shirt",
    revenue: Math.round(l.revenue * 100) / 100,
    units: l.units,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="bg-slate-900/40 border-orange-500/20 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">
            Daily revenue (60 days)
          </CardTitle>
          <CardDescription>Plain vs Plain Golf T-Shirt</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #ea580c33",
                    borderRadius: 8,
                  }}
                  formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, ""]}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="plain"
                  name="Plain T-Shirt"
                  stackId="1"
                  stroke="#f97316"
                  fill="#f9731633"
                />
                <Area
                  type="monotone"
                  dataKey="golf"
                  name="Plain Golf T-Shirt"
                  stackId="1"
                  stroke="#38bdf8"
                  fill="#38bdf833"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/40 border-orange-500/20">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">
            Revenue by product line
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                />
                <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/40 border-orange-500/20">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">
            Top sellers (60 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 max-h-[220px] overflow-y-auto">
            {data.topProducts.length === 0 ? (
              <li className="text-slate-500 text-sm">No sales yet.</li>
            ) : (
              data.topProducts.map((p) => (
                <li
                  key={p.itemId}
                  className="flex justify-between items-center gap-2 py-2 border-b border-slate-800 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {p.itemName}
                    </p>
                    <p className="text-[10px] text-orange-400/80 uppercase font-bold">
                      {p.lineLabel}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono text-emerald-400">
                      ${p.revenue.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-500">{p.quantity} sold</p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
