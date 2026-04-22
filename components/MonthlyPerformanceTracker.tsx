'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingCart, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/components/ui';

interface PerformanceData {
  shopId: string;
  shopName: string;
  revenue: number;
  salesCount: number;
  expenses: number;
  expenseCount: number;
  profit: number;
  bestSeller?: [string, number];
  biggestOverhead?: [string, number];
  expenseBreakdown: { [key: string]: number };
}

interface Totals {
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  totalSales: number;
  shopCount: number;
}

export function MonthlyPerformanceTracker() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<string>('all');

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
      });

      const res = await fetch(`/api/reports/performance?${params}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch performance data');
      }

      const data = await res.json();
      setPerformance(data.performance || []);
      setTotals(data.totals || null);
    } catch (e: any) {
      setError(e.message || 'Error loading performance data');
      setPerformance([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const displayData = selectedShop === 'all' ? performance : performance.filter(p => p.shopId === selectedShop);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (part: number, total: number) => {
    if (total === 0) return '0%';
    return `${((part / total) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Monthly Performance Tracker
          </h2>
          <p className="text-slate-400 text-sm">Track revenue, expenses, and profitability per shop</p>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-2">Year</label>
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 block mb-2">Month</label>
          <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {performance.length > 1 && (
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-2">Filter Shop</label>
            <Select value={selectedShop} onValueChange={setSelectedShop}>
              <SelectTrigger className="bg-slate-900 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shops</SelectItem>
                {performance.map((p) => (
                  <SelectItem key={p.shopId} value={p.shopId}>{p.shopName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-end">
          <Button onClick={fetchPerformance} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5" />
              <p className="text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {totals && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-slate-400">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-400">{formatCurrency(totals.totalRevenue)}</div>
              <p className="text-xs text-slate-500 mt-1">{totals.totalSales} sales</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-slate-400">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-400">{formatCurrency(totals.totalExpenses)}</div>
              <p className="text-xs text-slate-500 mt-1">{((totals.totalExpenses / totals.totalRevenue) * 100).toFixed(1)}% of revenue</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-slate-400">Net Profit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-bold', totals.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {formatCurrency(totals.totalProfit)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {((totals.totalProfit / totals.totalRevenue) * 100).toFixed(1)}% margin
              </p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-slate-400">Avg per Shop</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400">
                {formatCurrency(totals.totalProfit / totals.shopCount)}
              </div>
              <p className="text-xs text-slate-500 mt-1">{totals.shopCount} shops</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-slate-400">Profit Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-bold', totals.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {((totals.totalProfit / totals.totalRevenue) * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {totals.totalProfit >= 0 ? <TrendingUp className="h-3 w-3 inline mr-1" /> : <TrendingDown className="h-3 w-3 inline mr-1" />}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Shop Performance */}
      {loading ? (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-400" />
            <p className="text-slate-400 mt-2 text-sm">Loading performance data...</p>
          </CardContent>
        </Card>
      ) : displayData.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-400">No data available for the selected period</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {displayData.map((shop) => (
            <Card key={shop.shopId} className="bg-slate-900/50 border-slate-800 overflow-hidden">
              <CardHeader className="bg-slate-800/30 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{shop.shopName}</CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-1">
                      {shop.salesCount} transactions
                    </CardDescription>
                  </div>
                  <div className={cn('px-3 py-1 rounded text-xs font-semibold', shop.profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                    {shop.profit >= 0 ? '+' : ''}{formatCurrency(shop.profit)}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Revenue Section */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                      Revenue
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">Total</span>
                        <span className="text-sm font-bold text-emerald-400">{formatCurrency(shop.revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">Per Sale</span>
                        <span className="text-sm text-slate-300">
                          {formatCurrency(shop.salesCount > 0 ? shop.revenue / shop.salesCount : 0)}
                        </span>
                      </div>
                    </div>

                    {shop.bestSeller && (
                      <div className="mt-4 p-3 bg-slate-800/50 rounded border border-slate-700">
                        <p className="text-xs font-semibold text-slate-300 mb-1">🏆 Best Seller</p>
                        <p className="text-xs text-slate-400 truncate">{shop.bestSeller[0]}</p>
                        <p className="text-xs font-bold text-emerald-400 mt-1">{formatCurrency(shop.bestSeller[1])}</p>
                      </div>
                    )}
                  </div>

                  {/* Expenses Section */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-400" />
                      Expenses
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">Total</span>
                        <span className="text-sm font-bold text-red-400">{formatCurrency(shop.expenses)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">% of Revenue</span>
                        <span className="text-sm text-slate-300">
                          {formatPercent(shop.expenses, shop.revenue)}
                        </span>
                      </div>
                    </div>

                    {shop.biggestOverhead && (
                      <div className="mt-4 p-3 bg-slate-800/50 rounded border border-slate-700">
                        <p className="text-xs font-semibold text-slate-300 mb-1">⚠️ Biggest Overhead</p>
                        <p className="text-xs text-slate-400 truncate">{shop.biggestOverhead[0]}</p>
                        <p className="text-xs font-bold text-red-400 mt-1">{formatCurrency(shop.biggestOverhead[1])}</p>
                      </div>
                    )}
                  </div>

                  {/* Profit & Breakdown */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-400" />
                      Profitability
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">Net Profit</span>
                        <span className={cn('text-sm font-bold', shop.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {formatCurrency(shop.profit)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-400">Margin</span>
                        <span className={cn('text-sm font-bold', shop.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {formatPercent(shop.profit, shop.revenue)}
                        </span>
                      </div>
                    </div>

                    {Object.keys(shop.expenseBreakdown).length > 0 && (
                      <div className="mt-4 p-3 bg-slate-800/50 rounded border border-slate-700">
                        <p className="text-xs font-semibold text-slate-300 mb-2">Expense Breakdown</p>
                        <div className="space-y-1">
                          {Object.entries(shop.expenseBreakdown).map(([category, amount]: [string, any]) => (
                            <div key={category} className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 truncate flex-1">{category}</span>
                              <span className="text-slate-300 font-semibold ml-2">{formatCurrency(amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
