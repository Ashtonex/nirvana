import { getFinancials } from "../actions";
import { buildCashReconciliation } from "@/lib/cash-reconciliation";
import { getOperationsComputedBalance, getOperationsState } from "@/lib/operations";
import { supabaseAdmin } from "@/lib/supabase";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Input,
    Button
} from "@/components/ui";
import {
    DollarSign,
    PieChart,
    Calendar,
    ArrowRight
} from "lucide-react";
import Link from "next/link";

type LedgerRow = {
    amount?: number | string | null;
    category?: string | null;
    type?: string | null;
    shop_id?: string | null;
    date?: string | null;
};

type SaleRow = {
    total_before_tax?: number | string | null;
    total_with_tax?: number | string | null;
    quantity?: number | string | null;
    inventory_items?: { landed_cost?: number } | null;
    date?: string | null;
};

type ShopRow = {
    id: string;
    expenses?: Record<string, number | string | null> | null;
};

type InvestDepositRow = {
    amount?: number | string | null;
    withdrawn_amount?: number | string | null;
};

export default async function FinancePage(props: {
    searchParams: Promise<{ start?: string; end?: string }>
}) {
    const searchParams = await props.searchParams;
    const startDate = searchParams.start;
    const endDate = searchParams.end;

    const [{ ledger, sales, globalExpenses, shops }, opsComputedBalance, opsState, investDeposits] = await Promise.all([
        getFinancials(startDate, endDate),
        getOperationsComputedBalance().catch(() => 0),
        getOperationsState().catch(() => ({ actual_balance: 0 })),
        supabaseAdmin
            .from("invest_deposits")
            .select("amount, withdrawn_amount")
            .then(({ data }: { data: InvestDepositRow[] | null }) => data || [])
            .catch(() => []),
    ]);

    const investAvailable = (investDeposits || []).reduce(
        (sum: number, row: InvestDepositRow) => sum + Number(row.amount || 0) - Number(row.withdrawn_amount || 0),
        0
    );

    const cashMap = buildCashReconciliation({
        ledger: ledger as any,
        sales: sales as any,
        operationsActualBalance: Number((opsState as { actual_balance?: number | string | null })?.actual_balance || 0),
        operationsComputedBalance: opsComputedBalance,
        investAvailable,
    });

    // --- PRORATION LOGIC ---
    let monthsFactor = 1;
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        monthsFactor = diffDays / 30.44; // Average month length
    } else if (sales.length > 0) {
        // If no date range, but we have sales, estimate range from data
        const dates = sales.map(s => new Date(s.date || '').getTime()).filter(d => !isNaN(d));
        if (dates.length > 1) {
            const minDate = Math.min(...dates);
            const maxDate = Math.max(...dates);
            const diffDays = Math.ceil(Math.abs(maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
            monthsFactor = Math.max(1, diffDays / 30.44);
        }
    }

    // --- STRATEGIC VIEW (Sales-Based COGS) ---
    const revenue = sales.reduce((sum: number, s: SaleRow) => sum + Number(s.total_before_tax || 0), 0);
    
    // Improved COGS: Actual cost of goods sold based on landed cost
    const cogs = sales.reduce((sum: number, s: SaleRow) => {
        const qty = Number(s.quantity || 0);
        const costPerUnit = Number(s.inventory_items?.landed_cost || 0);
        return sum + (qty * costPerUnit);
    }, 0);

    const monthlyBudgetedOverhead =
        Object.values(globalExpenses as Record<string, number>).reduce((a: number, b: number) => a + Number(b), 0) +
        shops.reduce(
            (sum: number, s: ShopRow) =>
                sum +
                Object.values((s.expenses || {}) as Record<string, number | string | null>).reduce((a: number, b: number | string | null) => a + Number(b || 0), 0),
            0
        );

    const operatingExpenses = monthlyBudgetedOverhead * monthsFactor;
    const netIncome = revenue - (cogs + operatingExpenses);

    // Asset Valuation
    const inventoryAssetValue = ledger
        .filter((l: LedgerRow) => l.category === 'Inventory Acquisition')
        .reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0) - cogs;
    
    const cashAtHand = revenue;
    const totalAssets = Math.max(0, inventoryAssetValue) + cashAtHand;

    // --- OPERATIONAL VIEW (POS-Based) ---
    const posRevenue = sales.reduce((sum: number, s: SaleRow) => sum + Number(s.total_with_tax || 0), 0);

    const posExpenses = ledger
        .filter((l: LedgerRow) => l.shop_id && String(l.type || '').toLowerCase() === 'expense')
        .reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0);

    const posCashOpening = ledger
        .filter((l: LedgerRow) => l.category === 'Cash Drawer Opening')
        .reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0);

    const postedToOperations = ledger
        .filter((l: LedgerRow) => l.shop_id && l.category === 'Operations Transfer')
        .reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0);

    const posNetIncome = posRevenue - posExpenses;
    const posAvailableCash = cashMap.drawerExpectedCash;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                        <DollarSign className="text-emerald-500" /> Financial Dashboard
                    </h1>
                    <p className="text-slate-400">Comprehensive overview of NIRVANA&apos;s profitability and assets.</p>
                </div>

                <Card className="glass border-slate-700/50 p-2">
                    <form className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/50 rounded-lg border border-slate-800">
                            <Calendar className="h-4 w-4 text-slate-500" />
                            <input 
                                type="date" 
                                name="start" 
                                defaultValue={startDate}
                                className="bg-transparent border-none text-xs text-slate-200 focus:ring-0 w-28" 
                            />
                            <ArrowRight className="h-3 w-3 text-slate-600" />
                            <input 
                                type="date" 
                                name="end" 
                                defaultValue={endDate}
                                className="bg-transparent border-none text-xs text-slate-200 focus:ring-0 w-28" 
                            />
                        </div>
                        <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                            Apply
                        </Button>
                        {(startDate || endDate) && (
                            <Link href="/finance">
                                <Button type="button" variant="ghost" size="sm" className="text-xs">Reset</Button>
                            </Link>
                        )}
                    </form>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="text-emerald-500 h-5 w-5" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Inventory-Based Strategic View</h2>
                    </div>
                    {/* Income Statement 1 */}
                    <Card className="glass border-emerald-500/20 overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                            <DollarSign size={80} />
                        </div>
                        <CardHeader className="border-b border-slate-800 bg-emerald-500/5">
                            <CardTitle className="text-xl font-bold text-emerald-400">Income Statement (Strategic)</CardTitle>
                            <CardDescription>P&L based on items sold vs cost of acquisition</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-slate-300">Revenue (Pre-Tax)</span>
                                <span className="text-emerald-400 font-bold">${revenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <div>
                                    <span className="text-slate-300 text-sm">Cost of Goods Sold</span>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-tighter">Landed cost of {sales.length} items</p>
                                </div>
                                <span className="text-rose-400 font-medium">-${cogs.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <div>
                                    <span className="text-slate-300 text-sm">Operating Overhead</span>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
                                        {monthsFactor.toFixed(1)} month(s) prorated
                                    </p>
                                </div>
                                <span className="text-rose-400 font-medium">-${operatingExpenses.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-4 mt-2">
                                <span className="text-xl font-bold text-slate-100">Strategic Net</span>
                                <span className={`text-2xl font-black ${netIncome >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                    ${netIncome.toLocaleString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Balance Sheet 1 */}
                    <Card className="glass border-violet-500/20">
                        <CardHeader className="border-b border-slate-800 bg-violet-500/5">
                            <CardTitle className="text-xl font-bold text-violet-400">Balance Sheet (Assets)</CardTitle>
                            <CardDescription>Inventory & Strategic Valuation</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-slate-300">Net Inventory Value</span>
                                <span className="text-slate-100">${Math.max(0, inventoryAssetValue).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-slate-300">Total Revenue Generated</span>
                                <span className="text-slate-100">${cashAtHand.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-4">
                                <span className="text-lg font-bold text-slate-100">Total Asset Base</span>
                                <span className="text-lg font-bold text-violet-400">${totalAssets.toLocaleString()}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <PieChart className="text-blue-500 h-5 w-5" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">POS-Controlled Operational View</h2>
                    </div>
                    {/* Income Statement 2 */}
                    <Card className="glass border-blue-500/20">
                        <CardHeader className="border-b border-slate-800 bg-blue-500/5">
                            <CardTitle className="text-xl font-bold text-blue-400">Income Statement (POS)</CardTitle>
                            <CardDescription>Direct cash flow performance for period</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-slate-300">POS Sales (Inc. Tax)</span>
                                <span className="text-emerald-400 font-bold">${posRevenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-slate-300 text-sm">Direct POS Expenses</span>
                                <span className="text-rose-400 font-medium">-${posExpenses.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-4 mt-2">
                                <span className="text-xl font-bold text-slate-100">Operational Net</span>
                                <span className={`text-2xl font-black ${posNetIncome >= 0 ? 'text-blue-400' : 'text-rose-500'}`}>
                                    ${posNetIncome.toLocaleString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Balance Sheet 2 */}
                    <Card className="glass border-sky-500/20">
                        <CardHeader className="border-b border-slate-800 bg-sky-500/5">
                            <CardTitle className="text-xl font-bold text-sky-400">Balance Sheet (Cash)</CardTitle>
                            <CardDescription>Daily Liquidity Snapshot</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-slate-300">Opening Cash Balance</span>
                                <span className="text-slate-100">${posCashOpening.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-slate-300">Unrestricted Sales Revenue</span>
                                <span className="text-emerald-400">${posRevenue.toLocaleString()}</span>
                            </div>
                           <div className="flex justify-between items-center text-sm py-1">
                               <span className="text-slate-300">Cash Outflow</span>
                               <span className="text-rose-400">-${posExpenses.toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between items-center text-sm py-1">
                               <span className="text-slate-300">Posted to Operations</span>
                               <span className="text-amber-300">-${postedToOperations.toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-4">
                               <span className="text-lg font-bold text-slate-100">Expected Drawer Cash</span>
                               <span className="text-lg font-bold text-sky-400">${posAvailableCash.toLocaleString()}</span>
                           </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

           <Card className="bg-slate-900 shadow-xl border-slate-800/50">
               <CardHeader>
                   <CardTitle className="flex items-center gap-2">
                        <PieChart className="text-sky-400 h-5 w-5" />
                        Cash Reconciliation
                   </CardTitle>
                   <CardDescription>
                       Consolidated view of capital across drawers, operations vault, and investment pools.
                   </CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-16 h-16 bg-sky-500/5 rounded-bl-full group-hover:bg-sky-500/10 transition-colors" />
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Expected Drawer Cash</p>
                           <p className="mt-2 text-3xl font-black text-sky-400">${cashMap.drawerExpectedCash.toLocaleString()}</p>
                           <p className="mt-2 text-[10px] text-slate-500 leading-relaxed uppercase">
                               Opening {cashMap.drawerOpening.toLocaleString()} + sales {cashMap.salesCash.toLocaleString()} - expenses {cashMap.drawerExpenses.toLocaleString()} - ops transfers {cashMap.postedToOperations.toLocaleString()}
                           </p>
                       </div>
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full group-hover:bg-emerald-500/10 transition-colors" />
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operations Vault</p>
                           <p className="mt-2 text-3xl font-black text-emerald-400">${cashMap.operationsActualBalance.toLocaleString()}</p>
                           <p className="mt-2 text-[10px] text-slate-500 leading-relaxed uppercase">
                               Actual vault balance. Computed ledger says {cashMap.operationsComputedBalance.toLocaleString()}.
                           </p>
                       </div>
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-16 h-16 bg-violet-500/5 rounded-bl-full group-hover:bg-violet-500/10 transition-colors" />
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Invest Available</p>
                           <p className="mt-2 text-3xl font-black text-violet-400">${cashMap.investAvailable.toLocaleString()}</p>
                           <p className="mt-2 text-[10px] text-slate-500 leading-relaxed uppercase">
                               Perfume capital moved out of drawers but still held by business.
                           </p>
                       </div>
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-bl-full group-hover:bg-amber-500/10 transition-colors" />
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Tracked Cash</p>
                           <p className="mt-2 text-3xl font-black text-amber-300">${cashMap.totalTrackedCash.toLocaleString()}</p>
                           <p className="mt-2 text-[10px] text-slate-500 leading-relaxed uppercase">
                               Drawer cash + operations vault + invest available.
                           </p>
                       </div>
                   </div>

                   <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-300 border-l-4 border-l-emerald-500">
                       <p className="font-bold text-slate-100 flex items-center gap-2">
                           <PieChart className="h-4 w-4 text-emerald-500" />
                           Reconciliation Intelligence
                       </p>
                       <p className="mt-2 text-slate-400">
                           Current operations delta: <span className={cashMap.operationsDelta === 0 ? "text-emerald-400 font-bold" : "text-amber-300 font-bold"}>${cashMap.operationsDelta.toLocaleString()}</span>
                       </p>
                       <p className="mt-2 text-xs text-slate-500 leading-relaxed italic">
                           Note: The delta represents the difference between actual cash in hand and what the ledger records indicate should be present.
                       </p>
                   </div>
               </CardContent>
           </Card>

            <Card className="bg-slate-900 shadow-xl border-slate-800/50">
                <CardHeader>
                    <CardTitle>Overhead Scaling Visualization</CardTitle>
                    <CardDescription>How monthly business costs are distributed as &quot;Contribution&quot; per item.</CardDescription>
                 </CardHeader>
                 <CardContent>
                     <div className="py-12 text-center text-slate-500 italic flex flex-col items-center gap-3">
                         <div className="h-1 bg-slate-800 w-24 rounded-full" />
                         Visual metrics will appear here as you process shipments and record overheads.
                     </div>
                 </CardContent>
            </Card>
        </div>
    );
}
