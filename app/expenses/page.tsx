"use client";

import { useEffect, useState, useMemo } from "react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { AlertTriangle, Brain, Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { ExpenseDetailPanel } from "@/components/ExpenseDetailPanel";

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toLocalDateString(date: unknown): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(String(date));
  return d.toLocaleDateString('en-CA');
}

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

type BrainRule = {
  id: string;
  rule_type: string;
  match_pattern: string;
  match_field: string;
  action: string;
  category?: string;
  priority: number;
};

const DEFAULT_INTERNAL_TRANSFER_KEYWORDS = [
  "invest", "savings", "perfume deposit", "overhead contribution",
  "groceries to invest", "stockvel", "perfume invest", "deposit to", "eod", "blackbox"
];

const DEFAULT_PERSONAL_KEYWORDS = [
  "personal", "抽钱", "withdrawal", "my", "own", "family",
  "food for home", "groceries for home", "home groceries",
  "lunch personal", "dinner personal"
];

const DEFAULT_OVERHEAD_KEYWORDS = [
  "rent", "utilities", "electric", "electricity", "water", "rates",
  "municipal", "insurance", "security", "salary", "wages", "payroll",
  "site rent", "premises", "internet", "wifi"
];

const DEFAULT_STOCK_KEYWORDS = [
  "stock", "inventory", "purchases", "bulk order", "wholesale",
  "restock", "procurement", "supplier"
];

const DEFAULT_TRANSPORT_KEYWORDS = [
  "transport", "petrol", "fuel", "diesel", "uber", "delivery",
  "logistics", "courier", "freight"
];

const DEFAULT_GROCERY_KEYWORDS = [
  "groceries", "grocery", "supermarket", "market", "provisions",
  "food items", "sundries"
];

const DEFAULT_OPERATIONAL_KEYWORDS = [
  "airtime", "data", "internet", "phone", "advertising", "marketing",
  "stationery", "printing", "bank charges", "commission"
];

function classifyExpense(
  title: string,
  category: string,
  source: string,
  rules: BrainRule[]
): {
  type: ExpenseRow["expenseType"];
  isFiltered: boolean;
  filterReason: string;
  ruleApplied?: string;
} {
  const text = `${title} ${category}`.toLowerCase();

  if (source === "Invest") {
    return { type: "internal_transfer", isFiltered: true, filterReason: "Invest withdrawal - not a business expense" };
  }

  if (rules.length > 0) {
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const pattern = rule.match_pattern.toLowerCase();
      const field = rule.match_field === "category" ? category.toLowerCase() : text;

      if (field.includes(pattern) || pattern.includes(field)) {
        switch (rule.action) {
          case "personal":
            return {
              type: "personal",
              isFiltered: false,
              filterReason: `Learned: Personal expense (rule: "${rule.match_pattern}")`,
              ruleApplied: rule.id
            };
          case "overhead":
            return {
              type: "overhead",
              isFiltered: false,
              filterReason: `Learned: Business overhead (rule: "${rule.match_pattern}")`,
              ruleApplied: rule.id
            };
          case "stock":
            return {
              type: "stock",
              isFiltered: false,
              filterReason: `Learned: Stock/inventory (rule: "${rule.match_pattern}")`,
              ruleApplied: rule.id
            };
          case "filter":
          case "ignore":
            return {
              type: "internal_transfer",
              isFiltered: true,
              filterReason: `Learned: Filter as transfer (rule: "${rule.match_pattern}")`,
              ruleApplied: rule.id
            };
          case "operational":
            return {
              type: "operational",
              isFiltered: false,
              filterReason: `Learned: Operational (rule: "${rule.match_pattern}")`,
              ruleApplied: rule.id
            };
          case "classify":
            return {
              type: (rule.category as ExpenseRow["expenseType"]) || "other",
              isFiltered: false,
              filterReason: `Learned: ${rule.category || "custom"} (rule: "${rule.match_pattern}")`,
              ruleApplied: rule.id
            };
        }
      }
    }
  }

  if (DEFAULT_INTERNAL_TRANSFER_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "internal_transfer", isFiltered: true, filterReason: "Internal transfer between accounts" };
  }

  if (DEFAULT_PERSONAL_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "personal", isFiltered: false, filterReason: "Personal/household expense" };
  }

  if (DEFAULT_OVERHEAD_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "overhead", isFiltered: false, filterReason: "Business overhead" };
  }

  if (DEFAULT_STOCK_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "stock", isFiltered: false, filterReason: "Stock/inventory purchase" };
  }

  if (DEFAULT_TRANSPORT_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "transport", isFiltered: false, filterReason: "Transport/logistics" };
  }

  if (DEFAULT_GROCERY_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "groceries", isFiltered: false, filterReason: "Groceries (may be personal)" };
  }

  if (DEFAULT_OPERATIONAL_KEYWORDS.some(kw => text.includes(kw))) {
    return { type: "operational", isFiltered: false, filterReason: "Operational expense" };
  }

  if (category === "Perfume" || text.includes("perfume")) {
    return { type: "internal_transfer", isFiltered: true, filterReason: "Perfume deposit to Invest" };
  }

  return { type: "other", isFiltered: false, filterReason: "" };
}

