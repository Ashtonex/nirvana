export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { TrendingUp, TrendingDown, DollarSign, Calculator, Percent, ArrowRight } from "lucide-react";

function currency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toLocalDateString(date: unknown): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(String(date));
  return d.toLocaleDateString('en-CA');
}

type SummaryData = {
  period: string;
  totalSales: number;
  costOfGoods: number;
  grossProfit: number;
  grossMargin: number;
  trueOverhead: number;
  overheadFromOps: number;
  overheadFromPos: number;
  overheadDefaults: number;
  netProfit: number;
  netMargin: number;
  internalTransfers: number;
  posToOperations: number;
  posToSavings: number;
  posToInvest: number;
  stockPurchases: number;
  expenseRatio: number;
  profitPerShop: Record<string, number>;
  overheadBreakdown: Record<string, number>;
};

async function getFinancialSummary(daysBack = 30): Promise<SummaryData> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);

  const [salesRes, ledgerRes, opsLedgerRes] = await Promise.all([
    supabaseAdmin
      .from("sales")
      .select("id, shop_id, total_with_tax, subtotal, tax, date")
      .gte("date", startDate.toISOString())
      .lte("date", now.toISOString()),
    supabaseAdmin
      .from("ledger_entries")
      .select("*")
      .gte("date", startDate.toISOString())
      .lte("date", now.toISOString()),
    supabaseAdmin
      .from("operations_ledger")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", now.toISOString()),
  ]);

  const sales = salesRes.data || [];
  const ledger = ledgerRes.data || [];
  const opsLedger = opsLedgerRes.data || [];

  const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const subtotal = sales.reduce((sum: number, s: any) => sum + Number(s.subtotal || 0), 0);
  const costOfGoods = subtotal * 0.65;

  const profitPerShop: Record<string, number> = {};
  sales.forEach((s: any) => {
    const shopId = s.shop_id || "unknown";
    if (!profitPerShop[shopId]) profitPerShop[shopId] = 0;
    profitPerShop[shopId] += Number(s.total_with_tax || 0);
  });

  const INTERNAL_TRANSFER_PATTERNS = [
    "operations", "invest", "savings", "stockvel", "perfume", 
    "overhead contribution", "deposit to", "transfer to",
    "groceries to invest", "perfume invest", "blackbox", "eod"
  ];

  const TRUE_OVERHEAD_PATTERNS = [
    "rent", "utilities", "electric", "electricity", "water", "rates",
    "salary", "wages", "payroll", "internet", "wifi", "security",
    "insurance", "municipal", "transport business", "fuel business",
    "overhead", "site rent", "premises"
  ];

  const STOCK_PATTERNS = [
    "stock", "inventory", "purchases", "bulk", "wholesale",
    "restock", "supplier", "procurement", "stock orders"
  ];

  const opsOverhead = opsLedger
    .filter((row: any) => row.amount < 0)
    .filter((row: any) => {
      const text = `${row.title || ""} ${row.kind || ""}`.toLowerCase();
      return TRUE_OVERHEAD_PATTERNS.some(kw => text.includes(kw));
    })
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const posOverhead = ledger
    .filter((row: any) => row.type === "expense")
    .filter((row: any) => {
      const text = `${row.description || ""} ${row.category || ""}`.toLowerCase();
      return TRUE_OVERHEAD_PATTERNS.some(kw => text.includes(kw));
    })
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const stockPurchases = [
    ...opsLedger
      .filter((row: any) => row.amount < 0)
      .filter((row: any) => {
        const text = `${row.title || ""} ${row.kind || ""}`.toLowerCase();
        return STOCK_PATTERNS.some(kw => text.includes(kw));
      }),
    ...ledger
      .filter((row: any) => row.type === "expense")
      .filter((row: any) => {
        const text = `${row.description || ""} ${row.category || ""}`.toLowerCase();
        return STOCK_PATTERNS.some(kw => text.includes(kw));
      }),
  ].reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const internalTransfers = ledger
    .filter((row: any) => row.type === "expense")
    .filter((row: any) => {
      const text = `${row.description || ""} ${row.category || ""}`.toLowerCase();
      return INTERNAL_TRANSFER_PATTERNS.some(kw => text.includes(kw));
    })
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const posToOperations = ledger
    .filter((row: any) => row.type === "expense")
    .filter((row: any) => {
      const text = `${row.description || ""} ${row.category || ""}`.toLowerCase();
      return text.includes("operations") && !text.includes("overhead");
    })
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const posToSavings = ledger
    .filter((row: any) => row.type === "expense")
    .filter((row: any) => {
      const text = `${row.description || ""} ${row.category || ""}`.toLowerCase();
      return text.includes("savings") || text.includes("eod") || text.includes("blackbox");
    })
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const posToInvest = ledger
    .filter((row: any) => row.type === "expense")
    .filter((row: any) => {
      const text = `${row.description || ""} ${row.category || ""}`.toLowerCase();
      return text.includes("invest") || text.includes("perfume");
    })
    .reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);

  const dailyOverheadDefaults = 5000 / 30;
  const overheadDefaults = dailyOverheadDefaults * daysBack;

  const trueOverhead = opsOverhead + posOverhead + overheadDefaults;
  const grossProfit = totalSales - costOfGoods;
  const netProfit = grossProfit - trueOverhead;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
  const expenseRatio = totalSales > 0 ? (trueOverhead / totalSales) * 100 : 0;

  const overheadBreakdown: Record<string, number> = {
    "Operations Overhead": opsOverhead,
    "POS Direct Overhead": posOverhead,
    "Default Monthly (5k/mo)": overheadDefaults,
    "Stock Purchases": stockPurchases,
  };

  return {
    period: `${toLocalDateString(startDate)} to ${toLocalDateString(now)}`,
    totalSales,
    costOfGoods,
    grossProfit,
    grossMargin,
    trueOverhead,
    overheadFromOps: opsOverhead,
    overheadFromPos: posOverhead,
    overheadDefaults,
    netProfit,
    netMargin,
    internalTransfers,
    posToOperations,
    posToSavings,
    posToInvest,
    stockPurchases,
    expenseRatio,
    profitPerShop,
    overheadBreakdown,
  };
}

