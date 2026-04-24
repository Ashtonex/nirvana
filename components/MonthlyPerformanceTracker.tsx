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
  trueOperatingProfit: number;
  bestSeller?: [string, number];
  biggestOverhead?: [string, number];
  expenseBreakdown: { [key: string]: number };
  groupedExpenses?: { [key: string]: number };
}

interface Totals {
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  totalTrueOperatingProfit: number;
  totalOverheads: number;
  totalStockOrders: number;
  totalTransfers: number;
  totalPersonalUse: number;
  totalSales: number;
  shopCount: number;
  profitMargin: number;
  trueOperatingMargin: number;
}

export function MonthlyPerformanceTracker() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<string>('all');
  const [showDetailedExpenses, setShowDetailedExpenses] = useState<{ [key: string]: boolean }>({});

  const toggleDetailedExpenses = (shopId: string) => {
    setShowDetailedExpenses(prev => ({
      ...prev,
      [shopId]: !prev[shopId]
    }));
  };

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
              <SelectValue placeholder="Select year" />
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
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 block mb-2">Filter Shop</label>
          <Select value={selectedShop} onValueChange={setSelectedShop}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue placeholder="All Shops" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shops</SelectItem>
              {performance.map((p) => (
                <SelectItem key={p.shopId} value={p.shopId}>{p.shopName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
        <div className="space-y-4">
          {/* Primary numbers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Revenue</p>
              <p className="mt-3 text-3xl font-black text-emerald-400">{formatCurrency(totals.totalRevenue)}</p>
              <p className="mt-1 text-xs text-slate-500">{totals.totalSales} sales across {totals.shopCount} shops</p>
            </div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operating Expenses</p>
              <p className="mt-3 text-3xl font-black text-rose-400">{formatCurrency(totals.totalExpenses)}</p>
              <p className="mt-1 text-xs text-slate-500">Overheads + Stock Orders + Other</p>
            </div>
            <div className={cn('rounded-2xl border p-5', totals.totalProfit >= 0 ? 'border-sky-500/20 bg-sky-500/5' : 'border-rose-500/30 bg-rose-500/10')}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Profit</p>
              <p className={cn('mt-3 text-3xl font-black', totals.totalProfit >= 0 ? 'text-sky-300' : 'text-rose-400')}>{formatCurrency(totals.totalProfit)}</p>
              <p className="mt-1 text-xs text-slate-500">{totals.profitMargin?.toFixed(1) ?? '0.0'}% margin</p>
            </div>
          </div>

          {/* True operating profit — excludes Transfers & Personal Use from expenses */}
          <div className={cn('rounded-2xl border p-5 flex items-center justify-between', (totals.totalTrueOperatingProfit ?? 0) >= 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5')}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">True Operating Profit <span className="text-slate-600">(Revenue − Overheads only)</span></p>
              <p className={cn('mt-2 text-3xl font-black', (totals.totalTrueOperatingProfit ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-400')}>
                {formatCurrency(totals.totalTrueOperatingProfit ?? 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Operating Margin</p>
              <p className={cn('text-2xl font-black', (totals.trueOperatingMargin ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {(totals.trueOperatingMargin ?? 0).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Expense breakdown strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400/70">Overheads</p>
              <p className="mt-1 text-lg font-black text-rose-300">{formatCurrency(totals.totalOverheads ?? 0)}</p>
              <p className="text-[9px] text-slate-600">Rent · Salary · Utilities</p>
            </div>
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-violet-400/70">Stock Orders</p>
              <p className="mt-1 text-lg font-black text-violet-300">{formatCurrency(totals.totalStockOrders ?? 0)}</p>
              <p className="text-[9px] text-slate-600">Cost of goods purchased</p>
            </div>
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-sky-400/70">Transfers</p>
              <p className="mt-1 text-lg font-black text-sky-300">{formatCurrency(totals.totalTransfers ?? 0)}</p>
              <p className="text-[9px] text-slate-600">Not counted vs profit</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">Personal Use</p>
              <p className="mt-1 text-lg font-black text-amber-300">{formatCurrency(totals.totalPersonalUse ?? 0)}</p>
              <p className="text-[9px] text-slate-600">Not counted vs profit</p>
            </div>
          </div>
        </div>
      )}

      {/* Compressed Summary Cards */}
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
        <>
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayData.map((shop) => (
              <Card 
                key={shop.shopId} 
                className={cn(
                  "bg-slate-900/50 border-slate-800 cursor-pointer transition-all hover:border-slate-600 hover:bg-slate-800/50",
                  selectedShop === shop.shopId && "border-rose-500/50 bg-rose-500/5"
                )}
                onClick={() => setSelectedShop(shop.shopId)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{shop.shopName}</CardTitle>
                    <div className={cn('px-2 py-1 rounded text-xs font-semibold', shop.profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                      {shop.profit >= 0 ? '+' : ''}{formatCurrency(shop.profit)}
                    </div>
                  </div>
                  <CardDescription className="text-xs text-slate-400">
                    {shop.salesCount} transactions
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Revenue</p>
                      <p className="text-sm font-bold text-emerald-400">{formatCurrency(shop.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Expenses</p>
                      <p className="text-sm font-bold text-rose-400">{formatCurrency(shop.expenses)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Margin</p>
                      <p className={cn('text-sm font-bold', shop.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {formatPercent(shop.profit, shop.revenue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Avg/Sale</p>
                      <p className="text-sm font-bold text-slate-300">
                        {formatCurrency(shop.salesCount > 0 ? shop.revenue / shop.salesCount : 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detailed Drill-down for Single Shop */}
          {selectedShop !== 'all' && displayData.length === 1 && (
            <div className="mt-8 space-y-6">
              <Card className="bg-slate-900/50 border-slate-800 overflow-hidden">
                <CardHeader className="bg-slate-800/30">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{displayData[0].shopName} - Financial Statement</CardTitle>
                      <CardDescription className="text-sm text-slate-400 mt-1">
                        Detailed breakdown for {months[month - 1]} {year}
                      </CardDescription>
                    </div>
                    <button 
                      onClick={() => setSelectedShop('all')}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Back to All Shops
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    {/* Income Statement */}
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
                      <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                        Income Statement
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between py-2 border-b border-slate-800">
                          <span className="text-sm text-slate-400">Gross Revenue</span>
                          <span className="text-sm font-bold text-emerald-400">{formatCurrency(displayData[0].revenue)}</span>
                        </div>
                        
                        {displayData[0].groupedExpenses && (
                          <>
                            <div className="py-2 border-b border-slate-800">
                              <p className="text-xs font-bold text-slate-500 mb-2">Operating Expenses</p>
                              {Object.entries(displayData[0].groupedExpenses)
                                .filter(([cat]) => cat !== 'Transfers' && cat !== 'Personal Use')
                                .map(([category, amount]: [string, any]) => (
                                <div key={category} className="flex justify-between py-1">
                                  <span className="text-xs text-slate-400">{category}</span>
                                  <span className="text-xs font-bold text-rose-400">{formatCurrency(amount)}</span>
                                </div>
                              ))}
                            </div>
                            
                            <div className="flex justify-between py-2 border-b border-slate-800">
                              <span className="text-sm font-bold text-slate-300">Total Operating Expenses</span>
                              <span className="text-sm font-bold text-rose-400">
                                {formatCurrency(
                                  Object.entries(displayData[0].groupedExpenses || {})
                                    .filter(([cat]) => cat !== 'Transfers' && cat !== 'Personal Use')
                                    .reduce((sum, [, amount]) => sum + (amount as number), 0)
                                )}
                              </span>
                            </div>
                            
                            <div className="flex justify-between py-2 border-b border-slate-800">
                              <span className="text-sm font-bold text-slate-300">Operating Profit</span>
                              <span className={cn('text-sm font-bold', displayData[0].trueOperatingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                {formatCurrency(displayData[0].trueOperatingProfit || 0)}
                              </span>
                            </div>
                            
                            {displayData[0].groupedExpenses['Transfers'] > 0 && (
                              <div className="flex justify-between py-2 border-b border-slate-800">
                                <span className="text-xs text-slate-400">Transfers (non-operating)</span>
                                <span className="text-xs font-bold text-sky-400">{formatCurrency(displayData[0].groupedExpenses['Transfers'])}</span>
                              </div>
                            )}
                            
                            {displayData[0].groupedExpenses['Personal Use'] > 0 && (
                              <div className="flex justify-between py-2 border-b border-slate-800">
                                <span className="text-xs text-slate-400">Personal Use (non-operating)</span>
                                <span className="text-xs font-bold text-amber-400">{formatCurrency(displayData[0].groupedExpenses['Personal Use'])}</span>
                              </div>
                            )}
                          </>
                        )}
                        
                        <div className="flex justify-between py-3 border-t-2 border-slate-700 mt-4">
                          <span className="text-base font-bold text-white">Net Profit</span>
                          <span className={cn('text-base font-bold', displayData[0].profit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                            {formatCurrency(displayData[0].profit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Expense Breakdown */}
                    {displayData[0].expenseBreakdown && Object.keys(displayData[0].expenseBreakdown).length > 0 && (
                      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-rose-400" />
                          Detailed Expense Breakdown
                        </h3>
                        <div className="space-y-1">
                          {Object.entries(displayData[0].expenseBreakdown)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([category, amount]: [string, any]) => (
                            <div key={category} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                              <span className="text-sm text-slate-400 truncate flex-1">{category}</span>
                              <span className="text-sm font-bold text-slate-300 ml-4">{formatCurrency(amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {displayData[0].bestSeller && (
                        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                          <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">🏆 Best Seller</p>
                          <p className="text-sm text-slate-300 truncate">{displayData[0].bestSeller[0]}</p>
                          <p className="text-lg font-bold text-emerald-400 mt-1">{formatCurrency(displayData[0].bestSeller[1])}</p>
                        </div>
                      )}
                      {displayData[0].biggestOverhead && (
                        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                          <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">⚠️ Biggest Overhead</p>
                          <p className="text-sm text-slate-300 truncate">{displayData[0].biggestOverhead[0]}</p>
                          <p className="text-lg font-bold text-rose-400 mt-1">{formatCurrency(displayData[0].biggestOverhead[1])}</p>
                        </div>
                      )}
                      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                        <p className="text-[10px] font-bold uppercase text-slate-500 mb-2">📊 Profit Margin</p>
                        <p className={cn('text-lg font-bold', displayData[0].profit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {formatPercent(displayData[0].profit, displayData[0].revenue)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
