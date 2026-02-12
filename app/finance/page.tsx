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

    // Income Statement logic
    const revenue = sales.reduce((sum, s) => sum + s.totalBeforeTax, 0); // Excluding tax for P&L
    const cogs = ledger.filter(l => l.category === 'Inventory Acquisition').reduce((sum, l) => sum + l.amount, 0);
    const operatingExpenses = Object.values(globalExpenses).reduce((a, b) => a + b, 0) +
        shops.reduce((sum, s) => sum + Object.values(s.expenses).reduce((a, b) => a + b, 0), 0);
    const netIncome = revenue - (cogs + operatingExpenses);

    // Balance Sheet logic
    const inventoryAssetValue = cogs; // Simplified: cumulative inventory cost as asset
    const cashAtHand = revenue; // Simplified
    const totalAssets = inventoryAssetValue + cashAtHand;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                    <DollarSign className="text-emerald-500" /> Financial Dashboard
                </h1>
                <p className="text-slate-400">Comprehensive overview of NIRVANA's profitability and assets.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Income Statement */}
                <Card className="glass border-emerald-500/20">
                    <CardHeader className="border-b border-slate-800 bg-emerald-500/5">
                        <CardTitle className="text-xl font-bold text-emerald-400">Income Statement</CardTitle>
                        <CardDescription>Profit & Loss breakdown (Monthly Performance)</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-slate-800">
                            <span className="text-slate-300">Total Revenue (excl. Tax)</span>
                            <span className="text-emerald-400 font-bold">${revenue.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-800">
                            <span className="text-slate-300 text-sm">Cost of Goods Sold (Shipments)</span>
                            <span className="text-rose-400 font-medium">-${cogs.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-800">
                            <span className="text-slate-300 text-sm font-bold">Gross Profit</span>
                            <span className="text-slate-100 font-bold">${(revenue - cogs).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-800">
                            <span className="text-slate-300 text-sm">Total Operating Expenses (Rent/Salary)</span>
                            <span className="text-rose-400 font-medium">-${operatingExpenses.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pt-4 mt-2">
                            <span className="text-xl font-bold text-slate-100">Net Income</span>
                            <span className={`text-2xl font-black ${netIncome >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                ${netIncome.toLocaleString()}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Balance Sheet */}
                <Card className="glass border-violet-500/20">
                    <CardHeader className="border-b border-slate-800 bg-violet-500/5">
                        <CardTitle className="text-xl font-bold text-violet-400">Balance Sheet</CardTitle>
                        <CardDescription>Current Assets & Liabilities</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pb-1 border-b border-slate-800">Assets</h3>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="text-slate-300">Inventory Valuation</span>
                            <span className="text-slate-100">${inventoryAssetValue.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="text-slate-300">Cash / Receivables</span>
                            <span className="text-slate-100">${cashAtHand.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                            <span className="text-lg font-bold text-slate-100">Total Assets</span>
                            <span className="text-lg font-bold text-violet-400">${totalAssets.toLocaleString()}</span>
                        </div>

                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest pt-6 pb-1 border-b border-slate-800">Liabilities & Equity</h3>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="text-slate-300">Operating Liabilities (Accounts Payable)</span>
                            <span className="text-slate-100">$0</span>
                        </div>
                        <div className="flex justify-between items-center text-sm py-1">
                            <span className="text-slate-300">Owner's Equity</span>
                            <span className="text-slate-100">${totalAssets.toLocaleString()}</span>
                        </div>
                    </CardContent>
                </Card>
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
