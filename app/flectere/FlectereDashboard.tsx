"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Package, Shirt,
  AlertTriangle, Brain, Target, BarChart3, Users, Zap,
  ArrowUpRight, ArrowDownRight, Store, ShoppingCart, Clock,
} from "lucide-react";
import type { SalesMetric, ReorderSuggestion, DeadStockItem, DailySalesMetric, Forecast } from "@/lib/analytics";

interface FlectereDashboardProps {
  allTimeRevenue: number;
  totalInventoryValue: number;
  employeeCount: number;
  salesCount: number;
  salesHistory: DailySalesMetric[];
  bestSellers: SalesMetric[];
  forecast: Forecast;
  trends: { currentPeriodRevenue: number; previousPeriodRevenue: number; growth: number };
  overheads: Record<string, any[]>;
  deadStock: DeadStockItem[];
  reorderSuggestions: ReorderSuggestion[];
  premiumValue: number;
  breakEvenValue: number;
  leanValue: number;
  financials: any;
}

export function FlectereDashboard(props: FlectereDashboardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const {
    allTimeRevenue, totalInventoryValue, employeeCount, salesCount,
    salesHistory, bestSellers, forecast, trends, overheads,
    deadStock, reorderSuggestions, premiumValue, breakEvenValue, leanValue,
  } = props;

  const avgDailyRevenue = salesHistory.length > 0
    ? salesHistory.reduce((s, d) => s + d.revenue, 0) / salesHistory.length
    : 0;

  const projectedMonthly = avgDailyRevenue * 30;

  const bestSellersData = useMemo(() => {
    return bestSellers.slice(0, 8).map((item, i) => ({
      rank: i + 1,
      name: item.itemName.length > 28 ? item.itemName.slice(0, 28) + "..." : item.itemName,
      qty: item.totalQuantity,
      revenue: item.totalRevenue,
      margin: item.grossMargin.toFixed(1),
    }));
  }, [bestSellers]);

  if (!mounted) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-slate-900/40 border-slate-800">
            <CardContent className="h-[200px] flex items-center justify-center">
              <p className="text-slate-500 text-sm">Loading intelligence...</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Executive Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          icon={<DollarSign className="h-4 w-4 text-emerald-400" />}
          label="All-Time Revenue"
          value={`$${allTimeRevenue.toLocaleString()}`}
          sub={`${salesCount} transactions`}
        />
        <KpiCard
          icon={<Package className="h-4 w-4 text-sky-400" />}
          label="Inventory Value"
          value={`$${totalInventoryValue.toLocaleString()}`}
          sub={`Lean $${leanValue.toLocaleString()}`}
        />
        <KpiCard
          icon={<BarChart3 className="h-4 w-4 text-orange-400" />}
          label="Avg Daily Revenue (60d)"
          value={`$${Math.round(avgDailyRevenue).toLocaleString()}`}
          sub={`Proj. monthly $${Math.round(projectedMonthly).toLocaleString()}`}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-rose-400" />}
          label="Growth (30d vs prev)"
          value={`${trends.growth >= 0 ? "+" : ""}${trends.growth.toFixed(1)}%`}
          sub={`$${trends.currentPeriodRevenue.toLocaleString()} vs $${trends.previousPeriodRevenue.toLocaleString()}`}
        />
        <KpiCard
          icon={<Users className="h-4 w-4 text-violet-400" />}
          label="Workforce"
          value={String(employeeCount)}
          sub="employees across shops"
        />
      </div>

      {/* Revenue Trend + Forecast */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-slate-900/40 border-emerald-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                  <TrendingUp className="h-4 w-4 text-emerald-400" /> Revenue Trend (60 days)
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
                  Daily revenue with moving average
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {salesHistory.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">No sales data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={salesHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-sky-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Brain className="h-4 w-4 text-sky-400" /> Revenue Forecast
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              Linear regression · {forecast.confidence >= 0.7 ? "High" : forecast.confidence >= 0.4 ? "Medium" : "Low"} confidence
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Projected Next 30d</p>
                <p className="text-2xl font-black font-mono text-sky-400">${Math.round(forecast.projectedNext30).toLocaleString()}</p>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-black uppercase ${forecast.trend === "up" ? "bg-emerald-500/10 text-emerald-400" : forecast.trend === "down" ? "bg-rose-500/10 text-rose-400" : "bg-slate-500/10 text-slate-400"}`}>
                {forecast.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : forecast.trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
                {forecast.trend}
              </div>
            </div>
            <div className="text-xs text-slate-500 space-y-1">
              <p>Slope: ${forecast.slope.toFixed(2)}/day</p>
              <p>Confidence: {(forecast.confidence * 100).toFixed(0)}%</p>
            </div>
            {forecast.nextMonthPoints.length > 0 && (
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={forecast.nextMonthPoints.filter((_, i) => i % 5 === 0)}>
                    <XAxis dataKey="day" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} hide />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                    <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Best Sellers + Performance Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900/40 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <ShoppingCart className="h-4 w-4 text-amber-400" /> Best Sellers (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestSellersData.length === 0 ? (
              <p className="text-sm text-slate-500">No sales data for this period.</p>
            ) : (
              <div className="space-y-2">
                {bestSellersData.map((item) => (
                  <div key={item.rank} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] font-black text-slate-600 w-4 text-right">{item.rank}</span>
                      <span className="text-xs text-slate-300 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-mono text-slate-400">{item.qty} units</span>
                      <span className="text-xs font-mono text-emerald-400 w-20 text-right">${item.revenue.toLocaleString()}</span>
                      <span className={`text-[10px] font-black w-10 text-right ${Number(item.margin) >= 40 ? "text-emerald-400" : Number(item.margin) >= 20 ? "text-amber-400" : "text-rose-400"}`}>
                        {item.margin}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-violet-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Target className="h-4 w-4 text-violet-400" /> Stock Value Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <div>
                  <p className="text-[10px] uppercase font-black text-emerald-400 tracking-widest">Premium Value</p>
                  <p className="text-xs text-slate-500">Retail at 65% markup</p>
                </div>
                <p className="text-xl font-black font-mono text-emerald-400">${Math.round(premiumValue).toLocaleString()}</p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-sky-500/5 border border-sky-500/10">
                <div>
                  <p className="text-[10px] uppercase font-black text-sky-400 tracking-widest">Break-Even Value</p>
                  <p className="text-xs text-slate-500">Retail at 35% markup</p>
                </div>
                <p className="text-xl font-black font-mono text-sky-400">${Math.round(breakEvenValue).toLocaleString()}</p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <div>
                  <p className="text-[10px] uppercase font-black text-orange-400 tracking-widest">Lean Value</p>
                  <p className="text-xs text-slate-500">Retail at 25% markup</p>
                </div>
                <p className="text-xl font-black font-mono text-orange-400">${Math.round(leanValue).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue vs Overheads */}
      {overheads?.global?.length > 0 && (
        <Card className="bg-slate-900/40 border-orange-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <BarChart3 className="h-4 w-4 text-orange-400" /> Month-to-Date: Sales vs Overheads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={overheads.global}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                  formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]}
                />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }} />
                <Bar dataKey="sales" name="Cumulative Sales" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="overhead" name="Cumulative Overhead" fill="#f97316" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Deep Analysis Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Dead Stock */}
        <Card className="bg-slate-900/40 border-rose-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <AlertTriangle className="h-4 w-4 text-rose-400" /> Dead Stock ({deadStock.length} items)
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              No sale in 60+ days · Capital tied up
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deadStock.length === 0 ? (
              <p className="text-sm text-slate-500">No dead stock detected.</p>
            ) : (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {deadStock.slice(0, 10).map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/40">
                    <span className="text-xs text-slate-300 truncate min-w-0 flex-1">{item.itemName}</span>
                    <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
                      <span className="text-slate-500">{item.quantity} units</span>
                      <span className="text-rose-400 w-16 text-right">${Math.round(item.value).toLocaleString()}</span>
                      <span className="text-slate-600 w-12 text-right">{item.daysInStock}d</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reorder Suggestions */}
        <Card className="bg-slate-900/40 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Clock className="h-4 w-4 text-amber-400" /> Reorder Suggestions
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              Items running low · based on 30d velocity
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reorderSuggestions.length === 0 ? (
              <p className="text-sm text-slate-500">All stock levels healthy.</p>
            ) : (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {reorderSuggestions.slice(0, 10).map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/40">
                    <span className="text-xs text-slate-300 truncate min-w-0 flex-1">{item.itemName}</span>
                    <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
                      <span className="text-slate-500">{item.currentStock} left</span>
                      <span className="text-amber-400">{item.daysToZero}d</span>
                      <span className="text-emerald-400 font-black">+{item.suggestedReorder}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-Shop Overhead Breakdown */}
      {overheads && (
        <Card className="bg-slate-900/40 border-indigo-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Store className="h-4 w-4 text-indigo-400" /> Per-Shop Sales vs Overhead
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {["kipasa", "dubdub", "tradecenter"].map((shopKey) => {
                const shopData = overheads[shopKey] || [];
                const latest = shopData.filter((d: any) => d.sales !== null).slice(-1)[0];
                if (!latest) return null;
                return (
                  <div key={shopKey} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2">
                      {shopKey === "kipasa" ? "Kipasa" : shopKey === "dubdub" ? "Dub Dub" : "Trade Center"}
                    </p>
                    <p className="text-lg font-black font-mono text-emerald-400">${Math.round(latest.sales || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">Sales / ${Math.round(latest.overhead || 0).toLocaleString()} overhead</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All-time Average Unit Revenue */}
      <Card className="bg-slate-900/40 border-emerald-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            <Zap className="h-4 w-4 text-emerald-400" /> Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricTile label="Total Inventory Value" value={`$${totalInventoryValue.toLocaleString()}`} />
            <MetricTile label="Premium Markup (65%)" value={`$${Math.round(premiumValue).toLocaleString()}`} />
            <MetricTile label="Break-Even (35%)" value={`$${Math.round(breakEvenValue).toLocaleString()}`} />
            <MetricTile label="Lean (25%)" value={`$${Math.round(leanValue).toLocaleString()}`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-slate-900/40 border-slate-700/50">
      <CardHeader className="pb-1">
        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-black font-mono text-white">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 font-bold uppercase mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
      <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{label}</p>
      <p className="text-lg font-black font-mono text-white mt-0.5">{value}</p>
    </div>
  );
}
