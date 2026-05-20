export const dynamic = 'force-dynamic';

import { getDashboardData } from "./actions";
import { getBestSellers, getPerformanceTrends, getReorderSuggestions, getDeadStock, getSalesHistory, getStaffLeaderboard, getRevenueForecast, getPremiumStockValue, getBreakEvenStockValue, getLeanStockValue, getSalesVsOverheadsData, getRevenueExpenseProfitTrajectoryData } from "@/lib/analytics";
import { getTshirtsAnalytics } from "@/lib/tshirts-analytics";
import { IntelligenceDashboard } from "@/components/IntelligenceDashboard";
import { SalesChart } from "@/components/SalesChart";
import { BreakEvenChart } from "@/components/BreakEvenChart";
import { RevenueExpenseProfitTrajectoryChart } from "@/components/RevenueExpenseProfitTrajectoryChart";
import { Leaderboard } from "@/components/Leaderboard";
import { RealtimeDashboard } from "@/components/RealtimeDashboard";
import { NirvanaIntelligenceCards } from "@/components/NirvanaIntelligenceCards";
import { CommandCenterPulse } from "@/components/CommandCenterPulse";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import {
  TrendingUp,
  Users,
  DollarSign,
  Package,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  LayoutGrid,
  ShoppingCart,
  ArrowRightLeft
} from "lucide-react";