export default async function FinancePage() {
  let actor;
  try {
    actor = await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  const summary = await getFinancialSummary(30);
  const shops = Object.entries(summary.profitPerShop);

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Financial Intelligence</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          {summary.period}
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Main KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-emerald-950/40 border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />Total Sales
              </CardDescription>
              <CardTitle className="text-3xl font-black italic text-emerald-400">{currency(summary.totalSales)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-emerald-950/40 border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                <Calculator className="h-3 w-3" />Gross Profit
              </CardDescription>
              <CardTitle className="text-3xl font-black italic text-emerald-400">{currency(summary.grossProfit)}</CardTitle>
              <p className="text-[10px] text-emerald-500/70">{summary.grossMargin.toFixed(1)}% margin</p>
            </CardHeader>
          </Card>
          <Card className={summary.netProfit >= 0 ? "bg-emerald-950/40 border-emerald-500/30" : "bg-rose-950/40 border-rose-500/30"}>
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />Net Profit
              </CardDescription>
              <CardTitle className={`text-3xl font-black italic ${summary.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {summary.netProfit >= 0 ? "+" : ""}{currency(summary.netProfit)}
              </CardTitle>
              <p className="text-[10px] text-emerald-500/70">{summary.netMargin.toFixed(1)}% margin</p>
            </CardHeader>
          </Card>
          <Card className={summary.expenseRatio > 50 ? "bg-rose-950/40 border-rose-500/30" : summary.expenseRatio > 30 ? "bg-amber-950/40 border-amber-500/30" : "bg-emerald-950/40 border-emerald-500/30"}>
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                <Percent className="h-3 w-3" />Expense Ratio
              </CardDescription>
              <CardTitle className={`text-3xl font-black italic ${summary.expenseRatio > 50 ? "text-rose-400" : summary.expenseRatio > 30 ? "text-amber-400" : "text-emerald-400"}`}>
                {summary.expenseRatio.toFixed(1)}%
              </CardTitle>
              <p className="text-[10px] text-slate-500">Sales - Overhead</p>
            </CardHeader>
          </Card>
        </div>

        {/* What's NOT an Expense */}
        <Card className="bg-gradient-to-br from-slate-950/80 to-slate-900/80 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">FILTERED</Badge>
              Internal Transfers - NOT real expenses
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              Money moving between accounts, not leaving the business
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">POS → Operations</div>
                <div className="text-2xl font-black text-slate-400">{currency(summary.posToOperations)}</div>
                <div className="text-[10px] text-slate-600 mt-1">Overhead contributions</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">POS → Savings</div>
                <div className="text-2xl font-black text-slate-400">{currency(summary.posToSavings)}</div>
                <div className="text-[10px] text-slate-600 mt-1">EOD/Blackbox deposits</div>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-1">POS → Invest</div>
                <div className="text-2xl font-black text-slate-400">{currency(summary.posToInvest)}</div>
                <div className="text-[10px] text-slate-600 mt-1">Invest/Perfume deposits</div>
              </div>
              <div className="bg-rose-900/20 rounded-lg p-4 border border-rose-900/50">
                <div className="text-[10px] font-black uppercase text-rose-400 mb-1">Total Filtered</div>
                <div className="text-3xl font-black text-rose-400">{currency(summary.internalTransfers)}</div>
                <div className="text-[10px] text-rose-600 mt-1">NOT counted as expense</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TRUE Overhead Breakdown */}
        <Card className="bg-gradient-to-br from-amber-950/30 to-slate-950/80 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">REAL</Badge>
              TRUE Business Overhead
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase italic">
              Actual expenses that reduce profit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-sky-950/40 rounded-lg p-4 border border-sky-900/50">
                <div className="text-[10px] font-black uppercase text-sky-400 mb-1">From Operations</div>
                <div className="text-2xl font-black text-sky-400">{currency(summary.overheadFromOps)}</div>
                <div className="text-[10px] text-sky-600 mt-1">Rent, utilities, salaries</div>
              </div>
              <div className="bg-amber-950/40 rounded-lg p-4 border border-amber-900/50">
                <div className="text-[10px] font-black uppercase text-amber-400 mb-1">From POS</div>
                <div className="text-2xl font-black text-amber-400">{currency(summary.overheadFromPos)}</div>
                <div className="text-[10px] text-amber-600 mt-1">Direct overhead</div>
              </div>
              <div className="bg-violet-950/40 rounded-lg p-4 border border-violet-900/50">
                <div className="text-[10px] font-black uppercase text-violet-400 mb-1">Defaults</div>
                <div className="text-2xl font-black text-violet-400">{currency(summary.overheadDefaults)}</div>
                <div className="text-[10px] text-violet-600 mt-1">5k/month baseline</div>
              </div>
              <div className="bg-rose-950/40 rounded-lg p-4 border border-rose-900/50">
                <div className="text-[10px] font-black uppercase text-rose-400 mb-1">Stock Purchases</div>
                <div className="text-2xl font-black text-rose-400">{currency(summary.stockPurchases)}</div>
                <div className="text-[10px] text-rose-600 mt-1">Inventory restock</div>
              </div>
            </div>
            <div className="bg-emerald-950/40 rounded-lg p-4 border border-emerald-900/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase text-emerald-500">Total TRUE Overhead</div>
                  <div className="text-3xl font-black italic text-emerald-400">{currency(summary.trueOverhead)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">Net Profit</div>
                  <div className={`text-3xl font-black italic ${summary.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {summary.netProfit >= 0 ? "+" : ""}{currency(summary.netProfit)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit by Shop */}
        {shops.length > 0 && (
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Sales by Shop</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {shops.map(([shopId, sales]) => (
                  <div key={shopId} className="bg-slate-900/60 rounded-lg p-4 border border-slate-800">
                    <div className="text-[10px] font-black uppercase text-slate-500 mb-1">{shopId}</div>
                    <div className="text-2xl font-black text-white">{currency(sales)}</div>
                    <div className="text-[10px] text-slate-600 mt-1">
                      {(Number(sales) / summary.totalSales * 100).toFixed(1)}% of total
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Formula Explanation */}
        <Card className="bg-indigo-950/30 border-indigo-500/20">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase italic text-indigo-300">Profit Calculation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-black w-4">+</span>
              <span className="text-white">Total Sales:</span>
              <span className="text-emerald-400 font-mono font-black ml-auto">{currency(summary.totalSales)}</span>
            </div>
            <div className="flex items-center gap-3 pl-6 text-slate-400 text-sm">
              <span className="text-rose-400 font-black">-</span>
              <span>Cost of Goods (~65% of sales):</span>
              <span className="text-rose-400 font-mono ml-auto">{currency(summary.costOfGoods)}</span>
            </div>
            <div className="flex items-center gap-3 border-t border-slate-700 pt-3">
              <ArrowRight className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-400 font-black">Gross Profit:</span>
              <span className="text-emerald-400 font-mono font-black ml-auto">{currency(summary.grossProfit)}</span>
              <span className="text-emerald-500/70 text-sm">({summary.grossMargin.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-3 pl-6 text-slate-400 text-sm">
              <span className="text-rose-400 font-black">-</span>
              <span>TRUE Overhead:</span>
              <span className="text-rose-400 font-mono ml-auto">{currency(summary.trueOverhead)}</span>
            </div>
            <div className="flex items-center gap-3 border-t border-slate-700 pt-3">
              <ArrowRight className={`h-4 w-4 ${summary.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`} />
              <span className={`font-black ${summary.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>Net Profit:</span>
              <span className={`font-mono font-black ml-auto ${summary.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {summary.netProfit >= 0 ? "+" : ""}{currency(summary.netProfit)}
              </span>
              <span className="text-emerald-500/70 text-sm">({summary.netMargin.toFixed(1)}%)</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
