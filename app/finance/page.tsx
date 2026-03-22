export const dynamic = 'force-dynamic';

import { getFinancials } from "../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui";
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    PieChart,
    LayoutGrid
} from "lucide-react";

export default async function FinancePage() {
    const { ledger, sales, globalExpenses, shops } = await getFinancials();

    // --- STRATEGIC VIEW (Inventory-Based) ---
    const revenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const cogs = ledger.filter((l: any) => l.category === 'Inventory Acquisition').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
    const operatingExpenses =
        Object.values(globalExpenses as Record<string, number>).reduce((a: number, b: number) => a + Number(b), 0) +
        shops.reduce(
            (sum: number, s: any) =>
                sum +
                Object.values(s.expenses as Record<string, number>).reduce((a: number, b: number) => a + Number(b), 0),
            0
        );
    const netIncome = revenue - (cogs + operatingExpenses);

    const inventoryAssetValue = cogs;
    const cashAtHand = revenue;
    const totalAssets = inventoryAssetValue + cashAtHand;

    // --- OPERATIONAL VIEW (POS-Based) ---
    // Revenue from final sales only
    const posRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

    // Expenses from ledger (POS expenses are Perfume, Overhead, or POS Expense)
    const posExpenses = ledger
        .filter((l: any) => ['POS Expense', 'Perfume', 'Overhead'].includes(l.category))
        .reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    // Opening balance + sales - expenses
    const posCashOpening = ledger
        .filter((l: any) => l.category === 'Cash Drawer Opening')
        .reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const posNetIncome = posRevenue - posExpenses;
    const posAvailableCash = posCashOpening + posRevenue - posExpenses;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                    <DollarSign className="text-emerald-500" /> Financial Dashboard
                </h1>
                <p className="text-slate-400">Comprehensive overview of NIRVANA's profitability and assets.</p>
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
                            <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-4">
                                <span className="text-lg font-bold text-slate-100">Total Cash in Hand</span>
                                <span className="text-lg font-bold text-sky-400">${posAvailableCash.toLocaleString()}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="bg-slate-900 shadow-xl">
                <CardHeader>
                    <CardTitle>Overhead Scaling Visualization</CardTitle>
                    <CardDescription>How monthly business costs are distributed as "Contribution" per item.</CardDescription>
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
