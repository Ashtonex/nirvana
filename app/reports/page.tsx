import { getDashboardData } from "../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui";
import {
    Download,
    Calendar,
    Filter
} from "lucide-react";

export default async function ReportsPage() {
    const db = await getDashboardData();
    const sales = db.sales;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
                    <p className="text-slate-400">Detailed breakdown of daily sales and shop performance.</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                    <Download className="h-4 w-4" /> Download CSV
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {db.shops.map(shop => {
                    const shopSales = sales.filter(s => s.shopId === shop.id);
                    const total = shopSales.reduce((sum, s) => sum + s.totalWithTax, 0);
                    return (
                        <Card key={shop.id} className="glass">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">{shop.name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">${total.toLocaleString()}</div>
                                <p className="text-xs text-slate-500 mt-1">{shopSales.length} sales today</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Sales Log</CardTitle>
                            <CardDescription>All transactions recorded today across all shops.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
                                <Calendar className="h-3 w-3" /> Today
                            </span>
                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-900 border border-slate-800 px-2 py-1 rounded">
                                <Filter className="h-3 w-3" /> Filter
                            </span>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-900/50">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Time</th>
                                    <th className="px-6 py-3 font-medium">Shop</th>
                                    <th className="px-6 py-3 font-medium">Item</th>
                                    <th className="px-6 py-3 font-medium">Qty</th>
                                    <th className="px-6 py-3 font-medium">Price</th>
                                    <th className="px-6 py-3 font-medium">Total (inc. Tax)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {sales.map((sale) => (
                                    <tr key={sale.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-4">{new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td className="px-6 py-4 capitalize">{sale.shopId}</td>
                                        <td className="px-6 py-4 font-medium text-slate-100">{sale.itemName}</td>
                                        <td className="px-6 py-4">{sale.quantity}</td>
                                        <td className="px-6 py-4">${sale.unitPrice.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-emerald-400 font-bold">${sale.totalWithTax.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {sales.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                                            No sales recorded for the selected period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
