export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ExpenseRow = {
  id: string;
  source: "POS" | "Operations" | "Invest";
  amount: number;
  date: string;
  title: string;
  subtitle: string;
  shopId: string;
};

export default async function ExpensesPage() {
  try {
    await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  const [posRes, opsRes, investRes] = await Promise.all([
    supabaseAdmin.from("ledger_entries").select("*").eq("type", "expense").order("date", { ascending: false }).limit(1000),
    supabaseAdmin.from("operations_ledger").select("*").lt("amount", 0).order("created_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("invest_deposits").select("*").gt("withdrawn_amount", 0).order("withdrawn_at", { ascending: false }).limit(1000),
  ]);

  const posCategories = new Set(["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"]);
  const opsExpenseKinds = new Set(["overhead_payment", "stock_orders", "transport", "peer_payout", "other_expense", "rent", "utilities", "salaries", "misc"]);

  const posRows: ExpenseRow[] = (posRes.data || [])
    .filter((row: Record<string, unknown>) => posCategories.has(String(row.category || "")))
    .map((row: Record<string, unknown>) => ({
    id: `pos-${row.id}`,
    source: "POS",
    amount: Math.abs(Number(row.amount || 0)),
    date: row.date || row.created_at,
    title: row.description || row.category || "POS Expense",
    subtitle: row.category || "Expense",
    shopId: row.shop_id || row.shopId || "",
  }));

  const opsRows: ExpenseRow[] = (opsRes.data || [])
    .filter((row: Record<string, unknown>) => opsExpenseKinds.has(String(row.kind || "")))
    .map((row: Record<string, unknown>) => ({
    id: `ops-${row.id}`,
    source: "Operations",
    amount: Math.abs(Number(row.amount || 0)),
    date: row.effective_date || row.created_at,
    title: row.title || row.kind || "Operations Expense",
    subtitle: row.kind || "Expense",
    shopId: row.shop_id || "",
  }));

  const investRows: ExpenseRow[] = (investRes.data || []).map((row: Record<string, unknown>) => ({
    id: `invest-${row.id}`,
    source: "Invest",
    amount: Math.abs(Number(row.withdrawn_amount || 0)),
    date: row.withdrawn_at || row.deposited_at,
    title: row.withdraw_title || "Invest Withdrawal",
    subtitle: row.status || "withdrawal",
    shopId: row.shop_id || "",
  }));

  const rows: ExpenseRow[] = [...posRows, ...opsRows, ...investRows].sort((a, b) => {
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });

  const totals = {
    pos: posRows.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
    operations: opsRows.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
    invest: investRows.reduce((sum: number, row: ExpenseRow) => sum + row.amount, 0),
  };
  const grandTotal = totals.pos + totals.operations + totals.invest;

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Expenses</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          POS + Operations + Invest outflows in one place
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total</CardDescription>
              <CardTitle className="text-2xl font-black italic text-white">{currency(grandTotal)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">POS</CardDescription>
              <CardTitle className="text-2xl font-black italic text-rose-300">{currency(totals.pos)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operations</CardDescription>
              <CardTitle className="text-2xl font-black italic text-amber-300">{currency(totals.operations)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Invest</CardDescription>
              <CardTitle className="text-2xl font-black italic text-sky-300">{currency(totals.invest)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic">Expense Ledger</CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              Only expenses and withdrawals recorded from POS, Operations, and Invest pages are shown here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 ? (
              <div className="text-center py-12 text-slate-600 italic">No expenses recorded yet.</div>
            ) : (
              rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-slate-800 text-slate-200 border-slate-700">{row.source}</Badge>
                      {row.shopId ? <Badge className="bg-slate-800/60 text-slate-400 border-slate-700">{row.shopId}</Badge> : null}
                    </div>
                    <div className="mt-2 text-sm font-black text-white">{row.title}</div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                      {row.subtitle} • {row.date ? new Date(row.date).toLocaleString() : "Unknown date"}
                    </div>
                  </div>
                  <div className="text-right text-xl font-black italic text-rose-300">{currency(row.amount)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
