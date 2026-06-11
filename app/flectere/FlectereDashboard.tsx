"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  AlertTriangle, Brain, Target, BarChart3, Users, Zap,
  ArrowUpRight, ArrowDownRight, Store, ShoppingCart, Clock,
  RefreshCw, Plus, Trash2, ExternalLink, Settings2, Check, X,
  Sparkles, Radio,
} from "lucide-react";
import type { SalesMetric, ReorderSuggestion, DeadStockItem, DailySalesMetric, Forecast } from "@/lib/analytics";
import type { ApiConnectorConfig, ConnectorMetric, AiInsight } from "@/lib/flectere/types";
import { generateAiInsights } from "@/lib/flectere/ai-analysis";
import {
  loadConnectors, saveConnectors, getDefaultConnectors,
} from "@/lib/flectere/api-connectors";

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

const SHOP_OPTIONS = [
  { id: "kipasa", label: "Kipasa" },
  { id: "dubdub", label: "Dub Dub" },
  { id: "tradecenter", label: "Trade Center" },
  { id: "tshirts", label: "Nirvana Tees" },
];

export function FlectereDashboard(props: FlectereDashboardProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedShops, setSelectedShops] = useState<string[]>(["kipasa", "dubdub", "tradecenter"]);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [connectors, setConnectors] = useState<ApiConnectorConfig[]>([]);
  const [connectorMetrics, setConnectorMetrics] = useState<ConnectorMetric[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [showConnectorConfig, setShowConnectorConfig] = useState(false);
  const [connectorError, setConnectorError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setConnectors(loadConnectors()); }, []);

  const {
    allTimeRevenue, totalInventoryValue, employeeCount, salesCount,
    salesHistory, bestSellers, forecast, trends, overheads,
    deadStock, reorderSuggestions, premiumValue, breakEvenValue, leanValue,
  } = props;

  const avgDailyRevenue = salesHistory.length > 0
    ? salesHistory.reduce((s, d) => s + d.revenue, 0) / salesHistory.length
    : 0;

  const projectedMonthly = avgDailyRevenue * 30;
  const deadStockValue = deadStock.reduce((s, d) => s + d.value, 0);

  const bestSellersData = useMemo(() => {
    return bestSellers.slice(0, 8).map((item, i) => ({
      rank: i + 1,
      name: item.itemName.length > 28 ? item.itemName.slice(0, 28) + "..." : item.itemName,
      qty: item.totalQuantity,
      revenue: item.totalRevenue,
      margin: Number(item.grossMargin.toFixed(1)),
    }));
  }, [bestSellers]);

  const runAiAnalysis = useCallback(async () => {
    setInsightsLoading(true);
    setInsights([]);
    try {
      const result = await generateAiInsights({
        allTimeRevenue,
        salesCount,
        employeeCount,
        totalInventoryValue,
        avgDailyRevenue,
        growthPct: trends.growth,
        currentRevenue: trends.currentPeriodRevenue,
        previousRevenue: trends.previousPeriodRevenue,
        deadStockCount: deadStock.length,
        deadStockValue,
        reorderCount: reorderSuggestions.length,
        premiumValue,
        breakEvenValue,
        leanValue,
        bestSellers: bestSellersData,
        forecastTrend: forecast.trend,
        forecastProjected: forecast.projectedNext30,
        forecastConfidence: forecast.confidence,
        shopCount: SHOP_OPTIONS.length,
      });
      setInsights(result);
    } catch {
      setInsights([]);
    } finally {
      setInsightsLoading(false);
    }
  }, [allTimeRevenue, salesCount, employeeCount, totalInventoryValue, avgDailyRevenue, trends, deadStock.length, deadStockValue, reorderSuggestions.length, premiumValue, breakEvenValue, leanValue, bestSellersData, forecast]);

  const refreshConnectors = useCallback(async () => {
    const enabled = connectors.filter((c) => c.enabled && c.baseUrl);
    if (enabled.length === 0) {
      setConnectorError("No enabled connectors with a base URL. Configure one below.");
      return;
    }
    setConnectorsLoading(true);
    setConnectorError(null);
    try {
      const res = await fetch("/api/flectere/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectors }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setConnectorMetrics(data.metrics || []);
      if (data.connectors) {
        setConnectors(data.connectors);
        saveConnectors(data.connectors);
      }
    } catch (err: any) {
      setConnectorError(err.message || "Failed to fetch connectors");
    } finally {
      setConnectorsLoading(false);
    }
  }, [connectors]);

  const addDefaultConnectors = useCallback(() => {
    const defaults = getDefaultConnectors();
    setConnectors((prev) => [...prev, ...defaults]);
    saveConnectors([...connectors, ...defaults]);
  }, [connectors]);

  const updateConnector = useCallback((id: string, patch: Partial<ApiConnectorConfig>) => {
    setConnectors((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      saveConnectors(next);
      return next;
    });
  }, []);

  const removeConnector = useCallback((id: string) => {
    setConnectors((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConnectors(next);
      return next;
    });
  }, []);

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
    <div className="space-y-6">
      {/* FILTERS BAR */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Shops:</span>
            {SHOP_OPTIONS.map((shop) => (
              <button
                key={shop.id}
                onClick={() =>
                  setSelectedShops((prev) =>
                    prev.includes(shop.id)
                      ? prev.filter((s) => s !== shop.id)
                      : [...prev, shop.id]
                  )
                }
                className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                  selectedShops.includes(shop.id)
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : "bg-slate-800 text-slate-500 border border-slate-700/50 hover:text-slate-300"
                }`}
              >
                {shop.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* EXECUTIVE SUMMARY */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={<DollarSign className="h-4 w-4 text-emerald-400" />} label="All-Time Revenue" value={`$${allTimeRevenue.toLocaleString()}`} sub={`${salesCount} transactions`} />
        <KpiCard icon={<Package className="h-4 w-4 text-sky-400" />} label="Inventory Value" value={`$${totalInventoryValue.toLocaleString()}`} sub={`Lean $${leanValue.toLocaleString()}`} />
        <KpiCard icon={<BarChart3 className="h-4 w-4 text-orange-400" />} label="Avg Daily Revenue (60d)" value={`$${Math.round(avgDailyRevenue).toLocaleString()}`} sub={`Proj. monthly $${Math.round(projectedMonthly).toLocaleString()}`} />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-rose-400" />} label="Growth (30d vs prev)" value={`${trends.growth >= 0 ? "+" : ""}${trends.growth.toFixed(1)}%`} sub={`$${trends.currentPeriodRevenue.toLocaleString()} vs $${trends.previousPeriodRevenue.toLocaleString()}`} />
        <KpiCard icon={<Users className="h-4 w-4 text-violet-400" />} label="Workforce" value={String(employeeCount)} sub="employees across shops" />
      </div>

      {/* AI INSIGHTS */}
      <Card className={`border ${insights.length > 0 ? "border-violet-500/30" : "border-slate-700/50"} bg-slate-900/40`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                <Sparkles className={`h-4 w-4 ${insights.length > 0 ? "text-violet-400" : "text-slate-500"}`} /> AI Deep Analysis
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
                {insights.length > 0 ? `${insights.length} insights generated` : "Plain-English business intelligence powered by OpenAI"}
              </CardDescription>
            </div>
            <button
              onClick={runAiAnalysis}
              disabled={insightsLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-black uppercase tracking-wider hover:bg-violet-600/30 transition-all disabled:opacity-40"
            >
              {insightsLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
              {insightsLoading ? "Analyzing..." : insights.length > 0 ? "Refresh Analysis" : "Run Analysis"}
            </button>
          </div>
        </CardHeader>
        {insights.length > 0 && (
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className={`p-3 rounded-lg border ${
                    ins.severity === "critical"
                      ? "bg-rose-500/5 border-rose-500/20"
                      : ins.severity === "warning"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : ins.severity === "positive"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-slate-800/30 border-slate-700/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      ins.severity === "critical" ? "text-rose-400" : ins.severity === "warning" ? "text-amber-400" : ins.severity === "positive" ? "text-emerald-400" : "text-slate-400"
                    }`}>
                      {ins.category} · {ins.severity}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">{ins.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{ins.body}</p>
                  {ins.metric && (
                    <div className="mt-2 flex items-center gap-2 text-xs font-mono">
                      <span className="text-slate-500">{ins.metric.label}:</span>
                      <span className="text-orange-400 font-black">{ins.metric.value}</span>
                    </div>
                  )}
                  {ins.action && (
                    <p className="mt-1.5 text-[10px] text-slate-500 italic">
                      → {ins.action}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* REVENUE TREND + FORECAST */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-slate-900/40 border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Revenue Trend (60 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesHistory.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">No sales data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={salesHistory}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} dot={false} />
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

      {/* BEST SELLERS + STOCK VALUES */}
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
                      <span className={`text-[10px] font-black w-10 text-right ${item.margin >= 40 ? "text-emerald-400" : item.margin >= 20 ? "text-amber-400" : "text-rose-400"}`}>
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

      {/* SALES VS OVERHEADS */}
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
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }} />
                <Bar dataKey="sales" name="Cumulative Sales" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="overhead" name="Cumulative Overhead" fill="#f97316" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* DEEP ANALYSIS GRID */}
      <div className="grid gap-6 lg:grid-cols-2">
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

      {/* PER-SHOP OVERHEAD */}
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
                const latest = (overheads[shopKey] || []).filter((d: any) => d.sales !== null).slice(-1)[0];
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

      {/* EXTERNAL API CONNECTORS */}
      <Card className={`border ${connectorMetrics.length > 0 ? "border-cyan-500/30" : "border-slate-700/50"} bg-slate-900/40`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                <Radio className={`h-4 w-4 ${connectorMetrics.length > 0 ? "text-cyan-400" : "text-slate-500"}`} />
                External API Connectors
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
                Pull data from Shopify, PayPal, or any REST API
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConnectorConfig(!showConnectorConfig)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-wider hover:bg-slate-700 transition-all"
              >
                <Settings2 className="h-3 w-3" /> Configure
              </button>
              <button
                onClick={refreshConnectors}
                disabled={connectorsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-black uppercase tracking-wider hover:bg-cyan-600/30 transition-all disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${connectorsLoading ? "animate-spin" : ""}`} />
                {connectorsLoading ? "Fetching..." : "Refresh All"}
              </button>
            </div>
          </div>
        </CardHeader>

        {showConnectorConfig && (
          <CardContent className="border-b border-slate-800 pb-4 mb-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Connector Configuration</p>
                <button
                  onClick={addDefaultConnectors}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-wider hover:text-slate-200"
                >
                  <Plus className="h-3 w-3" /> Add Template
                </button>
              </div>
              {connectors.length === 0 ? (
                <p className="text-xs text-slate-500">No connectors configured. Click "Add Template" to start.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {connectors.map((c) => (
                    <div key={c.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateConnector(c.id, { enabled: !c.enabled })}
                            className={`p-1 rounded ${c.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-500"}`}
                          >
                            {c.enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          </button>
                          <input
                            className="bg-transparent border-b border-slate-700 text-sm text-white font-mono focus:border-cyan-500 outline-none"
                            value={c.name}
                            onChange={(e) => updateConnector(c.id, { name: e.target.value })}
                            placeholder="Connector name"
                          />
                        </div>
                        <button onClick={() => removeConnector(c.id)} className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500">Base URL</span>
                          <input className="w-full bg-slate-900 rounded px-2 py-1 text-white font-mono text-[11px] border border-slate-700" value={c.baseUrl} onChange={(e) => updateConnector(c.id, { baseUrl: e.target.value })} placeholder="https://..." />
                        </div>
                        <div>
                          <span className="text-slate-500">Endpoint</span>
                          <input className="w-full bg-slate-900 rounded px-2 py-1 text-white font-mono text-[11px] border border-slate-700" value={c.endpoint} onChange={(e) => updateConnector(c.id, { endpoint: e.target.value })} placeholder="/api/data" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500">Auth Type</span>
                          <select className="w-full bg-slate-900 rounded px-2 py-1 text-white text-[11px] border border-slate-700" value={c.authType} onChange={(e) => updateConnector(c.id, { authType: e.target.value as any })}>
                            <option value="none">None</option>
                            <option value="bearer">Bearer Token</option>
                            <option value="api-key">API Key Header</option>
                            <option value="basic">Basic Auth</option>
                          </select>
                        </div>
                        <div>
                          <span className="text-slate-500">API Key / Token</span>
                          <input className="w-full bg-slate-900 rounded px-2 py-1 text-white font-mono text-[11px] border border-slate-700" type="password" value={c.apiKey || ""} onChange={(e) => updateConnector(c.id, { apiKey: e.target.value })} placeholder="sk-..." />
                        </div>
                      </div>
                      {c.lastError && (
                        <p className="text-[10px] text-rose-400 mt-1">Last error: {c.lastError}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        )}

        {/* Connector metric display */}
        <CardContent>
          {connectorMetrics.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {connectorMetrics.map((m, i) => (
                <div key={`${m.connectorId}-${i}`} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ExternalLink className="h-3 w-3 text-cyan-400" />
                    <span className="text-[9px] uppercase font-black text-cyan-400 tracking-widest truncate">{m.connectorName}</span>
                  </div>
                  <p className="text-lg font-black font-mono text-white">
                    {m.unit === "$" && typeof m.value === "number" ? `$${m.value.toLocaleString()}` : m.value}
                    {m.unit && m.unit !== "$" ? <span className="text-[10px] text-slate-500 ml-0.5">{m.unit}</span> : null}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider truncate">{m.label}</p>
                  {m.change && (
                    <span className={`text-[10px] font-black ${m.changeDirection === "up" ? "text-emerald-400" : m.changeDirection === "down" ? "text-rose-400" : "text-slate-500"}`}>
                      {m.change}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <ExternalLink className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {connectorError || "Configure connectors above and click Refresh to pull external data."}
              </p>
              <p className="text-[10px] text-slate-600 mt-1">Supports Shopify, PayPal, or any REST API with bearer/api-key/basic auth</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PERFORMANCE SUMMARY */}
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