export default async function Home() {
  const db = await getDashboardData();
  // Parallel data fetching for max speed
  const [
    bestSellers,
    trends,
    reorders,
    deadStock,
    salesHistory,
    leaderboard,
    forecast,
    premiumStockValue,
    breakEvenStockValue,
    leanStockValue,
    breakEvenData,
    revExpData,
    tshirtsAnalytics
  ] = await Promise.all([
    getBestSellers(),
    getPerformanceTrends(),
    getReorderSuggestions(),
    getDeadStock(),
    getSalesHistory(),
    getStaffLeaderboard(),
    getRevenueForecast(),
    getPremiumStockValue(),
    getBreakEvenStockValue(),
    getLeanStockValue(),
    getSalesVsOverheadsData(),
    getRevenueExpenseProfitTrajectoryData(),
    getTshirtsAnalytics(60)
  ]);

  const totalExpenses = Object.values(db?.globalExpenses || {}).reduce((a: number, b: any) => a + Number(b), 0);
  const totalSales = (db?.sales || []).reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);
  const rawAllocatedItems = (db?.inventory || []).reduce(
    (sum: number, item: any) =>
      sum + (item.allocations || []).reduce((allocSum: number, allocation: any) => allocSum + Math.max(0, Number(allocation.quantity || 0)), 0),
    0
  );
  const rawTeeAllocatedItems = (db?.inventory || []).reduce(
    (sum: number, item: any) =>
      sum + (item.allocations || [])
        .filter((allocation: any) => allocation.shopId === "tshirts")
        .reduce((allocSum: number, allocation: any) => allocSum + Math.max(0, Number(allocation.quantity || 0)), 0),
    0
  );
  const teeActiveStock =
    tshirtsAnalytics.summary.stockSource === "reconciled_baseline"
      ? tshirtsAnalytics.summary.reconciledStock
      : tshirtsAnalytics.stockByLine.reduce((sum, line) => sum + Number(line.units || 0), 0);
  const activeItems = rawAllocatedItems - rawTeeAllocatedItems + teeActiveStock;
  const teeRunwayDays =
    tshirtsAnalytics.summary.unitsLast60Days > 0
      ? Math.round(teeActiveStock / (tshirtsAnalytics.summary.unitsLast60Days / 60))
      : 0;

  // Calculate shop performance/distribution ratios
  const shopTotals = (db?.shops || []).map((shop: any) => {
    const expenses = Object.values(shop.expenses || {}).reduce((a: number, b: any) => a + Number(b), 0);
    return { ...shop, totalExpenses: expenses };
  });

  const grandTotalShopExpenses = shopTotals.reduce((sum: number, s: any) => sum + Number(s.totalExpenses || 0), 0);
  const totalMonthlyOverheads = totalExpenses + grandTotalShopExpenses;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic">Nirvana Command Center</h1>
          <p className="text-slate-400 text-sm">Consolidated intelligence across all three locations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/40 border border-emerald-800/40 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black uppercase text-emerald-400">All Systems Operational</span>
          </div>
        </div>
      </div>

      {/* ── Predictive Intelligence Cards (AI Analytics) ── */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">⚡ Predictive Intelligence Engine</div>
        <NirvanaIntelligenceCards />
      </div>

      {/* ── Static Intelligence Dashboard ── */}
      <IntelligenceDashboard
        bestSellers={bestSellers}
        trends={trends}
        reorderSuggestions={reorders}
        deadStock={deadStock}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <SalesChart data={salesHistory} forecast={forecast} />
        <Leaderboard staff={leaderboard} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSales.toLocaleString()}</div>
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-emerald-400 inline-flex items-center">
                +15.5% <ArrowUpRight className="h-3 w-3 ml-1" />
              </span>{" "}
              vouchers included
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Overheads</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalMonthlyOverheads.toLocaleString()}</div>
            <p className="text-xs text-slate-400 mt-1">Consolidated (Global + Shops)</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Asset Value</CardTitle>
            <Package className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Break Even</p>
                <div className="text-lg font-bold text-slate-200">${breakEvenStockValue.toLocaleString()}</div>
                <p className="text-[9px] text-slate-500">1.35x Landed</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 text-emerald-400">Lean</p>
                <div className="text-lg font-bold text-emerald-500">${leanStockValue.toLocaleString()}</div>
                <p className="text-[9px] text-slate-500">1.25x Landed</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 text-violet-400">Premium</p>
                <div className="text-xl font-black text-violet-400">${premiumStockValue.toLocaleString()}</div>
                <p className="text-[9px] text-slate-500">1.65x Target</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Stock</CardTitle>
            <LayoutGrid className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeItems.toLocaleString()}</div>
            <p className="text-xs text-slate-400 mt-1">Pieces across all shops</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <BreakEvenChart datasets={breakEvenData} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Rationalized Distribution Index</CardTitle>
            <CardDescription>
              Allocation percentage based on operational overheads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 mt-4">
              {shopTotals.map((shop: any) => {
                const percentage = grandTotalShopExpenses > 0
                  ? (shop.totalExpenses / grandTotalShopExpenses) * 100
                  : 0;
                return (
                  <div key={shop.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-200">{shop.name}</span>
                      <span className="text-slate-400">{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {grandTotalShopExpenses === 0 && (
                <div className="text-center py-10 text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  Set expenses in the 'Inventory Master' to see distribution rankings.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* DEDICATED NIRVANA TEES CARD */}
        <Card className="col-span-3 bg-gradient-to-br from-slate-900/60 to-orange-950/20 border-orange-500/20 shadow-[0_15px_40px_-10px_rgba(249,115,22,0.15)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-[50px] rounded-full group-hover:bg-orange-500/10 transition-colors" />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Ecosystem Hub
                </span>
                <CardTitle className="text-xl font-black uppercase italic text-white tracking-tight mt-1">Nirvana Tees</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Compounding runway, velocity & order discount tracking.
                </CardDescription>
              </div>
              <a 
                href="/tshirts"
                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all hover:-translate-y-0.5 inline-block"
              >
                Launch Panel
              </a>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Compounding & Reinvestment Milestone Progress */}
            <div className="space-y-2 p-4 bg-orange-950/10 border border-orange-500/10 rounded-2xl">
              <div className="flex justify-between text-xs font-black uppercase tracking-wider">
                <span className="text-slate-400">Milestone Reinvestment Target</span>
                <span className="text-orange-400">2,400 pcs</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] text-slate-500">Starting Cap: $1,421.00</span>
                <span className="text-xl font-bold font-mono text-white">
                  ${Math.round(tshirtsAnalytics.summary.revenueAllTime).toLocaleString()} / $5,616
                </span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-orange-600 to-amber-500 transition-all duration-1000"
                  style={{ width: `${Math.min(100, (tshirtsAnalytics.summary.revenueAllTime / 5616) * 100)}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Reinvest 100% of cycle profit to compound pieces.
              </p>
            </div>

            {/* Runout Telemetry */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/40 border border-white/5 p-3.5 rounded-2xl">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Runway Indicator</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black font-mono text-white">
                    {Math.max(0, teeRunwayDays)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">DAYS</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">Estimated stockout date</p>
              </div>

              <div className="bg-slate-900/40 border border-white/5 p-3.5 rounded-2xl">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Stock Allocation</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black font-mono text-white">
                    {teeActiveStock.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">PCS</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">
                  {tshirtsAnalytics.summary.stockSource === "reconciled_baseline" ? "Reconciled from 600 starting shirts" : "Shirts currently in shop"}
                </p>
              </div>
            </div>

            {/* micro grid summary */}
            <div className="space-y-2 pt-2 border-t border-slate-800/60">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">All-Time Tees Revenue</span>
                <span className="font-mono font-black text-emerald-400">
                  ${tshirtsAnalytics.summary.revenueAllTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">60-Day Sales Volume</span>
                <span className="font-mono font-black text-white">
                  {tshirtsAnalytics.summary.unitsLast60Days} units
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Revenue Sense Check</span>
                <span className="font-mono font-black text-sky-400">
                  {tshirtsAnalytics.summary.expectedUnitsAtStandardPrice.toFixed(1)} units @ $3.50
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Live System Pulse (Control Center Feed) ── */}
      <div className="border-t border-slate-800 pt-8">
        <CommandCenterPulse />
      </div>

      {/* ── Today's Real-time Activity Feed ── */}
      <RealtimeDashboard />
    </div>
  );
}
