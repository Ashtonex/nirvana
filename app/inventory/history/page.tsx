import { getInventoryHistory, getShipments } from "../../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui";
import {
    Package,
    Truck,
    Search,
    History
} from "lucide-react";

export default async function InventoryHistoryPage() {
    const inventory = await getInventoryHistory();
    const shipments = await getShipments();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                    <History className="text-violet-500" /> Inventory History
                </h1>
                <p className="text-slate-400">Track every piece of stock from sourcing to distribution.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-4">
                <Card className="glass">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-slate-500 uppercase">Total Sourced</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-100">{inventory.reduce((sum, item) => sum + item.quantity, 0)}</div>
                    </CardContent>
                </Card>
                <Card className="glass">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-slate-500 uppercase">Total Shipments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-100">{shipments.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-950/20">
                <CardHeader>
                    <CardTitle>History Log</CardTitle>
                    <CardDescription>Detailed cost breakdown for every item sourced.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-900/80">
                                <tr>
                                    <th className="px-6 py-4 font-bold">Item Name</th>
                                    <th className="px-6 py-4 font-bold">Category</th>
                                    <th className="px-6 py-4 font-bold text-center">Qty</th>
                                    <th className="px-6 py-4 font-bold text-violet-400">Provider</th>
                                    <th className="px-6 py-4 font-bold text-right">Base Cost</th>
                                    <th className="px-6 py-4 font-bold text-right text-emerald-400">Landed Cost</th>
                                    <th className="px-6 py-4 font-bold text-right text-violet-400">Overhead Contribution</th>
                                    <th className="px-6 py-4 font-bold">Added Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {inventory.map((item) => {
                                    const shipment = shipments.find(s => s.id === item.shipmentId);
                                    const supplier = shipment?.supplier || "Global Provider";
                                    return (
                                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-100">{item.name}</td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded-full border border-slate-700">
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono">{item.quantity}</td>
                                            <td className="px-6 py-4 font-bold text-violet-400 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <Truck className="h-3 w-3" /> {supplier}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">${item.acquisitionPrice.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-right text-emerald-400 font-semibold">${item.landedCost.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-right text-violet-400 font-semibold">${item.overheadContribution.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-xs text-slate-500">
                                                {new Date(item.dateAdded).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {inventory.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-20 text-center text-slate-600">
                                            No inventory records yet. Use 'Inventory Master' to add shipments.
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
