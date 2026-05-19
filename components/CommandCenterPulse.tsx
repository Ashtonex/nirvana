"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import {
  TrendingUp, TrendingDown, AlertTriangle, Shield, Wifi, WifiOff, Eye,
  DollarSign, ArrowUpRight, ArrowDownRight, Zap, Activity, Clock,
  ShoppingCart, Package, Users, Info, CheckCircle2, XCircle, BarChart3,
  RefreshCw, Brain
} from "lucide-react";
import { cn } from "@/lib/utils";

type ShopSnapshot = {
  id: string;
  name: string;
  sales30d: number;
  expenses30d: number;
  expectedDrawerCash: number;
  activeStaff: number;
  lastSaleAt: string | null;
  transactions7d: number;
  lowStockCount: number;
  zeroStockCount: number;
  deadStockCount: number;
  status: "online" | "watch" | "offline";
  issues: string[];
};

type Risk = {
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
};

type RecentTx = {
  id: string;
  source: string;
  shopId: string | null;
  type: string | null;
  category: string | null;
  amount: number;
  when: string | null;
  description: string;
};

type PulseData = {
  generatedAt: string;
  system: {
    activeStaffCount: number;
    unreadMessagesCount: number;
    pendingStockRequestsCount: number;
  };
  money: {
    sales30d: number;
    expenses30d: number;
    profit30d: number;
    profitMargin: number;
    operationsActualBalance: number;
    overheadContributed30d: number;
    overheadPaid30d: number;
  };
  shops: ShopSnapshot[];
  risks: Risk[];
  forecasts: string[];
  recentTransactions: RecentTx[];
  brain: {
    topShop: string;
    insight: string;
    revenueTrend: string;
    expenseTrend: string;
  };
};

