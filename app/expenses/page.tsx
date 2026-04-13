export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { ExpenseAuditPanel } from "@/components/ExpenseAuditPanel";

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
  isOverhead: boolean;
  isPersonal: boolean;
  hasOpsMatch: boolean;
  isAbnormal: boolean;
  reason: string;
  comparedTo: number;
};

const BUSINESS_OVERHEAD_KEYWORDS = [
  "rent", "utilities", "electric", "electricity", "water", "internet", "wifi",
  "rates", "municipal", "insurance", "security", "cleaning", "maintenance",
  "repair", "overhead", "salary", "wages", "staff", "payroll", "transport",
  "fuel", "petrol", "diesel", "delivery", "logistics"
];

const PERSONAL_KEYWORDS = [
  "personal", "抽钱", "withdrawal", "own", "my", "me", "family", "home",
  "lunch", "dinner", "breakfast", "food for home", "groceries for home",
  "car", "fuel personal", "phone personal"
];

const ABNORMAL_THRESHOLD_MULTIPLIER = 2.5;

function isBusinessOverhead(description: string, category: string): boolean {
  const text = `${description} ${category}`.toLowerCase();
  return BUSINESS_OVERHEAD_KEYWORDS.some(kw => text.includes(kw));
}

function isPersonalExpense(description: string, category: string): boolean {
  const text = `${description} ${category}`.toLowerCase();
  return PERSONAL_KEYWORDS.some(kw => text.includes(kw));
}

