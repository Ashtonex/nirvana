"use client";

import { useState, useEffect } from "react";
import { getDashboardData, recordStocktake, increaseMasterStock, reapportionStock } from "../../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
    ArrowRight,
    FileText,
    Loader2,
    Printer,
    Package,
    Plus,
    Minus,
    RefreshCw,
    LayoutGrid,
    List
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "shop" | "global";

export default function StocktakePage() {
    const [db, setDb] = useState<any>(null);
    const [selectedShop, setSelectedShop] = useState<string>("");
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>("shop");
    const [refreshKey, setRefreshKey] = useState(0);
    const [savingItem, setSavingItem] = useState<string | null>(null);
    const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

    useEffect(() => {
        getDashboardData().then(setDb).catch(() => setDb({ inventory: [], shops: [] }));
    }, [refreshKey]);

    if (!db) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 text-sky-500 animate-spin" />
            <span className="ml-4 text-slate-500 uppercase font-black tracking-widest">Loading Manifest...</span>
        </div>
    );

    const shops = db.shops || [];
    const inventory = db.inventory || [];

    // Filter for shop view - items with allocations at selected shop
    const shopItems = selectedShop 
        ? inventory.filter((item: any) => 
            item.allocations.some((a: any) => a.shopId === selectedShop)
          )
        : [];

    // Search filter
    const filterItems = (items: any[]) => {
        return items.filter((item: any) =>
            !searchTerm ||
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    };

    const filteredShopItems = filterItems(shopItems);
    
    // Split into "with stock" and "without stock"
    const itemsWithStock = filteredShopItems.filter((item: any) => {
        const alloc = item.allocations.find((a: any) => a.shopId === selectedShop);
        return (alloc?.quantity || 0) > 0;
    });
    
    const itemsWithoutStock = filteredShopItems.filter((item: any) => {
        const alloc = item.allocations.find((a: any) => a.shopId === selectedShop);
        return (alloc?.quantity || 0) === 0;
    });

    const handleCountChange = (itemId: string, val: string) => {
        setCounts(prev => ({ ...prev, [itemId]: parseInt(val) || 0 }));
        setPendingChanges(prev => new Set(prev).add(itemId));
    };

    const saveSingleItem = async (itemId: string) => {
        if (!selectedShop) return;
        setSavingItem(itemId);
        try {
            const item = shopItems.find((i: any) => i.id === itemId);
            const alloc = item?.allocations.find((a: any) => a.shopId === selectedShop);
            const systemQty = alloc?.quantity || 0;
            const physicalQty = counts[itemId] !== undefined ? counts[itemId] : systemQty;
            
            await recordStocktake({
                shopId: selectedShop,
                items: [{ itemId, physicalQuantity: physicalQty }]
            });
            
            setPendingChanges(prev => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });

            // Refresh data
            await new Promise(r => setTimeout(r, 500));
            setRefreshKey(k => k + 1);
        } catch (e) {
            console.error(e);
        } finally {
            setSavingItem(null);
        }
    };

    const generateShopPDF = async () => {
        if (!selectedShop) return;
        const shop = shops.find((s: any) => s.id === selectedShop);
        const shopName = shop?.name || selectedShop;
        
        let content = "";
        
        // Section 1: With Stock
        content += "=======================================\n";
        content += `IN STOCK - ${shopName.toUpperCase()}\n`;
        content += "=======================================\n";
        content += `Date: ${new Date().toLocaleDateString()}\n\n`;
        
        itemsWithStock.forEach((item: any, idx: number) => {
            const alloc = item.allocations.find((a: any) => a.shopId === selectedShop);
            const qty = counts[item.id] !== undefined ? counts[item.id] : (alloc?.quantity || 0);
            content += `${idx + 1}. ${item.name} | ${item.category} | Qty: ${qty}\n`;
        });
        
        content += `\nTotal In Stock: ${itemsWithStock.length} items\n\n`;
        
        // Section 2: Without Stock
        content += "=======================================\n";
        content += `OUT OF STOCK - ${shopName.toUpperCase()}\n`;
        content += "=======================================\n\n";
        
        itemsWithoutStock.forEach((item: any, idx: number) => {
            content += `${idx + 1}. ${item.name} | ${item.category} | Qty: 0\n`;
        });
        
        content += `\nTotal Out of Stock: ${itemsWithoutStock.length} items\n`;
        content += "=======================================\n";

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Stocktake_${shopName}_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const generateFullInventoryPDF = async () => {
        let content = "=======================================\n";
        content += "FULL DATABASE INVENTORY REPORT\n";
        content += "=======================================\n";
        content += `Generated: ${new Date().toLocaleString()}\n\n`;

        // Group by category
        const catMap: Record<string, boolean> = {};
        inventory.forEach((i: any) => { catMap[String(i.category || "Uncategorized")] = true; });
        const categories = Object.keys(catMap);
        
        categories.forEach((category: string) => {
            content += `\n--- ${category.toUpperCase()} ---\n`;
            const catItems = inventory.filter((i: any) => i.category === category);
            catItems.forEach((item: any) => {
                const allocs = item.allocations.map((a: any) => {
                    const shop = shops.find((s: any) => s.id === a.shopId);
                    return `${shop?.name || a.shopId}: ${a.quantity}`;
                }).join(", ");
                content += `${item.name}: [${allocs || "No stock"}]\n`;
            });
        });

        content += "\n=======================================\n";
        content += `Total Products: ${inventory.length}\n`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FullInventory_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const hasPendingChanges = pendingChanges.size > 0;

    return (
        <div className="space-y-8 pb-32 pt-8">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        Stocktake Engine <ClipboardList className="h-8 w-8 text-sky-500" />
                    </h1>
                    <p className="text-slate-400 font-medium tracking-tight uppercase text-xs">
                        Physical inventory reconciliation & shrinkage control.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-900 rounded-lg border border-slate-800 p-1">
                        <button
                            onClick={() => setViewMode("shop")}
                            className={cn(
                                "px-3 py-1 rounded text-xs font-black uppercase transition-colors",
                                viewMode === "shop" ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
                            )}
                        >
                            <Store className="h-3 w-3 inline mr-1" />
                            Per Shop
                        </button>
                        <button
                            onClick={() => setViewMode("global")}
                            className={cn(
                                "px-3 py-1 rounded text-xs font-black uppercase transition-colors",
                                viewMode === "global" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
                            )}
                        >
                            <LayoutGrid className="h-3 w-3 inline mr-1" />
                            Global DB
                        </button>
                    </div>

                    <Button 
                        onClick={generateFullInventoryPDF}
                        disabled={loading}
                        className="bg-slate-700 hover:bg-slate-600 text-white font-black uppercase text-xs"
                    >
                        <Printer className="h-4 w-4 mr-2" />
                        Full DB
                    </Button>

                    {viewMode === "shop" && (
                        <select
                            className="bg-slate-900 border-2 border-slate-800 text-white rounded-lg px-4 py-2 font-black uppercase text-xs"
                            value={selectedShop}
                            onChange={(e) => {
                                setSelectedShop(e.target.value);
                                setCounts({});
                                setPendingChanges(new Set());
                            }}
                        >
                            <option value="">Select Shop</option>
                            {shops.map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* SHOP VIEW */}
            {viewMode === "shop" && (
                <>
                    {selectedShop ? (
                        <div className="space-y-6">
                            {/* Search & Actions */}
                            <div className="flex items-center gap-4 bg-slate-950/50 p-4 border border-slate-800 rounded-xl">
                                <Search className="h-5 w-5 text-slate-500" />
                                <Input
                                    placeholder="Search by Name, Category, or SKU..."
                                    className="bg-transparent border-none placeholder:text-slate-600 font-bold text-slate-200"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <Button 
                                    onClick={generateShopPDF}
                                    disabled={loading}
                                    className="bg-violet-700 hover:bg-violet-600 text-white font-black uppercase text-xs"
                                >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Export
                                </Button>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-black text-white">{itemsWithStock.length}</div>
                                        <div className="text-[10px] uppercase text-emerald-400 font-black">In Stock</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-black text-white">{itemsWithoutStock.length}</div>
                                        <div className="text-[10px] uppercase text-rose-400 font-black">Out of Stock</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-black text-white">{filteredShopItems.length}</div>
                                        <div className="text-[10px] uppercase text-sky-400 font-black">Total Items</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-4 text-center">
                                        <div className="text-3xl font-black text-white">{pendingChanges.size}</div>
                                        <div className="text-[10px] uppercase text-amber-400 font-black">Pending</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* SECTION 1: IN STOCK */}
                            {itemsWithStock.length > 0 && (
                                <Card className="border-emerald-500/20">
                                    <CardHeader className="bg-emerald-500/10 border-b border-emerald-500/20">
                                        <CardTitle className="flex items-center gap-2 text-emerald-400">
                                            <CheckCircle2 className="h-5 w-5" />
                                            IN STOCK ({itemsWithStock.length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="divide-y divide-slate-800">
                                            {itemsWithStock.map((item: any) => {
                                                const alloc = item.allocations.find((a: any) => a.shopId === selectedShop);
                                                const systemQty = alloc?.quantity || 0;
                                                const currentQty = counts[item.id] !== undefined ? counts[item.id] : systemQty;
                                                const hasChange = pendingChanges.has(item.id);
                                                
                                                return (
                                                    <div key={item.id} className={cn(
                                                        "flex items-center gap-4 p-4 hover:bg-slate-900/30 transition-colors",
                                                        hasChange && "bg-amber-500/5"
                                                    )}>
                                                        <div className="flex-1">
                                                            <p className="font-black text-white uppercase italic">{item.name}</p>
                                                            <p className="text-[10px] text-slate-500 uppercase">{item.category}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                type="number"
                                                                className="w-20 bg-slate-900 border-slate-800 text-center font-black"
                                                                value={currentQty}
                                                                onChange={(e) => handleCountChange(item.id, e.target.value)}
                                                            />
                                                            {hasChange && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => saveSingleItem(item.id)}
                                                                    disabled={savingItem === item.id}
                                                                    className="bg-emerald-600 hover:bg-emerald-500"
                                                                >
                                                                    {savingItem === item.id ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <Save className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* SECTION 2: OUT OF STOCK */}
                            {itemsWithoutStock.length > 0 && (
                                <Card className="border-rose-500/20">
                                    <CardHeader className="bg-rose-500/10 border-b border-rose-500/20">
                                        <CardTitle className="flex items-center gap-2 text-rose-400">
                                            <AlertTriangle className="h-5 w-5" />
                                            OUT OF STOCK ({itemsWithoutStock.length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="divide-y divide-slate-800">
                                            {itemsWithoutStock.map((item: any) => (
                                                <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-slate-900/30 transition-colors opacity-60">
                                                    <div className="flex-1">
                                                        <p className="font-black text-white uppercase italic">{item.name}</p>
                                                        <p className="text-[10px] text-slate-500 uppercase">{item.category}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="number"
                                                            className="w-20 bg-slate-900 border-slate-800 text-center font-black"
                                                            placeholder="0"
                                                            value={counts[item.id] || ""}
                                                            onChange={(e) => handleCountChange(item.id, e.target.value)}
                                                        />
                                                        {pendingChanges.has(item.id) && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => saveSingleItem(item.id)}
                                                                disabled={savingItem === item.id}
                                                                className="bg-emerald-600 hover:bg-emerald-500"
                                                            >
                                                                {savingItem === item.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Plus className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {filteredShopItems.length === 0 && (
                                <Card className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-12 text-center">
                                        <Package className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                                        <p className="text-slate-500 uppercase font-black tracking-widest">
                                            {searchTerm ? "No matching items found" : "No items allocated to this shop"}
                                        </p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    ) : (
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardContent className="p-12 text-center">
                                <Store className="h-12 w-12 text-slate-700 mx-auto mb-4" />
                                <p className="text-slate-500 uppercase font-black tracking-widest">
                                    Select a shop to begin stocktake
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}

            {/* GLOBAL VIEW */}
            {viewMode === "global" && (
                <div className="space-y-6">
                    <div className="flex items-center gap-4 bg-slate-950/50 p-4 border border-slate-800 rounded-xl">
                        <Search className="h-5 w-5 text-slate-500" />
                        <Input
                            placeholder="Search entire database..."
                            className="bg-transparent border-none placeholder:text-slate-600 font-bold text-slate-200"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sky-400">
                                <LayoutGrid className="h-5 w-5" />
                                ALL PRODUCTS IN DATABASE ({filterItems(inventory).length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
                                {filterItems(inventory).map((item: any) => (
                                    <div key={item.id} className="p-4 hover:bg-slate-900/30 transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <p className="font-black text-white uppercase italic">{item.name}</p>
                                                <p className="text-[10px] text-slate-500 uppercase">{item.category} | Master: {item.quantity}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                {shops.map((shop: any) => {
                                                    const alloc = item.allocations.find((a: any) => a.shopId === shop.id);
                                                    const qty = alloc?.quantity || 0;
                                                    return (
                                                        <div 
                                                            key={shop.id} 
                                                            className={cn(
                                                                "px-2 py-1 rounded text-center min-w-[50px]",
                                                                qty > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                                                            )}
                                                            title={shop.name}
                                                        >
                                                            <div className="text-[8px] uppercase font-black">{shop.name.substring(0, 3)}</div>
                                                            <div className="text-sm font-black">{qty}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
