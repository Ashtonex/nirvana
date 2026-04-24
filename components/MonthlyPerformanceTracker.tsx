'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingCart, AlertCircle, Loader2, Wallet } from 'lucide-react';
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
  revenueChange?: number;
  expenseChange?: number;
  profitChange?: number;
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

interface ComparisonData {
  prevMonth: {
    revenue: number;
    expenses: number;
    profit: number;
  };
  change: {
    revenue: number;
    expenses: number;
    profit: number;
  };
}

interface TrendData {
  month: number;
  monthName: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface TopItem {
  name: string;
  quantity: number;
  total: number;
}

interface AlertThresholds {
  maxExpenseRatio: number; // Maximum expense as % of revenue
  minProfitMargin: number; // Minimum profit margin %
  enabled: boolean;
}

export function MonthlyPerformanceTracker() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [view, setView] = useState<'monthly' | 'ytd'>('monthly');
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<string>('all');
  const [showDetailedExpenses, setShowDetailedExpenses] = useState<{ [key: string]: boolean }>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertThresholds>({ maxExpenseRatio: 80, minProfitMargin: 15, enabled: true });

  const toggleDetailedExpenses = (shopId: string) => {
    setShowDetailedExpenses(prev => ({
      ...prev,
      [shopId]: !prev[shopId]
    }));
  };

  const toggleCategoryExpansion = (category: string) => {
    setExpandedCategory(prev => prev === category ? null : category);
  };

