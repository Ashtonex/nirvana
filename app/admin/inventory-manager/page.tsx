"use client";

import { useEffect, useState, useTransition } from "react";
import { increaseMasterStock, reapportionStock } from "../../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Input,
    Badge
} from "@/components/ui";
import {
    Package,
    Plus,
    RefreshCcw,
    Search,
    Truck,
    AlertCircle,
    LayoutGrid,
    Boxes,
    ArrowRightLeft,
    TrendingUp,
    ShieldCheck,
    X,
    FileText,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xl font-black uppercase italic tracking-tight">{title}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-500 hover:text-white">
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
        </div>
    );
};

export default function InventoryManagerPage() {
    const [db, setDb] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isPending, startTransition] = useTransition();
    const [refreshKey, setRefreshKey] = useState(0);
    const [debugInfo, setDebugInfo] = useState<string>("");

    // Modals
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isReapportionModalOpen, setIsReapportionModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<any>(null);

    // Form states
    const [adjustQty, setAdjustQty] = useState("");
    const [adjustReason, setAdjustReason] = useState("");
    const [newAllocations, setNewAllocations] = useState<Record<string, string>>({});

    const fetchDashboardData = async () => {
        try {
            // Add timestamp to bust any caches
            const timestamp = Date.now();
            const res = await fetch(`/api/dashboard/data?_=${timestamp}`, { 
                credentials: "include",
                cache: "no-store",
                headers: { 
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            });
            if (res.ok) {
                const data = await res.json();
                setDb({ inventory: data.inventory || [], shops: data.shops || [] });
            } else {
                setDb({ inventory: [], shops: [] });
            }
        } catch {
            setDb({ inventory: [], shops: [] });
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [refreshKey]);

    const refresh = () => {
        setRefreshKey(k => k + 1);
    };

    const inventory = db?.inventory || [];
    const shops = db?.shops || [];

    const filteredItems = inventory.filter((item: any) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenAdjust = (item: any) => {
        setSelectedItem(item);
        setAdjustQty("");
        setAdjustReason("");
        setIsAdjustModalOpen(true);
    };

    const handleOpenReapportion = (item: any) => {
        setSelectedItem(item);
        const currentAlloc: Record<string, string> = {};
        
        // Debug: log shop IDs and current allocations
        const debug = `Shops:\n${shops.map((s: any) => `  ${s.name}: ID="${s.id}"`).join('\n')}\n\nAllocations:\n${item.allocations.map((a: any) => `  shopId="${a.shopId}" qty=${a.quantity}`).join('\n')}`;
        console.log("[Reapportion Modal]", debug);
        setDebugInfo(debug);
        
        shops.forEach((s: any) => {
            const alloc = item.allocations.find((a: any) => a.shopId === s.id);
            currentAlloc[s.id] = String(alloc?.quantity || 0);
        });
        setNewAllocations(currentAlloc);
        setIsReapportionModalOpen(true);
    };

    const handleAdjust = async () => {
        const qty = parseInt(adjustQty);
        if (isNaN(qty) || !selectedItem) return;

        try {
            await increaseMasterStock(selectedItem.id, qty, adjustReason || "Manual adjustment via Global Inventory");
            setIsAdjustModalOpen(false);
            setRefreshKey(k => k + 1);
            setTimeout(() => fetchDashboardData(), 100);
            alert(`Master stock for ${selectedItem.name} updated.`);
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleReapportion = async () => {
        if (!selectedItem) return;

        const allocs = Object.entries(newAllocations).map(([shopId, qty]) => ({
            shopId,
            quantity: parseInt(qty) || 0
        }));

        const totalToAlloc = allocs.reduce((sum, a) => sum + a.quantity, 0);
        if (totalToAlloc > selectedItem.quantity) {
            alert(`Total allocated (${totalToAlloc}) exceeds master stock (${selectedItem.quantity})`);
            return;
        }

        try {
            console.log("[Reapportion] Starting with itemId:", selectedItem.id, "allocations:", allocs);
            console.log("[Reapportion] Available shops:", shops.map((s: any) => ({ id: s.id, name: s.name })));
            
            const response = await fetch("/api/inventory/reapportion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ itemId: selectedItem.id, allocations: allocs })
            });

            console.log("[Reapportion] Response status:", response.status);
            const data = await response.json();
            console.log("[Reapportion] Response data:", data);

            if (!response.ok) throw new Error(data.error || "Reapportion failed");

            setIsReapportionModalOpen(false);
            
            // Update local state directly with the verified allocations from server
            if (data.verifiedAllocations) {
                setDb((prevDb: any) => {
                    if (!prevDb) return prevDb;
                    return {
                        ...prevDb,
                        inventory: prevDb.inventory.map((item: any) => {
                            if (item.id === selectedItem.id) {
                                return {
                                    ...item,
                                    allocations: data.verifiedAllocations
                                };
                            }
                            return item;
                        })
                    };
                });
            }
            
            alert(`Stock reapportioned for ${selectedItem.name}.\nKipasa: ${allocs.find(a => a.shopId.toLowerCase().includes('kipasa'))?.quantity || 0}\nDub Dub: ${allocs.find(a => a.shopId.toLowerCase().includes('dub'))?.quantity || 0}\nTradecenter: ${allocs.find(a => a.shopId.toLowerCase().includes('trade'))?.quantity || 0}`);
        } catch (e: any) {
            console.error("[Reapportion] Error:", e);
            alert("Error: " + e.message);
        }
    };

    const handleDownloadPDF = async () => {
        startTransition(async () => {
            try {
                const response = await fetch("/api/inventory/low-stock-pdf");
                if (!response.ok) throw new Error("Failed to generate PDF");
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `Low_Stock_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (e: any) {
                alert(e.message);
            }
        });
    };

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="space-y-2 text-center max-w-3xl mx-auto">
                <Badge className="bg-sky-600/10 text-sky-400 border-sky-500/20 px-4 py-1 mb-4 uppercase text-[10px] font-black">
                    <ShieldCheck className="h-3 w-3 mr-2" /> Master stock scrying enabled
                </Badge>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic text-white leading-none">
                    Global Inventory
                </h1>
                <p className="text-slate-400 font-medium tracking-tight uppercase text-xs italic">
                    Central Node for Physical Count Adjustments & Multi-Shop Reapportionment.
                </p>
            </div>

            {/* DEBUG PANEL - Shows actual shop IDs and allocation counts */}
            <Card className="max-w-6xl mx-auto bg-amber-500/5 border-amber-500/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2 text-amber-400">
                        <AlertCircle className="h-4 w-4" /> Debug: Shop IDs & Allocations
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {shops.map((s: any) => {
                            const itemsWithAlloc = inventory.filter((item: any) => item.allocations?.some((a: any) => a.shopId === s.id));
                            const totalAllocQty = itemsWithAlloc.reduce((sum: number, item: any) => {
                                const alloc = item.allocations?.find((a: any) => a.shopId === s.id);
                                return sum + (alloc?.quantity || 0);
                            }, 0);
                            return (
                                <div key={s.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                                    <div className="text-lg font-black text-white">{s.name}</div>
                                    <div className="text-[10px] font-mono text-amber-400 mt-1">ID: "{s.id}"</div>
                                    <div className="text-[10px] text-emerald-400 mt-1">Items: {itemsWithAlloc.length} | Total Qty: {totalAllocQty}</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 p-3 bg-slate-900 rounded border border-slate-800">
                        <div className="text-xs font-black text-slate-400 mb-2">Sample Allocation Data (first 3 items):</div>
                        {inventory.slice(0, 3).map((item: any) => (
                            <div key={item.id} className="text-[10px] font-mono text-slate-500 mb-1">
                                {item.name}: {JSON.stringify(item.allocations)}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* CONTROLS */}
            <Card className="max-w-6xl mx-auto bg-slate-950/40 border-slate-800">
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                                <Boxes className="h-5 w-5 text-sky-500" /> Physical Counts
                            </CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase">All registered items across the network node.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                className="bg-slate-900 border-slate-800 text-[10px] font-black uppercase italic tracking-widest gap-2"
                                onClick={handleDownloadPDF}
                                disabled={isPending}
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-violet-400" />}
                                Export Low Stock
                            </Button>
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <Input
                                    placeholder="Filter items..."
                                    className="pl-9 bg-slate-900 border-slate-800 h-10 text-xs font-bold"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    <th className="px-4 py-3 font-black">Product</th>
                                    <th className="px-4 py-3 font-black">Category</th>
                                    <th className="px-4 py-3 font-black text-center">Master Count</th>
                                    <th className="px-4 py-3 font-black">Distribution</th>
                                    <th className="px-4 py-3 font-black text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filteredItems.map((item: any) => (
                                    <tr key={item.id} className="group hover:bg-slate-900/40 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-sky-500/50 transition-colors">
                                                    <Package className="h-4 w-4 text-sky-500" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-black text-white uppercase italic">{item.name}</p>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase">{item.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <Badge variant="outline" className="bg-slate-900/50 border-slate-800 text-[10px] font-black uppercase italic tracking-tighter">
                                                {item.category}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <div className={cn(
                                                "text-lg font-black italic",
                                                item.quantity <= 0 ? "text-rose-500" : "text-white"
                                            )}>
                                                {item.quantity}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex gap-2">
                                                {shops.map((s: any) => {
                                                    const alloc = item.allocations.find((a: any) => a.shopId === s.id);
                                                    const count = alloc?.quantity || 0;
                                                    return (
                                                        <div key={s.id} className="flex flex-col items-center p-1.5 rounded bg-slate-900/50 border border-slate-800 min-w-[60px]" title={`ID: ${s.id}`}>
                                                            <span className="text-[8px] font-black text-slate-500 uppercase truncate max-w-[50px]">{s.name}</span>
                                                            <span className={cn(
                                                                "text-[10px] font-black italic",
                                                                count <= 0 ? "text-rose-500/50" : "text-emerald-400"
                                                            )}>{count}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 border-slate-800 text-[10px] font-black uppercase italic hover:bg-slate-900"
                                                    onClick={() => handleOpenAdjust(item)}
                                                >
                                                    <Plus className="h-3 w-3 mr-1" /> Stock
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 border-slate-800 text-[10px] font-black uppercase italic hover:bg-slate-900"
                                                    onClick={() => handleOpenReapportion(item)}
                                                >
                                                    <ArrowRightLeft className="h-3 w-3 mr-1" /> Split
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* ADJUST MODAL */}
            <Modal
                isOpen={isAdjustModalOpen}
                onClose={() => setIsAdjustModalOpen(false)}
                title={`Adjust Master Stock: ${selectedItem?.name}`}
            >
                <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-sky-400 uppercase italic">Current Master</span>
                            <span className="text-2xl font-black italic text-white">{selectedItem?.quantity}</span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Add Units (Use negative for removal)</label>
                        <Input
                            type="number"
                            placeholder="e.g. 50"
                            className="bg-slate-950 border-slate-800 h-12 text-lg font-black italic"
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Reason for adjustment</label>
                        <Input
                            placeholder="e.g. Physical count discrepancy"
                            className="bg-slate-950 border-slate-800 h-10 text-xs font-bold"
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                        />
                    </div>
                    <Button
                        className="w-full bg-sky-600 hover:bg-sky-500 h-12 text-xs font-black uppercase italic"
                        disabled={isPending || !adjustQty}
                        onClick={handleAdjust}
                    >
                        {isPending ? "Syncing..." : "Update Network Stock"}
                    </Button>
                </div>
            </Modal>

            {/* REAPPORTION MODAL */}
            <Modal
                isOpen={isReapportionModalOpen}
                onClose={() => setIsReapportionModalOpen(false)}
                title={`Split Stock: ${selectedItem?.name}`}
            >
                <div className="space-y-6">
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-emerald-400 uppercase italic">Total Available</span>
                            <span className="text-2xl font-black italic text-white">{selectedItem?.quantity} units</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {shops.map((s: any) => (
                            <div key={s.id} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.name} <span className="text-rose-400">[ID: {s.id}]</span></label>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase italic">Current: {newAllocations[s.id] || 0}</span>
                                </div>
                                <Input
                                    type="number"
                                    className="bg-slate-950 border-slate-800 h-10 font-black italic"
                                    value={newAllocations[s.id] || ""}
                                    onChange={(e) => setNewAllocations({ ...newAllocations, [s.id]: e.target.value })}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-slate-500 uppercase">Sum of allocations</span>
                            <span className={cn(
                                "text-lg font-black italic",
                                Object.values(newAllocations).reduce((a, b) => a + (parseInt(b) || 0), 0) > (selectedItem?.quantity || 0) ? "text-rose-500" : "text-emerald-400"
                            )}>
                                {Object.values(newAllocations).reduce((a, b) => a + (parseInt(b) || 0), 0)} / {selectedItem?.quantity}
                            </span>
                        </div>
                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-500 h-12 text-xs font-black uppercase italic"
                            disabled={isPending || Object.values(newAllocations).reduce((a, b) => a + (parseInt(b) || 0), 0) > (selectedItem?.quantity || 0)}
                            onClick={handleReapportion}
                        >
                            {isPending ? "Syncing Grid..." : "Execute Reapportionment"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
