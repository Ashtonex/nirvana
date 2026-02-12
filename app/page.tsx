import { getDashboardData } from "./actions";
import { getBestSellers, getPerformanceTrends, getReorderSuggestions, getDeadStock, getSalesHistory, getStaffLeaderboard, getRevenueForecast } from "@/lib/analytics";
import { IntelligenceDashboard } from "@/components/IntelligenceDashboard";
import { SalesChart } from "@/components/SalesChart";
import { Leaderboard } from "@/components/Leaderboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import {
  TrendingUp,
  Users,
  DollarSign,
  Package,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  LayoutGrid
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
    forecast
  ] = await Promise.all([
    getBestSellers(),
    getPerformanceTrends(),
    getReorderSuggestions(),
    getDeadStock(),
    getSalesHistory(),
    getStaffLeaderboard(),
    getRevenueForecast()
  ]);

  const totalExpenses = Object.values(db.globalExpenses).reduce((a, b) => a + b, 0);
  const totalSales = db.sales.reduce((sum, s) => sum + s.totalWithTax, 0);
  const activeItems = db.inventory.reduce((sum, i) => sum + i.quantity, 0);

  // Calculate shop performance/distribution ratios
  const shopTotals = db.shops.map(shop => {
    const expenses = Object.values(shop.expenses).reduce((a, b) => a + b, 0);
    return { ...shop, totalExpenses: expenses };
  });

  const grandTotalShopExpenses = shopTotals.reduce((sum, s) => sum + s.totalExpenses, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nirvana Command Center</h1>
          <p className="text-slate-400">Consolidated overview across all three locations.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-500 uppercase font-semibold">Consolidated Status</span>
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <TrendingUp className="h-4 w-4" /> Operational
            </span>
          </div>
        </div>
      </div>

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            <div className="text-2xl font-bold">${totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-slate-400 mt-1">Rent, Salaries, Utilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-violet-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${db.ledger.filter(l => l.category === 'Inventory Acquisition').reduce((sum, l) => sum + l.amount, 0).toLocaleString()}</div>
            <p className="text-xs text-slate-400 mt-1">Total Assets (At Cost)</p>
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
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Rationalized Distribution Index</CardTitle>
            <CardDescription>
              Allocation percentage based on operational overheads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 mt-4">
              {shopTotals.map((shop) => {
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

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest sales and transfers across Nirvana.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-20 text-slate-500">
              No recent activity recorded.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
