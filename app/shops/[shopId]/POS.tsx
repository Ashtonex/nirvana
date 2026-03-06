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
    MessageSquare,
    LogOut
} from "lucide-react";
import { recordSale, recordQuotation, addNewProductFromPos, recordUntrackedSale } from "../../actions";
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
    const [clientEmail, setClientEmail] = useState("");
    const [clientPhone, setClientPhone] = useState("");
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'ecocash'>('cash');

    const [isClosingDay, setIsClosingDay] = useState(false);
    const [isEodShareModalOpen, setIsEodShareModalOpen] = useState(false);
    const [eodShareUrl, setEodShareUrl] = useState<string>("");
    const [eodShareText, setEodShareText] = useState<string>("");

    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [returnSaleId, setReturnSaleId] = useState("");
    const [returnQty, setReturnQty] = useState("1");
    const [returnReason, setReturnReason] = useState("Customer return");
    const [returnNotes, setReturnNotes] = useState("");
    const [returnRestock, setReturnRestock] = useState(true);
    const [returnBusy, setReturnBusy] = useState(false);
    const [returnStatus, setReturnStatus] = useState<string>("");

    // Today's receipts modal
    const [isReceiptsModalOpen, setIsReceiptsModalOpen] = useState(false);

    // Get today's sales for dropdown
    const today = new Date().toISOString().split('T')[0];
    const todaysSales = (db.sales || []).filter((s: any) => {
        const saleDate = s.date?.split('T')[0];
        return saleDate === today && s.shopId === shopId;
    });

    // Calculate total sales for today
    const todaysTotalSales = todaysSales.reduce((sum: number, s: any) => sum + (s.totalWithTax || 0), 0);

    // Ad-hoc Product Modal State
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: "", category: "", landedCost: "", initialStock: "0" });

    // Quick Sale Modal State (manual entry for untracked products)
    const [isQuickSaleModalOpen, setIsQuickSaleModalOpen] = useState(false);
    const [quickSale, setQuickSale] = useState({ name: "", quantity: "1", price: "0" });

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

    const addToCart = (item: any, price: number, qtyToAdd: number = 1) => {
        const existing = cart.find(c => c.item.id === item.id);
        if (existing) {
            setCart(cart.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + qtyToAdd, price } : c));
        } else {
            setCart([...cart, { item, quantity: qtyToAdd, price }]);
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

    const handleQuickSale = () => {
        const qty = parseInt(quickSale.quantity) || 1;
        const salePrice = parseFloat(quickSale.price) || 0;

        if (!quickSale.name || qty <= 0 || salePrice <= 0) {
            alert("Please enter product name, quantity (>0), and price (>0)");
            return;
        }

        // Try to find the product in inventory
        const existingItem = inventory.find((item: any) =>
            item.name.toLowerCase() === quickSale.name.toLowerCase()
        );

        if (existingItem) {
            // Add tracked product to cart
            addToCart(existingItem, salePrice, qty);
        } else {
            // Add untracked product to cart with fake ID
            addToCart({
                id: `QUICK_${Date.now()}`,
                name: quickSale.name,
                category: "Quick Sale",
                quantity: 0,
                landedCost: 0,
                allocations: []
            }, salePrice, qty);
        }

        setIsQuickSaleModalOpen(false);
        setQuickSale({ name: "", quantity: "1", price: "0" });
    };

    const taxRate = db.settings?.taxRate || 0.155;
    const totalBeforeTax = cart.reduce((sum, c) => sum + (c.price / (1 + taxRate)) * c.quantity, 0);
    const totalWithTax = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
    const totalTax = totalWithTax - totalBeforeTax;

    const handleCheckout = () => {
        startTransition(async () => {
            try {
                if (posMode === 'sale') {
                    for (const entry of cart) {
                        const isUntracked = entry.item.id.startsWith('QUICK_');

                        if (isUntracked) {
                            // For untracked items, use the server action
                            await recordUntrackedSale({
                                shopId,
                                itemName: entry.item.name,
                                quantity: entry.quantity,
                                unitPrice: entry.price / (1 + taxRate),
                                totalBeforeTax: (entry.price / (1 + taxRate)) * entry.quantity,
                                employeeId: selectedEmployeeId || "system",
                                clientName: clientName || "General Walk-in",
                                paymentMethod
                            });
                        } else {
                            // For tracked items, use normal recordSale which decrements inventory
                            await recordSale({
                                shopId,
                                itemId: entry.item.id,
                                itemName: entry.item.name,
                                quantity: entry.quantity,
                                unitPrice: entry.price / (1 + taxRate),
                                totalBeforeTax: (entry.price / (1 + taxRate)) * entry.quantity,
                                employeeId: selectedEmployeeId || "system",
                                clientName: clientName || "General Walk-in",
                                paymentMethod
                            });
                        }
                    }
                    alert("Sale recorded successfully!");
                } else {
                    await recordQuotation({
                        shopId,
                        clientName: clientName || "Walk-in Customer",
                        clientEmail: clientEmail || "",
                        clientPhone: clientPhone || "",
                        items: cart.map(c => ({
                            itemId: c.item.id,
                            itemName: c.item.name,
                            quantity: c.quantity,
                            unitPrice: c.price / (1 + taxRate),
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
                setClientEmail("");
                setClientPhone("");
                setPaymentMethod('cash');
            } catch (error) {
                console.error('Checkout failed:', error);
                alert(`Checkout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    };

    const handleEndOfDayAndLogout = async () => {
        if (!confirm('End of day: send report and log out?')) return;
        setIsClosingDay(true);

        // Cleanup any previous blob url
        if (eodShareUrl) {
            try { URL.revokeObjectURL(eodShareUrl); } catch { }
            setEodShareUrl("");
        }

        try {
            const res = await fetch('/api/eod', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Test day mode: do not email; we will share via WhatsApp
                body: JSON.stringify({ shopId, sendEmail: false })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('EOD failed:', data);
            }

            const totals = data?.totals;
            const msgLines = [
                `NIRVANA EOD — ${shopId.toUpperCase()}`,
                `Date: ${new Date().toLocaleDateString()}`,
                totals ? `Transactions: ${totals.count}` : null,
                totals ? `Total (inc tax): $${Number(totals.totalWithTax || 0).toFixed(2)}` : null,
                totals ? `Total (pre tax): $${Number(totals.totalBeforeTax || 0).toFixed(2)}` : null,
                totals ? `Tax: $${Number(totals.totalTax || 0).toFixed(2)}` : null,
                `Report PDF is attached.`
            ].filter(Boolean);
            setEodShareText(msgLines.join('\n'));

            // Generate report PDF for sharing
            try {
                const pdfRes = await fetch(`/api/eod/pdf?shopId=${encodeURIComponent(shopId)}`, { cache: 'no-store' });
                if (pdfRes.ok) {
                    const blob = await pdfRes.blob();
                    const url = URL.createObjectURL(blob);
                    setEodShareUrl(url);
                    setIsEodShareModalOpen(true);
                } else {
                    const err = await pdfRes.json().catch(() => ({}));
                    console.error('EOD PDF failed:', err);
                }
            } catch (e) {
                console.error('EOD PDF error:', e);
            }
        } catch (e) {
            console.error('EOD error:', e);
        }
    };

    const shareEodToWhatsApp = async () => {
        // Prefer native share sheet with file (WhatsApp selectable) on mobile.
        if (eodShareUrl) {
            try {
                const r = await fetch(eodShareUrl);
                const b = await r.blob();
                const file = new File([b], `EOD_${shopId}_${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' });
                const nav: any = navigator as any;
                if (nav?.canShare?.({ files: [file] }) && nav?.share) {
                    await nav.share({
                        title: `EOD ${shopId.toUpperCase()}`,
                        text: eodShareText,
                        files: [file],
                    });
                    return;
                }
            } catch (e) {
                console.error('Share sheet failed:', e);
            }
        }

        // Fallback: open WhatsApp with text only + open PDF in new tab for manual attach.
        try {
            if (eodShareUrl) window.open(eodShareUrl, '_blank', 'noopener,noreferrer');
        } catch { }
        try {
            const link = `https://wa.me/?text=${encodeURIComponent(eodShareText || `NIRVANA EOD — ${shopId.toUpperCase()}`)}`;
            window.open(link, '_blank', 'noopener,noreferrer');
        } catch { }
    };

    const finalizeEodLogout = async () => {
        try {
            await fetch('/api/staff/logout', { method: 'POST' });
        } finally {
            window.location.href = '/login';
        }
    };

    const filteredInventory = inventory.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-8 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Search products or classes..."
                            className="pl-10 h-10 bg-slate-900 border-slate-800"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                            onClick={() => setIsAddProductModalOpen(true)}
                            className="bg-violet-600 hover:bg-violet-500 text-[10px] font-black uppercase italic h-10 px-3 flex items-center gap-2"
                        >
                            <PackagePlus className="h-4 w-4" /> Add Ad-hoc
                        </Button>

                        <Button
                            onClick={() => setIsQuickSaleModalOpen(true)}
                            className="bg-sky-600 hover:bg-sky-500 text-[10px] font-black uppercase italic h-10 px-3 flex items-center gap-2"
                        >
                            <ShoppingCart className="h-4 w-4" /> Quick Sale
                        </Button>

                        <Button
                            onClick={handleEndOfDayAndLogout}
                            disabled={isClosingDay}
                            variant="outline"
                            className="h-10 px-3 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                            title="End of day + log out"
                        >
                            <Power className="h-4 w-4" /> {isClosingDay ? 'Closing...' : 'Power Off'}
                        </Button>

                        <Button
                            onClick={() => {
                                setReturnStatus("");
                                setIsReturnModalOpen(true);
                            }}
                            variant="outline"
                            className="h-10 px-3 border-amber-500/30 text-amber-200 hover:bg-amber-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                            title="Issue return / credit note"
                        >
                            <Receipt className="h-4 w-4" /> Return
                        </Button>

                        <Button
                            onClick={() => setIsReceiptsModalOpen(true)}
                            variant="outline"
                            className="h-10 px-3 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                            title="View today's receipts"
                        >
                            <FileText className="h-4 w-4" /> Receipts
                        </Button>

                        <Button
                            onClick={() => (window.location.href = '/staff-chat')}
                            variant="outline"
                            className="h-10 px-3 border-slate-700 text-slate-200 hover:bg-slate-800/60 text-[10px] font-black uppercase italic flex items-center gap-2"
                            title="Open staff chat"
                        >
                            <MessageSquare className="h-4 w-4" /> Chat
                        </Button>

                        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-3 h-10 shadow-lg w-full sm:w-auto">
                            <LayoutGrid className="h-4 w-4 text-violet-400" />
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-500 uppercase font-black leading-none">Shop Stock</span>
                                <span className="text-xs font-bold text-slate-200">{totalShopStock} Pieces</span>
                            </div>
                        </div>

                        <Button
                            onClick={async () => {
                                if (confirm('Log out now?')) {
                                    await fetch('/api/staff/logout', { method: 'POST' });
                                    window.location.href = '/login';
                                }
                            }}
                            variant="outline"
                            className="h-10 px-3 border-slate-700 text-slate-200 hover:bg-slate-800/60 text-[10px] font-black uppercase italic flex items-center gap-2"
                            title="Log out"
                        >
                            <LogOut className="h-4 w-4" /> Logout
                        </Button>
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
                    {/* Daily Sales Total Badge */}
                    <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Today's Sales</div>
                        <div className="text-2xl font-black text-emerald-300 font-mono">${todaysTotalSales.toFixed(2)}</div>
                        <div className="text-[9px] text-emerald-500 mt-1">{todaysSales.length} transaction{todaysSales.length !== 1 ? 's' : ''}</div>
                    </div>

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

                        {posMode === 'quote' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recipient Email</label>
                                    <Input placeholder="customer@email.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="h-10 bg-slate-900 border-slate-800 text-xs" type="email" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recipient Phone</label>
                                    <Input placeholder="+1234567890" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="h-10 bg-slate-900 border-slate-800 text-xs" />
                                </div>
                            </div>
                        )}
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

                    {posMode === 'sale' && (
                        <div className="space-y-2 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Coins className="h-3 w-3 text-amber-500" /> Payment Method
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPaymentMethod('cash')}
                                    className={cn(
                                        "flex-1 py-2 px-3 rounded-lg border font-black text-xs uppercase transition-all",
                                        paymentMethod === 'cash'
                                            ? "bg-emerald-600 border-emerald-500 text-white"
                                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                    )}
                                >
                                    Cash
                                </button>
                                <button
                                    onClick={() => setPaymentMethod('ecocash')}
                                    className={cn(
                                        "flex-1 py-2 px-3 rounded-lg border font-black text-xs uppercase transition-all",
                                        paymentMethod === 'ecocash'
                                            ? "bg-blue-600 border-blue-500 text-white"
                                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                    )}
                                >
                                    EcoCash
                                </button>
                            </div>
                        </div>
                    )}

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

            <Modal
                isOpen={isQuickSaleModalOpen}
                onClose={() => setIsQuickSaleModalOpen(false)}
                title="Quick Sale (Manual Entry)"
            >
                <div className="space-y-4 pt-2">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Enter product details to add to cart. If product exists in inventory, it will be tracked; otherwise, it will be recorded as untracked.</p>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Name</label>
                        <Input
                            placeholder="e.g. Premium Hub Cap"
                            value={quickSale.name}
                            onChange={(e) => setQuickSale({ ...quickSale, name: e.target.value })}
                            className="bg-slate-950"
                        />
                    </div>
                    <div className="flex gap-2">
                        <div className="space-y-2 flex-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantity</label>
                            <Input
                                type="number"
                                min="1"
                                placeholder="1"
                                value={quickSale.quantity}
                                onChange={(e) => setQuickSale({ ...quickSale, quantity: e.target.value })}
                                className="bg-slate-950"
                            />
                        </div>
                        <div className="space-y-2 flex-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selling Price ($)</label>
                            <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                placeholder="0.00"
                                value={quickSale.price}
                                onChange={(e) => setQuickSale({ ...quickSale, price: e.target.value })}
                                className="bg-slate-950"
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleQuickSale}
                        className="w-full bg-sky-600 hover:bg-sky-500 font-black uppercase italic tracking-widest h-12 mt-4"
                    >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Add to Cart
                    </Button>
                </div>
            </Modal>

            <Modal
                isOpen={isEodShareModalOpen}
                onClose={() => setIsEodShareModalOpen(false)}
                title="End of Day Report"
            >
                <div className="space-y-4">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">
                        Share the EOD PDF via WhatsApp (or any app). After sharing, log out.
                    </p>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 font-mono text-xs text-slate-200 whitespace-pre-wrap">
                        {eodShareText || `NIRVANA EOD — ${shopId.toUpperCase()}`}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={shareEodToWhatsApp} className="flex-1 h-11 font-black uppercase italic tracking-widest">
                            Share to WhatsApp
                        </Button>
                        <Button
                            variant="outline"
                            onClick={finalizeEodLogout}
                            className="flex-1 h-11 border-slate-800 font-black uppercase italic tracking-widest"
                        >
                            Logout
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isReturnModalOpen}
                onClose={() => setIsReturnModalOpen(false)}
                title="Return / Credit Note"
            >
                <div className="space-y-4">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">
                        Manager-only. Select a Sale ID from today's sales or enter manually.
                    </p>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Sale (Today)</label>
                        <select
                            value={returnSaleId}
                            onChange={(e) => setReturnSaleId(e.target.value)}
                            className="h-10 bg-slate-950 border border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none w-full"
                        >
                            <option value="">-- Select a sale --</option>
                            {todaysSales.map((sale: any) => (
                                <option key={sale.id} value={sale.id}>
                                    {sale.id} - {sale.clientName || 'Walk-in'} - ${(sale.totalWithTax || 0).toFixed(2)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Or Enter Sale ID Manually</label>
                        <Input
                            value={returnSaleId}
                            onChange={(e) => setReturnSaleId(e.target.value)}
                            className="bg-slate-950"
                            placeholder="e.g. ab12cd3"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                            <Input
                                value={returnQty}
                                onChange={(e) => setReturnQty(e.target.value)}
                                className="bg-slate-950"
                                inputMode="numeric"
                                placeholder="1"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Restock</label>
                            <select
                                value={returnRestock ? "yes" : "no"}
                                onChange={(e) => setReturnRestock(e.target.value === "yes")}
                                className="h-10 bg-slate-950 border border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none"
                            >
                                <option value="yes">Yes (resellable)</option>
                                <option value="no">No (damaged)</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reason</label>
                        <select
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            className="h-10 bg-slate-950 border border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none"
                        >
                            <option value="Customer return">Customer return</option>
                            <option value="Damaged">Damaged</option>
                            <option value="Wrong item">Wrong item</option>
                            <option value="Warranty">Warranty</option>
                            <option value="Price correction">Price correction</option>
                            <option value="Goodwill">Goodwill</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Notes (optional)</label>
                        <Input
                            value={returnNotes}
                            onChange={(e) => setReturnNotes(e.target.value)}
                            className="bg-slate-950"
                            placeholder="Short context for audit trail"
                        />
                    </div>

                    {returnStatus ? (
                        <div className="text-xs font-bold text-slate-300 bg-slate-950/40 border border-slate-800 rounded-lg p-3 whitespace-pre-wrap">
                            {returnStatus}
                        </div>
                    ) : null}

                    <Button
                        className="w-full h-12 font-black uppercase italic tracking-widest"
                        disabled={returnBusy || !returnSaleId.trim()}
                        onClick={async () => {
                            setReturnBusy(true);
                            setReturnStatus("");
                            try {
                                const qtyNum = Math.max(1, Number(returnQty || 1));
                                const res = await fetch('/api/returns', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        saleId: returnSaleId.trim(),
                                        quantity: qtyNum,
                                        reason: returnReason,
                                        notes: returnNotes,
                                        restock: returnRestock,
                                    })
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                    setReturnStatus(`ERROR: ${data?.error || 'Return failed'}`);
                                    return;
                                }
                                setReturnStatus(`Return recorded. Credit note id: ${data?.returnId || 'OK'}`);
                                setReturnSaleId("");
                                setReturnQty("1");
                                setReturnNotes("");
                            } catch (e: any) {
                                setReturnStatus(`ERROR: ${e?.message || 'Return failed'}`);
                            } finally {
                                setReturnBusy(false);
                            }
                        }}
                    >
                        {returnBusy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : "Issue Credit Note"}
                    </Button>
                </div>
            </Modal>

            <Modal
                isOpen={isReceiptsModalOpen}
                onClose={() => setIsReceiptsModalOpen(false)}
                title="Today's Receipts"
            >
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {todaysSales.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No sales recorded today</p>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                {todaysSales.length} sale{todaysSales.length !== 1 ? 's' : ''} today
                            </p>
                            {todaysSales.map((sale: any) => (
                                <div key={sale.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs font-bold text-slate-200">{sale.id}</p>
                                            <p className="text-[10px] text-slate-500">{sale.clientName || 'Walk-in'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-emerald-400">${(sale.totalWithTax || 0).toFixed(2)}</p>
                                            <p className="text-[10px] text-slate-500">{sale.items?.length || 0} items</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
