"use client";

import { useState, useMemo } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/index";
import { DollarSign, Filter, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/components/ui/index";

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
  expenseType: "overhead" | "stock" | "transport" | "groceries" | "personal" | "internal_transfer" | "operational" | "other";
  isFiltered: boolean;
  filterReason: string;
  ruleApplied?: string;
};

type Props = {
  expenses: ExpenseRow[];
  defaultStartDate: string;
  defaultEndDate: string;
};

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  overhead: { bg: "bg-sky-950/40", text: "text-sky-400", border: "border-sky-900/50", label: "Overhead" },
  stock: { bg: "bg-violet-950/40", text: "text-violet-400", border: "border-violet-900/50", label: "Stock" },
  transport: { bg: "bg-amber-950/40", text: "text-amber-400", border: "border-amber-900/50", label: "Transport" },
  groceries: { bg: "bg-rose-950/40", text: "text-rose-400", border: "border-rose-900/50", label: "Groceries" },
  operational: { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-900/50", label: "Operational" },
  personal: { bg: "bg-rose-950/40", text: "text-rose-400", border: "border-rose-900/50", label: "Personal" },
  internal_transfer: { bg: "bg-slate-900/60", text: "text-slate-400", border: "border-slate-800", label: "Internal" },
  other: { bg: "bg-slate-900/60", text: "text-slate-400", border: "border-slate-800", label: "Other" },
};

export function ExpenseDetailPanel({ expenses, defaultStartDate, defaultEndDate }: Props) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showFiltered, setShowFiltered] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "type" | "shop" | "category">("type");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const expDate = exp.dateStr;
      if (expDate < startDate || expDate > endDate) return false;
      if (!showFiltered && exp.isFiltered) return false;
      if (searchTerm && !exp.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !exp.category.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (selectedSource !== "all" && exp.source !== selectedSource) return false;
      if (selectedType !== "all" && exp.expenseType !== selectedType) return false;
      return true;
    });
  }, [expenses, startDate, endDate, searchTerm, selectedSource, selectedType, showFiltered]);

  const groupedExpenses = useMemo(() => {
    if (groupBy === "none") {
      return { "All Expenses": filteredExpenses };
    }

    const groups: Record<string, ExpenseRow[]> = {};
    filteredExpenses.forEach(exp => {
      let key: string;
      if (groupBy === "type") {
        key = TYPE_COLORS[exp.expenseType]?.label || "Other";
      } else if (groupBy === "shop") {
        key = exp.shopId || "No Shop";
      } else {
        key = exp.category || "Other";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(exp);
    });

    return groups;
  }, [filteredExpenses, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card className="bg-slate-950/60 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-lg font-black uppercase italic">Expense Details</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 text-white text-xs px-2 py-1 rounded"
            >
              <option value="none">No Grouping</option>
              <option value="type">Group by Type</option>
              <option value="shop">Group by Shop</option>
              <option value="category">Group by Category</option>
            </select>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white text-xs px-2 py-1 rounded"
            >
              <option value="all">All Types</option>
              <option value="overhead">Overhead</option>
              <option value="stock">Stock</option>
              <option value="transport">Transport</option>
              <option value="groceries">Groceries</option>
              <option value="operational">Operational</option>
              <option value="personal">Personal</option>
              <option value="internal_transfer">Internal Transfer</option>
              <option value="other">Other</option>
            </select>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white text-xs px-2 py-1 rounded"
            >
              <option value="all">All Sources</option>
              <option value="POS">POS</option>
              <option value="Operations">Operations</option>
              <option value="Invest">Invest</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showFiltered}
                onChange={(e) => setShowFiltered(e.target.checked)}
                className="rounded"
              />
              Show Filtered
            </label>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-black">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white text-xs px-2 py-1 rounded"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-black">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white text-xs px-2 py-1 rounded"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search expenses..."
                className="w-full bg-slate-900 border border-slate-800 text-white text-xs px-2 py-1 pl-7 rounded"
              />
            </div>
          </div>
          <div className="text-lg font-black text-white">
            Total: <span className="text-rose-400">{currency(total)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
        {Object.entries(groupedExpenses).map(([groupName, groupExpenses]) => {
          const groupTotal = groupExpenses.reduce((sum, e) => sum + e.amount, 0);
          const isExpanded = expandedGroups[groupName] ?? true;
          
          let typeKey = "other";
          if (groupBy === "type") typeKey = groupName.toLowerCase().replace(" ", "_");
          const colors = TYPE_COLORS[typeKey] || TYPE_COLORS.other;

          return (
            <div key={groupName} className="space-y-1">
              <button
                onClick={() => groupBy !== "none" && toggleGroup(groupName)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-colors",
                  colors.bg, colors.border,
                  groupBy !== "none" && "cursor-pointer hover:opacity-80"
                )}
              >
                <div className="flex items-center gap-2">
                  {groupBy !== "none" && (
                    isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                  <span className={cn("font-black uppercase text-sm", colors.text)}>{groupName}</span>
                  <Badge className={cn("text-[8px]", colors.bg, colors.text, colors.border)}>
                    {groupExpenses.length} items
                  </Badge>
                </div>
                <span className={cn("font-black text-lg", colors.text)}>{currency(groupTotal)}</span>
              </button>

              {isExpanded && (
                <div className="space-y-1 pl-4">
                  {groupExpenses.map(expense => {
                    const expColors = TYPE_COLORS[expense.expenseType] || TYPE_COLORS.other;
                    return (
                      <div
                        key={expense.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border",
                          expense.isFiltered ? "bg-slate-900/40 border-slate-800/50" : "bg-slate-900/60 border-slate-800"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-[8px]", expColors.bg, expColors.text, expColors.border)}>
                              {expense.source}
                            </Badge>
                            {expense.shopId && (
                              <Badge className="bg-slate-800/60 text-slate-400 border-slate-700 text-[8px]">
                                {expense.shopId}
                              </Badge>
                            )}
                            {expense.isFiltered && (
                              <Badge className="bg-slate-700/50 text-slate-400 border-slate-600 text-[8px]">
                                FILTERED
                              </Badge>
                            )}
                            {expense.ruleApplied && (
                              <Badge className="bg-violet-500/30 text-violet-400 border-violet-500/50 text-[8px]">
                                LEARNED
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm font-bold text-white mt-1 truncate">{expense.title}</div>
                          <div className="text-[10px] text-slate-500 uppercase">{expense.dateStr}</div>
                          {expense.ruleApplied && (
                            <div className="text-[10px] text-violet-400/70 italic mt-1">{expense.filterReason}</div>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <div className={cn("text-lg font-black", expense.isFiltered ? "text-slate-500 line-through" : "text-rose-300")}>
                            {currency(expense.amount)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredExpenses.length === 0 && (
          <div className="text-center py-12 text-slate-600">
            No expenses match your filters
          </div>
        )}
      </CardContent>
    </Card>
  );
}
