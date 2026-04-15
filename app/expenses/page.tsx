export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
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

export default async function ExpensesPage() {
  let actor;
  try {
    actor = await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const defaultStartDate = toLocalDateString(thirtyDaysAgo);
  const defaultEndDate = toLocalDateString(now);

  const [posRes, opsRes, investRes, salesRes, rulesRes] = await Promise.all([
    supabaseAdmin.from("ledger_entries").select("*").eq("type", "expense").order("date", { ascending: false }).limit(2000),
    supabaseAdmin.from("operations_ledger").select("*").lt("amount", 0).order("created_at", { ascending: false }).limit(2000),
    supabaseAdmin.from("invest_deposits").select("*").gt("withdrawn_amount", 0).order("withdrawn_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("sales").select("total_with_tax, date").gte("date", thirtyDaysAgo.toISOString()).lte("date", now.toISOString()),
    supabaseAdmin.from("brain_learning_rules").select("*").eq("is_active", true).order("priority", { ascending: false }),
  ]);

  const rules: BrainRule[] = rulesRes.data || [];

  const posExpenseCategories = new Set(["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"]);
  const opsExpenseKinds = new Set(["overhead_payment", "stock_orders", "transport", "peer_payout", "other_expense", "rent", "utilities", "salaries", "misc", "salary", "wages", "electric", "water", "internet"]);

  const posRows: ExpenseRow[] = (posRes.data || [])
    .filter((row: Record<string, unknown>) => posExpenseCategories.has(String(row.category || "")))
    .map((row: Record<string, unknown>) => {
      const title = String(row.description || row.category || "POS Expense");
      const category = String(row.category || "POS Expense");
      const classification = classifyExpense(title, category, "POS", rules);
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

  const opsRows: ExpenseRow[] = (opsRes.data || [])
    .filter((row: Record<string, unknown>) => opsExpenseKinds.has(String(row.kind || "")))
    .map((row: Record<string, unknown>) => {
      const title = String(row.title || row.kind || "Operations Expense");
      const kind = String(row.kind || "Expense");
      const classification = classifyExpense(title, kind, "Operations", rules);
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

  const investRows: ExpenseRow[] = (investRes.data || []).map((row: Record<string, unknown>) => ({
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

  const allRows: ExpenseRow[] = [...posRows, ...opsRows, ...investRows];

  const realBusinessExpenses = allRows.filter(r => !r.isFiltered);
  const internalTransfers = allRows.filter(r => r.expenseType === "internal_transfer");
  const personalExpenses = allRows.filter(r => r.expenseType === "personal");
  const overheadExpenses = allRows.filter(r => r.expenseType === "overhead");
  const stockExpenses = allRows.filter(r => r.expenseType === "stock");
  const transportExpenses = allRows.filter(r => r.expenseType === "transport");
  const groceryExpenses = allRows.filter(r => r.expenseType === "groceries");
  const operationalExpenses = allRows.filter(r => r.expenseType === "operational");
  const otherExpenses = allRows.filter(r => r.expenseType === "other");

  const totalSales = (salesRes.data || []).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalAllExpenses = allRows.reduce((sum: number, r: ExpenseRow) => sum + r.amount, 0);
  const totalRealExpenses = realBusinessExpenses.reduce((sum: number, r: ExpenseRow) => sum + r.amount, 0);
  const totalFiltered = internalTransfers.reduce((sum: number, r: ExpenseRow) => sum + r.amount, 0);

  const profitLoss = totalSales - totalRealExpenses;
  const expenseRatio = totalSales > 0 ? (totalRealExpenses / totalSales * 100) : 0;

  const summary = {
    totalSales,
    totalAllExpenses,
    totalRealExpenses,
    totalFiltered,
    internalTransfers: internalTransfers.reduce((s, r) => s + r.amount, 0),
    personal: personalExpenses.reduce((s, r) => s + r.amount, 0),
    overhead: overheadExpenses.reduce((s, r) => s + r.amount, 0),
    stock: stockExpenses.reduce((s, r) => s + r.amount, 0),
    transport: transportExpenses.reduce((s, r) => s + r.amount, 0),
    groceries: groceryExpenses.reduce((s, r) => s + r.amount, 0),
    operational: operationalExpenses.reduce((s, r) => s + r.amount, 0),
    other: otherExpenses.reduce((s, r) => s + r.amount, 0),
    profitLoss,
    expenseRatio,
  };

  const rulesAppliedCount = allRows.filter(r => r.ruleApplied).length;

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-4">
          <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Expenses</h1>
          {rules.length > 0 && (
            <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
              {rules.length} Rules Active
            </Badge>
          )}
        </div>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          Real business expenses vs internal transfers
          {rulesAppliedCount > 0 && ` • ${rulesAppliedCount} expenses classified by your rules`}
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Main Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-emerald-950/40 border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Total Sales (30d)</CardDescription>
              <CardTitle className="text-3xl font-black italic text-emerald-400">{currency(summary.totalSales)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-rose-950/40 border-rose-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-rose-400">Real Expenses</CardDescription>
              <CardTitle className="text-3xl font-black italic text-rose-400">{currency(summary.totalRealExpenses)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className={summary.profitLoss >= 0 ? "bg-emerald-950/40 border-emerald-500/30" : "bg-rose-950/40 border-rose-500/30"}>
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Profit/Loss</CardDescription>
              <CardTitle className={`text-3xl font-black italic ${summary.profitLoss >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {summary.profitLoss >= 0 ? "+" : ""}{currency(summary.profitLoss)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expense Ratio</CardDescription>
              <CardTitle className={`text-3xl font-black italic ${summary.expenseRatio > 50 ? "text-rose-400" : summary.expenseRatio > 30 ? "text-amber-400" : "text-emerald-400"}`}>
                {summary.expenseRatio.toFixed(1)}%
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

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
                <div className="text-2xl font-black text-slate-400">{currency(summary.internalTransfers)}</div>
                <div className="text-[10px] text-slate-600 mt-1">{internalTransfers.length} items</div>
              </div>
              <div className="bg-rose-900/20 rounded-lg p-4 border border-rose-900/50">
                <div className="text-[10px] font-black uppercase text-rose-400 mb-1">Personal/Household</div>
                <div className="text-2xl font-black text-rose-400">{currency(summary.personal)}</div>
                <div className="text-[10px] text-rose-600 mt-1">{personalExpenses.length} items</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800 col-span-2">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Total Filtered</div>
                <div className="text-3xl font-black text-slate-400">{currency(summary.internalTransfers + summary.personal)}</div>
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
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
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
