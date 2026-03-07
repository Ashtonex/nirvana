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
    LogOut,
    Printer
} from "lucide-react";
import { recordSale, recordQuotation, addNewProductFromPos, recordUntrackedSale, openCashRegister, recordPosExpense } from "../../actions";
import { thermalPrinter } from "@/lib/thermalPrinter";
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

    // Cash Register Logic
    const [isCashRegisterModalOpen, setIsCashRegisterModalOpen] = useState(false);
    const [cashRegisterAmount, setCashRegisterAmount] = useState("");

    // Expense Tracking
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [expenseAmount, setExpenseAmount] = useState("");
    const [expenseDescription, setExpenseDescription] = useState("");

    // Receipt context & Modal state
    const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

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

    // Identify Top 3 Best Sellers for this shop
    const itemSalesCount: Record<string, number> = {};
    (db.sales || []).filter((s: any) => s.shopId === shopId).forEach((s: any) => {
        itemSalesCount[s.itemId] = (itemSalesCount[s.itemId] || 0) + Number(s.quantity || 0);
    });
    const topSellerIds = Object.entries(itemSalesCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([id]) => id);

    const topSellers = inventory.filter(item => topSellerIds.includes(item.id));
    // Fallback if no sales yet: just show first 3
    const defaultDisplayItems = topSellers.length >= 1 ? topSellers : inventory.slice(0, 3);

    // Calculate Cash Drawer Math
    const ledger = db.ledger || [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Did we open today?
    const todaysOpening = ledger.find((l: any) => l.category === 'Cash Drawer Opening' && l.shopId === shopId && String(l.date).startsWith(todayStr));
    const hasOpenedRegister = !!todaysOpening;

    // 2. What was yesterday's exact closing?
    // Last Opening + All Cash Sales since then - All POS Expenses since then
    let expectedOpeningCash = 0;
    let carryOverSales = 0;
    let carryOverExpenses = 0;
    let carryOverBaseline = 0;

    // Find the very last opening before today
    const pastOpenings = ledger.filter((l: any) => l.category === 'Cash Drawer Opening' && l.shopId === shopId && !String(l.date).startsWith(todayStr));
    const lastOpening = pastOpenings.sort((a: any) => new Date(a.date).getTime() - new Date(todayStr).getTime())[0]; // Simplified sort to find recent

    if (lastOpening) {
        const lastOpenDate = new Date(lastOpening.date).getTime();
        carryOverBaseline = Number(lastOpening.amount);

        // Sales after the last opening, but before today started
        const salesSinceLastOpen = (db.sales || []).filter((s: any) => s.shopId === shopId && s.paymentMethod === 'cash' && new Date(s.date).getTime() >= lastOpenDate && !String(s.date).startsWith(todayStr));
        carryOverSales = salesSinceLastOpen.reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

        // POS Expenses after last opening, before today
        const expensesSinceLastOpen = ledger.filter((l: any) => l.category === 'POS Expense' && l.shopId === shopId && new Date(l.date).getTime() >= lastOpenDate && !String(l.date).startsWith(todayStr));
        carryOverExpenses = expensesSinceLastOpen.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

        expectedOpeningCash = carryOverBaseline + carryOverSales - carryOverExpenses;
    }

    // 3. Current Live Drawer (Today's Opening + Today's Cash Sales - Today's Expenses)

    const todaysCashSales = (db.sales || []).filter((s: any) =>
        s.shopId === shopId &&
        s.paymentMethod === 'cash' &&
        String(s.date).startsWith(todayStr)
    ).reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

    const todaysExpenses = ledger.filter((l: any) =>
        l.category === 'POS Expense' &&
        l.shopId === shopId &&
        String(l.date).startsWith(todayStr)
    ).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const baseBalance = hasOpenedRegister ? Number(todaysOpening.amount) : expectedOpeningCash;
    const liveCashInDrawer = baseBalance + todaysCashSales - todaysExpenses;

    // Trigger auto-print when success modal opens
    React.useEffect(() => {
        if (isSuccessModalOpen && activeReceipt) {
            const timer = setTimeout(() => {
                window.print();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [isSuccessModalOpen, activeReceipt]);

    // Trigger open modal on load if missing
    React.useEffect(() => {
        if (!hasOpenedRegister && !isCashRegisterModalOpen) {
            setIsCashRegisterModalOpen(true);
            setCashRegisterAmount(expectedOpeningCash.toFixed(2));
        }
    }, [hasOpenedRegister, isCashRegisterModalOpen, expectedOpeningCash]);

    const handleOpenRegister = async () => {
        const val = parseFloat(cashRegisterAmount);
        if (isNaN(val) || val < 0) {
            alert("Please enter a valid cash amount.");
            return;
        }
        startTransition(async () => {
            try {
                await openCashRegister(shopId, expectedOpeningCash, val);
                setIsCashRegisterModalOpen(false);
            } catch (e) {
                alert("Failed to open register.");
            }
        });
    };

    const handleRecordExpense = async () => {
        const val = parseFloat(expenseAmount);
        if (isNaN(val) || val <= 0 || !expenseDescription) {
            alert("Please provide a valid amount and description.");
            return;
        }
        startTransition(async () => {
            try {
                await recordPosExpense(shopId, val, expenseDescription, selectedEmployeeId || "system");
                setIsExpenseModalOpen(false);
                setExpenseAmount("");
                setExpenseDescription("");
                alert("Expense recorded successfully.");
            } catch (e) {
                alert("Failed to record expense.");
            }
        });
    };

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

    const handleQuickSale = async () => {
        const qty = parseInt(quickSale.quantity) || 1;
        const salePrice = parseFloat(quickSale.price) || 0;

        if (!quickSale.name || qty <= 0 || salePrice <= 0) {
            alert("Please enter product name, quantity (>0), and price (>0)");
            return;
        }

        startTransition(async () => {
            try {
                // Try to find the product in inventory
                const existingItem = inventory.find((item: any) =>
                    item.name.toLowerCase() === quickSale.name.toLowerCase()
                );

                if (existingItem) {
                    // Add tracked product to cart
                    addToCart(existingItem, salePrice, qty);
                } else {
                    // It genuinely doesn't exist. Create it on the fly in MASTER inventory.
                    const addedItem: any = await addNewProductFromPos({
                        name: quickSale.name,
                        category: "Quick Sale",
                        landedCost: salePrice * 0.7, // Estimate cost at 70% of sale price
                        shopId,
                        initialStock: 0 // Will be handled by the sale itself
                    });

                    if (addedItem?.id) {
                        // Create a mock inventory item object to add to cart immediately
                        const newItem = {
                            id: addedItem.id,
                            name: quickSale.name,
                            category: "Quick Sale",
                            quantity: 0,
                            landedCost: salePrice * 0.7,
                            allocations: [{ shopId, quantity: 0 }]
                        };
                        addToCart(newItem, salePrice, qty);
                    } else {
                        throw new Error("Failed to register new product");
                    }
                }

                setIsQuickSaleModalOpen(false);
                setQuickSale({ name: "", quantity: "1", price: "0" });
            } catch (error) {
                console.error("Quick sale failed:", error);
                alert("Failed to process quick sale registration.");
            }
        });
    };

    const taxRate = db.settings?.taxRate || 0.155;
    const totalBeforeTax = cart.reduce((sum, c) => sum + (c.price / (1 + taxRate)) * c.quantity, 0);
    const totalWithTax = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
    const totalTax = totalWithTax - totalBeforeTax;

    const handleCheckout = () => {
        startTransition(async () => {
            try {
                if (posMode === 'sale') {
                    const transactionId = Math.random().toString(36).substring(2, 9).toUpperCase();
                    const receiptItems = [];

                    for (const entry of cart) {
                        const isUntracked = entry.item.id.startsWith('QUICK_');
                        const netPrice = entry.price / (1 + taxRate);
                        const grossPrice = entry.price;
                        const lineNet = netPrice * entry.quantity;
                        const lineGross = grossPrice * entry.quantity;
                        const itemTax = lineGross - lineNet;

                        if (isUntracked) {
                            await recordUntrackedSale({
                                shopId,
                                itemName: entry.item.name,
                                quantity: entry.quantity,
                                unitPrice: netPrice,
                                totalBeforeTax: lineNet,
                                employeeId: selectedEmployeeId || "system",
                                clientName: clientName || "General Walk-in",
                                paymentMethod
                            });
                        } else {
                            await recordSale({
                                shopId,
                                itemId: entry.item.id,
                                itemName: entry.item.name,
                                quantity: entry.quantity,
                                unitPrice: netPrice,
                                totalBeforeTax: lineNet,
                                employeeId: selectedEmployeeId || "system",
                                clientName: clientName || "General Walk-in",
                                paymentMethod
                            });
                        }

                        receiptItems.push({
                            name: entry.item.name,
                            quantity: entry.quantity,
                            priceNet: netPrice,
                            priceGross: grossPrice,
                            totalNet: lineNet,
                            totalGross: lineGross,
                            tax: itemTax
                        });
                    }

                    // Prepare receipt for printing
                    const cashier = employees.find((e: any) => e.id === selectedEmployeeId)?.name || "System";
                    setActiveReceipt({
                        orderId: `ORD-${transactionId}`,
                        receiptNo: `#RCT-${transactionId}`,
                        transactionId,
                        shopName: shop?.name || "NIRVANA STORE",
                        cashier,
                        clientName: clientName || "Walk-in Customer",
                        clientPhone: clientPhone || "N/A",
                        items: receiptItems,
                        subtotal: totalBeforeTax,
                        tax: totalTax,
                        total: totalWithTax,
                        dateStamp: new Date().toLocaleDateString(),
                        timeStamp: new Date().toLocaleTimeString(),
                        paymentMethod
                    });

                    setIsSuccessModalOpen(true);
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
            <div className="md:col-span-8 space-y-6">
                {/* Full-width Search Bar */}
                <div className="relative w-full group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
                    <Input
                        placeholder="Search products, categories, or suppliers..."
                        className="pl-12 h-14 bg-slate-900/50 border-slate-800 text-base focus:bg-slate-900 focus:border-violet-500/50 transition-all rounded-2xl shadow-2xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                        onClick={() => setIsExpenseModalOpen(true)}
                        variant="outline"
                        className="h-10 px-3 border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="Record shop expense"
                    >
                        <Minus className="h-4 w-4" /> Add Exp.
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

                <div className="flex gap-2 w-full mt-4 sm:mt-0 sm:w-auto overflow-x-auto pb-2 scrollbar-hide">
                    <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-3 h-10 shadow-lg min-w-max">
                        <Coins className="h-4 w-4 text-emerald-400" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase font-black leading-none">Drawer Cash</span>
                            <span className="text-xs font-bold text-slate-200">${liveCashInDrawer.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-3 h-10 shadow-lg min-w-max">
                        <AlertCircle className="h-4 w-4 text-rose-400" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 uppercase font-black leading-none">Today's Exp.</span>
                            <span className="text-xs font-bold text-slate-200">${todaysExpenses.toFixed(2)}</span>
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
                        {(searchTerm ? filteredInventory : defaultDisplayItems).map((item) => {
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
                title="Quick Sale Request"
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-400 font-medium">Record a sale for a product not in the system yet.</p>
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Product Name</label>
                        <Input
                            placeholder="e.g. Wireless Mouse"
                            className="bg-slate-950 border-slate-800 mt-1 placeholder:text-slate-700 font-bold"
                            value={quickSale.name}
                            onChange={(e) => setQuickSale({ ...quickSale, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity</label>
                            <Input
                                type="number"
                                min="1"
                                className="bg-slate-950 border-slate-800 mt-1 font-mono font-bold"
                                value={quickSale.quantity}
                                onChange={(e) => setQuickSale({ ...quickSale, quantity: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Sale Price (Each)</label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-[10px] text-slate-500 font-mono">$</span>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="pl-7 bg-slate-950 border-slate-800 font-mono font-bold"
                                    value={quickSale.price}
                                    onChange={(e) => setQuickSale({ ...quickSale, price: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <Button
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black uppercase italic tracking-wider h-12 mt-4"
                        onClick={handleQuickSale}
                    >
                        Add to Cart
                    </Button>
                </div>
            </Modal>

            {/* Checkout Success Modal */}
            <Modal
                isOpen={isSuccessModalOpen}
                onClose={() => setIsSuccessModalOpen(false)}
                title="Sale Complete!"
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-400 font-medium">Sale recorded successfully. You can print a receipt or close this window.</p>
                    {activeReceipt && (
                        <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
                            <Button
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase italic tracking-wider h-12 flex items-center justify-center gap-2"
                                onClick={async () => {
                                    try {
                                        await thermalPrinter.printReceipt(activeReceipt);
                                    } catch (e: any) {
                                        alert("Direct printing failed. Please check connection or use system print.\n\nError: " + e.message);
                                    }
                                }}
                            >
                                <Printer className="h-5 w-5" /> Print Directly (USB)
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full border-slate-800 text-slate-400 font-black uppercase italic tracking-wider h-12"
                                onClick={() => window.print()}
                            >
                                Use System Print
                            </Button>
                            <Button
                                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black uppercase italic tracking-wider h-12 mt-2"
                                onClick={() => setIsSuccessModalOpen(false)}
                            >
                                Done
                            </Button>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Cash Register Modal (Force Open on Load) */}
            <Modal
                isOpen={isCashRegisterModalOpen}
                onClose={() => {
                    if (!hasOpenedRegister) {
                        alert("You must open the register to proceed.");
                    } else {
                        setIsCashRegisterModalOpen(false);
                    }
                }}
                title={hasOpenedRegister ? "View Register" : "Open Register"}
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-400 font-medium">Please enter the actual physical cash currently in the drawer to start your shift.</p>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl pointer-events-none" />
                        <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3 flex items-center gap-2">
                            <History className="h-3 w-3 text-violet-400" /> Yesterday's Carry Over Reconciliation
                        </div>

                        <div className="space-y-2 mb-4 border-b border-slate-800 pb-3">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Starting Balance:</span>
                                <span className="font-mono text-slate-300">${carryOverBaseline.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500 text-emerald-500/80">+ Yesterday's Cash Sales:</span>
                                <span className="font-mono text-emerald-400/80">${carryOverSales.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500 text-rose-500/80">- Yesterday's POS Expenses:</span>
                                <span className="font-mono text-rose-400/80">${carryOverExpenses.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-end">
                            <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-none">Expected Closing Cash</div>
                            <div className="text-xl font-black font-mono text-white leading-none">${expectedOpeningCash.toFixed(2)}</div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Confirm Actual Physical Cash</label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-[10px] text-slate-500 font-mono font-bold text-lg">$</span>
                            <Input
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                className="pl-8 bg-slate-950 border-violet-500/30 text-lg font-mono font-black h-12"
                                value={cashRegisterAmount}
                                onChange={(e) => setCashRegisterAmount(e.target.value)}
                            />
                        </div>
                        {cashRegisterAmount && parseFloat(cashRegisterAmount) - expectedOpeningCash !== 0 && (
                            <div className={cn(
                                "text-xs font-black uppercase italic mt-2 p-2 rounded",
                                parseFloat(cashRegisterAmount) - expectedOpeningCash > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                            )}>
                                {parseFloat(cashRegisterAmount) - expectedOpeningCash > 0 ? "Register Overflow By " : "Register Short By "}
                                ${Math.abs(parseFloat(cashRegisterAmount) - expectedOpeningCash).toFixed(2)}
                            </div>
                        )}
                    </div>

                    {!hasOpenedRegister && (
                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase italic tracking-wider h-12 mt-4"
                            onClick={handleOpenRegister}
                            disabled={isPending}
                        >
                            {isPending ? "Recording..." : "Start Shift"}
                        </Button>
                    )}
                </div>
            </Modal >

            {/* Expense Modal */}
            < Modal
                isOpen={isExpenseModalOpen}
                onClose={() => setIsExpenseModalOpen(false)}
                title="Record Shop Expense"
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-400 font-medium">Record money taken out of the drawer for day-to-day shop expenses.</p>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Expense Amount</label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-[10px] text-slate-500 font-mono font-bold text-lg">$</span>
                            <Input
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                className="pl-8 bg-slate-950 border-rose-500/30 text-lg font-mono font-black h-12 text-rose-400"
                                value={expenseAmount}
                                onChange={(e) => setExpenseAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description / Reason</label>
                        <Input
                            placeholder="e.g. Lunch for staff"
                            className="bg-slate-950 border-slate-800 mt-1 placeholder:text-slate-700 font-bold h-12"
                            value={expenseDescription}
                            onChange={(e) => setExpenseDescription(e.target.value)}
                        />
                    </div>

                    <Button
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black uppercase italic tracking-wider h-12 mt-4"
                        onClick={handleRecordExpense}
                        disabled={isPending}
                    >
                        {isPending ? "Recording..." : "Deduct from Drawer"}
                    </Button>
                </div>
            </Modal >

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
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="text-xs font-black text-slate-100 uppercase italic tracking-tight">{sale.itemName}</p>
                                                <p className="text-xs font-mono font-bold text-emerald-400">${(sale.totalWithTax || 0).toFixed(2)}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div className="space-y-0.5">
                                                    <p className="text-slate-500 font-bold uppercase tracking-widest">Product ID</p>
                                                    <p className="text-slate-300 font-mono truncate">{sale.itemId || sale.id}</p>
                                                </div>
                                                <div className="space-y-0.5 text-right">
                                                    <p className="text-slate-500 font-bold uppercase tracking-widest">Detail</p>
                                                    <p className="text-slate-300 font-bold">
                                                        {sale.quantity} x ${(sale.unitPrice * (1 + (db.settings?.taxRate || 0.155))).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-slate-800/50 flex justify-between items-center">
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Client: <span className="text-slate-400">{sale.clientName || 'Walk-in'}</span></p>
                                                <p className="text-[9px] text-slate-600 font-mono italic">{sale.id}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Thermal Receipt (Hidden from screen, visible only for print) */}
            {activeReceipt && (
                <div id="thermal-receipt" className="hidden print:block w-[58mm] bg-white text-black p-4 font-mono text-[10px] leading-tight mx-auto">
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @media print {
                            @page { size: 58mm auto; margin: 0; }
                            body * { visibility: hidden; }
                            #thermal-receipt, #thermal-receipt * { visibility: visible; }
                            #thermal-receipt { position: absolute; left: 0; top: 0; width: 58mm; }
                        }
                    `}} />

                    <div className="text-center space-y-1 mb-4 border-b border-black pb-2">
                        <h1 className="text-sm font-bold uppercase">{activeReceipt.shopName}</h1>
                        <p className="text-[8px] uppercase tracking-tighter">NIRVANA PREMIUM NETWORK</p>
                        <p className="text-[7px] font-bold uppercase">{activeReceipt.dateStamp} | {activeReceipt.timeStamp}</p>
                    </div>

                    <div className="space-y-1 mb-4">
                        <div className="flex justify-between">
                            <span>CASHIER:</span>
                            <span className="font-bold">{activeReceipt.cashier}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>CLIENT:</span>
                            <span className="font-bold truncate max-w-[30mm]">{activeReceipt.clientName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>ORDER ID:</span>
                            <span className="font-bold">{activeReceipt.orderId}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>RECEIPT NO:</span>
                            <span className="font-bold">{activeReceipt.receiptNo}</span>
                        </div>
                    </div>

                    <div className="border-b border-dashed border-black mb-2 opacity-50" />

                    <div className="space-y-3 mb-4">
                        {activeReceipt.items.map((item: any, i: number) => (
                            <div key={i} className="space-y-1">
                                <div className="flex justify-between font-bold">
                                    <span className="max-w-[40mm] truncate">{item.name}</span>
                                    <span>x{item.quantity}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 text-[7px] opacity-80">
                                    <div className="flex justify-between">
                                        <span>COST/1 (NET):</span>
                                        <span>${item.priceNet.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>COST/1 (GROSS):</span>
                                        <span>${item.priceGross.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>ITEM TAX:</span>
                                        <span>${item.tax.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>LINE TOTAL:</span>
                                        <span>${item.totalGross.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="border-b border-dotted border-black/20" />
                            </div>
                        ))}
                    </div>

                    <div className="border-t border-black pt-2 space-y-1">
                        <div className="flex justify-between text-[8px]">
                            <span>TOTAL (WITHOUT TAX):</span>
                            <span className="font-bold">${activeReceipt.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[8px]">
                            <span>SALES TAX (15.5%):</span>
                            <span className="font-bold">${activeReceipt.tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-black pt-2 mt-1 border-t-2 border-black">
                            <span>TOTAL PAID:</span>
                            <span>${activeReceipt.total.toFixed(2)}</span>
                        </div>
                        <div className="text-[7px] italic mt-2 font-bold uppercase text-center">
                            PAYMENT METHOD: {activeReceipt.paymentMethod}
                        </div>
                    </div>

                    <div className="flex flex-col items-center mt-6 pt-4 border-t border-dashed border-black space-y-2">
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=VERIFY_NIRVANA_${activeReceipt.transactionId}`}
                            alt="Verification QR"
                            className="w-24 h-24 grayscale"
                        />
                        <p className="text-[7px] text-center font-bold uppercase tracking-widest">Scan to Verify Authentic Purchase</p>
                        <p className="text-[6px] text-center opacity-70">Thank you for choosing NIRVANA. For returns, bring this original receipt.</p>
                    </div>

                    <div className="mt-4 text-center text-[7px] font-black tracking-widest uppercase py-2 border-y border-black/10">
                        KIPASA_DUB DUB_TRADECENTER
                    </div>

                    <div className="mt-4 text-center text-[8px] font-bold pb-8">
                        *** END OF RECEIPT ***
                    </div>
                </div>
            )}

            {/* Transaction Success Modal */}
            <Modal
                isOpen={isSuccessModalOpen}
                onClose={() => setIsSuccessModalOpen(false)}
                title="Transaction Confirmed"
            >
                <div className="space-y-6 pt-2 text-center">
                    <div className="flex justify-center flex-col items-center gap-2">
                        <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center border-4 border-emerald-500/20">
                            <BadgeCheck className="h-10 w-10 text-emerald-400" />
                        </div>
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-emerald-400">Sale Recorded</h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Receipt #RCT-{activeReceipt?.transactionId}</p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-left">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Total Charged:</span>
                            <span className="font-mono font-black text-white">${activeReceipt?.total.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Payment:</span>
                            <span className="font-bold uppercase text-slate-300">{activeReceipt?.paymentMethod}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            onClick={() => window.print()}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase italic tracking-widest h-12"
                        >
                            <Printer className="h-4 w-4 mr-2" /> Print Again
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsSuccessModalOpen(false);
                                setCart([]);
                                // Reset other states
                            }}
                            className="border-slate-800 font-black uppercase italic tracking-widest h-12"
                        >
                            Done
                        </Button>
                    </div>

                    <p className="text-[8px] text-slate-600 font-bold uppercase tracking-tight">Receipt triggered for thermal printer at 58mm width.</p>
                </div>
            </Modal>
        </div>
    );
}