function detectAbnormalExpense(
  rows: ExpenseRow[],
  currentRow: ExpenseRow,
  windowDays = 30
): { isAbnormal: boolean; reason: string; comparedTo: number } {
  const currentDate = new Date(currentRow.dateStr);
  const windowStart = new Date(currentDate);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const sameCategoryRows = rows.filter(r => {
    const rDate = new Date(r.dateStr);
    return rDate >= windowStart &&
           rDate <= currentDate &&
           r.category === currentRow.category &&
           r.id !== currentRow.id;
  });

  if (sameCategoryRows.length === 0) {
    return { isAbnormal: false, reason: "No historical data for comparison", comparedTo: 0 };
  }

  const amounts = sameCategoryRows.map(r => r.amount);
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const max = Math.max(...amounts);
  const threshold = Math.max(avg * ABNORMAL_THRESHOLD_MULTIPLIER, max * 1.5);

  if (currentRow.amount > threshold) {
    return {
      isAbnormal: true,
      reason: `${currentRow.amount > avg * 3 ? "Significantly" : "Above"} average (${currency(avg)}) for this category`,
      comparedTo: avg
    };
  }

  if (currentRow.amount > 500) {
    const highValueCount = sameCategoryRows.filter(r => r.amount > 500).length;
    if (highValueCount === 0) {
      return {
        isAbnormal: true,
        reason: `High value (${currency(currentRow.amount)}) but no similar expenses in last ${windowDays} days`,
        comparedTo: avg
      };
    }
  }

  return { isAbnormal: false, reason: "", comparedTo: avg };
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

  const [posRes, opsRes, investRes] = await Promise.all([
    supabaseAdmin.from("ledger_entries").select("*").eq("type", "expense").order("date", { ascending: false }).limit(2000),
    supabaseAdmin.from("operations_ledger").select("*").lt("amount", 0).order("created_at", { ascending: false }).limit(2000),
    supabaseAdmin.from("invest_deposits").select("*").gt("withdrawn_amount", 0).order("withdrawn_at", { ascending: false }).limit(1000),
  ]);

  const posExpenseCategories = new Set(["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"]);
  const opsExpenseKinds = new Set(["overhead_payment", "stock_orders", "transport", "peer_payout", "other_expense", "rent", "utilities", "salaries", "misc"]);

  const posRows: ExpenseRow[] = (posRes.data || [])
    .filter((row: Record<string, unknown>) => posExpenseCategories.has(String(row.category || "")))
    .map((row: Record<string, unknown>) => ({
      id: `pos-${row.id}`,
      source: "POS" as const,
      amount: Math.abs(Number(row.amount || 0)),
      date: String(row.date || row.created_at || ''),
      dateStr: toLocalDateString(row.date || row.created_at),
      title: String(row.description || row.category || "POS Expense"),
      subtitle: String(row.category || "Expense"),
      shopId: String(row.shop_id || row.shopId || ""),
      category: String(row.category || "POS Expense"),
      kind: String(row.category || "POS Expense"),
      isOverhead: isBusinessOverhead(String(row.description || ""), String(row.category || "")),
      isPersonal: isPersonalExpense(String(row.description || ""), String(row.category || "")),
      hasOpsMatch: false,
      isAbnormal: false,
      reason: '',
      comparedTo: 0,
    }));

  const opsRows: ExpenseRow[] = (opsRes.data || [])
    .filter((row: Record<string, unknown>) => opsExpenseKinds.has(String(row.kind || "")))
    .map((row: Record<string, unknown>) => ({
      id: `ops-${row.id}`,
      source: "Operations" as const,
      amount: Math.abs(Number(row.amount || 0)),
      date: String(row.effective_date || row.created_at || ''),
      dateStr: toLocalDateString(row.effective_date || row.created_at),
      title: String(row.title || row.kind || "Operations Expense"),
      subtitle: String(row.kind || "Expense"),
      shopId: String(row.shop_id || ""),
      category: String(row.kind || "Expense"),
      kind: String(row.kind || "Expense"),
      isOverhead: isBusinessOverhead(String(row.title || ""), String(row.kind || "")),
      isPersonal: isPersonalExpense(String(row.title || ""), String(row.kind || "")),
      hasOpsMatch: false,
      isAbnormal: false,
      reason: '',
      comparedTo: 0,
    }));

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
    isOverhead: false,
    isPersonal: true,
    hasOpsMatch: false,
    isAbnormal: false,
    reason: '',
    comparedTo: 0,
  }));

  const allRows: ExpenseRow[] = [...posRows, ...opsRows, ...investRows];

  const abnormalAnalysis = allRows.map(row => ({
    ...row,
    ...detectAbnormalExpense(allRows, row),
  }));

  const flaggedRows = abnormalAnalysis.filter(r => r.isAbnormal);
  const businessExpenses = abnormalAnalysis.filter(r => r.isOverhead && !r.isPersonal);
  const personalExpenses = abnormalAnalysis.filter(r => r.isPersonal);
  const cleanExpenses = abnormalAnalysis.filter(r => !r.isOverhead && !r.isPersonal && !r.isAbnormal);

  const totals = {
    all: abnormalAnalysis.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
    flagged: flaggedRows.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
    business: businessExpenses.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
    personal: personalExpenses.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
  };

  const flaggedByCategory: Record<string, { count: number; total: number; items: ExpenseRow[] }> = {};
  flaggedRows.forEach((row: ExpenseRow) => {
    const key = row.category;
    if (!flaggedByCategory[key]) {
      flaggedByCategory[key] = { count: 0, total: 0, items: [] };
    }
    flaggedByCategory[key].count++;
    flaggedByCategory[key].total += row.amount;
    flaggedByCategory[key].items.push(row);
  });

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Expenses</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          POS + Operations + Invest outflows • With AI Anomaly Detection
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total 30 Days</CardDescription>
              <CardTitle className="text-2xl font-black italic text-white">{currency(totals.all)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-amber-800/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-amber-500">Flagged Abnormal</CardDescription>
              <CardTitle className="text-2xl font-black italic text-amber-400">{currency(totals.flagged)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-emerald-800/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Business Overhead</CardDescription>
              <CardTitle className="text-2xl font-black italic text-emerald-400">{currency(totals.business)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-rose-800/50">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-rose-500">Personal/Other</CardDescription>
              <CardTitle className="text-2xl font-black italic text-rose-400">{currency(totals.personal)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {flaggedRows.length > 0 && (
          <Card className="bg-gradient-to-br from-amber-950/40 to-slate-950 border-amber-800/40">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">!</Badge>
                Flagged Abnormal Expenses ({flaggedRows.length})
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">
                Expenses that exceed normal patterns for their category
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(flaggedByCategory).map(([category, data]) => (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between text-sm border-b border-amber-900/30 pb-2">
                    <span className="font-black text-amber-400 uppercase">{category}</span>
                    <span className="text-amber-300 font-mono">{data.count} items • {currency(data.total)}</span>
                  </div>
                  {data.items.map((row: ExpenseRow & { reason: string }) => (
                    <div key={row.id} className="flex items-center justify-between gap-4 rounded-lg border border-amber-900/30 bg-amber-950/20 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{row.source}</Badge>
                          {row.shopId && <Badge className="bg-slate-800/60 text-slate-400 border-slate-700">{row.shopId}</Badge>}
                          <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">ABNORMAL</Badge>
                        </div>
                        <div className="mt-2 text-sm font-black text-white">{row.title}</div>
                        <div className="text-[10px] text-amber-500/80 max-w-md">{row.reason}</div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-600 mt-1">
                          {row.dateStr}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black italic text-amber-400">{currency(row.amount)}</div>
                        <div className="text-[10px] text-slate-500">vs avg {currency(row.comparedTo)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <ExpenseAuditPanel 
          expenses={abnormalAnalysis} 
          defaultStartDate={defaultStartDate}
          defaultEndDate={defaultEndDate}
        />

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Full Expense Ledger</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              All expenses from POS, Operations, and Invest • Sorted by date
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {abnormalAnalysis.length === 0 ? (
              <div className="text-center py-12 text-slate-600 italic">No expenses recorded yet.</div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {abnormalAnalysis.map((row: ExpenseRow & { isAbnormal: boolean; reason: string }) => (
                  <div 
                    key={row.id} 
                    className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${
                      row.isAbnormal 
                        ? 'border-amber-800/50 bg-amber-950/10' 
                        : row.isPersonal 
                          ? 'border-rose-800/30 bg-rose-950/10'
                          : row.isOverhead
                            ? 'border-emerald-800/30 bg-emerald-950/10'
                            : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${row.source === 'POS' ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' : row.source === 'Operations' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-sky-500/20 text-sky-400 border-sky-500/30'}`}>
                          {row.source}
                        </Badge>
                        {row.shopId && <Badge className="bg-slate-800/60 text-slate-400 border-slate-700">{row.shopId}</Badge>}
                        {row.isOverhead && !row.isPersonal && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Business</Badge>
                        )}
                        {row.isPersonal && (
                          <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Personal</Badge>
                        )}
                        {row.isAbnormal && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">!</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-black text-white">{row.title}</div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-600">
                        {row.subtitle} • {row.dateStr}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-black italic ${
                        row.isAbnormal ? 'text-amber-400' : row.isPersonal ? 'text-rose-300' : 'text-rose-300'
                      }`}>
                        {currency(row.amount)}
                      </div>
                      {row.isAbnormal && (
                        <div className="text-[9px] text-amber-600 max-w-[150px] truncate">{row.reason}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