  const getCategoryExpenses = (category: string) => {
    if (!performance.length) return [];
    const allExpenses: { shop: string; category: string; amount: number }[] = [];
    
    // Use all performance data for category drill-down, not filtered displayData
    const sourceData = selectedShop === 'all' ? performance : performance.filter(p => p.shopId === selectedShop);
    
    sourceData.forEach(shop => {
      if (shop.expenseBreakdown && shop.groupedExpenses) {
        // Use the API's categorization to determine which expenses belong to which category
        // The API already categorizes expenses into groupedExpenses
        // We need to reverse-map: for each expense in expenseBreakdown, find which group it belongs to
        
        // Since the API doesn't provide the mapping, we'll use the categorization logic
        Object.entries(shop.expenseBreakdown).forEach(([cat, amount]) => {
          const normalizedCat = cat.toLowerCase();
          
          // Use the same categorization logic as the API
          let expenseGroup = 'Other';
          if (/(rent|salary|salaries|utility|utilities|overhead|electricity|water|internet|insurance|maintenance)/.test(normalizedCat)) {
            expenseGroup = 'Overheads';
          } else if (/(stock|order|purchase|supplier|restock|supply|supplies|inventory)/.test(normalizedCat)) {
            expenseGroup = 'Stock Orders';
          } else if (/(invest|vault|transfer|saving|savings|blackbox|deposit|withdrawal|move)/.test(normalizedCat)) {
            expenseGroup = 'Transfers';
          } else if (/(grocery|groceries|fuel|owner|drawing|personal)/.test(normalizedCat)) {
            expenseGroup = 'Personal Use';
          }
          
          if (expenseGroup === category && amount > 0) {
            allExpenses.push({ shop: shop.shopName, category: cat, amount: amount as number });
          }
        });
      }
    });
    
    return allExpenses.sort((a, b) => b.amount - a.amount);
  };

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        view: view,
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
      setComparison(data.comparison || null);
      setTrends(data.trends || []);
      setTopItems(data.topItems || []);
    } catch (e: any) {
      setError(e.message || 'Error loading performance data');
      setPerformance([]);
      setTotals(null);
      setComparison(null);
      setTrends([]);
      setTopItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, view]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  const exportToCSV = () => {
    if (!performance.length || !totals) return;
    
    const headers = ['Shop', 'Revenue', 'Expenses', 'Profit', 'Sales Count', 'Margin'];
    const rows = performance.map(p => [
      p.shopName,
      p.revenue.toFixed(2),
      p.expenses.toFixed(2),
      p.profit.toFixed(2),
      p.salesCount,
      ((p.profit / p.revenue) * 100).toFixed(1) + '%'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance_${view}_${year}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ChangeIndicator = ({ value }: { value: number }) => {
    if (value === 0) return <span className="text-slate-500 text-xs">—</span>;
    const isPositive = value > 0;
    return (
      <span className={cn('text-xs font-semibold flex items-center gap-1', isPositive ? 'text-emerald-400' : 'text-rose-400')}>
        {isPositive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

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
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-2">Year</label>
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue>{year}</SelectValue>
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
              <SelectValue>{months[month - 1]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 block mb-2">View</label>
          <Select value={view} onValueChange={(v: string) => setView(v as 'monthly' | 'ytd')}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue>{view === 'monthly' ? 'Monthly' : 'YTD'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 block mb-2">Filter Shop</label>
          <Select value={selectedShop} onValueChange={setSelectedShop}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue>{selectedShop === 'all' ? 'All Shops' : performance.find(p => p.shopId === selectedShop)?.shopName || 'All Shops'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shops</SelectItem>
              {performance.map((p) => (
                <SelectItem key={p.shopId} value={p.shopId}>{p.shopName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <Button onClick={fetchPerformance} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
          <Button onClick={exportToCSV} disabled={!performance.length} variant="outline" className="bg-slate-900 border-slate-700 hover:bg-slate-800">
            Export
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

      {/* Summary Cards - Only show when viewing all shops */}
      {totals && selectedShop === 'all' && (
        <div className="space-y-4">
          {/* Primary numbers with MoM comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Revenue</p>
                {view === 'monthly' && comparison && <ChangeIndicator value={comparison.change.revenue} />}
              </div>
              <p className="mt-3 text-3xl font-black text-emerald-400">{formatCurrency(totals.totalRevenue)}</p>
              <p className="mt-1 text-xs text-slate-500">{totals.totalSales} sales across {totals.shopCount} shops</p>
            </div>
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operating Expenses</p>
                {view === 'monthly' && comparison && <ChangeIndicator value={comparison.change.expenses} />}
              </div>
              <p className="mt-3 text-3xl font-black text-rose-400">{formatCurrency(totals.totalExpenses)}</p>
              <p className="mt-1 text-xs text-slate-500">Overheads + Stock Orders + Other</p>
            </div>
            <div className={cn('rounded-2xl border p-5', totals.totalProfit >= 0 ? 'border-sky-500/20 bg-sky-500/5' : 'border-rose-500/30 bg-rose-500/10')}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Profit</p>
                {view === 'monthly' && comparison && <ChangeIndicator value={comparison.change.profit} />}
              </div>
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

          {/* Trend Chart */}
          {trends.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                {year} Revenue & Expense Trends
              </h3>
              <div className="space-y-3">
                <div className="flex items-end gap-1 h-32">
                  {trends.map((trend) => {
                    const maxVal = Math.max(...trends.map(t => Math.max(t.revenue, t.expenses)));
                    const revenueHeight = maxVal > 0 ? (trend.revenue / maxVal) * 100 : 0;
                    const expenseHeight = maxVal > 0 ? (trend.expenses / maxVal) * 100 : 0;
                    return (
                      <div key={trend.month} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex gap-0.5 items-end justify-center h-full">
                          <div 
                            className="w-3 bg-emerald-500/80 rounded-t transition-all hover:bg-emerald-400" 
                            style={{ height: `${revenueHeight}%` }}
                            title={`Revenue: ${formatCurrency(trend.revenue)}`}
                          />
                          <div 
                            className="w-3 bg-rose-500/80 rounded-t transition-all hover:bg-rose-400" 
                            style={{ height: `${expenseHeight}%` }}
                            title={`Expenses: ${formatCurrency(trend.expenses)}`}
                          />
                        </div>
                        <p className="text-[8px] text-slate-500 uppercase">{trend.monthName}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500/80 rounded" />
                    <span className="text-slate-400">Revenue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-rose-500/80 rounded" />
                    <span className="text-slate-400">Expenses</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cash Flow Projection */}
          {trends.length > 0 && view === 'monthly' && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-sky-400" />
                Cash Flow Projection (Next 3 Months)
              </h3>
              <div className="space-y-3">
                {(() => {
                  const recentMonths = trends.slice(-3);
                  const avgRevenueGrowth = recentMonths.length > 1 
                    ? ((recentMonths[recentMonths.length - 1].revenue - recentMonths[0].revenue) / Math.max(recentMonths[0].revenue, 1)) / (recentMonths.length - 1)
                    : 0;
                  const avgExpenseGrowth = recentMonths.length > 1
                    ? ((recentMonths[recentMonths.length - 1].expenses - recentMonths[0].expenses) / Math.max(recentMonths[0].expenses, 1)) / (recentMonths.length - 1)
                    : 0;
                  
                  const projections = [
                    { month: month + 1, label: 'Next Month' },
                    { month: month + 2, label: 'Month +2' },
                    { month: month + 3, label: 'Month +3' },
                  ].map(proj => {
                    const baseRevenue = trends[month - 1]?.revenue || 0;
                    const baseExpenses = trends[month - 1]?.expenses || 0;
                    const projectedRevenue = baseRevenue * (1 + avgRevenueGrowth * (proj.month - month + 1));
                    const projectedExpenses = baseExpenses * (1 + avgExpenseGrowth * (proj.month - month + 1));
                    const projectedProfit = projectedRevenue - projectedExpenses;
                    return { ...proj, revenue: projectedRevenue, expenses: projectedExpenses, profit: projectedProfit };
                  });
                  
                  return (
                    <div className="space-y-2">
                      {projections.map((proj, idx) => {
                    const projMonth = proj.month > 12 ? proj.month - 12 : proj.month;
                    const projYear = proj.month > 12 ? year + 1 : year;
                    const monthName = new Date(projYear, projMonth - 1, 1).toLocaleString('default', { month: 'short' });
                    return (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                        <span className="text-sm text-slate-400">{monthName} {projYear}</span>
                        <div className="flex items-center gap-6">
                          <span className="text-sm text-emerald-400">{formatCurrency(proj.revenue)}</span>
                          <span className="text-sm text-rose-400">{formatCurrency(proj.expenses)}</span>
                          <span className={cn('text-sm font-bold', proj.profit >= 0 ? 'text-sky-400' : 'text-rose-400')}>
                            {formatCurrency(proj.profit)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                    </div>
                  );
                })()}
                <p className="text-[10px] text-slate-500 mt-2">*Based on recent 3-month trend analysis</p>
              </div>
            </div>
          )}

          {/* Alert Thresholds */}
          {alerts.enabled && totals && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400" />
                Performance Alerts
              </h3>
              <div className="space-y-2">
                {(() => {
                  const expenseRatio = totals.totalRevenue > 0 ? (totals.totalExpenses / totals.totalRevenue) * 100 : 0;
                  const profitMargin = totals.profitMargin;
                  const alertsList = [];
                  
                  if (expenseRatio > alerts.maxExpenseRatio) {
                    alertsList.push({
                      type: 'warning',
                      message: `Expenses at ${expenseRatio.toFixed(1)}% exceed threshold of ${alerts.maxExpenseRatio}%`
                    });
                  }
                  
                  if (profitMargin < alerts.minProfitMargin) {
                    alertsList.push({
                      type: 'error',
                      message: `Profit margin at ${profitMargin.toFixed(1)}% below minimum of ${alerts.minProfitMargin}%`
                    });
                  }
                  
                  if (alertsList.length === 0) {
                    return <p className="text-xs text-emerald-400">All metrics within healthy ranges ✓</p>;
                  }
                  
                  return alertsList.map((alert, idx) => (
                    <div key={idx} className={cn('flex items-center gap-2 text-xs p-2 rounded', alert.type === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400')}>
                      <AlertCircle className="h-4 w-4" />
                      {alert.message}
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Top Performing Items */}
          {topItems.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
              <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-violet-400" />
                Top Performing Items ({year})
              </h3>
              <div className="space-y-2">
                {topItems.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', idx === 0 ? 'bg-amber-500/20 text-amber-400' : idx === 1 ? 'bg-slate-500/20 text-slate-400' : idx === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500')}>
                        {idx + 1}
                      </span>
                      <span className="text-sm text-slate-300">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-500">{item.quantity} sold</span>
                      <span className="text-sm font-bold text-emerald-400">{formatCurrency(item.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense breakdown strip with drill-down - Only show when viewing all shops */}
          {selectedShop === 'all' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div 
                  className={cn(
                    "rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 cursor-pointer transition-all hover:bg-rose-500/10",
                    expandedCategory === 'Overheads' && "ring-2 ring-rose-500/50"
                  )}
                  onClick={() => toggleCategoryExpansion('Overheads')}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-400/70">Overheads</p>
                    <span className="text-[8px] text-rose-400/50">{expandedCategory === 'Overheads' ? '−' : '+'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-rose-300">{formatCurrency(totals.totalOverheads ?? 0)}</p>
                  <p className="text-[9px] text-slate-600">Rent · Salary · Utilities</p>
                </div>
                <div 
                  className={cn(
                    "rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 cursor-pointer transition-all hover:bg-violet-500/10",
                    expandedCategory === 'Stock Orders' && "ring-2 ring-violet-500/50"
                  )}
                  onClick={() => toggleCategoryExpansion('Stock Orders')}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-violet-400/70">Stock Orders</p>
                    <span className="text-[8px] text-violet-400/50">{expandedCategory === 'Stock Orders' ? '−' : '+'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-violet-300">{formatCurrency(totals.totalStockOrders ?? 0)}</p>
                  <p className="text-[9px] text-slate-600">Cost of goods purchased</p>
                </div>
                <div 
                  className={cn(
                    "rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 cursor-pointer transition-all hover:bg-sky-500/10",
                    expandedCategory === 'Transfers' && "ring-2 ring-sky-500/50"
                  )}
                  onClick={() => toggleCategoryExpansion('Transfers')}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-sky-400/70">Transfers</p>
                    <span className="text-[8px] text-sky-400/50">{expandedCategory === 'Transfers' ? '−' : '+'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-sky-300">{formatCurrency(totals.totalTransfers ?? 0)}</p>
                  <p className="text-[9px] text-slate-600">Not counted vs profit</p>
                </div>
                <div 
                  className={cn(
                    "rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 cursor-pointer transition-all hover:bg-amber-500/10",
                    expandedCategory === 'Personal Use' && "ring-2 ring-amber-500/50"
                  )}
                  onClick={() => toggleCategoryExpansion('Personal Use')}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">Personal Use</p>
                    <span className="text-[8px] text-amber-400/50">{expandedCategory === 'Personal Use' ? '−' : '+'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-amber-300">{formatCurrency(totals.totalPersonalUse ?? 0)}</p>
                  <p className="text-[9px] text-slate-600">Not counted vs profit</p>
                </div>
              </div>

              {/* Expanded category details */}
              {expandedCategory && (
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 animate-in slide-down-from-top-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-slate-300">{expandedCategory} - Individual Expenses {selectedShop !== 'all' && `(for ${performance.find(p => p.shopId === selectedShop)?.shopName})`}</h4>
                    <button 
                      onClick={() => setExpandedCategory(null)}
                      className="text-xs text-slate-500 hover:text-white transition-colors"
                    >
                      Close
                    </button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {getCategoryExpenses(expandedCategory).length === 0 ? (
                      <p className="text-xs text-slate-500">No expenses found in this category</p>
                    ) : (
                      getCategoryExpenses(expandedCategory).map((expense, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                          <div className="flex-1">
                            <p className="text-xs text-slate-400">{expense.category}</p>
                            <p className="text-[10px] text-slate-600">{expense.shop}</p>
                          </div>
                          <p className="text-sm font-bold text-slate-300 ml-4">{formatCurrency(expense.amount)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Shop-specific expense breakdown when a shop is selected */}
      {selectedShop !== 'all' && displayData.length === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-5">
            <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-400" />
              {displayData[0].shopName} - Expense Categories
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {displayData[0].groupedExpenses && Object.entries(displayData[0].groupedExpenses).map(([category, amount]) => (
                <div 
                  key={category}
                  className={cn(
                    "rounded-xl border p-3 cursor-pointer transition-all hover:bg-slate-800",
                    expandedCategory === category && "ring-2 ring-emerald-500/50",
                    category === 'Overheads' ? "border-rose-500/20 bg-rose-500/5" :
                    category === 'Stock Orders' ? "border-violet-500/20 bg-violet-500/5" :
                    category === 'Transfers' ? "border-sky-500/20 bg-sky-500/5" :
                    category === 'Personal Use' ? "border-amber-500/20 bg-amber-500/5" : "border-slate-700 bg-slate-900/50"
                  )}
                  onClick={() => toggleCategoryExpansion(category)}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{category}</p>
                    <span className="text-[8px] text-slate-500">{expandedCategory === category ? '−' : '+'}</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-slate-300">{formatCurrency(amount as number)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Expanded category details for selected shop */}
          {expandedCategory && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 animate-in slide-down-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-300">{expandedCategory} - Individual Expenses</h4>
                <button 
                  onClick={() => setExpandedCategory(null)}
                  className="text-xs text-slate-500 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {getCategoryExpenses(expandedCategory).length === 0 ? (
                  <p className="text-xs text-slate-500">No expenses found in this category</p>
                ) : (
                  getCategoryExpenses(expandedCategory).map((expense, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                      <div className="flex-1">
                        <p className="text-xs text-slate-400">{expense.category}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-300 ml-4">{formatCurrency(expense.amount)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
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
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Revenue</p>
                        {view === 'monthly' && shop.revenueChange !== undefined && <ChangeIndicator value={shop.revenueChange} />}
                      </div>
                      <p className="text-sm font-bold text-emerald-400">{formatCurrency(shop.revenue)}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Expenses</p>
                        {view === 'monthly' && shop.expenseChange !== undefined && <ChangeIndicator value={shop.expenseChange} />}
                      </div>
                      <p className="text-sm font-bold text-rose-400">{formatCurrency(shop.expenses)}</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Margin</p>
                        {view === 'monthly' && shop.profitChange !== undefined && <ChangeIndicator value={shop.profitChange} />}
                      </div>
                      <p className={cn('text-sm font-bold', shop.profit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
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
