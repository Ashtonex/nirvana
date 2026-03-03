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
    Minus,
    Plus,
    ShoppingCart,
    Trash2,
    Search,
    Truck,
    Receipt,
    X,
    LayoutGrid,
    FileText,
    Users,
    AlertCircle,
    ShieldAlert,
    BadgeCheck,
    TrendingUp,
    RefreshCcw,
    Skull,
    History,
    Sparkles,
    Coins,
    PackagePlus,
    Power,
    MessageSquare
} from "lucide-react";
import { recordSale, recordQuotation, addNewProductFromPos } from "../../actions";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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

export default function POS({ shopId, inventory, db }: { shopId: string, inventory: any[], db: any }) {
    const [cart, setCart] = useState<{ item: any, quantity: number, price: number }[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isPending, startTransition] = useTransition();
    const [posMode, setPosMode] = useState<'sale' | 'quote'>('sale');
    const [clientName, setClientName] = useState("");
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

    const [isClosingDay, setIsClosingDay] = useState(false);

    // Ad-hoc Product Modal State
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: "", category: "", landedCost: "", initialStock: "0" });

    const employees = (db.employees || []).filter((e: any) => e.shopId === shopId && e.active);
    const shop = db.shops.find((s: any) => s.id === shopId);
    const shopExpenses = shop ? Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0) : 0;

    const totalShopStock = inventory.reduce((sum, item) => {
        const alloc = item.allocations.find((a: any) => a.shopId === shopId);
        return sum + (alloc ? alloc.quantity : 0);
    }, 0);

    const getClientLTV = (name: string) => {
        if (!name) return 0;
        const clientSales = (db.sales || []).filter((s: any) => s.clientName?.toLowerCase() === name.toLowerCase());
        return clientSales.reduce((acc: number, s: any) => acc + s.totalWithTax, 0);
    };

    const clientLTV = getClientLTV(clientName);

    const addToCart = (item: any, price: number) => {
        const existing = cart.find(c => c.item.id === item.id);
        if (existing) {
            setCart(cart.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1, price } : c));
        } else {
            setCart([...cart, { item, quantity: 1, price }]);
        }
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(c => c.item.id !== id));
    };

    const updateQty = (id: string, delta: number) => {
        setCart(cart.map(c => {
            if (c.item.id === id) {
                const newQty = Math.max(1, c.quantity + delta);
                return { ...c, quantity: newQty };
            }
            return c;
        }));
    };

    const updatePrice = (id: string, newPrice: number) => {
        setCart(cart.map(c => c.item.id === id ? { ...c, price: newPrice } : c));
    };

    const handleAddAdHocProduct = async () => {
        if (!newProduct.name || !newProduct.category || !newProduct.landedCost) {
            alert("Please fill all fields");
            return;
        }

        startTransition(async () => {
            try {
                const addedItem = await addNewProductFromPos({
                    name: newProduct.name,
                    category: newProduct.category,
                    landedCost: parseFloat(newProduct.landedCost),
                    shopId,
                    initialStock: parseInt(newProduct.initialStock) || 0
                });
                setIsAddProductModalOpen(false);
                setNewProduct({ name: "", category: "", landedCost: "", initialStock: "0" });
                alert(`${newProduct.name} added to inventory system.`);
            } catch (error) {
                alert("Failed to add product");
            }
        });
    };

    const taxRate = db.settings?.taxRate || 0.155;
    const totalBeforeTax = cart.reduce((sum, c) => sum + (c.price / (1 + taxRate)) * c.quantity, 0);
    const totalWithTax = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
    const totalTax = totalWithTax - totalBeforeTax;

    const handleCheckout = () => {
        startTransition(async () => {
            if (posMode === 'sale') {
                for (const entry of cart) {
                    await recordSale({
                        shopId,
                        itemId: entry.item.id,
                        itemName: entry.item.name,
                        quantity: entry.quantity,
                        unitPrice: entry.price / 1.155,
                        totalBeforeTax: (entry.price / 1.155) * entry.quantity,
                        employeeId: selectedEmployeeId || "system",
                        clientName: clientName || "General Walk-in"
                    });
                }
                alert("Sale recorded successfully!");
            } else {
                await recordQuotation({
                    shopId,
                    clientName: clientName || "Walk-in Customer",
                    items: cart.map(c => ({
                        itemId: c.item.id,
                        itemName: c.item.name,
                        quantity: c.quantity,
                        unitPrice: c.price / 1.155,
                        total: c.price * c.quantity
                    })),
                    totalBeforeTax,
                    tax: totalTax,
                    totalWithTax,
                    employeeId: selectedEmployeeId || "system"
                });
                alert("Quotation generated successfully!");
            }
            setCart([]);
            setClientName("");
        });
    };

    const handleEndOfDayAndLogout = async () => {
        if (!confirm('End of day: send report and log out?')) return;
        setIsClosingDay(true);
        try {
            const res = await fetch('/api/eod', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('EOD failed:', data);
            }
        } catch (e) {
            console.error('EOD error:', e);
        }

        try {
            await fetch('/api/staff/logout', { method: 'POST' });
        } finally {
            window.location.href = '/staff-login';
        }
    };

    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-8 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Search products or classes..."
                            className="pl-10 h-10 bg-slate-900 border-slate-800"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        onClick={() => setIsAddProductModalOpen(true)}
                        className="bg-violet-600 hover:bg-violet-500 text-[10px] font-black uppercase italic h-10 px-4 flex items-center gap-2"
                    >
                        <PackagePlus className="h-4 w-4" /> Add Ad-hoc
                    </Button>

                    <Button
                        onClick={handleEndOfDayAndLogout}
                        disabled={isClosingDay}
                        variant="outline"
                        className="h-10 px-4 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="End of day + log out"
                    >
                        <Power className="h-4 w-4" /> {isClosingDay ? 'Closing...' : 'Power Off'}
                    </Button>

                    <Button
                        onClick={() => (window.location.href = '/staff-chat')}
                        variant="outline"
                        className="h-10 px-4 border-slate-700 text-slate-200 hover:bg-slate-800/60 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="Open shop chat"
                    >
                        <MessageSquare className="h-4 w-4" /> Chat
                    </Button>
                    <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-3 h-10 shadow-lg shrink-0">
                        <LayoutGrid className="h-4 w-4 text-violet-400" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase font-black leading-none">Shop Stock</span>
                            <span className="text-xs font-bold text-slate-200">{totalShopStock} Pieces</span>
                        </div>
                    </div>
                </div>

                {filteredInventory.length === 0 && searchTerm ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
                        <PackagePlus className="h-12 w-12 text-slate-700 mb-4" />
                        <p className="text-slate-400 font-bold uppercase text-xs">No products found for "{searchTerm}"</p>
                        <Button
                            variant="outline"
                            className="mt-4 border-violet-500/50 text-violet-400 text-[10px] font-black uppercase italic"
                            onClick={() => {
                                setNewProduct({ ...newProduct, name: searchTerm, initialStock: "0" });
                                setIsAddProductModalOpen(true);
                            }}
                        >
                            Add "{searchTerm}" as new product
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredInventory.map((item) => {
                            const allocation = item.allocations.find((a: any) => a.shopId === shopId);
                            const qtyAtShop = (allocation ? allocation.quantity : 0);
                            const totalNetworkStock = item.quantity || 0;

                            const dynamicOverhead = totalShopStock > 0 ? (shopExpenses as number) / totalShopStock : 0;
                            const baseCost = (item.landedCost || 0) + dynamicOverhead;

                            const shipment = db.shipments?.find((s: any) => s.id === item.shipmentId);
                            const supplier = shipment?.supplier || "Global Provider";

                            const daysInStock = Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 3600 * 24));
                            const totalInventoryCount = inventory.reduce((sum, i) => sum + i.quantity, 0);
                            const totalGlobalOverhead = db.globalExpenses ? Object.values(db.globalExpenses).reduce((acc: number, val: any) => acc + Number(val), 0) : 0;
                            const dailyBleed = totalInventoryCount > 0 ? (totalGlobalOverhead / 30) / totalInventoryCount : 0;
                            const cumulativeBleed = dailyBleed * daysInStock;

                            const minRecovery = (item.landedCost + cumulativeBleed) * 1.155;
                            const suggestions = [
                                { label: "Recovery", price: minRecovery, color: "text-rose-400", icon: <Skull className="h-3 w-3" /> },
                                { label: "Conservative", price: (item.landedCost * 1.2) * 1.155, color: "text-amber-400", icon: <Coins className="h-3 w-3" /> },
                                { label: "Balanced", price: (item.landedCost * 1.4) * 1.155, color: "text-emerald-400", icon: <TrendingUp className="h-3 w-3" /> },
                                { label: "Performance", price: (item.landedCost * 1.6) * 1.155, color: "text-sky-400", icon: <Sparkles className="h-3 w-3" /> },
                                { label: "Premium", price: (item.landedCost * 1.8) * 1.155, color: "text-violet-400", icon: <BadgeCheck className="h-3 w-3" /> },
                            ];

                            const isZombie = daysInStock > 60;

                            return (
                                <Card key={item.id} className={cn("group transition-all duration-300 bg-slate-900/40 border-slate-800/50 overflow-hidden relative", (qtyAtShop > 0 || item.id.startsWith('adhoc')) ? "hover:border-violet-500/50" : "opacity-30 grayscale")}>
                                    <div className="absolute top-0 right-0 p-2 z-20">
                                        {isZombie && (
                                            <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/10 text-[8px] font-black uppercase flex items-center gap-1">
                                                <Skull className="h-2 w-2" /> Zombie
                                            </Badge>
                                        )}
                                    </div>

                                    <CardContent className="pt-6">
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant="outline" className="text-[9px] uppercase font-black tracking-widest text-slate-500 bg-slate-900/50 border-slate-800 px-2 py-0">
                                                {item.category}
                                            </Badge>
                                            <div className="text-right">
                                                <span className="text-sm font-black block italic tracking-tighter text-white">
                                                    ${minRecovery.toFixed(2)} <span className="text-[10px] text-slate-600 font-normal">Min</span>
                                                </span>
                                            </div>
                                        </div>
                                        <h3 className="font-semibold text-slate-100 truncate mb-1">{item.name}</h3>
                                        <div className="flex items-center gap-1.5 opacity-70 mb-4">
                                            <Truck className="h-3 w-3 text-slate-500" />
                                            <span className="text-[10px] text-slate-400 uppercase font-bold">{supplier}</span>
                                        </div>

                                        <div className="space-y-1.5 border-t border-slate-800/50 pt-4 mt-2">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <Sparkles className="h-3 w-3 text-violet-400" /> Oracle Suggestions
                                            </p>
                                            <div className="grid grid-cols-1 gap-1">
                                                {suggestions.map((s, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => (qtyAtShop > 0 || item.id.startsWith('adhoc')) && addToCart(item, s.price)}
                                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-violet-500/50 hover:bg-slate-900 transition-all group/btn"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("p-1 rounded bg-slate-900", s.color)}>{s.icon}</div>
                                                            <span className="text-[10px] font-black uppercase tracking-tight text-slate-400 group-hover/btn:text-slate-200">{s.label}</span>
                                                        </div>
                                                        <span className={cn("text-xs font-black italic", s.color)}>${s.price.toFixed(2)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center bg-slate-950/30 -mx-6 -mb-6 px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 uppercase font-black leading-none">In Shop</span>
                                                <span className="text-xs font-bold text-slate-200">{qtyAtShop} Units</span>
                                            </div>
                                            <div className={cn("h-2 w-2 rounded-full", qtyAtShop < 5 ? "bg-rose-500 animate-pulse" : "bg-emerald-500")} />
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            <Card className="md:col-span-4 h-fit sticky top-6 border-slate-800 bg-slate-950/40 backdrop-blur-md">
                <CardHeader>
                    <div className="flex gap-2 mb-4">
                        <Button variant={posMode === 'sale' ? 'default' : 'outline'} onClick={() => setPosMode('sale')} className={cn("flex-1 text-[10px] font-black uppercase italic h-8", posMode === 'sale' ? 'bg-emerald-600' : 'border-slate-800 text-slate-500')}>Direct Sale</Button>
                        <Button variant={posMode === 'quote' ? 'default' : 'outline'} onClick={() => setPosMode('quote')} className={cn("flex-1 text-[10px] font-black uppercase italic h-8", posMode === 'quote' ? 'bg-amber-600' : 'border-slate-800 text-slate-500')}>Make Quote</Button>
                    </div>
                    <CardTitle className="flex items-center gap-2">
                        {posMode === 'sale' ? <ShoppingCart className="h-5 w-5 text-emerald-400" /> : <FileText className="h-5 w-5 text-amber-500" />}
                        {posMode === 'sale' ? "Active Cart" : "Quote Builder"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Users className="h-3 w-3 text-violet-500" /> Attribution
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {employees.map((emp: any) => (
                                    <button key={emp.id} onClick={() => setSelectedEmployeeId(emp.id)} className={cn("flex items-center gap-2 px-2 py-1 rounded-full border transition-all", selectedEmployeeId === emp.id ? "bg-violet-600 border-violet-500 text-white shadow-lg" : "bg-slate-900 border-slate-800 text-slate-400")}>
                                        <div className="h-5 w-5 rounded-full bg-violet-800 flex items-center justify-center text-[8px] font-black">{emp.name.split(' ').map((n: string) => n[0]).join('')}</div>
                                        <span className="text-[10px] font-bold">{emp.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Client Name</label>
                                {clientLTV > 0 && <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/10 text-[8px] font-black uppercase flex items-center gap-1"><BadgeCheck className="h-2 w-2" /> ${clientLTV.toLocaleString()} LTV</Badge>}
                            </div>
                            <Input placeholder="Identifying customer..." value={clientName} onChange={(e) => setClientName(e.target.value)} className="h-10 bg-slate-900 border-slate-800 text-xs" />
                        </div>
                    </div>

                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                        {cart.length === 0 ? (
                            <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                                <ShoppingCart className="h-8 w-8 text-slate-800 mx-auto mb-2" />
                                <p className="text-[10px] text-slate-600 font-bold uppercase">Cart is Empty</p>
                            </div>
                        ) : cart.map((entry) => {
                            const dynamicOverhead = totalShopStock > 0 ? shopExpenses / totalShopStock : 0;
                            const landedCostWithOverhead = (entry.item.landedCost || 0) + dynamicOverhead;
                            const isLossLeading = entry.price < (landedCostWithOverhead * 1.155);
                            return (
                                <div key={entry.item.id} className={cn("bg-slate-900 p-3 rounded-lg border", isLossLeading ? "border-rose-500/30" : "border-slate-800")}>
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-[11px] font-black uppercase truncate italic">{entry.item.name}</h4>
                                        <button onClick={() => removeFromCart(entry.item.id)} className="text-slate-600 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center gap-2 bg-slate-950 px-1 rounded border border-slate-800">
                                            <button onClick={() => updateQty(entry.item.id, -1)}><Minus className="h-3 w-3" /></button>
                                            <span className="text-xs font-black">{entry.quantity}</span>
                                            <button onClick={() => updateQty(entry.item.id, 1)}><Plus className="h-3 w-3" /></button>
                                        </div>
                                        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
                                            <span className="text-[8px] font-black text-slate-600">$</span>
                                            <input type="number" className="bg-transparent w-16 text-right text-xs font-black focus:outline-none" value={entry.price} onChange={(e) => updatePrice(entry.item.id, parseFloat(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                    {isLossLeading && <p className="text-[8px] font-black text-rose-500 mt-1 uppercase flex items-center gap-1"><ShieldAlert className="h-2 w-2" /> Margin Risk Detected</p>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-4 border-t border-slate-800 space-y-2">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase"><span>Subtotal</span><span>${totalBeforeTax.toFixed(2)}</span></div>
                        <div className="flex justify-between text-xl font-black text-white italic tracking-tighter uppercase"><span>Total Due</span><span className="text-emerald-400">${totalWithTax.toFixed(2)}</span></div>
                    </div>

                    <Button className={cn("w-full h-14 font-black text-sm uppercase italic tracking-[0.2em] rounded-xl", posMode === 'sale' ? "bg-emerald-600" : "bg-amber-600")} disabled={cart.length === 0 || isPending} onClick={handleCheckout}>
                        {isPending ? <RefreshCcw className="h-5 w-5 animate-spin" /> : posMode === 'sale' ? "Execute Sale" : "Process Quote"}
                    </Button>
                </CardContent>
            </Card>

            <Modal
                isOpen={isAddProductModalOpen}
                onClose={() => setIsAddProductModalOpen(false)}
                title="Add Ad-hoc Product"
            >
                <div className="space-y-4 pt-2">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">This will add the product to the global inventory and make it available for this shop.</p>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Name</label>
                        <Input
                            placeholder="e.g. Premium Hub Cap"
                            value={newProduct.name}
                            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                            className="bg-slate-950"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</label>
                        <Input
                            placeholder="e.g. Accessories"
                            value={newProduct.category}
                            onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                            className="bg-slate-950"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated Landed Cost ($)</label>
                        <Input
                            type="number"
                            placeholder="0.00"
                            value={newProduct.landedCost}
                            onChange={(e) => setNewProduct({ ...newProduct, landedCost: e.target.value })}
                            className="bg-slate-950"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Initial Physical Stock</label>
                        <Input
                            type="number"
                            placeholder="0"
                            value={newProduct.initialStock}
                            onChange={(e) => setNewProduct({ ...newProduct, initialStock: e.target.value })}
                            className="bg-slate-950 font-bold text-sky-500"
                        />
                    </div>
                    <Button
                        onClick={handleAddAdHocProduct}
                        disabled={isPending}
                        className="w-full bg-violet-600 hover:bg-violet-500 font-black uppercase italic tracking-widest h-12 mt-4"
                    >
                        {isPending ? <RefreshCcw className="h-4 w-4 animate-spin mr-2" /> : <PackagePlus className="h-4 w-4 mr-2" />}
                        Persist to Oracle
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
