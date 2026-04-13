export const dynamic = 'force-dynamic';

import { getFinancials } from "../actions";
import { buildCashReconciliation } from "@/lib/cash-reconciliation";
import { getOperationsComputedBalance, getOperationsState } from "@/lib/operations";
import { supabaseAdmin } from "@/lib/supabase";
import {
   Card,
   CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui";
import {
    DollarSign,
    PieChart
} from "lucide-react";

type LedgerRow = {
    amount?: number | string | null;
    category?: string | null;
    type?: string | null;
    shop_id?: string | null;
};

type SaleRow = {
    total_before_tax?: number | string | null;
    total_with_tax?: number | string | null;
};

type ShopRow = {
    expenses?: Record<string, number | string | null> | null;
};

type InvestDepositRow = {
    amount?: number | string | null;
    withdrawn_amount?: number | string | null;
};

export default async function FinancePage() {
   const [{ ledger, sales, globalExpenses, shops }, opsComputedBalance, opsState, investDeposits] = await Promise.all([
       getFinancials(),
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
       ledger,
       sales,
       operationsActualBalance: Number((opsState as { actual_balance?: number | string | null })?.actual_balance || 0),
       operationsComputedBalance: opsComputedBalance,
       investAvailable,
   });

    // --- STRATEGIC VIEW (Inventory-Based) ---
    const revenue = sales.reduce((sum: number, s: SaleRow) => sum + Number(s.total_before_tax || 0), 0);
    const cogs = ledger.filter((l: LedgerRow) => l.category === 'Inventory Acquisition').reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0);
    const operatingExpenses =
        Object.values(globalExpenses as Record<string, number>).reduce((a: number, b: number) => a + Number(b), 0) +
        shops.reduce(
            (sum: number, s: ShopRow) =>
                sum +
                Object.values((s.expenses || {}) as Record<string, number | string | null>).reduce((a: number, b: number | string | null) => a + Number(b || 0), 0),
            0
        );
    const netIncome = revenue - (cogs + operatingExpenses);

    const inventoryAssetValue = cogs;
    const cashAtHand = revenue;
    const totalAssets = inventoryAssetValue + cashAtHand;

    // --- OPERATIONAL VIEW (POS-Based) ---
    // Revenue from final sales only
    const posRevenue = sales.reduce((sum: number, s: SaleRow) => sum + Number(s.total_with_tax || 0), 0);

    // Expenses from ledger (POS expenses are Perfume, Overhead, or POS Expense)
   const posExpenses = ledger
       .filter((l: LedgerRow) => l.shop_id && String(l.type || '').toLowerCase() === 'expense')
       .reduce((sum: number, l: LedgerRow) => sum + Number(l.amount || 0), 0);

    // Opening balance + sales - expenses
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
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                    <DollarSign className="text-emerald-500" /> Financial Dashboard
                </h1>
                <p className="text-slate-400">Comprehensive overview of NIRVANA&apos;s profitability and assets.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="text-emerald-500 h-5 w-5" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Inventory-Based Strategic View</h2>
                    </div>
                    {/* Income Statement 1 */}
                    <Card className="glass border-emerald-500/20">
                        <CardHeader className="border-b border-slate-800 bg-emerald-500/5">
                            <CardTitle className="text-xl font-bold text-emerald-400">Income Statement (Strategic)</CardTitle>
                            <CardDescription>P&L based on global inventory acquisitions</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-slate-300">Revenue (Pre-Tax)</span>
                                <span className="text-emerald-400 font-bold">${revenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-slate-300 text-sm">Cost of Goods (Acquired)</span>
                                <span className="text-rose-400 font-medium">-${cogs.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-slate-300 text-sm">Operating Overhead</span>
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
                                <span className="text-slate-300">Inventory Asset Value</span>
                                <span className="text-slate-100">${inventoryAssetValue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1">
                                <span className="text-slate-300">Projected Receivables</span>
                                <span className="text-slate-100">${cashAtHand.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-4">
                                <span className="text-lg font-bold text-slate-100">Total Assets</span>
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
                            <CardDescription>Direct cash flow performance</CardDescription>
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

           <Card className="bg-slate-900 shadow-xl">
               <CardHeader>
                   <CardTitle>Cash Reconciliation</CardTitle>
                   <CardDescription>
                       One map of where the money is sitting right now across drawers, operations, and invest.
                   </CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Expected Drawer Cash</p>
                           <p className="mt-2 text-3xl font-black text-sky-400">${cashMap.drawerExpectedCash.toLocaleString()}</p>
                           <p className="mt-2 text-xs text-slate-400">
                               Opening {cashMap.drawerOpening.toLocaleString()} + sales {cashMap.salesCash.toLocaleString()} - expenses {cashMap.drawerExpenses.toLocaleString()} - ops transfers {cashMap.postedToOperations.toLocaleString()}
                           </p>
                       </div>
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operations Vault</p>
                           <p className="mt-2 text-3xl font-black text-emerald-400">${cashMap.operationsActualBalance.toLocaleString()}</p>
                           <p className="mt-2 text-xs text-slate-400">
                               Actual vault balance. Computed ledger says {cashMap.operationsComputedBalance.toLocaleString()}.
                           </p>
                       </div>
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Invest Available</p>
                           <p className="mt-2 text-3xl font-black text-violet-400">${cashMap.investAvailable.toLocaleString()}</p>
                           <p className="mt-2 text-xs text-slate-400">
                               Perfume money moved out of drawers but still controlled by the business.
                           </p>
                       </div>
                       <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                           <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Tracked Cash</p>
                           <p className="mt-2 text-3xl font-black text-amber-300">${cashMap.totalTrackedCash.toLocaleString()}</p>
                           <p className="mt-2 text-xs text-slate-400">
                               Drawer cash + operations vault + invest available.
                           </p>
                       </div>
                   </div>

                   <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                       <p className="font-semibold text-slate-100">Why the old numbers disagreed</p>
                       <p className="mt-2">
                           Shop-level POS expenses reduce drawer cash immediately. Some of those expenses, like rent contributions, also move value into the Operations pool because each shop is contributing toward a larger monthly overhead target. Operations should only decrease when the real bulk payment is made from the vault.
                       </p>
                       <p className="mt-2">
                           Current operations delta: <span className={cashMap.operationsDelta === 0 ? "text-emerald-400" : "text-amber-300"}>${cashMap.operationsDelta.toLocaleString()}</span>
                       </p>
                   </div>
               </CardContent>
           </Card>

           <Card className="bg-slate-900 shadow-xl">
               <CardHeader>
                   <CardTitle>Overhead Scaling Visualization</CardTitle>
                   <CardDescription>How monthly business costs are distributed as &quot;Contribution&quot; per item.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="py-10 text-center text-slate-500 italic">
                        Visual metrics will appear here as you process shipments and record overheads.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