function AnimatedNumber({ value, prefix = "", decimals = 2 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const end = value;
    if (Math.abs(end - start) < 0.01) { setDisplay(end); return; }
    const duration = 800;
    const startTime = performance.now();
    const animate = (t: number) => {
      const p = Math.min((t - startTime) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (end - start) * e);
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span>{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusConfig = {
  online: { label: "Online", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500", icon: Wifi },
  watch: { label: "Watch", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-500", icon: Eye },
  offline: { label: "Offline", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20", dot: "bg-rose-600", icon: WifiOff },
};

const riskConfig = {
  critical: { color: "text-rose-400", bg: "bg-rose-950/40 border-rose-800/40", icon: XCircle },
  warning: { color: "text-amber-400", bg: "bg-amber-950/40 border-amber-800/40", icon: AlertTriangle },
  info: { color: "text-sky-400", bg: "bg-sky-950/40 border-sky-800/40", icon: Info },
};

export function CommandCenterPulse() {
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/hand/control-center", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json);
          setLastRefresh(new Date());
        }
      }
    } catch (e) {
      console.error("Command center pulse failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-xl bg-slate-900/60 border border-slate-800" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { money, shops, risks, forecasts, recentTransactions, brain, system } = data;
  const profit = money.profit30d;
  const profitPositive = profit >= 0;

  return (
    <div className="space-y-6">
      {/* Header row with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400 animate-pulse" />
            Live System Pulse
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {lastRefresh ? `Updated ${timeAgo(lastRefresh.toISOString())}` : "Fetching..."} · Auto-refreshes every 60s
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 border border-slate-800 rounded-md hover:border-emerald-500/40 hover:text-emerald-400 transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 30d Sales */}
        <Card className="bg-gradient-to-br from-emerald-950/50 to-slate-950 border-emerald-800/30">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500/70">30d Revenue</span>
              <TrendingUp className="h-3 w-3 text-emerald-500" />
            </div>
            <div className="text-2xl font-black italic font-mono text-emerald-300">
              <AnimatedNumber value={money.sales30d} prefix="$" />
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">All locations combined</p>
          </CardContent>
        </Card>

        {/* 30d Expenses */}
        <Card className="bg-gradient-to-br from-rose-950/50 to-slate-950 border-rose-800/30">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-rose-500/70">30d Expenses</span>
              <TrendingDown className="h-3 w-3 text-rose-500" />
            </div>
            <div className="text-2xl font-black italic font-mono text-rose-300">
              <AnimatedNumber value={money.expenses30d} prefix="$" />
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">Operational costs</p>
          </CardContent>
        </Card>

        {/* Profit */}
        <Card className={cn(
          "bg-gradient-to-br to-slate-950 border",
          profitPositive ? "from-violet-950/50 border-violet-800/30" : "from-rose-950/50 border-rose-800/30"
        )}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className={cn("text-[9px] font-black uppercase tracking-widest", profitPositive ? "text-violet-500/70" : "text-rose-500/70")}>30d Profit</span>
              {profitPositive ? <ArrowUpRight className="h-3 w-3 text-violet-400" /> : <ArrowDownRight className="h-3 w-3 text-rose-400" />}
            </div>
            <div className={cn("text-2xl font-black italic font-mono", profitPositive ? "text-violet-300" : "text-rose-300")}>
              {profitPositive ? "" : "-"}<AnimatedNumber value={Math.abs(profit)} prefix="$" />
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">{money.profitMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>

        {/* Ops Vault */}
        <Card className="bg-gradient-to-br from-sky-950/50 to-slate-950 border-sky-800/30">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-sky-500/70">Ops Vault</span>
              <DollarSign className="h-3 w-3 text-sky-400" />
            </div>
            <div className="text-2xl font-black italic font-mono text-sky-300">
              <AnimatedNumber value={money.operationsActualBalance} prefix="$" />
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">Actual balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Shop Status Cards */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Zap className="h-3 w-3" /> Shop Health Matrix
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {shops.map((shop) => {
            const cfg = statusConfig[shop.status];
            const StatusIcon = cfg.icon;
            const profit = shop.sales30d - shop.expenses30d;
            return (
              <Card key={shop.id} className={cn("border transition-all hover:scale-[1.01]", cfg.bg)}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-black uppercase text-white">{shop.name}</CardTitle>
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-2 h-2 rounded-full", cfg.dot, shop.status === "online" && "animate-pulse")} />
                      <span className={cn("text-[9px] font-black uppercase", cfg.color)}>{cfg.label}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">30d Sales</p>
                      <p className="text-sm font-black font-mono text-emerald-400">${shop.sales30d.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">30d Profit</p>
                      <p className={cn("text-sm font-black font-mono", profit >= 0 ? "text-violet-400" : "text-rose-400")}>
                        {profit >= 0 ? "+" : ""}${profit.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">Staff Live</p>
                      <p className="text-sm font-black text-sky-400 flex items-center gap-1">
                        <Users className="h-3 w-3" /> {shop.activeStaff}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">Last Sale</p>
                      <p className="text-xs font-bold text-slate-400">{timeAgo(shop.lastSaleAt)}</p>
                    </div>
                  </div>
                  {/* Stock flags */}
                  <div className="flex gap-2 flex-wrap">
                    {shop.lowStockCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-950/50 border border-amber-800/40 rounded-full text-[9px] font-black text-amber-400">
                        <Package className="h-2.5 w-2.5" /> {shop.lowStockCount} Low
                      </span>
                    )}
                    {shop.zeroStockCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-950/50 border border-rose-800/40 rounded-full text-[9px] font-black text-rose-400">
                        <XCircle className="h-2.5 w-2.5" /> {shop.zeroStockCount} Zero
                      </span>
                    )}
                    {shop.lowStockCount === 0 && shop.zeroStockCount === 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-950/50 border border-emerald-800/40 rounded-full text-[9px] font-black text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Stock OK
                      </span>
                    )}
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-full text-[9px] font-black text-slate-500">
                      <BarChart3 className="h-2.5 w-2.5" /> {shop.transactions7d} txns/7d
                    </span>
                  </div>
                  {shop.issues.length > 0 && (
                    <p className="text-[9px] text-amber-400/80 border-t border-amber-800/20 pt-2 italic">
                      ⚠ {shop.issues[0]}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bottom row: Risks + Forecast + Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk Alerts */}
        <Card className="bg-gradient-to-br from-slate-900/60 to-slate-950 border-slate-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
              <Shield className="h-4 w-4 text-rose-400" /> Risk Alerts
            </CardTitle>
            <CardDescription className="text-[10px]">{risks.length} active signal{risks.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {risks.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-bold">All systems nominal</span>
              </div>
            ) : (
              risks.map((risk, i) => {
                const cfg = riskConfig[risk.severity];
                const RiskIcon = cfg.icon;
                return (
                  <div key={i} className={cn("p-2.5 rounded-lg border text-[10px]", cfg.bg)}>
                    <div className={cn("font-black uppercase flex items-center gap-1 mb-0.5", cfg.color)}>
                      <RiskIcon className="h-3 w-3" /> {risk.title}
                    </div>
                    <p className="text-slate-400">{risk.message}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Forecast & Brain Insight */}
        <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-400" /> Oracle Forecast
            </CardTitle>
            <CardDescription className="text-[10px]">Strategic system intelligence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Brain insight */}
            <div className="p-3 rounded-lg bg-violet-950/30 border border-violet-800/20">
              <p className="text-[10px] font-black uppercase text-violet-400/70 mb-1 flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" /> Top Shop: {brain.topShop}
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">{brain.insight}</p>
            </div>
            {/* Forecasts */}
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {forecasts.map((f, i) => (
                <div key={i} className="flex gap-2 text-[10px] text-slate-400 py-1 border-b border-slate-800/50 last:border-0">
                  <span className="text-violet-500 mt-0.5 shrink-0">›</span>
                  {f}
                </div>
              ))}
            </div>
            {/* Trend indicators */}
            <div className="flex gap-2 pt-1">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border",
                brain.revenueTrend === "stable_to_up"
                  ? "bg-emerald-950/50 border-emerald-800/30 text-emerald-400"
                  : "bg-rose-950/50 border-rose-800/30 text-rose-400"
              )}>
                Revenue: {brain.revenueTrend === "stable_to_up" ? "Stable ↑" : "Under Pressure"}
              </span>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border",
                brain.expenseTrend === "contained"
                  ? "bg-emerald-950/50 border-emerald-800/30 text-emerald-400"
                  : "bg-rose-950/50 border-rose-800/30 text-rose-400"
              )}>
                Expenses: {brain.expenseTrend === "contained" ? "Contained" : "Danger"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions Feed */}
        <Card className="bg-gradient-to-br from-slate-900/60 to-slate-950 border-slate-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
              <Clock className="h-4 w-4 text-sky-400" /> Transaction Feed
            </CardTitle>
            <CardDescription className="text-[10px]">Latest ledger activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-slate-600 italic py-4 text-center">No recent transactions</p>
            ) : (
              recentTransactions.slice(0, 10).map((tx) => {
                const isIncome = (tx.type || "").toLowerCase() !== "expense";
                return (
                  <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-slate-300 truncate">{tx.description}</p>
                      <p className="text-[9px] text-slate-600">
                        {tx.shopId || "Global"} · {timeAgo(tx.when)}
                      </p>
                    </div>
                    <span className={cn("text-xs font-black font-mono ml-2", isIncome ? "text-emerald-400" : "text-rose-400")}>
                      {isIncome ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Status Footer */}
      <div className="flex flex-wrap gap-3 text-[9px] font-black uppercase text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3 text-sky-400" />
          <span className="text-sky-300">{system.activeStaffCount}</span> staff live
        </span>
        <span className="text-slate-700">·</span>
        <span className="flex items-center gap-1">
          <ShoppingCart className="h-3 w-3 text-amber-400" />
          <span className="text-amber-300">{system.pendingStockRequestsCount}</span> stock requests
        </span>
        <span className="text-slate-700">·</span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          Supabase connected
        </span>
      </div>
    </div>
  );
}
