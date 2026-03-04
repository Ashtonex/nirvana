"use client";

import React, { useState, useTransition } from "react";
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
    Plus,
    Trash2,
    Truck,
    TrendingUp,
    TrendingDown,
    Save,
    Search,
    RefreshCcw,
    AlertTriangle,
    DollarSign,
    Zap,
    Scale,
    Clock,
    Target,
    Store,
    Upload,
    FileText,
    X,
    Check,
    AlertCircle
} from "lucide-react";
import { updateGlobalExpenses, processShipment, registerInventoryItem, registerBulkInventoryItems, updateInventoryItem, deleteInventoryItem } from "../actions";

export default function InventoryMaster({ db }: { db: any }) {
    const inventory = db?.inventory || [];
    const sales = db?.sales || [];

    const TAX_RATE = 1.155; // 15.5% Tax Buffer

    // Predictive logic helper
    const getInsights = (itemId: string, currentQty: number, landedCost: number, dateAdded: string) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const relevantSales = sales.filter((s: any) => s.itemId === itemId && new Date(s.date) >= thirtyDaysAgo);
        const totalSold = relevantSales.reduce((acc: number, s: any) => acc + s.quantity, 0);
        const velocity = totalSold / 30;
        const daysToZero = velocity > 0 ? Math.floor(currentQty / velocity) : Infinity;

        // Aging & Bleed (Nirvana Logic)
        const totalGlobalOverhead = Object.values(globalExpenses).reduce((a: any, b: any) => a + Number(b), 0) as number;
        const totalInventoryPieces = inventory.reduce((sum: number, i: any) => sum + i.quantity, 0);
        const dailyBleedPerPiece = totalInventoryPieces > 0 ? (totalGlobalOverhead / 30) / totalInventoryPieces : 0;
        const daysInStock = Math.floor((new Date().getTime() - new Date(dateAdded).getTime()) / (1000 * 3600 * 24));
        const cumulativeBleed = dailyBleedPerPiece * daysInStock;

        // Suggest a price that covers Landed + Cumulative Bleed + 50% Margin + 15.5% Tax
        const suggestedPrice = (landedCost + cumulativeBleed) * 1.5 * TAX_RATE;

        return { velocity, daysToZero, totalSold, suggestedPrice, cumulativeBleed, daysInStock };
    };

    const [activeSimulation, setActiveSimulation] = useState<any>(null); // For The Oracle Modal

    const [globalExpenses, setGlobalExpenses] = useState(db?.globalExpenses || {});
    const [isPending, startTransition] = useTransition();
    const [shipment, setShipment] = useState({
        supplier: "",
        shipmentNumber: "",
        shippingCost: 0,
        dutyCost: 0,
        purchasePrice: 0,
        manifestPieces: 0
    });

    // The Oracle: Generates 5 pricing tiers for a product
    const generatePriceTiers = (landedCost: number, overheadPerPiece: number) => {
        const baseCost = landedCost + overheadPerPiece;
        const tiers = [
            { name: "Break-Even", multiplier: 1.0, color: "text-slate-400" }, // 0% Net
            { name: "Lean", multiplier: 1.15, color: "text-emerald-400" }, // 15% Net
            { name: "Standard", multiplier: 1.35, color: "text-sky-400" }, // 35% Net
            { name: "Premium", multiplier: 1.65, color: "text-violet-400" }, // 65% Net
            { name: "Oracle", multiplier: 2.0, color: "text-amber-400" }, // 100% Net
        ];

        return tiers.map(tier => {
            const sellingPrice = baseCost * tier.multiplier * TAX_RATE;
            const netProfit = (baseCost * tier.multiplier) - baseCost; // Excludes tax from profit calc
            return {
                ...tier,
                price: sellingPrice,
                netProfit
            };
        });
    };

    const [items, setItems] = useState([
        { name: "", category: "", quantity: 1, acquisitionPrice: 0, unitPurchasePrice: 0, showOracle: false }
    ]);

    const [showAdHoc, setShowAdHoc] = useState(false);
    const [adHocItem, setAdHocItem] = useState({ name: "", category: "", quantity: 0, acquisitionPrice: 0, landedCost: 0 });

    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [bulkShops, setBulkShops] = useState<string[]>([]);
    const [bulkLandedCostMethod, setBulkLandedCostMethod] = useState<'flat' | 'auto'>('flat');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkParsedData, setBulkParsedData] = useState<Array<{ name: string; category: string; quantity: number; price: number }>>([]);
    const [bulkError, setBulkError] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const handleRegisterAdHoc = () => {
        startTransition(async () => {
            await registerInventoryItem(adHocItem);
            setShowAdHoc(false);
            setAdHocItem({ name: "", category: "", quantity: 0, acquisitionPrice: 0, landedCost: 0 });
        });
    };

    const parseCSV = (text: string): Array<{ name: string; category: string; quantity: number; price: number }> => {
        const lines = text.trim().split('\n');
        const results: Array<{ name: string; category: string; quantity: number; price: number }> = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 4) {
                const name = parts[0];
                const category = parts[1];
                const quantity = parseInt(parts[2]);
                const price = parseFloat(parts[3]);
                
                if (name && category && !isNaN(quantity) && !isNaN(price)) {
                    results.push({ name, category, quantity, price });
                }
            }
        }
        
        return results;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setBulkFile(file);
        setBulkError("");
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const parsed = parseCSV(text);
            
            if (parsed.length === 0) {
                setBulkError("No valid items found in CSV. Expected format: name,category,quantity,price");
                setBulkParsedData([]);
            } else {
                setBulkParsedData(parsed);
            }
        };
        reader.readAsText(file);
    };

    const handleBulkUpload = () => {
        if (bulkShops.length === 0) {
            setBulkError("Please select at least one shop");
            return;
        }
        
        if (bulkParsedData.length === 0) {
            setBulkError("Please upload a valid CSV file");
            return;
        }
        
        setIsUploading(true);
        startTransition(async () => {
            await registerBulkInventoryItems(bulkParsedData, bulkShops, bulkLandedCostMethod, globalExpenses);
            setShowBulkUpload(false);
            setBulkFile(null);
            setBulkParsedData([]);
            setBulkShops([]);
            setBulkError("");
            setIsUploading(false);
            alert(`Successfully added ${bulkParsedData.length} items to inventory!`);
        });
    };

    const toggleShop = (shopId: string) => {
        if (bulkShops.includes(shopId)) {
            setBulkShops(bulkShops.filter(s => s !== shopId));
        } else {
            setBulkShops([...bulkShops, shopId]);
        }
    };

    const [selectedShopId, setSelectedShopId] = useState(db.shops[0]?.id || "");
    const [localShopExpenses, setLocalShopExpenses] = useState(db.shops[0]?.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 });

    const itemsTotal = items.reduce((sum, item) => sum + (Number(item.acquisitionPrice) || 0), 0);
    const allocatedPieces = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    const handleGlobalExpenseChange = (key: string, value: string) => {
        setGlobalExpenses({ ...globalExpenses, [key]: parseFloat(value) || 0 });
    };

    const saveGlobalExpenses = () => {
        startTransition(async () => {
            await updateGlobalExpenses(globalExpenses);
            alert("Global expenses updated!");
        });
    };

    const addItemToShipment = () => {
        setItems([...items, { name: "", category: "", quantity: 1, acquisitionPrice: 0, unitPurchasePrice: 0, showOracle: false }]);
    };

    const removeItemFromShipment = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...items];
        const item = { ...newItems[index], [field]: value };

        const q = Number(item.quantity) || 0;
        const up = Number(item.unitPurchasePrice) || 0;
        const ap = Number(item.acquisitionPrice) || 0;

        if (field === 'quantity' || field === 'unitPurchasePrice') {
            item.acquisitionPrice = q * up;
        } else if (field === 'acquisitionPrice') {
            item.unitPurchasePrice = q > 0 ? ap / q : 0;
        }

        item.quantity = Number(item.quantity) || 0;
        item.acquisitionPrice = Number(item.acquisitionPrice) || 0;
        item.unitPurchasePrice = Number(item.unitPurchasePrice) || 0;

        newItems[index] = item;
        setItems(newItems);
    };

    const handleProcessShipment = () => {
        startTransition(async () => {
            await processShipment({
                ...shipment,
                miscCost: 0,
                items
            });
            setShipment({ supplier: "", shipmentNumber: "", shippingCost: 0, dutyCost: 0, purchasePrice: 0, manifestPieces: 0 });
            setItems([{ name: "", category: "", quantity: 1, acquisitionPrice: 0, unitPurchasePrice: 0, showOracle: false }]);
            alert("Shipment processed successfully!");
        });
    };

    return (
        <div className="space-y-8 pb-32">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-4xl font-black tracking-tighter text-slate-100 uppercase italic flex items-center gap-3">
                        <Truck className="text-violet-500 h-7 w-7 sm:h-10 sm:w-10" /> Inventory Master
                    </h1>
                    <p className="text-slate-400 font-medium tracking-tight uppercase text-xs font-black">Central source of truth for global distribution and inventory reconciliation.</p>
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-12">
                {/* Main Content Area */}
                <div className="md:col-span-8 space-y-8">
                    {/* Integrated Manifest & Ad-Hoc Section */}
                    <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-violet-600 group-hover:bg-emerald-500 transition-colors" />
                        <CardHeader className="border-b border-slate-800/50">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase italic text-white">
                                        <Truck className="h-6 w-6 text-violet-400" /> Manifest & Ad-Hoc Acquisition
                                    </CardTitle>
                                    <CardDescription className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                                        Ref #{shipment.shipmentNumber || "---"} | {shipment.manifestPieces || allocatedPieces} Pieces Expected
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        onClick={() => setShowBulkUpload(!showBulkUpload)}
                                        className={`font-black uppercase italic text-xs tracking-widest px-4 h-10 border-2 transition-all flex items-center gap-2 ${showBulkUpload ? 'bg-violet-500/20 text-violet-500 border-violet-500/50' : 'bg-violet-500/10 text-violet-400 border-violet-500/30'}`}
                                    >
                                        <Upload className="h-4 w-4" />
                                        {showBulkUpload ? "Close" : "Bulk CSV"}
                                    </Button>
                                    <Button
                                        onClick={() => setShowAdHoc(!showAdHoc)}
                                        className={`font-black uppercase italic text-xs tracking-widest px-6 h-10 border-2 transition-all ${showAdHoc ? 'bg-rose-500/20 text-rose-500 border-rose-500/50' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}
                                    >
                                        {showAdHoc ? "Close Ad-Hoc" : "Direct Ad-Hoc Add"}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-8 space-y-10">
                            {showAdHoc && (
                                <div className="p-8 rounded-3xl bg-emerald-500/5 border-2 border-emerald-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <h3 className="text-emerald-400 font-black uppercase italic tracking-widest text-sm mb-6 flex items-center gap-2">
                                        <Plus className="h-5 w-5 animate-pulse" /> Instant Ledger Registration
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Product Name</label>
                                            <Input
                                                className="bg-slate-950 border-slate-800 text-white font-bold h-12"
                                                placeholder="e.g. iPhone 15 Pro"
                                                value={adHocItem.name}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</label>
                                            <Input
                                                className="bg-slate-950 border-slate-800 text-white font-bold h-12"
                                                placeholder="Mobile"
                                                value={adHocItem.category}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, category: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                                            <Input
                                                type="number"
                                                className="bg-slate-950 border-slate-800 text-emerald-400 font-black h-12"
                                                value={adHocItem.quantity}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, quantity: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Landed ($)</label>
                                            <Input
                                                type="number"
                                                className="bg-slate-950 border-slate-800 text-emerald-400 font-black h-12"
                                                value={adHocItem.landedCost}
                                                onChange={(e) => setAdHocItem({ ...adHocItem, landedCost: Number(e.target.value), acquisitionPrice: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        onClick={handleRegisterAdHoc}
                                        disabled={isPending || !adHocItem.name}
                                        className="w-full mt-8 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase italic tracking-widest rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
                                    >
                                        Commit Ad-Hoc Item to master ledger
                                    </Button>
                                </div>
                            )}

                            {showBulkUpload && (
                                <div className="p-8 rounded-3xl bg-violet-500/5 border-2 border-violet-500/20 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <h3 className="text-violet-400 font-black uppercase italic tracking-widest text-sm mb-6 flex items-center gap-2">
                                        <Upload className="h-5 w-5 animate-pulse" /> Bulk CSV Import
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Shops</label>
                                            <div className="flex flex-wrap gap-2">
                                                {db.shops.map((shop: any) => (
                                                    <button
                                                        key={shop.id}
                                                        onClick={() => toggleShop(shop.id)}
                                                        className={`px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${
                                                            bulkShops.includes(shop.id)
                                                                ? 'bg-violet-500/20 border-violet-500 text-violet-400'
                                                                : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                        }`}
                                                    >
                                                        {shop.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Landed Cost Method</label>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setBulkLandedCostMethod('flat')}
                                                    className={`flex-1 px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${
                                                        bulkLandedCostMethod === 'flat'
                                                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                    }`}
                                                >
                                                    Flat Rate
                                                </button>
                                                <button
                                                    onClick={() => setBulkLandedCostMethod('auto')}
                                                    className={`flex-1 px-4 py-2 rounded-lg border-2 font-black uppercase text-xs tracking-widest transition-all ${
                                                        bulkLandedCostMethod === 'auto'
                                                            ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                                                    }`}
                                                >
                                                    Auto-Calculate
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-500">
                                                {bulkLandedCostMethod === 'flat' 
                                                    ? 'Uses price column as landed cost directly'
                                                    : 'Adds overhead fraction to price based on monthly expenses'
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Upload CSV File</label>
                                        <div className="border-2 border-dashed border-slate-800 rounded-xl p-6 text-center hover:border-violet-500/50 transition-colors">
                                            <input
                                                type="file"
                                                accept=".csv"
                                                onChange={handleFileChange}
                                                className="hidden"
                                                id="bulk-csv-upload"
                                            />
                                            <label htmlFor="bulk-csv-upload" className="cursor-pointer">
                                                <FileText className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                                                <p className="text-sm font-black text-slate-400">
                                                    {bulkFile ? bulkFile.name : "Click to upload CSV"}
                                                </p>
                                                <p className="text-[10px] text-slate-600 mt-1">
                                                    Format: name, category, quantity, price
                                                </p>
                                            </label>
                                        </div>
                                    </div>

                                    {bulkError && (
                                        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-rose-500" />
                                            <p className="text-xs font-black text-rose-500">{bulkError}</p>
                                        </div>
                                    )}

                                    {bulkParsedData.length > 0 && (
                                        <div className="mt-6 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                    Preview ({bulkParsedData.length} items)
                                                </label>
                                                <button
                                                    onClick={() => { setBulkParsedData([]); setBulkFile(null); }}
                                                    className="text-[10px] text-slate-500 hover:text-rose-500"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-lg">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-950 sticky top-0">
                                                        <tr>
                                                            <th className="text-left p-2 font-black text-slate-500 uppercase">Name</th>
                                                            <th className="text-left p-2 font-black text-slate-500 uppercase">Category</th>
                                                            <th className="text-right p-2 font-black text-slate-500 uppercase">Qty</th>
                                                            <th className="text-right p-2 font-black text-slate-500 uppercase">Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800">
                                                        {bulkParsedData.map((item, idx) => (
                                                            <tr key={idx} className="hover:bg-slate-800/30">
                                                                <td className="p-2 font-bold text-slate-300">{item.name}</td>
                                                                <td className="p-2 text-slate-400">{item.category}</td>
                                                                <td className="p-2 text-right font-black text-emerald-400">{item.quantity}</td>
                                                                <td className="p-2 text-right font-black text-slate-300">${item.price.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleBulkUpload}
                                        disabled={isPending || isUploading || bulkParsedData.length === 0 || bulkShops.length === 0}
                                        className="w-full mt-6 h-14 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase italic tracking-widest rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.2)] transition-all disabled:opacity-50"
                                    >
                                        {isUploading ? (
                                            <>Processing...</>
                                        ) : (
                                            <>
                                                <Check className="h-5 w-5 mr-2" /> Commit {bulkParsedData.length} Items to Inventory
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] border-b border-slate-800 pb-2">Logistics & Totals</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Supplier</label>
                                        <Input placeholder="Vendor" value={shipment.supplier} onChange={e => setShipment({ ...shipment, supplier: e.target.value })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Ref #</label>
                                        <Input placeholder="ID" value={shipment.shipmentNumber} onChange={e => setShipment({ ...shipment, shipmentNumber: e.target.value })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                    <div className="space-y-2 text-sky-400">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Manifest Pieces</label>
                                        <Input type="number" value={shipment.manifestPieces} onChange={e => setShipment({ ...shipment, manifestPieces: parseInt(e.target.value) || 0 })} className="h-10 bg-slate-950 border-sky-900/40 font-black text-lg" />
                                    </div>
                                    <div className="space-y-2 text-emerald-400">
                                        <label className="text-[10px] font-black text-slate-400 uppercase">Goods Cost</label>
                                        <Input type="number" value={shipment.purchasePrice} onChange={e => setShipment({ ...shipment, purchasePrice: parseFloat(e.target.value) || 0 })} className="h-10 bg-slate-950 border-emerald-900/40 font-black text-lg" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Shipping Fees</label>
                                        <Input type="number" value={shipment.shippingCost} onChange={e => setShipment({ ...shipment, shippingCost: parseFloat(e.target.value) || 0 })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase">Duty Costs</label>
                                        <Input type="number" value={shipment.dutyCost} onChange={e => setShipment({ ...shipment, dutyCost: parseFloat(e.target.value) || 0 })} className="h-10 bg-slate-950 border-slate-850" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 pt-6 border-t border-slate-800">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black text-violet-500 uppercase tracking-[0.3em]">Product Class Breakdown</h3>
                                    <Button size="sm" variant="outline" onClick={addItemToShipment} className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 h-9 text-[10px] font-black uppercase tracking-widest px-6">
                                        <Plus className="h-4 w-4 mr-2" /> Add Class
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    {items.map((item, idx) => {
                                        const logisticsBasis = shipment.manifestPieces > 0 ? shipment.manifestPieces : allocatedPieces;
                                        const totalLogistics = shipment.shippingCost + shipment.dutyCost;
                                        const feePerPiece = logisticsBasis > 0 ? totalLogistics / logisticsBasis : 0;
                                        const unitAcquisition = item.quantity > 0 ? item.acquisitionPrice / item.quantity : 0;
                                        const landedUnitCost = unitAcquisition + feePerPiece;

                                        const totalGlobalOverhead = Object.values(globalExpenses).reduce((a: any, b: any) => a + Number(b), 0) as number;
                                        const globalDailyBurn = totalGlobalOverhead / 30;
                                        const overheadPerPiece = logisticsBasis > 0 ? globalDailyBurn / logisticsBasis : 0;

                                        const tiers = generatePriceTiers(landedUnitCost, overheadPerPiece);

                                        return (
                                            <div key={idx} className="space-y-4 bg-slate-950/40 p-6 rounded-2xl border border-slate-800/50 relative group/item">
                                                <div className="grid grid-cols-12 gap-4 items-end">
                                                    <div className="col-span-4 space-y-2">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Name</label>
                                                        <Input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} className="h-10 bg-slate-900 border-slate-800" />
                                                    </div>
                                                    <div className="col-span-2 space-y-2">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Qty</label>
                                                        <Input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)} className="h-10 bg-slate-900 border-slate-800 text-center font-bold" />
                                                    </div>
                                                    <div className="col-span-3 space-y-2 text-emerald-400">
                                                        <label className="text-[10px] font-black text-slate-500 uppercase text-xs">Total Class Cost</label>
                                                        <Input type="number" value={item.acquisitionPrice} onChange={e => updateItem(idx, 'acquisitionPrice', parseFloat(e.target.value) || 0)} className="h-10 bg-slate-900 border-emerald-900/30 font-black" />
                                                    </div>
                                                    <div className="col-span-3 space-y-1 text-center">
                                                        <div className="text-[9px] font-black text-slate-600 uppercase mb-1">Unit Landed</div>
                                                        <div className="text-sm font-black text-white italic">${landedUnitCost.toFixed(2)}</div>
                                                    </div>

                                                    <div className="col-span-12">
                                                        <button
                                                            onClick={() => updateItem(idx, 'showOracle', !(item as any).showOracle)}
                                                            className="w-full flex items-center justify-center gap-2 py-2 border-t border-b border-slate-800/50 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 hover:text-violet-300 hover:bg-violet-500/5 transition-all mt-2 group-hover/item:border-violet-500/20"
                                                        >
                                                            <Zap className={`h-3 w-3 ${(item as any).showOracle ? 'text-emerald-400' : 'text-violet-400'}`} />
                                                            {(item as any).showOracle ? 'Hide Predictions' : 'Ask The Oracle'}
                                                        </button>

                                                        <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${(item as any).showOracle ? 'max-h-[200px] opacity-100 mt-4' : 'max-h-0 opacity-0'
                                                            }`}>
                                                            <div className="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest text-center">Oracle Pricing Intelligence</div>
                                                            <div className="grid grid-cols-5 gap-2">
                                                                {tiers.map((tier) => (
                                                                    <button
                                                                        key={tier.name}
                                                                        onClick={() => setActiveSimulation({ ...tier, item, landedUnitCost, overheadPerPiece, taxRate: TAX_RATE })}
                                                                        className={`p-2 rounded-lg border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all text-center group/tier relative overflow-hidden active:scale-95`}
                                                                    >
                                                                        <div className={`text-[9px] font-black uppercase mb-1 ${tier.color}`}>{tier.name}</div>
                                                                        <div className="text-sm font-bold text-slate-300 group-hover/tier:text-white transition-colors">${tier.price.toFixed(2)}</div>
                                                                        <div className={`text-[9px] font-black mt-1 ${tier.netProfit > 0 ? 'text-emerald-500' : 'text-slate-600'}`}>
                                                                            {((tier.netProfit / tier.price) * 100).toFixed(0)}% Net
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="absolute top-2 right-2">
                                                        <button onClick={() => removeItemFromShipment(idx)} className="text-slate-800 hover:text-rose-500 p-2 transition-colors">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <Button
                                className="w-full h-16 bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 font-black text-sm uppercase italic tracking-[0.2em] rounded-xl shadow-2xl hover:scale-[1.01] transition-all"
                                onClick={handleProcessShipment}
                                disabled={isPending || items.length === 0}
                            >
                                Process Global Manifest & Synchronize ledger
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Current Stock Intelligence */}
                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md shadow-2xl overflow-hidden">
                        <CardHeader className="border-b border-slate-800/50 pb-6">
                            <CardTitle className="text-2xl font-black uppercase italic flex items-center gap-3">
                                <Zap className="h-6 w-6 text-yellow-500 animate-pulse" /> Live Master ledger inventory
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-800">
                                {inventory.map((item: any) => {
                                    const insights = getInsights(item.id, item.quantity, item.landedCost, item.dateAdded);
                                    return (
                                        <div key={item.id} className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all">
                                            <div className="flex items-center gap-6">
                                                <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-violet-500/40 transition-colors">
                                                    <Target className="h-6 w-6 text-slate-500 group-hover:text-violet-400" />
                                                </div>
                                                <div>
                                                    <p className="text-lg font-black uppercase tracking-tight text-white">{item.name}</p>
                                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{item.sku} | {item.category} | Stock Age: {insights.daysInStock}d</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-8 items-center">
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Bleed / Pc</p>
                                                    <p className="text-xs font-black text-rose-500/80 italic">${insights.cumulativeBleed.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-violet-500 uppercase mb-1">Target Price</p>
                                                    <p className="text-lg font-black text-violet-400 italic">${insights.suggestedPrice.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right min-w-[70px]">
                                                    <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Velocity</p>
                                                    <p className="text-sm font-black text-emerald-400 italic">{insights.velocity.toFixed(2)}/d</p>
                                                </div>
                                                <div className="flex items-center gap-3 ml-4 pl-4 border-l border-slate-800">
                                                    <button
                                                        onClick={() => {
                                                            const newName = prompt("Update Product Name:", item.name);
                                                            const newQty = prompt("Override Total Quantity:", item.quantity);
                                                            if (newName && newQty) {
                                                                startTransition(() => updateInventoryItem(item.id, { name: newName, quantity: Number(newQty) }));
                                                            }
                                                        }}
                                                        title="Quick Edit Ledger Entry"
                                                        className="p-2 rounded-lg bg-slate-900 text-slate-500 hover:text-sky-400 transition-colors border border-slate-800"
                                                    >
                                                        <Save className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`CRITICAL: Purge ${item.name} from Master Ledger? This action is IRREVERSIBLE.`)) {
                                                                startTransition(() => deleteInventoryItem(item.id));
                                                            }
                                                        }}
                                                        title="Purge Entry"
                                                        className="p-2 rounded-lg bg-slate-900 text-slate-500 hover:text-rose-500 transition-colors border border-slate-800"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar area */}
                <div className="md:col-span-4 space-y-8">
                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-emerald-400 flex items-center gap-2">
                                <Store className="h-4 w-4" /> Shop Overheads reconciliation
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Distribution Point</label>
                                <select
                                    className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 text-sm font-black text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none"
                                    value={selectedShopId}
                                    onChange={(e) => {
                                        const sid = e.target.value;
                                        setSelectedShopId(sid);
                                        const shop = db.shops.find((s: any) => s.id === sid);
                                        if (shop) setLocalShopExpenses(shop.expenses);
                                    }}
                                >
                                    {db.shops.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(localShopExpenses).map(([key, val]) => (
                                    <div key={key} className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{key}</label>
                                        <Input
                                            type="number"
                                            value={Number(val)}
                                            onChange={e => setLocalShopExpenses({ ...localShopExpenses, [key]: parseFloat(e.target.value) || 0 })}
                                            className="h-9 bg-slate-950 border-slate-800 text-xs font-black text-emerald-400"
                                        />
                                    </div>
                                ))}
                            </div>

                            <Button
                                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-lg transition-all"
                                onClick={() => {
                                    startTransition(async () => {
                                        const { updateShopExpenses } = await import("../actions");
                                        await updateShopExpenses(selectedShopId, localShopExpenses);
                                        alert("Shop expenses reconciled successfully.");
                                    });
                                }}
                                disabled={isPending}
                            >
                                <Save className="h-4 w-4 mr-2" /> Commit adjustments
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-sky-400 flex items-center gap-2">
                                <DollarSign className="h-4 w-4" /> Global admin costs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="max-h-[300px] overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                                {Object.entries(globalExpenses).map(([key, val]) => (
                                    <div key={key} className="space-y-2 group/expense relative">
                                        <div className="flex justify-between items-center pr-8">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{key}</label>
                                            <button
                                                onClick={() => {
                                                    const newExp = { ...globalExpenses };
                                                    delete newExp[key];
                                                    setGlobalExpenses(newExp);
                                                }}
                                                className="absolute right-0 top-6 opacity-0 group-hover/expense:opacity-100 text-slate-700 hover:text-rose-500 transition-all"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <Input
                                            type="number"
                                            value={String(val || 0)}
                                            onChange={(e) => handleGlobalExpenseChange(key, e.target.value)}
                                            className="h-10 bg-slate-950 border-slate-800 font-black text-sky-400"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-slate-800 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="EXPENSE NAME"
                                        className="h-10 bg-slate-900 border-slate-800 text-[10px] font-black uppercase tracking-widest"
                                        id="new-expense-name"
                                    />
                                    <Input
                                        type="number"
                                        placeholder="$0.00"
                                        className="h-10 bg-slate-900 border-slate-800 text-[10px] font-black uppercase"
                                        id="new-expense-val"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full h-10 border-sky-900/40 text-sky-500 hover:bg-sky-500/5 text-[9px] font-black uppercase tracking-[0.2em]"
                                    onClick={() => {
                                        const nameInput = document.getElementById('new-expense-name') as HTMLInputElement;
                                        const valInput = document.getElementById('new-expense-val') as HTMLInputElement;
                                        if (nameInput.value) {
                                            setGlobalExpenses({
                                                ...globalExpenses,
                                                [nameInput.value.toUpperCase()]: parseFloat(valInput.value) || 0
                                            });
                                            nameInput.value = "";
                                            valInput.value = "";
                                        }
                                    }}
                                >
                                    <Plus className="h-3 w-3 mr-2" /> Add overhead line
                                </Button>
                                <Button
                                    className="w-full h-12 bg-sky-600 hover:bg-sky-500 text-white font-black uppercase italic tracking-widest rounded-xl mt-2"
                                    onClick={saveGlobalExpenses}
                                    disabled={isPending}
                                >
                                    <RefreshCcw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} /> Synchronize admin rates
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2 overflow-hidden shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-emerald-400 flex items-center gap-2">
                                <Scale className="h-4 w-4" /> inventory burn priority
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            {db.shops.map((shop: any) => {
                                const totalExp = Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0);
                                const totalGlobalExp = db.shops.reduce((sum: number, s: any) => sum + Object.values(s.expenses).reduce((a: number, b: any) => a + Number(b), 0), 0);
                                const ratio = totalGlobalExp > 0 ? (totalExp / totalGlobalExp) * 100 : 0;
                                return (
                                    <div key={shop.id} className="space-y-2">
                                        <div className="flex justify-between text-[11px] font-black uppercase tracking-tight">
                                            <span className="text-slate-400">{shop.name}</span>
                                            <span className="text-emerald-500">{ratio.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                                            <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" style={{ width: `${ratio}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* The Oracle Simulation Modal */}
            {activeSimulation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 ease-out">
                        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-violet-600/20 rounded-2xl border border-violet-500/50">
                                    <Zap className="h-8 w-8 text-violet-400 animate-pulse" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black italic text-white flex items-center gap-2 tracking-tighter uppercase">
                                        THE ORACLE PROJECTION
                                    </h2>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.3em] mt-1">Simulating yield for: {activeSimulation.item.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setActiveSimulation(null)} className="p-4 rounded-2xl hover:bg-white/5 transition-all group">
                                <Plus className="h-10 w-10 text-slate-500 group-hover:text-white rotate-45" />
                            </button>
                        </div>

                        <div className="p-12 grid grid-cols-2 gap-16">
                            {/* Forecasted Yield */}
                            <div className="space-y-8">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] border-b border-slate-800 pb-3 flex items-center gap-2">
                                    <TrendingUp className="h-3 w-3" /> Predicted Income Statement
                                </h3>
                                <div className="space-y-5">
                                    <div className="flex justify-between items-end">
                                        <span className="text-slate-500 font-black uppercase text-[10px] tracking-widest pb-1">Forecasted Revenue</span>
                                        <span className="font-black text-white text-3xl italic tracking-tighter">${(activeSimulation.price * activeSimulation.item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 font-bold text-xs uppercase">Landed Acquisition Cost</span>
                                        <span className="font-bold text-rose-500/80">-${(activeSimulation.landedUnitCost * activeSimulation.item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 font-bold text-xs uppercase">Assigned Overhead Burn</span>
                                        <span className="font-bold text-amber-500/80">-${(activeSimulation.overheadPerPiece * activeSimulation.item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-slate-800/50 pb-5">
                                        <span className="text-slate-500 font-bold text-xs uppercase">Tax Liability Allocation</span>
                                        <span className="font-bold text-indigo-400/80">-${((activeSimulation.price * activeSimulation.item.quantity) - ((activeSimulation.price * activeSimulation.item.quantity) / activeSimulation.taxRate)).toFixed(2)}</span>
                                    </div>
                                    <div className="pt-4">
                                        <div className="p-6 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/20 flex justify-between items-center shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                            <span className="text-emerald-500 font-black uppercase italic tracking-widest">ledger net profit</span>
                                            <span className="text-emerald-400 text-4xl font-black italic tracking-tighter">
                                                ${(activeSimulation.netProfit * activeSimulation.item.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Portfolio Impact */}
                            <div className="space-y-8">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] border-b border-slate-800 pb-3 flex items-center gap-2">
                                    <Target className="h-3 w-3" /> Position Transformation
                                </h3>
                                <div className="space-y-8 relative">
                                    <div className="p-6 bg-slate-950/50 rounded-2xl border border-slate-800/80 opacity-40 grayscale scale-95 transition-all">
                                        <div className="text-[10px] font-black text-slate-600 uppercase mb-2 tracking-widest">Inventory Asset Class Value</div>
                                        <div className="text-2xl font-black text-slate-500 line-through tracking-tighter italic">
                                            ${(activeSimulation.landedUnitCost * activeSimulation.item.quantity).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="flex justify-center -my-6 relative z-10">
                                        <div className="bg-slate-900 rounded-full p-3 border-2 border-slate-800 shadow-2xl">
                                            <TrendingDown className="h-6 w-6 text-slate-500 animate-bounce" />
                                        </div>
                                    </div>
                                    <div className="p-6 bg-emerald-500/5 rounded-3xl border-2 border-emerald-500/40 relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
                                        <div className="text-[10px] font-black text-emerald-600 uppercase mb-2 tracking-[0.2em] flex items-center gap-2 relative">
                                            <TrendingUp className="h-4 w-4" /> Final Cash Liquidity position
                                        </div>
                                        <div className="text-4xl font-black text-emerald-400 italic tracking-tighter relative">
                                            +${(activeSimulation.price * activeSimulation.item.quantity).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-950/80 border-t border-slate-800 text-center">
                            <div className="flex justify-center gap-12 items-center">
                                <div>
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Return on Investment</p>
                                    <p className="text-2xl font-black text-violet-400 italic tracking-tighter">{((activeSimulation.netProfit / activeSimulation.landedUnitCost) * 100).toFixed(1)}%</p>
                                </div>
                                <div className="h-10 w-px bg-slate-800" />
                                <div>
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">efficiency score</p>
                                    <p className="text-2xl font-black text-emerald-400 italic tracking-tighter">{(activeSimulation.multiplier * 10).toFixed(1)}/10.0</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
