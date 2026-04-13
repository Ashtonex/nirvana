"use client";

import { useState, useMemo } from "react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Calendar, Filter, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

type ExpenseRow = {
  id: string;
  source: "POS" | "Operations" | "Invest";
  amount: number;
  date: string;
  dateStr: string;
  title: string;
  subtitle: string;
  shopId: string;
  category: string;
  kind: string;
  isOverhead: boolean;
  isPersonal: boolean;
  isAbnormal: boolean;
  reason: string;
  comparedTo: number;
};

type ExpenseAuditPanelProps = {
  expenses: (ExpenseRow & { reason: string; comparedTo: number })[];
  defaultStartDate: string;
  defaultEndDate: string;
};

export function ExpenseAuditPanel({ expenses, defaultStartDate, defaultEndDate }: ExpenseAuditPanelProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [filterSource, setFilterSource] = useState<"all" | "POS" | "Operations" | "Invest">("all");
  const [filterType, setFilterType] = useState<"all" | "flagged" | "business" | "personal" | "clean">("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredExpenses = useMemo(() => {
    let filtered = expenses.filter(exp => {
      const expDate = exp.dateStr;
      if (expDate < startDate || expDate > endDate) return false;
      if (filterSource !== "all" && exp.source !== filterSource) return false;
      
      if (filterType === "flagged") return exp.isAbnormal;
      if (filterType === "business") return exp.isOverhead && !exp.isPersonal;
      if (filterType === "personal") return exp.isPersonal;
      if (filterType === "clean") return !exp.isAbnormal && !exp.isPersonal && !exp.isOverhead;
      
      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        comparison = a.dateStr.localeCompare(b.dateStr);
      } else {
        comparison = a.amount - b.amount;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [expenses, startDate, endDate, filterSource, filterType, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const flagged = filteredExpenses.filter(e => e.isAbnormal).reduce((sum, e) => sum + e.amount, 0);
    const business = filteredExpenses.filter(e => e.isOverhead && !e.isPersonal).reduce((sum, e) => sum + e.amount, 0);
    const personal = filteredExpenses.filter(e => e.isPersonal).reduce((sum, e) => sum + e.amount, 0);
    const pos = filteredExpenses.filter(e => e.source === "POS").reduce((sum, e) => sum + e.amount, 0);
    const ops = filteredExpenses.filter(e => e.source === "Operations").reduce((sum, e) => sum + e.amount, 0);
    const invest = filteredExpenses.filter(e => e.source === "Invest").reduce((sum, e) => sum + e.amount, 0);

    const byShop: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const shop = e.shopId || "Unknown";
      byShop[shop] = (byShop[shop] || 0) + e.amount;
    });

    const byCategory: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    const dailyTotals: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      dailyTotals[e.dateStr] = (dailyTotals[e.dateStr] || 0) + e.amount;
    });

    const avgDaily = Object.keys(dailyTotals).length > 0 
      ? total / Object.keys(dailyTotals).length 
      : 0;

    const maxDaily = Math.max(...Object.values(dailyTotals), 0);
    const minDaily = Math.min(...Object.values(dailyTotals).filter(v => v > 0), 0);

    return { total, flagged, business, personal, pos, ops, invest, byShop, byCategory, avgDaily, maxDaily, minDaily, count: filteredExpenses.length };
  }, [filteredExpenses]);

  const dailyExpenses = useMemo(() => {
    const daily: Record<string, { date: string; total: number; flagged: number; items: number }> = {};
    filteredExpenses.forEach(e => {
      if (!daily[e.dateStr]) {
        daily[e.dateStr] = { date: e.dateStr, total: 0, flagged: 0, items: 0 };
      }
      daily[e.dateStr].total += e.amount;
      daily[e.dateStr].items++;
      if (e.isAbnormal) daily[e.dateStr].flagged++;
    });
    return Object.values(daily).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredExpenses]);

  return (
    <Card className="bg-slate-950/60 border-slate-800">
      <CardHeader>
        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
          <Filter className="h-5 w-5 text-sky-400" />
          Expense Audit & Filter
        </CardTitle>
        <CardDescription className="text-[10px] font-bold uppercase italic">
          Filter, sort, and analyze expenses by date range, source, and type
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500">Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
              className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md text-sm"
            >
              <option value="all">All Sources</option>
              <option value="POS">POS Only</option>
              <option value="Operations">Operations Only</option>
              <option value="Invest">Invest Only</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md text-sm"
            >
              <option value="all">All Types</option>
              <option value="flagged">Flagged Only</option>
              <option value="business">Business Overhead</option>
              <option value="personal">Personal</option>
              <option value="clean">Clean (Unclassified)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="text-[10px] font-black uppercase text-slate-500">Filtered Total</div>
            <div className="text-lg font-black text-white font-mono">${stats.total.toFixed(2)}</div>
          </div>
          <div className="bg-amber-950/30 rounded-lg p-3 border border-amber-900/30">
            <div className="text-[10px] font-black uppercase text-amber-500">Flagged</div>
            <div className="text-lg font-black text-amber-400 font-mono">${stats.flagged.toFixed(2)}</div>
          </div>
          <div className="bg-emerald-950/30 rounded-lg p-3 border border-emerald-900/30">
            <div className="text-[10px] font-black uppercase text-emerald-500">Business</div>
            <div className="text-lg font-black text-emerald-400 font-mono">${stats.business.toFixed(2)}</div>
          </div>
          <div className="bg-rose-950/30 rounded-lg p-3 border border-rose-900/30">
            <div className="text-[10px] font-black uppercase text-rose-500">Personal</div>
            <div className="text-lg font-black text-rose-400 font-mono">${stats.personal.toFixed(2)}</div>
          </div>
          <div className="bg-sky-950/30 rounded-lg p-3 border border-sky-900/30">
            <div className="text-[10px] font-black uppercase text-sky-500">Avg/Day</div>
            <div className="text-lg font-black text-sky-400 font-mono">${stats.avgDaily.toFixed(2)}</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="text-[10px] font-black uppercase text-slate-500">Items</div>
            <div className="text-lg font-black text-white font-mono">{stats.count}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase">By Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-sky-400">POS</span>
                <span className="font-mono text-white">${stats.pos.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-400">Operations</span>
                <span className="font-mono text-white">${stats.ops.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-sky-400">Invest</span>
                <span className="font-mono text-white">${stats.invest.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase">By Shop</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[150px] overflow-y-auto">
              {Object.entries(stats.byShop)
                .sort((a, b) => b[1] - a[1])
                .map(([shop, amount]) => (
                  <div key={shop} className="flex justify-between text-sm">
                    <span className="text-slate-400 capitalize">{shop}</span>
                    <span className="font-mono text-white">${amount.toFixed(2)}</span>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black uppercase">By Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[150px] overflow-y-auto">
              {Object.entries(stats.byCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([cat, amount]) => (
                  <div key={cat} className="flex justify-between text-sm">
                    <span className="text-slate-400 truncate max-w-[120px]">{cat}</span>
                    <span className="font-mono text-white">${amount.toFixed(2)}</span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black uppercase text-slate-400">Daily Breakdown</h4>
            <div className="flex gap-2">
              <button
                onClick={() => { setSortBy("date"); setSortOrder("desc"); }}
                className={`text-[10px] px-2 py-1 rounded ${sortBy === "date" && sortOrder === "desc" ? "bg-sky-500/20 text-sky-400" : "bg-slate-800 text-slate-500"}`}
              >
                Newest
              </button>
              <button
                onClick={() => { setSortBy("amount"); setSortOrder("desc"); }}
                className={`text-[10px] px-2 py-1 rounded ${sortBy === "amount" && sortOrder === "desc" ? "bg-sky-500/20 text-sky-400" : "bg-slate-800 text-slate-500"}`}
              >
                Highest $
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto pr-2">
            {dailyExpenses.map(day => (
              <div 
                key={day.date} 
                className={`flex items-center justify-between p-2 rounded ${
                  day.flagged > 0 ? "bg-amber-950/20 border border-amber-900/30" : "bg-slate-900/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-300 font-mono">{day.date}</span>
                  {day.flagged > 0 && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[8px]">
                      {day.flagged} flagged
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-slate-500">{day.items} items</span>
                  <span className="text-sm font-mono text-white">${day.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
