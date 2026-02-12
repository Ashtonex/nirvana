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
    Store
} from "lucide-react";
import { updateGlobalExpenses, processShipment } from "../actions";

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
        // Tax is applied on top of the selling price in many regions, but here we treat it as a buffer we must collect.
        // If "Inc. Tax" means the price the customer pays covers the tax liability:
        // Price = (Cost + Margin) * TaxRate

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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-100 uppercase italic flex items-center gap-3">
                        <Truck className="text-violet-500 h-10 w-10" /> Inventory Master
                    </h1>
                    <p className="text-slate-400 font-medium">Precision sourcing, rationalized distribution, and global costing.</p>
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-12">
                {/* Main Content Area */}
                <div className="md:col-span-8 space-y-8">
                    {/* New Shipment Section */}
                    <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-violet-600 group-hover:bg-emerald-500 transition-colors" />
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl font-black uppercase italic">
                                <Plus className="h-6 w-6 text-violet-400" /> Process New Shipment
                            </CardTitle>
                            <CardDescription className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                                <span>Ref #{shipment.shipmentNumber || "---"} | {shipment.manifestPieces || allocatedPieces} Pieces Expected</span>
                                {shipment.manifestPieces > 0 && (
                                    <Badge className={`ml-4 ${shipment.manifestPieces - allocatedPieces === 0 ? 'bg-emerald-600' :
                                        shipment.manifestPieces - allocatedPieces > 0 ? 'bg-violet-600 animate-pulse' : 'bg-rose-600'
                                        }`}>
                                        {shipment.manifestPieces - allocatedPieces === 0 ? 'Order Balanced' :
                                            shipment.manifestPieces - allocatedPieces > 0 ? `${shipment.manifestPieces - allocatedPieces} Remaining` :
                                                `${Math.abs(shipment.manifestPieces - allocatedPieces)} Over-allocated`}
                                    </Badge>
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">
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
                                Process Global Shipment & Suggest Prices
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Current Stock Intelligence */}
                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md shadow-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl font-black uppercase italic flex items-center gap-3">
                                <Zap className="h-6 w-6 text-yellow-500 animate-pulse" /> Current Stock Intelligence
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4">
                                {inventory.map((item: any) => {
                                    const insights = getInsights(item.id, item.quantity, item.landedCost, item.dateAdded);
                                    return (
                                        <div key={item.id} className="p-6 rounded-2xl bg-slate-950/40 border border-slate-800/50 flex items-center justify-between group hover:border-violet-500/30 transition-all">
                                            <div className="flex items-center gap-6">
                                                <div className="h-12 w-12 rounded-xl bg-slate-900 border-2 border-slate-800 flex items-center justify-center group-hover:border-violet-500/40 transition-colors">
                                                    <Target className="h-6 w-6 text-slate-500 group-hover:text-violet-400" />
                                                </div>
                                                <div>
                                                    <p className="text-lg font-black uppercase tracking-tight text-white">{item.name}</p>
                                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{item.sku} | {item.category} | In Stock: {insights.daysInStock}d</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-10 text-right">
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Bleed / Pc</p>
                                                    <p className="text-xs font-black text-rose-500/80 italic">${insights.cumulativeBleed.toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-violet-500 uppercase mb-1">Target Price</p>
                                                    <p className="text-lg font-black text-violet-400 italic">${insights.suggestedPrice.toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Velocity</p>
                                                    <p className="text-sm font-black text-emerald-400 italic">{insights.velocity.toFixed(2)}/d</p>
                                                </div>
                                                <div className="min-w-[100px]">
                                                    <p className="text-[10px] font-black text-slate-600 uppercase mb-1">Stockout In</p>
                                                    <div className="space-y-1">
                                                        <p className={`text-xl font-black italic ${insights.daysToZero < 7 ? 'text-rose-500' : 'text-violet-400'}`}>
                                                            {insights.daysToZero === Infinity ? '---' : `${insights.daysToZero} Days`}
                                                        </p>
                                                    </div>
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
                    <Card className="bg-slate-900/60 border-slate-800 border-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-emerald-400 flex items-center gap-2">
                                <Store className="h-4 w-4" /> Shop Overheads
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Shop</label>
                                <select
                                    className="w-full h-10 bg-slate-950 border border-slate-800 rounded-lg px-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    value={selectedShopId}
                                    onChange={(e) => {
                                        const sid = e.target.value;
                                        setSelectedShopId(sid);
                                        const shop = db.shops.find((s: any) => s.id === sid);
                                        if (shop) {
                                            setLocalShopExpenses(shop.expenses);
                                        }
                                    }}
                                >
                                    {db.shops.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase">Rent</label>
                                    <Input
                                        type="number"
                                        value={localShopExpenses.rent}
                                        onChange={e => setLocalShopExpenses({ ...localShopExpenses, rent: parseFloat(e.target.value) || 0 })}
                                        className="h-8 bg-slate-950 border-slate-900 text-xs font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase">Salaries</label>
                                    <Input
                                        type="number"
                                        value={localShopExpenses.salaries}
                                        onChange={e => setLocalShopExpenses({ ...localShopExpenses, salaries: parseFloat(e.target.value) || 0 })}
                                        className="h-8 bg-slate-950 border-slate-900 text-xs font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase">Utilities</label>
                                    <Input
                                        type="number"
                                        value={localShopExpenses.utilities}
                                        onChange={e => setLocalShopExpenses({ ...localShopExpenses, utilities: parseFloat(e.target.value) || 0 })}
                                        className="h-8 bg-slate-950 border-slate-900 text-xs font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase">Misc</label>
                                    <Input
                                        type="number"
                                        value={localShopExpenses.misc}
                                        onChange={e => setLocalShopExpenses({ ...localShopExpenses, misc: parseFloat(e.target.value) || 0 })}
                                        className="h-8 bg-slate-950 border-slate-900 text-xs font-bold"
                                    />
                                </div>
                            </div>

                            <Button
                                className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em]"
                                onClick={() => {
                                    startTransition(async () => {
                                        const { updateShopExpenses } = await import("../actions");
                                        await updateShopExpenses(selectedShopId, localShopExpenses);
                                        // db is updated via revalidatePath in actions, but for alert we can just show generic
                                        alert("Shop expenses updated!");
                                    });
                                }}
                                disabled={isPending}
                            >
                                <Save className="h-3 w-3 mr-2" /> Sync Shop Totals
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800 border-2">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-emerald-400 flex items-center gap-2">
                                <Scale className="h-4 w-4" /> Restock Priority
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
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

                    <Card className="bg-slate-900/60 border-slate-800 border-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-black uppercase italic tracking-widest text-sky-400 flex items-center gap-2">
                                <DollarSign className="h-4 w-4" /> Global Overheads
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                                {Object.entries(globalExpenses).map(([key, val]) => (
                                    <div key={key} className="space-y-2 group/expense relative">
                                        <div className="flex justify-between items-center pr-8">
                                            <label className="text-[10px] font-black text-slate-500 uppercase">{key}</label>
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
                                            className="h-10 bg-slate-950 border-slate-850 font-black text-sky-400"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-slate-800 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="EX: SOFTWARE"
                                        className="h-8 bg-slate-900 border-slate-800 text-[10px] font-black uppercase placeholder:text-slate-700"
                                        id="new-expense-name"
                                    />
                                    <Input
                                        type="number"
                                        placeholder="$0.00"
                                        className="h-8 bg-slate-900 border-slate-800 text-[10px] font-black uppercase"
                                        id="new-expense-val"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full h-10 border-sky-900/40 text-sky-500 hover:bg-sky-500/5 text-[9px] font-black uppercase tracking-widest"
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
                                    <Plus className="h-3 w-3 mr-2" /> Commit New Overhead Line
                                </Button>
                            </div>

                            <Button
                                className="w-full h-12 bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-900/20 text-[10px] font-black uppercase tracking-[0.2em] mt-4"
                                onClick={saveGlobalExpenses}
                                disabled={isPending}
                            >
                                <RefreshCcw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} /> Update Base Fees
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* The Oracle Simulation Modal */}
            {
                activeSimulation && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                        <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-10 fade-in duration-500 ease-out">
                            <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
                                <div>
                                    <h2 className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400 flex items-center gap-2">
                                        <Zap className="h-6 w-6 text-violet-400" /> THE ORACLE
                                    </h2>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Financial Projection: {activeSimulation.item.name || "Unnamed Item"}</p>
                                </div>
                                <button onClick={() => setActiveSimulation(null)} className="text-slate-500 hover:text-white transition-colors">
                                    <Plus className="h-8 w-8 rotate-45" />
                                </button>
                            </div>

                            <div className="p-8 grid grid-cols-2 gap-12">
                                {/* Income Statement */}
                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-2">Forecasted Income</h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm items-center">
                                            <span className="text-slate-400 font-medium">Revenue (Sales)</span>
                                            <span className="font-black text-white text-lg">${(activeSimulation.price * activeSimulation.item.quantity).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs items-center">
                                            <span className="text-slate-500">COGS (Landed)</span>
                                            <span className="font-bold text-rose-400">-${(activeSimulation.landedUnitCost * activeSimulation.item.quantity).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs items-center">
                                            <span className="text-slate-500">Overhead Contribution</span>
                                            <span className="font-bold text-amber-500">-${(activeSimulation.overheadPerPiece * activeSimulation.item.quantity).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs items-center border-b border-slate-800 pb-3">
                                            <span className="text-slate-500">Tax Liability (15.5%)</span>
                                            <span className="font-bold text-indigo-400">-${((activeSimulation.price * activeSimulation.item.quantity) - ((activeSimulation.price * activeSimulation.item.quantity) / activeSimulation.taxRate)).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xl font-black pt-2 items-center">
                                            <span className="text-emerald-500 uppercase italic tracking-wider">Net Profit</span>
                                            <span className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                                ${(activeSimulation.netProfit * activeSimulation.item.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Balance Sheet Impact */}
                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-slate-800 pb-2">Balance Sheet Impact</h3>
                                    <div className="space-y-6">
                                        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 opacity-60">
                                            <div className="text-[9px] font-black text-slate-500 uppercase mb-1">Current Asset Value</div>
                                            <div className="text-xl font-black text-slate-400 line-through decoration-rose-500/50 decoration-2">
                                                ${(activeSimulation.landedUnitCost * activeSimulation.item.quantity).toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="flex justify-center -my-3 relative z-10">
                                            <div className="bg-slate-900 rounded-full p-2 border border-slate-800">
                                                <TrendingDown className="h-5 w-5 text-slate-500" />
                                            </div>
                                        </div>
                                        <div className="p-4 bg-emerald-950/20 rounded-xl border border-emerald-900/40 relative overflow-hidden group">
                                            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="text-[9px] font-black text-emerald-600 uppercase mb-1 flex items-center gap-2">
                                                <TrendingUp className="h-3 w-3" /> New Cash Position
                                            </div>
                                            <div className="text-2xl font-black text-emerald-400">
                                                +${(activeSimulation.price * activeSimulation.item.quantity).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-950/50 text-center border-t border-slate-800">
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                    Efficiency Rating: <span className={`${activeSimulation.netProfit > 0 ? 'text-emerald-500' : 'text-rose-500'} text-sm ml-2`}>{((activeSimulation.netProfit / activeSimulation.landedUnitCost) * 100).toFixed(0)}% ROIC</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
