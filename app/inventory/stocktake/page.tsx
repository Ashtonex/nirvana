"use client";

import { useState, useEffect } from "react";
import { getDashboardData, recordStocktake } from "../../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Badge,
    Input
} from "@/components/ui";
import {
    ClipboardList,
    Save,
    AlertTriangle,
    CheckCircle2,
    Search,
    Store,
    ArrowRight
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function StocktakePage() {
    const [db, setDb] = useState<any>(null);
    const [selectedShop, setSelectedShop] = useState<string>("");
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const router = useRouter();

    useEffect(() => {
        getDashboardData().then(setDb);
    }, []);

    if (!db) return <div className="p-8 text-slate-500 animate-pulse uppercase font-black">Loading Manifest...</div>;

    const shops = db.shops || [];
    const shopItems = db.inventory.filter((item: any) =>
        item.allocations.some((a: any) => a.shopId === selectedShop)
    ).filter((item: any) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCountChange = (itemId: string, val: string) => {
        setCounts(prev => ({ ...prev, [itemId]: parseInt(val) || 0 }));
    };

    const handleSave = async () => {
        if (!selectedShop) return;
        setLoading(true);
        try {
            const itemsToSync = shopItems.map((item: any) => ({
                itemId: item.id,
                physicalQuantity: counts[item.id] !== undefined
                    ? counts[item.id]
                    : item.allocations.find((a: any) => a.shopId === selectedShop).quantity
            }));

            await recordStocktake({
                shopId: selectedShop,
                employeeId: "MANAGER", // Simplified
                items: itemsToSync
            });

            alert("Inventory Synchronized Successfully.");
            router.refresh();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        Stocktake Engine <ClipboardList className="h-8 w-8 text-sky-500" />
                    </h1>
                    <p className="text-slate-400 font-medium tracking-tight uppercase text-xs">Physical inventory reconciliation & shrinkage control.</p>
                </div>

                <div className="flex gap-4">
                    <select
                        className="bg-slate-900 border-2 border-slate-800 text-white rounded-lg px-4 py-2 font-black uppercase text-xs"
                        value={selectedShop}
                        onChange={(e) => setSelectedShop(e.target.value)}
                    >
                        <option value="">Select Shop for Audit</option>
                        {shops.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </div>

            {selectedShop ? (
                <div className="space-y-6">
                    <div className="flex items-center gap-4 bg-slate-950/50 p-4 border border-slate-800 rounded-xl">
                        <Search className="h-5 w-5 text-slate-500" />
                        <Input
                            placeholder="Filter by Name or Category..."
                            className="bg-transparent border-none placeholder:text-slate-600 font-bold text-slate-200"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {shopItems.map((item: any) => {
                            const alloc = item.allocations.find((a: any) => a.shopId === selectedShop);
                            const systemQty = alloc?.quantity || 0;
                            const physicalQty = counts[item.id] !== undefined ? counts[item.id] : systemQty;
                            const diff = physicalQty - systemQty;

                            return (
                                <Card key={item.id} className="bg-slate-900/40 border-slate-800 hover:border-slate-700 transition-all overflow-hidden group">
                                    <CardContent className="p-0 flex items-stretch">
                                        <div className="p-6 flex-1 space-y-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge className="bg-slate-950 text-slate-500 text-[8px] font-black uppercase">{item.category}</Badge>
                                                {diff < 0 && <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/10 text-[8px] font-black uppercase tracking-widest"><AlertTriangle className="h-2 w-2 mr-1" /> Shrinkage</Badge>}
                                                {diff > 0 && <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/10 text-[8px] font-black uppercase tracking-widest"><CheckCircle2 className="h-2 w-2 mr-1" /> Surplus</Badge>}
                                            </div>
                                            <h3 className="text-lg font-black text-white uppercase italic tracking-tight">{item.name}</h3>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">SKU: {item.id.toUpperCase()}</p>
                                        </div>

                                        <div className="bg-slate-950/50 border-l border-slate-800 p-6 flex items-center gap-8">
                                            <div className="text-right">
                                                <p className="text-[10px] font-black text-slate-500 uppercase">System</p>
                                                <p className="text-2xl font-black text-slate-300 italic font-mono">{systemQty}</p>
                                            </div>

                                            <ArrowRight className="h-4 w-4 text-slate-700" />

                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black text-sky-400 uppercase">Physical Count</p>
                                                <Input
                                                    type="number"
                                                    className="w-24 bg-slate-900 border-slate-700 text-white font-black text-lg h-10 text-center"
                                                    value={physicalQty}
                                                    onChange={(e) => handleCountChange(item.id, e.target.value)}
                                                />
                                            </div>

                                            <div className="w-20 text-center">
                                                <p className="text-[10px] font-black text-slate-500 uppercase">Delta</p>
                                                <p className={`text-xl font-black italic font-mono ${diff === 0 ? 'text-slate-600' : diff < 0 ? 'text-rose-500' : 'text-sky-500'}`}>
                                                    {diff > 0 ? '+' : ''}{diff}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button
                            className="bg-sky-600 hover:bg-sky-500 text-white font-black uppercase px-8 py-6 rounded-xl shadow-xl shadow-sky-900/20 group"
                            onClick={handleSave}
                            disabled={loading}
                        >
                            {loading ? "Reconciling..." : <>Sync Physical State <Save className="ml-2 h-5 w-5 group-hover:scale-110 transition-transform" /></>}
                        </Button>
                    </div>
                </div>
            ) : (
                <Card className="bg-slate-900/20 border-slate-800 border-dashed py-24">
                    <CardContent className="flex flex-col items-center text-center space-y-4">
                        <Store className="h-16 w-16 text-slate-700 mb-2" />
                        <h2 className="text-xl font-black text-slate-500 uppercase tracking-widest italic">Node Selection Required</h2>
                        <p className="text-slate-600 font-bold text-xs uppercase max-w-xs">Please select a shop location from the dropdown to initiate a physical stock audit.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