// Helper functions to create default dates
function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getDefaultStartDate(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export default function ExpensesPage() {
  const [allRows, setAllRows] = useState<ExpenseRow[]>([]);
  const [rules, setRules] = useState<BrainRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTeaching, setShowTeaching] = useState(false);
  const [newRule, setNewRule] = useState({
    match_pattern: "",
    match_field: "title" as "title" | "category",
    action: "overhead" as "overhead" | "personal" | "stock" | "operational" | "filter",
    category: "",
    priority: 10
  });

  // Default date range - last 30 days
  const { defaultStartDate, defaultEndDate } = useMemo(() => ({
    defaultEndDate: getDefaultEndDate(),
    defaultStartDate: getDefaultStartDate()
  }), []);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const [posRes, opsRes, investRes, rulesRes] = await Promise.all([
        fetch("/api/expenses/pos", { credentials: "include" }).then(r => r.json()),
        fetch("/api/expenses/operations", { credentials: "include" }).then(r => r.json()),
        fetch("/api/expenses/invest", { credentials: "include" }).then(r => r.json()),
        fetch("/api/expenses/rules", { credentials: "include" }).then(r => r.json())
      ]);

      const posRows: ExpenseRow[] = (posRes || []).map((row: any) => {
        const title = String(row.description || row.category || "POS Expense");
        const category = String(row.category || "POS Expense");
        const classification = classifyExpense(title, category, "POS", rulesRes || []);
        return {
          id: `pos-${row.id}`,
          source: "POS" as const,
          amount: Math.abs(Number(row.amount || 0)),
          date: String(row.date || row.created_at || ''),
          dateStr: toLocalDateString(row.date || row.created_at),
          title,
          subtitle: category,
          shopId: String(row.shop_id || row.shopId || ""),
          category,
          kind: category,
          expenseType: classification.type,
          isFiltered: classification.isFiltered,
          filterReason: classification.filterReason,
          ruleApplied: classification.ruleApplied,
        };
      });

      const opsRows: ExpenseRow[] = (opsRes || []).map((row: any) => {
        const title = String(row.title || row.kind || "Operations Expense");
        const kind = String(row.kind || "Expense");
        const classification = classifyExpense(title, kind, "Operations", rulesRes || []);
        return {
          id: `ops-${row.id}`,
          source: "Operations" as const,
          amount: Math.abs(Number(row.amount || 0)),
          date: String(row.effective_date || row.created_at || ''),
          dateStr: toLocalDateString(row.effective_date || row.created_at),
          title,
          subtitle: kind,
          shopId: String(row.shop_id || ""),
          category: kind,
          kind,
          expenseType: classification.type,
          isFiltered: classification.isFiltered,
          filterReason: classification.filterReason,
          ruleApplied: classification.ruleApplied,
        };
      });

      const investRows: ExpenseRow[] = (investRes || []).map((row: any) => ({
        id: `invest-${row.id}`,
        source: "Invest" as const,
        amount: Math.abs(Number(row.withdrawn_amount || 0)),
        date: String(row.withdrawn_at || row.deposited_at || ''),
        dateStr: toLocalDateString(row.withdrawn_at || row.deposited_at),
        title: String(row.withdraw_title || "Invest Withdrawal"),
        subtitle: String(row.status || "withdrawal"),
        shopId: String(row.shop_id || ""),
        category: "Invest Withdrawal",
        kind: "invest_withdrawal",
        expenseType: "internal_transfer" as const,
        isFiltered: true,
        filterReason: "Invest withdrawal - internal transfer",
      }));

      setAllRows([...posRows, ...opsRows, ...investRows]);
      setRules(rulesRes || []);
    } catch (e) {
      console.error("Failed to load expenses:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async () => {
    if (!newRule.match_pattern.trim()) return;

    try {
      const response = await fetch("/api/expenses/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newRule)
      });

      if (response.ok) {
        setNewRule({
          match_pattern: "",
          match_field: "title",
          action: "overhead",
          category: "",
          priority: 10
        });
        loadExpenses(); // Reload to apply new rule
      }
    } catch (e) {
      console.error("Failed to save rule:", e);
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      await fetch(`/api/expenses/rules/${ruleId}`, {
        method: "DELETE",
        credentials: "include"
      });
      loadExpenses();
    } catch (e) {
      console.error("Failed to delete rule:", e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading expenses...</p>
        </div>
      </div>
    );
  }

  const realBusinessExpenses = allRows.filter(r => !r.isFiltered);
  const internalTransfers = allRows.filter(r => r.expenseType === "internal_transfer");
  const personalExpenses = allRows.filter(r => r.expenseType === "personal");
  const overheadExpenses = allRows.filter(r => r.expenseType === "overhead");
  const stockExpenses = allRows.filter(r => r.expenseType === "stock");
  const transportExpenses = allRows.filter(r => r.expenseType === "transport");
  const groceryExpenses = allRows.filter(r => r.expenseType === "groceries");
  const operationalExpenses = allRows.filter(r => r.expenseType === "operational");
  const otherExpenses = allRows.filter(r => r.expenseType === "other");

  const posExpenses = allRows.filter(r => r.source === "POS");
  const opsExpenses = allRows.filter(r => r.source === "Operations");
  const investExpenses = allRows.filter(r => r.source === "Invest");

  const totalAllExpenses = allRows.reduce((sum, r) => sum + r.amount, 0);
  const totalRealExpenses = realBusinessExpenses.reduce((sum, r) => sum + r.amount, 0);
  const totalPosExpenses = posExpenses.reduce((sum, r) => sum + r.amount, 0);
  const totalOpsExpenses = opsExpenses.reduce((sum, r) => sum + r.amount, 0);
  const totalInvestExpenses = investExpenses.reduce((sum, r) => sum + r.amount, 0);

  const summary = {
    overhead: overheadExpenses.reduce((s, r) => s + r.amount, 0),
    stock: stockExpenses.reduce((s, r) => s + r.amount, 0),
    transport: transportExpenses.reduce((s, r) => s + r.amount, 0),
    groceries: groceryExpenses.reduce((s, r) => s + r.amount, 0),
    operational: operationalExpenses.reduce((s, r) => s + r.amount, 0),
    other: otherExpenses.reduce((s, r) => s + r.amount, 0),
  };

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-4">
          <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Expenses</h1>
          <Button
            onClick={() => setShowTeaching(!showTeaching)}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Brain className="h-4 w-4" />
            {showTeaching ? "Hide" : "Teach"} AI
          </Button>
          {rules.length > 0 && (
            <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
              {rules.length} Rules Active
            </Badge>
          )}
        </div>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          Real business expenses vs internal transfers
        </p>
      </div>

      {showTeaching && (
        <Card className="max-w-4xl mx-auto bg-gradient-to-br from-violet-950/40 to-slate-950/40 border-violet-500/30">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-500" />
              Teach the Expense AI
            </CardTitle>
            <CardDescription className="text-sm">
              Create rules to automatically classify expenses. The AI will remember these patterns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Pattern to Match</label>
                <Input
                  placeholder="e.g., 'rent', 'fuel', 'salary'"
                  value={newRule.match_pattern}
                  onChange={(e) => setNewRule({...newRule, match_pattern: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Match In</label>
                <select
                  value={newRule.match_field}
                  onChange={(e) => setNewRule({...newRule, match_field: e.target.value as "title" | "category"})}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="title">Title/Description</option>
                  <option value="category">Category</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Classification</label>
                <select
                  value={newRule.action}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      action: e.target.value as "overhead" | "filter" | "personal" | "stock" | "operational"
                    })
                  }
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="overhead">Business Overhead</option>
                  <option value="personal">Personal Expense</option>
                  <option value="stock">Stock/Inventory</option>
                  <option value="operational">Operational</option>
                  <option value="filter">Filter as Transfer</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Priority (Higher = First)</label>
                <Input
                  type="number"
                  value={newRule.priority}
                  onChange={(e) => setNewRule({...newRule, priority: Number(e.target.value)})}
                  min="1"
                  max="100"
                />
              </div>
            </div>
            <Button onClick={saveRule} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              Save Rule
            </Button>

            {rules.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-black uppercase text-slate-400">Active Rules</h4>
                {rules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                    <div className="text-sm">
                      <span className="font-bold text-violet-400">"{rule.match_pattern}"</span> in {rule.match_field} → {rule.action}
                      {rule.category && ` (${rule.category})`}
                    </div>
                    <Button
                      onClick={() => deleteRule(rule.id)}
                      variant="ghost"
                      size="sm"
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Expense Source Breakdown */}
        <Card className="bg-gradient-to-br from-slate-950/80 to-slate-900/80 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">
              Expense Source Breakdown - Where Your $22,798 Comes From
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-900/50">
                <div className="text-[10px] font-black uppercase text-blue-400 mb-1">POS Expenses</div>
                <div className="text-3xl font-black text-blue-400">{currency(totalPosExpenses)}</div>
                <div className="text-[10px] text-blue-600 mt-1">{posExpenses.length} items</div>
                <div className="text-[9px] text-blue-500 mt-2">From your point-of-sale system</div>
              </div>
              <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-900/50">
                <div className="text-[10px] font-black uppercase text-amber-400 mb-1">Operations Expenses</div>
                <div className="text-3xl font-black text-amber-400">{currency(totalOpsExpenses)}</div>
                <div className="text-[10px] text-amber-600 mt-1">{opsExpenses.length} items</div>
                <div className="text-[9px] text-amber-500 mt-2">From operations ledger (rent, salaries, etc.)</div>
              </div>
              <div className="bg-emerald-900/20 rounded-lg p-4 border border-emerald-900/50">
                <div className="text-[10px] font-black uppercase text-emerald-400 mb-1">Invest Withdrawals</div>
                <div className="text-3xl font-black text-emerald-400">{currency(totalInvestExpenses)}</div>
                <div className="text-[10px] text-emerald-600 mt-1">{investExpenses.length} items</div>
                <div className="text-[9px] text-emerald-500 mt-2">Money moved from Invest account</div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
              <div className="text-sm text-slate-300">
                <strong>Total: {currency(totalAllExpenses)}</strong> = POS + Operations + Invest
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-emerald-950/40 border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Total Sales (30d)</CardDescription>
              <CardTitle className="text-3xl font-black italic text-emerald-400">$0.00</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-rose-950/40 border-rose-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-rose-400">Real Expenses</CardDescription>
              <CardTitle className="text-3xl font-black italic text-rose-400">{currency(totalRealExpenses)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">All Expenses</CardDescription>
              <CardTitle className="text-3xl font-black italic text-slate-400">{currency(totalAllExpenses)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtered Out</CardDescription>
              <CardTitle className="text-3xl font-black italic text-slate-400">{currency(totalAllExpenses - totalRealExpenses)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Expense Categories */}
        <Card className="bg-gradient-to-br from-slate-950/80 to-slate-900/80 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Overhead</div>
                <div className="text-2xl font-black text-slate-400">{currency(overheadExpenses.reduce((s, r) => s + r.amount, 0))}</div>
                <div className="text-[10px] text-slate-600 mt-1">{overheadExpenses.length} items</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Stock/Inventory</div>
                <div className="text-2xl font-black text-slate-400">{currency(stockExpenses.reduce((s, r) => s + r.amount, 0))}</div>
                <div className="text-[10px] text-slate-600 mt-1">{stockExpenses.length} items</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Transport</div>
                <div className="text-2xl font-black text-slate-400">{currency(transportExpenses.reduce((s, r) => s + r.amount, 0))}</div>
                <div className="text-[10px] text-slate-600 mt-1">{transportExpenses.length} items</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Operational</div>
                <div className="text-2xl font-black text-slate-400">{currency(operationalExpenses.reduce((s, r) => s + r.amount, 0))}</div>
                <div className="text-[10px] text-slate-600 mt-1">{operationalExpenses.length} items</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What Was Filtered */}
        <Card className="bg-gradient-to-br from-slate-950/80 to-slate-900/80 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">FILTERED</Badge>
              These are NOT real expenses - money just moved between accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Internal Transfers</div>
                <div className="text-2xl font-black text-slate-400">{currency(internalTransfers.reduce((s, r) => s + r.amount, 0))}</div>
                <div className="text-[10px] text-slate-600 mt-1">{internalTransfers.length} items</div>
              </div>
              <div className="bg-rose-900/20 rounded-lg p-4 border border-rose-900/50">
                <div className="text-[10px] font-black uppercase text-rose-400 mb-1">Personal/Household</div>
                <div className="text-2xl font-black text-rose-400">{currency(personalExpenses.reduce((s, r) => s + r.amount, 0))}</div>
                <div className="text-[10px] text-rose-600 mt-1">{personalExpenses.length} items</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800 col-span-2">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Total Filtered</div>
                <div className="text-3xl font-black text-slate-400">{currency(totalAllExpenses - totalRealExpenses)}</div>
                <div className="text-[10px] text-slate-600 mt-1">These don't count against your business</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* REAL Business Expenses Breakdown */}
        <Card className="bg-gradient-to-br from-emerald-950/30 to-slate-950/80 border-emerald-500/30">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">REAL</Badge>
              TRUE Business Expenses ({realBusinessExpenses.length} items)
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              This is what your business actually spent
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-sky-950/40 rounded-lg p-4 border border-sky-900/50">
                <div className="text-[10px] font-black uppercase text-sky-400 mb-1">Overhead</div>
                <div className="text-2xl font-black text-sky-400">{currency(summary.overhead)}</div>
                <div className="text-[10px] text-sky-600 mt-1">{overheadExpenses.length} items</div>
              </div>
              <div className="bg-violet-950/40 rounded-lg p-4 border border-violet-900/50">
                <div className="text-[10px] font-black uppercase text-violet-400 mb-1">Stock/Inventory</div>
                <div className="text-2xl font-black text-violet-400">{currency(summary.stock)}</div>
                <div className="text-[10px] text-violet-600 mt-1">{stockExpenses.length} items</div>
              </div>
              <div className="bg-amber-950/40 rounded-lg p-4 border border-amber-900/50">
                <div className="text-[10px] font-black uppercase text-amber-400 mb-1">Transport</div>
                <div className="text-2xl font-black text-amber-400">{currency(summary.transport)}</div>
                <div className="text-[10px] text-amber-600 mt-1">{transportExpenses.length} items</div>
              </div>
              <div className="bg-rose-950/40 rounded-lg p-4 border border-rose-900/50">
                <div className="text-[10px] font-black uppercase text-rose-400 mb-1">Groceries</div>
                <div className="text-2xl font-black text-rose-400">{currency(summary.groceries)}</div>
                <div className="text-[10px] text-rose-600 mt-1">{groceryExpenses.length} items</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-950/40 rounded-lg p-4 border border-emerald-900/50">
                <div className="text-[10px] font-black uppercase text-emerald-400 mb-1">Operational</div>
                <div className="text-xl font-black text-emerald-400">{currency(summary.operational)}</div>
                <div className="text-[10px] text-emerald-600 mt-1">{operationalExpenses.length} items</div>
              </div>
              <div className="bg-slate-900 opacity-60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1">Other</div>
                <div className="text-xl font-black text-slate-400">{currency(summary.other)}</div>
                <div className="text-[10px] text-slate-600 mt-1">{otherExpenses.length} items</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Expense Panel */}
        <ExpenseDetailPanel 
          expenses={allRows}
          defaultStartDate={defaultStartDate}
          defaultEndDate={defaultEndDate}
        />
      </div>
    </div>
  );
}
