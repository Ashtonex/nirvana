"use client";

import React, { useState, useTransition, useEffect, useMemo, useDeferredValue } from "react";
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
    ShieldCheck,
    Settings,
    BadgeCheck,
    TrendingUp,
    RefreshCcw,
    Skull,
    History,
    Sparkles,
    Coins,
    PackagePlus,
    ClipboardList,
    ArrowRightLeft,
    Power,
    MessageSquare,
    LogOut,
    Printer,
    Heart
} from "lucide-react";
import {
    recordSale,
    recordQuotation,
    addNewProductFromPos,
    recordUntrackedSale,
    openCashRegister,
    recordPosExpense,
    postDrawerToOperations,
    recordLayby,
    updateLaybyPayment,
    recordTitheWithdrawal
} from "../../actions";
import { useOfflineSales } from "@/components/useOfflineSales";
import { thermalPrinter } from "@/lib/thermalPrinter";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Optimized Search Input to prevent re-renders of the entire POS on every keystroke
const SearchBar = React.memo(({ value, onChange }: { value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
        </div>
        <Input
            placeholder="Search products, categories, or suppliers..."
            className="pl-12 h-14 bg-slate-900/50 border-slate-800 text-base focus:bg-slate-900 focus:border-violet-500/50 transition-all rounded-2xl shadow-2xl"
            value={value}
            onChange={onChange}
        />
    </div>
));
SearchBar.displayName = "SearchBar";

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

type LaybyItem = {
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    total: number;
};

type LaybyQuote = {
    id: string;
    shopId: string;
    clientName: string;
    clientPhone: string;
    items: LaybyItem[];
    totalBeforeTax: number;
    tax: number;
    totalWithTax: number;
    paidAmount: number;
    status: 'layby' | 'converted' | string;
    date: string;
    expiryDate?: string;
    employeeId?: string;
};

export default function POS({ shopId, inventory, db }: { shopId: string, inventory: any[], db: any }) {
    const [cart, setCart] = useState<{ item: any, quantity: number, price: number }[]>([]);
    const [lastCheckoutInventory, setLastCheckoutInventory] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const [isPending, startTransition] = useTransition();

    // Local inventory state so POS can immediately sell ad-hoc items without a page reload.
    const [inventoryState, setInventoryState] = useState<any[]>(() => inventory || []);
    useEffect(() => {
        setInventoryState(inventory || []);
    }, [inventory]);

    // Optimized search results using deferred value and memoization
    const filteredInventory = useMemo(() => {
        const query = deferredSearchTerm.toLowerCase().trim();
        if (!query) return [];
        
        return inventoryState.filter((item: any) => {
            return (item.name?.toLowerCase().includes(query) ||
                item.category?.toLowerCase().includes(query));
        });
    }, [inventoryState, deferredSearchTerm]);

    // POS Modes
    const [posMode, setPosMode] = useState<'sale' | 'quote' | 'layby'>('sale');
    const [laybyDeposit, setLaybyDeposit] = useState("");
    const [isLaybyModalOpen, setIsLaybyModalOpen] = useState(false);
    const [selectedLaybyId, setSelectedLaybyId] = useState("");
    const [laybyPaymentAmount, setLaybyPaymentAmount] = useState("");

    // Client Info
    const [clientName, setClientName] = useState("");
    const [clientEmail, setClientEmail] = useState("");
    const [clientPhone, setClientPhone] = useState("");
    const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
    const [staffRole, setStaffRole] = useState<string>("");
    const [staffDisplayName, setStaffDisplayName] = useState<string>("");
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'ecocash'>('cash');
    const [backlogDate, setBacklogDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isBacklogMode, setIsBacklogMode] = useState(false);

    // Offline handling
    const { saveSaleOffline, syncPendingSales, getPendingCount, isOnline } = useOfflineSales();
    const [pendingSyncCount, setPendingSyncCount] = useState(0);

    const [opsLedger, setOpsLedger] = useState<any[]>([]);
    const [investBalance, setInvestBalance] = useState<{ availableBalance: number; totalDeposited: number; totalWithdrawn: number; depositCount: number } | null>(null);
    const [isTitheModalOpen, setIsTitheModalOpen] = useState(false);
    const [titheWithdrawAmount, setTitheWithdrawAmount] = useState("");
    const [titheWithdrawDesc, setTitheWithdrawDesc] = useState("");
    const [isRecordingTithe, setIsRecordingTithe] = useState(false);

    useEffect(() => {
        getPendingCount().then(setPendingSyncCount);
    }, [getPendingCount]);

    useEffect(() => {
        fetch(`/api/operations/ledger?limit=5000&shopId=${shopId}`, { cache: "no-store", credentials: "include" })
            .then(r => r.ok ? r.json() : { rows: [] })
            .then(d => {
                const rows = Array.isArray(d.rows) ? d.rows : [];
                setOpsLedger(rows.filter((r: any) => r.shop_id === shopId));
            })
            .catch(() => {});
    }, [shopId]);

    useEffect(() => {
        if (!shopId) return;
        fetch(`/api/invest/balance?shopId=${shopId}`, { cache: "no-store", credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && !d.error) setInvestBalance(d);
            })
            .catch(() => {});
    }, [shopId]);

    // Auto-select the currently logged-in staff member so sales/audit entries are attributed correctly.
    useEffect(() => {
        let cancelled = false;
        async function hydrateStaff() {
            if (selectedEmployeeId) return;
            try {
                const res = await fetch("/api/staff/me", { cache: "no-store", credentials: "include" });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                const staffId = data?.staff?.id;
                if (!cancelled && staffId) {
                    setSelectedEmployeeId(String(staffId));
                    setStaffRole(String(data?.staff?.role || ""));
                    const name = String(data?.staff?.name || "").trim();
                    const surname = String(data?.staff?.surname || "").trim();
                    const combined = `${name} ${surname}`.trim();
                    setStaffDisplayName(combined || String(data?.staff?.email || "") || "Manager");
                }
            } catch { }
        }
        hydrateStaff();
        return () => {
            cancelled = true;
        };
    }, [selectedEmployeeId]);

    const canUseManagerTools = (() => {
        const r = String(staffRole || "").toLowerCase();
        return r === "owner" || r === "admin" || r === "manager" || r === "lead_manager" || r === "lead manager";
    })();
    const [isManagerToolsOpen, setIsManagerToolsOpen] = useState(false);

    // Discount (0.50 to 5.00 USD)
    const [discount, setDiscount] = useState(0);

    // UI States
    const [isClosingDay, setIsClosingDay] = useState(false);
    const [isEodShareModalOpen, setIsEodShareModalOpen] = useState(false);
    const [eodShareUrl, setEodShareUrl] = useState<string>("");
    const [eodShareBlob, setEodShareBlob] = useState<Blob | null>(null);
    const [eodShareText, setEodShareText] = useState<string>("");
    const [eodHistory, setEodHistory] = useState<{id: string; date: string; text: string; blob: Blob | null; url: string; shopId: string}[]>([]);
    const [isEodHistoryModalOpen, setIsEodHistoryModalOpen] = useState(false);

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
    const [receiptsPaymentFilter, setReceiptsPaymentFilter] = useState<'cash' | 'ecocash'>('cash');

    // Expenses receipts modal
    const [isExpensesModalOpen, setIsExpensesModalOpen] = useState(false);

    // Get today's sales for calculations
    const today = new Date().toISOString().split('T')[0];
    const todaysSales = (db.sales || []).filter((s: any) => {
        const saleDate = s.date?.split('T')[0];
        return saleDate === today && s.shopId === shopId;
    });
    const todaysTotalSales = todaysSales.reduce((sum: number, s: any) => sum + (s.totalWithTax || 0), 0);

    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: "", category: "", landedCost: "", initialStock: "0" });

    // Quick Sale Modal State (manual entry for untracked products)
    const [isQuickSaleModalOpen, setIsQuickSaleModalOpen] = useState(false);
    const [quickSale, setQuickSale] = useState({ name: "", quantity: "1", price: "0" });

    // Cash Register Logic
    const [isCashRegisterModalOpen, setIsCashRegisterModalOpen] = useState(false);
    const [cashRegisterAmount, setCashRegisterAmount] = useState("");
    const [hasDismissedRegisterModal, setHasDismissedRegisterModal] = useState(false);

    // Printer Connection State
    const [printerTransport, setPrinterTransport] = useState<'usb' | 'bluetooth'>('usb');
    const [isPrinterConnected, setIsPrinterConnected] = useState(false);
    const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);

    // Expense Tracking
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [expenseAmount, setExpenseAmount] = useState("");
    const [expenseDescription, setExpenseDescription] = useState("");
    const [expenseToInvest, setExpenseToInvest] = useState(false);
    const [expenseToOperations, setExpenseToOperations] = useState(false);

    // Operations vault posting (drawer → master vault)
    const [isOpsPostModalOpen, setIsOpsPostModalOpen] = useState(false);
    const [opsPostAmount, setOpsPostAmount] = useState("");
    const [opsPostNotes, setOpsPostNotes] = useState("");
    const [opsPostKind, setOpsPostKind] = useState<"eod_deposit" | "overhead_contribution">("overhead_contribution");

    // Auto-detect overhead keywords in notes
    useEffect(() => {
        const notes = opsPostNotes.toLowerCase();
        const overheadKeywords = ["rent", "utilities", "salary", "salaries", "wages", "electric", "water", "internet", "overhead"];
        const hasOverheadKeyword = overheadKeywords.some(kw => notes.includes(kw));
        if (hasOverheadKeyword && opsPostKind === "eod_deposit") {
            setOpsPostKind("overhead_contribution");
        }
    }, [opsPostNotes, opsPostKind]);

    // Receipt context & Modal state
    const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

    // Live Lay-by list for this shop (so newly created / updated lay-bys appear immediately)
    const [laybyList, setLaybyList] = useState<LaybyQuote[]>(
        () => (db.quotations || []).filter((q: any) => q.status === 'layby' && q.shopId === shopId)
    );

    const employees = (db.employees || []).filter((e: any) => e.shopId === shopId && e.active);
    const shop = db.shops.find((s: any) => s.id === shopId);
    const shopExpenses = shop ? Object.values(shop.expenses).reduce((a: number, b: any) => a + Number(b), 0) : 0;

    const totalShopStock = inventoryState.reduce((sum, item) => {
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

    const topSellers = inventoryState.filter(item => topSellerIds.includes(item.id));
    // Fallback if no sales yet: just show first 3
    const defaultDisplayItems = topSellers.length >= 1 ? topSellers : inventoryState.slice(0, 3);

    // Calculate Cash Drawer Math
    const ledger = db.ledger || [];
    const todayStr = new Date().toLocaleDateString('en-CA'); // Local Date (YYYY-MM-DD)
    const CASH_OUT_CATEGORIES = new Set(["POS Expense", "Operations Transfer", "Perfume", "Overhead", "Tithe", "Groceries", "Tithe Withdrawal"]);

    // 1. Did we open today?
    const todaysOpening = ledger.find((l: any) => 
        l.category === 'Cash Drawer Opening' && 
        l.shopId === shopId && 
        String(l.date || "").includes(todayStr)
    );
    const hasOpenedRegister = !!todaysOpening;

    // Helper functions for keyword matching (must be defined early for carry-over calc)
    const titheKeywords = ["tithe", "tithes", "offering", "church", "donation", "charity", "10%", "ten percent"];
    const groceriesKeywords = ["groceries", "grocery", "food", "supermarket", "provisions", "sundries", "rice", "sugar", "cooking oil", "flour", "bread", "milk", "eggs", "meat", "vegetables", "fruits", "snacks", "drinks", "beverages"];
    const isTitheExpense = (l: any) => l.category !== 'Tithe Withdrawal' && (l.category === 'Tithe' || titheKeywords.some(kw => String(l.description || "").toLowerCase().includes(kw)));
    const isGroceriesExpense = (l: any) => l.category === 'Groceries' || groceriesKeywords.some(kw => String(l.description || "").toLowerCase().includes(kw));

    // 2. What was yesterday's exact closing?
    // Yesterday's Opening + Yesterday's Cash Sales - Yesterday's POS Expenses
    let expectedOpeningCash = 0;
    let carryOverSales = 0;
    let carryOverExpenses = 0;
    let carryOverBaseline = 0;

    // Get yesterday's date in the same format as todayStr
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA'); // YYYY-MM-DD

    // Find yesterday's opening (not "very last opening")
    const yesterdayOpening = ledger.find((l: any) => 
        l.category === 'Cash Drawer Opening' && 
        l.shopId === shopId && 
        String(l.date || "").includes(yesterdayStr)
    );

    if (yesterdayOpening) {
        carryOverBaseline = Number(yesterdayOpening.amount);

        // Only look at yesterday's sales (not all sales since last opening)
        const yesterdaySales = (db.sales || []).filter((s: any) => 
            s.shopId === shopId && 
            s.paymentMethod === 'cash' && 
            String(s.date).includes(yesterdayStr)
        );
        carryOverSales = yesterdaySales.reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

        // Only look at yesterday's expenses (not all expenses since last opening)
        const yesterdayExpenses = ledger.filter((l: any) =>
            (CASH_OUT_CATEGORIES.has(String(l.category || "")) || isGroceriesExpense(l) || isTitheExpense(l)) &&
            l.shopId === shopId &&
            String(l.date).includes(yesterdayStr)
        );
        carryOverExpenses = yesterdayExpenses.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

        expectedOpeningCash = carryOverBaseline + carryOverSales - carryOverExpenses;
    } else {
        // If no yesterday opening, try to find the most recent opening and calculate from there
        const pastOpenings = ledger.filter((l: any) => 
            l.category === 'Cash Drawer Opening' && 
            l.shopId === shopId && 
            !String(l.date).startsWith(todayStr)
        );
        
        if (pastOpenings.length > 0) {
            const lastOpening = pastOpenings.sort((a: any, b: any) => 
                new Date(b.date).getTime() - new Date(a.date).getTime()
            )[0];
            
            const lastOpenDate = new Date(lastOpening.date);
            const lastOpenDateStr = lastOpenDate.toLocaleDateString('en-CA');
            
            carryOverBaseline = Number(lastOpening.amount);

            // Only include sales/expenses from that specific day
            const lastDaySales = (db.sales || []).filter((s: any) => 
                s.shopId === shopId && 
                s.paymentMethod === 'cash' && 
                String(s.date).includes(lastOpenDateStr)
            );
            carryOverSales = lastDaySales.reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

            const lastDayExpenses = ledger.filter((l: any) =>
                (CASH_OUT_CATEGORIES.has(String(l.category || "")) || isGroceriesExpense(l) || isTitheExpense(l)) &&
                l.shopId === shopId &&
                String(l.date).includes(lastOpenDateStr)
            );
            carryOverExpenses = lastDayExpenses.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

            expectedOpeningCash = carryOverBaseline + carryOverSales - carryOverExpenses;
        }
    }

    // 3. Current Live Drawer (Today's Opening + Today's Cash Sales - Today's Expenses)

    const todaysCashSales = (db.sales || []).filter((s: any) =>
        s.shopId === shopId &&
        s.paymentMethod === 'cash' &&
        String(s.date).startsWith(todayStr)
    ).reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

    const todaysPosExpenses = ledger.filter((l: any) =>
        ['POS Expense', 'Perfume', 'Overhead', 'Tithe', 'Groceries', 'Operations Transfer', 'Tithe Withdrawal'].includes(l.category) &&
        l.shopId === shopId &&
        String(l.date).startsWith(todayStr)
    ).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    // Tithe expenses (cumulative all-time)
    const cumulativeTithe = ledger.filter((l: any) =>
        l.shopId === shopId
    ).reduce((sum: number, l: any) => {
        if (isTitheExpense(l)) return sum + Number(l.amount || 0);
        if (l.category === 'Tithe Withdrawal') return sum - Number(l.amount || 0);
        return sum;
    }, 0);

    // Groceries - current month vs previous month
    const currentMonth = todayStr.substring(0, 7); // YYYY-MM
    const previousMonthDate = new Date();
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
    const previousMonth = previousMonthDate.toISOString().substring(0, 7);

    const currentMonthGroceries = ledger.filter((l: any) =>
        isGroceriesExpense(l) &&
        l.shopId === shopId &&
        String(l.date).startsWith(currentMonth)
    ).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const previousMonthGroceries = ledger.filter((l: any) =>
        isGroceriesExpense(l) &&
        l.shopId === shopId &&
        String(l.date).startsWith(previousMonth)
    ).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const groceriesExceeded = currentMonthGroceries > previousMonthGroceries && previousMonthGroceries > 0;

    const todaysOpsPosts = ledger.filter((l: any) =>
        l.category === 'Operations Transfer' &&
        !['POS Expense', 'Perfume', 'Overhead'].includes(l.category) &&
        l.shopId === shopId &&
        String(l.date).startsWith(todayStr)
    ).reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const todaysOpsIncome = opsLedger
        .filter((r: any) => r.amount > 0 && r.notes?.includes('Auto-routed from POS expense') && String(r.created_at).startsWith(todayStr))
        .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    const cumulativeOpsIncome = opsLedger
        .filter((r: any) => r.amount > 0 && r.notes?.includes('Auto-routed from POS expense'))
        .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    const baseBalance = hasOpenedRegister ? Number(todaysOpening.amount) : expectedOpeningCash;
    const liveCashInDrawer = baseBalance + todaysCashSales - (todaysPosExpenses + todaysOpsPosts);

    const SHOP_SERVICES = [
        { id: 'service_engraving', name: 'Engraving', category: 'Service', basePrice: 1 },
        { id: 'service_watch_repair', name: 'Watch Repairs', category: 'Service', basePrice: 1 },
        { id: 'service_wrapping', name: 'Wrapping', category: 'Service', basePrice: 1 },
    ];

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
        if (!hasOpenedRegister && !isCashRegisterModalOpen && !hasDismissedRegisterModal) {
            setIsCashRegisterModalOpen(true);
            setCashRegisterAmount(expectedOpeningCash.toFixed(2));
        }
    }, [hasOpenedRegister, isCashRegisterModalOpen, expectedOpeningCash, hasDismissedRegisterModal]);

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
                await recordPosExpense(
                    shopId, 
                    val, 
                    expenseDescription, 
                    selectedEmployeeId || "system",
                    {
                        toInvest: expenseToInvest,
                        toOperations: expenseToOperations,
                        date: isBacklogMode ? backlogDate : undefined
                    }
                );
                setIsExpenseModalOpen(false);
                setExpenseAmount("");
                setExpenseDescription("");
                setExpenseToInvest(false);
                setExpenseToOperations(false);
                alert("Expense recorded successfully.");
            } catch (e) {
                alert("Failed to record expense.");
            }
        });
    };

    const handlePostToOperations = async () => {
        const val = parseFloat(opsPostAmount);
        if (isNaN(val) || val <= 0) {
            alert("Please provide a valid amount.");
            return;
        }
        if (val > liveCashInDrawer + 0.01) {
            alert(`Not enough cash in drawer. Drawer shows $${liveCashInDrawer.toFixed(2)}.`);
            return;
        }

        startTransition(async () => {
            try {
                await postDrawerToOperations({ shopId, amount: val, notes: opsPostNotes, kind: opsPostKind });
                setIsOpsPostModalOpen(false);
                setOpsPostAmount("");
                setOpsPostNotes("");
                setOpsPostKind("eod_deposit");
                alert("Posted to Operations successfully.");
            } catch (e: any) {
                alert(e?.message || "Failed to post to Operations.");
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
        setSearchTerm("");
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(c => c.item.id !== id));
    };

    const applyLocalStockDecrement = (itemId: string, qty: number) => {
        if (!itemId || String(itemId).startsWith('service_')) return;
        const q = Math.max(0, Number(qty || 0));
        if (!q) return;

        setInventoryState((prev) =>
            (prev || []).map((it: any) => {
                if (it.id !== itemId) return it;
                const allocations = Array.isArray(it.allocations) ? it.allocations.map((a: any) => {
                    if (a.shopId !== shopId) return a;
                    return { ...a, quantity: Math.max(0, Number(a.quantity || 0) - q) };
                }) : it.allocations;
                return {
                    ...it,
                    quantity: Math.max(0, Number(it.quantity || 0) - q),
                    allocations
                };
            })
        );
    };

    const upsertLocalInventoryItem = (item: any, addedStock: number) => {
        if (!item?.id) return;
        const add = Math.max(0, Number(addedStock || 0));
        setInventoryState((prev) => {
            const current = prev || [];
            const idx = current.findIndex((p: any) => p.id === item.id);
            if (idx === -1) {
                return [
                    ...current,
                    {
                        id: item.id,
                        name: item.name || "New Item",
                        category: item.category || "General",
                        quantity: add,
                        landedCost: Number(item.landedCost || item.landed_cost || 0),
                        allocations: [{ shopId, quantity: add }]
                    }
                ];
            }

            const next = [...current];
            const cur = next[idx];
            const allocations = Array.isArray(cur.allocations) ? [...cur.allocations] : [];
            const aIdx = allocations.findIndex((a: any) => a.shopId === shopId);
            if (aIdx === -1) allocations.push({ shopId, quantity: add });
            else allocations[aIdx] = { ...allocations[aIdx], quantity: Number(allocations[aIdx].quantity || 0) + add };

            next[idx] = {
                ...cur,
                name: item.name || cur.name,
                category: item.category || cur.category,
                landedCost: Number(item.landedCost || item.landed_cost || cur.landedCost || 0),
                quantity: Number(cur.quantity || 0) + add,
                allocations
            };
            return next;
        });
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

    const handleConnectPrinter = async (transport: 'usb' | 'bluetooth') => {
        setIsConnectingPrinter(true);
        try {
            const success = transport === 'usb'
                ? await thermalPrinter.connectUsb()
                : await thermalPrinter.connectBluetooth();

            if (success) {
                setPrinterTransport(transport);
                setIsPrinterConnected(true);
            } else {
                alert(`Failed to connect to ${transport.toUpperCase()} printer.`);
            }
        } catch (error: any) {
            alert(`Connection error: ${error.message}`);
        } finally {
            setIsConnectingPrinter(false);
        }
    };

    const handleAddAdHocProduct = async () => {
        if (!newProduct.name || !newProduct.category || !newProduct.landedCost) {
            alert("Please fill all fields");
            return;
        }

        startTransition(async () => {
            try {
                const stockToAdd = parseInt(newProduct.initialStock) || 0;
                const addedItem: any = await addNewProductFromPos({
                    name: newProduct.name,
                    category: newProduct.category,
                    landedCost: parseFloat(newProduct.landedCost),
                    shopId,
                    initialStock: stockToAdd
                });

                upsertLocalInventoryItem(
                    { ...addedItem, name: newProduct.name, category: newProduct.category, landedCost: parseFloat(newProduct.landedCost) },
                    Number(addedItem?.addedStock ?? stockToAdd)
                );
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
                const existingItem = inventoryState.find((item: any) =>
                    item.name.toLowerCase() === quickSale.name.toLowerCase()
                );

                if (existingItem) {
                    // Add tracked product to cart
                    addToCart(existingItem, salePrice, qty);
                } else {
                    // It genuinely doesn't exist. Create it on the fly in MASTER inventory with enough stock to cover this sale.
                    const addedItem: any = await addNewProductFromPos({
                        name: quickSale.name,
                        category: "Quick Sale",
                        landedCost: salePrice * 0.7, // Estimate cost at 70% of sale price
                        shopId,
                        initialStock: qty // Added then sold, leaving 0 after checkout
                    });

                    if (addedItem?.id) {
                        upsertLocalInventoryItem(
                            { ...addedItem, name: quickSale.name, category: "Quick Sale", landedCost: salePrice * 0.7 },
                            qty
                        );
                        // Create a mock inventory item object to add to cart immediately
                        const newItem = {
                            id: addedItem.id,
                            name: quickSale.name,
                            category: "Quick Sale",
                            quantity: qty,
                            landedCost: salePrice * 0.7,
                            allocations: [{ shopId, quantity: qty }]
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
    const totalDue = Math.max(0, totalWithTax - discount);
    const discountAmount = Math.min(discount, totalWithTax);

    const handleCheckout = () => {
        startTransition(async () => {
            try {
                const cashier = employees.find((e: any) => e.id === selectedEmployeeId)?.name || "System";
                let currentReceiptData: any = null;

                if (posMode === 'layby') {
                    const deposit = parseFloat(laybyDeposit);
                    if (isNaN(deposit) || deposit <= 0 || !clientName || !clientPhone) {
                        alert("Lay-by requires a valid deposit, client name, and phone number.");
                        return;
                    }

                    const res = await recordLayby({
                        shopId,
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
                        deposit,
                        clientName,
                        clientPhone,
                        employeeId: selectedEmployeeId || "system"
                    });

                    if (res.error) {
                        alert(`Lay-by failed: ${res.error}`);
                        return;
                    }

                    const laybyId = res.id!;
                    const laybyDate = res.date!;

                    // Lay-by reserves stock immediately; reflect it locally so staff can keep selling without refresh.
                    for (const entry of cart) {
                        applyLocalStockDecrement(entry.item.id, entry.quantity);
                    }

                    // Push new lay-by into local list so it appears in the Lay-by modal immediately
                    setLaybyList((prev: LaybyQuote[]) => [
                        {
                            id: laybyId,
                            shopId,
                            clientName,
                            clientPhone,
                            items: cart.map(c => ({
                                itemId: c.item.id,
                                itemName: c.item.name,
                                quantity: c.quantity,
                                unitPrice: c.price / (1 + taxRate),
                                total: c.price * c.quantity,
                            })),
                            totalBeforeTax,
                            tax: totalTax,
                            totalWithTax,
                            paidAmount: deposit,
                            status: 'layby',
                            date: laybyDate,
                            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                            employeeId: selectedEmployeeId || "system",
                        },
                        ...prev,
                    ]);

                    currentReceiptData = {
                        orderId: `LAY-${laybyId}`,
                        receiptNo: `#LAY-${laybyId}`,
                        transactionId: laybyId,
                        shopName: shop?.name || "NIRVANA STORE",
                        cashier,
                        clientName,
                        clientPhone,
                        items: cart.map(c => {
                            const priceGross = Number(c.price || 0);
                            const priceNet = priceGross / (1 + taxRate);
                            const totalGross = priceGross * Number(c.quantity || 0);
                            const totalNet = priceNet * Number(c.quantity || 0);
                            const tax = totalGross - totalNet;
                            return {
                                name: c.item.name,
                                quantity: c.quantity,
                                priceNet,
                                priceGross,
                                totalNet,
                                totalGross,
                                tax,
                            };
                        }),
                        subtotal: totalBeforeTax,
                        discount: discountAmount,
                        tax: totalTax,
                        total: totalDue,
                        paidAmount: deposit,
                        balanceRemaining: Math.max(0, Number(totalDue) - deposit),
                        dateStamp: new Date().toLocaleDateString(),
                        timeStamp: new Date().toLocaleTimeString(),
                        paymentMethod: 'cash',
                        isLayby: true
                    };

                    setActiveReceipt(currentReceiptData);
                    setIsSuccessModalOpen(true);
                } else if (posMode === 'sale') {
                    const transactionId = Math.random().toString(36).substring(2, 9).toUpperCase();
                    const receiptItems = [];

                    // Check if we're offline
                    const isOffline = !isOnline;

                    if (isOffline) {
                        // Save each cart item to offline queue
                        for (const entry of cart) {
                            const isUntracked = entry.item.id.startsWith('QUICK_');
                            const netPrice = entry.price / (1 + taxRate);
                            const grossPrice = entry.price;
                            const lineNet = netPrice * entry.quantity;
                            const lineGross = grossPrice * entry.quantity;
                            const itemTax = lineGross - lineNet;

                            // For offline, we save to IndexedDB - untracked items also use same structure
                            await saveSaleOffline({
                                shopId,
                                itemId: entry.item.id,
                                itemName: entry.item.name,
                                quantity: entry.quantity,
                                unitPrice: netPrice,
                                totalBeforeTax: lineNet,
                                employeeId: selectedEmployeeId || "system",
                                clientName: clientName || "General Walk-in",
                                paymentMethod,
                                discount: discountAmount
                            });

                            applyLocalStockDecrement(entry.item.id, entry.quantity);

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

                        // Update pending count
                        const count = await getPendingCount();
                        setPendingSyncCount(count);

                        currentReceiptData = {
                            orderId: `ORD-${transactionId}`,
                            receiptNo: `#RCT-${transactionId}`,
                            transactionId,
                            shopName: shop?.name || "NIRVANA STORE",
                            cashier,
                            clientName: clientName || "Walk-in Customer",
                            clientPhone: clientPhone || "N/A",
                            items: receiptItems,
                            subtotal: totalBeforeTax,
                            discount: discountAmount,
                            tax: totalTax,
                            total: totalDue,
                            dateStamp: new Date().toLocaleDateString(),
                            timeStamp: new Date().toLocaleTimeString(),
                            paymentMethod,
                            isOfflineQueued: true
                        };

                        setActiveReceipt(currentReceiptData);
                        setIsSuccessModalOpen(true);
                    } else {
                        // Online mode - use server actions as before
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
                                    paymentMethod,
                                    discount: discountAmount,
                                    date: isBacklogMode ? backlogDate : undefined
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
                                    paymentMethod,
                                    discount: discountAmount,
                                    date: isBacklogMode ? backlogDate : undefined
                                });
                            }

                            applyLocalStockDecrement(entry.item.id, entry.quantity);

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

                        currentReceiptData = {
                            orderId: `ORD-${transactionId}`,
                            receiptNo: `#RCT-${transactionId}`,
                            transactionId,
                            shopName: shop?.name || "NIRVANA STORE",
                            cashier,
                            clientName: clientName || "Walk-in Customer",
                            clientPhone: clientPhone || "N/A",
                            items: receiptItems,
                            subtotal: totalBeforeTax,
                            discount: discountAmount,
                            tax: totalTax,
                            total: totalDue,
                            dateStamp: isBacklogMode ? new Date(backlogDate).toLocaleDateString() : new Date().toLocaleDateString(),
                            timeStamp: isBacklogMode ? "00:00:00 (Backlog)" : new Date().toLocaleTimeString(),
                            paymentMethod
                        };

                        setActiveReceipt(currentReceiptData);
                        setIsSuccessModalOpen(true);
                    }
                } else {
                    // QUOTE MODE - Generate quote and share to WhatsApp
                    const quoteId = Math.random().toString(36).substring(2, 6).toUpperCase();
                    const quoteItems = cart.map(c => ({
                        name: c.item.name,
                        quantity: c.quantity,
                        unitPrice: (c.price / (1 + taxRate)).toFixed(2),
                        total: (c.price * c.quantity).toFixed(2)
                    }));

                    const quoteText = `*QUOTATION #QT-${quoteId}*
_${shop?.name || 'NIRVANA STORE'}_

*Client:* ${clientName || 'Walk-in Customer'}
${clientPhone ? `*Phone:* ${clientPhone}` : ''}
${clientEmail ? `*Email:* ${clientEmail}` : ''}

*Items:*
${quoteItems.map(i => `• ${i.quantity}x ${i.name}
  @ $${i.unitPrice} = $${i.total}`).join('\n')}

------------------------
*Subtotal:* $${totalBeforeTax.toFixed(2)}
*Tax (15.5%):* $${totalTax.toFixed(2)}
*_TOTAL: $${totalWithTax.toFixed(2)}_*

*Valid for 7 days*
*Quote prepared by:* ${selectedEmployeeId ? employees.find((e: any) => e.id === selectedEmployeeId)?.name || 'Staff' : 'Nirvana Staff'}

Generated via NIRVANA POS`;

                    // Save quote to database
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

                    // Share to WhatsApp
                    const waUrl = `https://wa.me/${clientPhone ? clientPhone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(quoteText)}`;
                    
                    // If there's a phone number, try to open WhatsApp directly, otherwise show the quote
                    if (clientPhone) {
                        window.open(waUrl, '_blank', 'noopener,noreferrer');
                    } else {
                        // Copy to clipboard if no phone
                        await navigator.clipboard.writeText(quoteText);
                        alert(`Quotation #QT-${quoteId} copied to clipboard! Send to customer manually.`);
                    }
                }

                // Shared cleanup for all modes
                setLastCheckoutInventory(inventoryState);
                setCart([]);
                setClientName("");
                setClientEmail("");
                setClientPhone("");
                setLaybyDeposit("");
                setPaymentMethod('cash');
                setDiscount(0);

                // Auto-print if a receipt was generated and printer is connected
                if (currentReceiptData && isPrinterConnected) {
                    try {
                        await thermalPrinter.printReceipt(currentReceiptData);
                    } catch (printErr) {
                        console.error("Auto-print failed:", printErr);
                    }
                }
            } catch (error) {
                console.error('Checkout failed:', error);
                alert(`Checkout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    };

    const handleEndOfDayAndLogout = async () => {
        if (!confirm('End of day: generate report and log out?')) return;
        setIsClosingDay(true);
        console.log('Starting EOD process for', shopId);

        // Cleanup any previous blob url
        if (eodShareUrl) {
            try { URL.revokeObjectURL(eodShareUrl); } catch { }
            setEodShareUrl("");
        }

        try {
            // 1. Initial EOD Summary & Weekly logic
            console.log('Fetching /api/eod summary...');
            const res = await fetch('/api/eod', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shopId, sendEmail: false }),
                credentials: 'include'
            });
            
            if (res.status === 401) {
                alert("Session expired. Please log in again.");
                window.location.href = "/staff-login";
                return;
            }
            
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.warn('EOD summary API returned error:', data);
                // We continue because PDF might still work
            }

            const totals = data?.totals;
            const now = new Date();
            const dayOfWeek = now.getDay(); // local
            const isSunday = dayOfWeek === 0;
            const todayDate = now.getDate();
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

            const pad2 = (n: number) => String(n).padStart(2, "0");
            const dayStamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`; // local YYYY-MM-DD
            const monthStamp = dayStamp.slice(0, 7); // YYYY-MM
            
            const isWeeklyDay = dayOfWeek === 6; // Saturday
            const isMonthlyDay = !isSunday && (todayDate === 30 || todayDate === 31);
            const isQuarterlyDay = isMonthlyDay && [2, 5, 8, 11].includes(now.getMonth());
            let pdfGenerated = false;
            
            const msgLines = [
                `NIRVANA EOD — ${shopId.toUpperCase()}`,
                `Date: ${now.toLocaleDateString()}`,
                isWeeklyDay ? 'Weekly Report Generated.' : null,
                isMonthlyDay ? 'Monthly Strategic Report Generated.' : null,
                totals ? `Transactions: ${totals.count}` : null,
                totals ? `Total (inc tax): $${Number(totals.totalWithTax || 0).toFixed(2)}` : null,
                totals ? `Net Revenue: $${Number((totals.totalWithTax || 0) - (totals.totalExpenses || 0)).toFixed(2)}` : null,
                pdfGenerated ? `Report PDFs attached.` : `PDF will be available in Reports section.`
            ].filter(Boolean);
            setEodShareText(msgLines.join('\n'));

            // 2. Generate report PDF for sharing
            console.log('Generating EOD PDF...');
            try {
                const pdfRes = await fetch(`/api/eod/pdf?shopId=${encodeURIComponent(shopId)}&date=${encodeURIComponent(dayStamp)}&weekly=${encodeURIComponent(String(isWeeklyDay))}`, { 
                    cache: 'no-store',
                    credentials: 'include'
                });
                
                if (pdfRes.ok) {
                    const blob = await pdfRes.blob();
                    const url = URL.createObjectURL(blob);
                    setEodShareBlob(blob);
                    setEodShareUrl(url);
                    pdfGenerated = true;
                    
                    // Save to history
                    const reportId = `${shopId}-${dayStamp}`;
                    const newReport = {
                        id: reportId,
                        date: new Date().toISOString(),
                        text: msgLines.join('\n'),
                        blob: blob,
                        url: url,
                        shopId,
                    };
                    setEodHistory(prev => [newReport, ...prev].slice(0, 30));
                    console.log('EOD PDF generated and saved to history.');
                } else {
                    const errText = await pdfRes.text().catch(() => 'Unknown error');
                    console.error('EOD PDF failed:', pdfRes.status, errText);
                    // Don't alert - we'll handle gracefully and still show text report
                }

                if (isMonthlyDay) {
                     const mMonth = now.toISOString().substring(0, 7);
                     const mUrl = `/api/reports/monthly/pdf?shopId=${encodeURIComponent(shopId)}&month=${encodeURIComponent(mMonth)}`;
                     
                     // Trigger download
                     const link = document.createElement("a");
                     link.href = mUrl;
                     link.download = `Monthly_Business_Report_${shopId}_${mMonth}.pdf`;
                     document.body.appendChild(link);
                     link.click();
                     document.body.removeChild(link);
                }

                if (isQuarterlyDay) {
                    const qMonth = now.toISOString().substring(0, 7);
                    
                    // Quarterly Business Report
                    const qUrl = `/api/reports/quarterly/pdf?shopId=${encodeURIComponent(shopId)}&month=${encodeURIComponent(qMonth)}`;
                    const qLink = document.createElement("a");
                    qLink.href = qUrl;
                    qLink.download = `Quarterly_Business_Report_${shopId}_${qMonth}.pdf`;
                    document.body.appendChild(qLink);
                    qLink.click();
                    document.body.removeChild(qLink);

                    // CEO-Level Quarterly Report
                    const cUrl = `/api/reports/quarterly/ceo/pdf?shopId=${encodeURIComponent(shopId)}&month=${encodeURIComponent(qMonth)}`;
                    const cLink = document.createElement("a");
                    cLink.href = cUrl;
                    cLink.download = `CEO_Quarterly_Report_${shopId}_${qMonth}.pdf`;
                    document.body.appendChild(cLink);
                    cLink.click();
                    document.body.removeChild(cLink);
                }
            } catch (e) {
                console.error('EOD PDF exception:', e);
            }

            // Always save to history even if PDF failed - EOD data is critical
            if (!pdfGenerated) {
                const reportId = `${shopId}-${dayStamp}`;
                const textOnlyReport = {
                    id: reportId,
                    date: new Date().toISOString(),
                    text: msgLines.join('\n'),
                    blob: null as Blob | null,
                    url: '',
                    shopId,
                };
                setEodHistory(prev => [textOnlyReport, ...prev].slice(0, 30));
                console.log('EOD saved to history (text only - PDF generation had issues).');
            }

            // 3. Post cash to Operations (Master Vault)
            try {
                const depositRaw = prompt("How much are you posting to Operations (Master Vault) today?", "");
                if (depositRaw != null && String(depositRaw).trim() !== "") {
                    const deposit = Number(String(depositRaw).trim());
                    if (Number.isFinite(deposit) && deposit > 0) {
                        const postRes = await fetch("/api/operations/ledger", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({
                                amount: deposit,
                                kind: "eod_deposit",
                                shopId,
                                title: `EOD deposit ${dayStamp} (${shopId})`,
                                effectiveDate: dayStamp,
                            }),
                        });
                        if (!postRes.ok) {
                            const err = await postRes.json().catch(() => ({}));
                            console.warn("Operations deposit failed:", err);
                        }
                    }
                }
            } catch (e) {
                console.warn("Operations deposit prompt failed:", e);
            }

            // Always open the modal if we got this far
            setIsEodShareModalOpen(true);

        } catch (e) {
            console.error('Critical EOD error:', e);
            alert("End-of-day process failed. Please try again or log out manually.");
        } finally {
            setIsClosingDay(false);
        }
    };

    const shareEodToWhatsApp = async () => {
        // Prefer native share sheet with file (WhatsApp selectable) on mobile.
        // Use the stored blob directly instead of fetching the blob URL
        if (eodShareBlob) {
            try {
                const file = new File([eodShareBlob], `EOD_${shopId}_${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' });
                const nav: any = navigator;
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
            await fetch('/api/staff/logout', { method: 'POST', credentials: 'include' });
        } finally {
            window.location.href = '/login';
        }
    };

    // Search results are now memoized and deferred using useMemo and useDeferredValue at the top of the component
    // const filteredInventory = ... was here

    return (
        <div className="grid gap-4 md:gap-6 md:grid-cols-12 grid-cols-1">
            <div className="md:col-span-8 col-span-1 space-y-4 md:space-y-6">
                {/* Full-width Search Bar */}
                <div className="relative w-full group">
                    <SearchBar
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Online/Offline Status & Pending Sync */}
                {(!isOnline || pendingSyncCount > 0) && (
                    <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-xs font-black uppercase ${!isOnline ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                            <span className={isOnline ? 'text-emerald-400' : 'text-amber-400'}>
                                {isOnline ? 'Online' : 'OFFLINE MODE'}
                            </span>
                        </div>
                        {pendingSyncCount > 0 && (
                            <span className="text-amber-400">
                                {pendingSyncCount} sale{pendingSyncCount !== 1 ? 's' : ''} pending sync
                            </span>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    {canUseManagerTools && (
                        <Button
                            onClick={() => setIsManagerToolsOpen(true)}
                            className="bg-amber-600 hover:bg-amber-500 text-[10px] font-black uppercase italic h-10 px-3 flex items-center gap-2"
                            title="Admin/Manager tools"
                        >
                            <ShieldAlert className="h-4 w-4" /> Manager Tools
                        </Button>
                    )}

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
                        onClick={() => window.location.reload()}
                        className="bg-slate-700 hover:bg-slate-600 text-[10px] font-black uppercase italic h-10 px-3 flex items-center gap-2"
                        title="Refresh page"
                    >
                        <RefreshCcw className="h-4 w-4" /> Refresh
                    </Button>

                    {db?.settings?.taxMode ? (
                        <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px] font-black uppercase">
                            Tax: {String(db.settings.taxMode).replace(/_/g, " ")} @ {Number(db.settings.taxRate || 0) * 100}%
                        </Badge>
                    ) : null}

                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 h-10 px-3">
                        <div className="flex items-center gap-2 mr-1">
                            <input 
                                type="checkbox" 
                                id="backlog-mode" 
                                checked={isBacklogMode} 
                                onChange={(e) => setIsBacklogMode(e.target.checked)}
                                className="h-3 w-3 rounded border-slate-700 bg-slate-800 text-violet-600 focus:ring-violet-500"
                            />
                            <label htmlFor="backlog-mode" className="text-[9px] font-black uppercase text-slate-400 cursor-pointer whitespace-nowrap">Backlog</label>
                        </div>
                        {isBacklogMode && (
                            <input 
                                type="date" 
                                value={backlogDate} 
                                onChange={(e) => setBacklogDate(e.target.value)}
                                className="bg-transparent border-none text-[9px] font-black uppercase text-violet-400 focus:ring-0 w-24 p-0 ml-1"
                            />
                        )}
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 h-10">
                        <Button
                            onClick={() => handleConnectPrinter('usb')}
                            disabled={isConnectingPrinter}
                            variant="ghost"
                            className={cn(
                                "h-8 px-2 text-[8px] font-black uppercase italic flex items-center gap-1",
                                (isPrinterConnected && printerTransport === 'usb') ? "bg-emerald-500/20 text-emerald-400" : "text-slate-500"
                            )}
                        >
                            USB
                        </Button>
                        <Button
                            onClick={() => handleConnectPrinter('bluetooth')}
                            disabled={isConnectingPrinter}
                            variant="ghost"
                            className={cn(
                                "h-8 px-2 text-[8px] font-black uppercase italic flex items-center gap-1",
                                (isPrinterConnected && printerTransport === 'bluetooth') ? "bg-blue-500/20 text-blue-400" : "text-slate-500"
                            )}
                        >
                            {isConnectingPrinter && printerTransport === 'bluetooth' ? "..." : "BT"}
                        </Button>
                    </div>

                    <Button
                        onClick={async () => {
                            try {
                                if (cart.length > 0) {
                                    // Generate preview receipt from live cart
                                    const previewItems = cart.map(entry => {
                                        const netPrice = entry.price / (1 + taxRate);
                                        const grossPrice = entry.price;
                                        const lineNet = netPrice * entry.quantity;
                                        const lineGross = grossPrice * entry.quantity;
                                        const itemTax = lineGross - lineNet;

                                        return {
                                            name: entry.item.name,
                                            quantity: entry.quantity,
                                            priceNet: netPrice,
                                            priceGross: grossPrice,
                                            totalNet: lineNet,
                                            totalGross: lineGross,
                                            tax: itemTax
                                        };
                                    });

                                    const cashier = employees.find((e: any) => e.id === selectedEmployeeId)?.name || "System";
                                    const previewReceipt = {
                                        orderId: "PREVIEW",
                                        transactionId: "PREVIEW-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
                                        shopName: shop?.name || "NIRVANA STORE",
                                        cashier,
                                        dateStamp: new Date().toLocaleDateString(),
                                        timeStamp: new Date().toLocaleTimeString(),
                                        items: previewItems,
                                        subtotal: totalBeforeTax,
                                        discount: discountAmount,
                                        tax: totalTax,
                                        total: totalDue,
                                        paymentMethod: paymentMethod.toUpperCase()
                                    };
                                    await thermalPrinter.printReceipt(previewReceipt);
                                } else {
                                    await thermalPrinter.printTest();
                                }
                            } catch (e: any) {
                                alert("Print failed: " + e.message);
                            }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-[10px] font-black uppercase italic h-10 px-3 flex items-center gap-2"
                    >
                        <Printer className="h-4 w-4" /> {cart.length > 0 ? "Print Preview" : "Test Print"}
                    </Button>

                    <Button
                        onClick={() => {
                            const month = new Date().toISOString().substring(0, 7);
                            const date = new Date().toISOString().split('T')[0];
                            window.open(`/api/reports/combined?shopId=${shopId}&month=${month}&date=${date}`, '_blank');
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase italic h-10 px-3 flex items-center gap-2"
                        title="Download unified EOD, Monthly and Quarterly master report"
                    >
                        <FileText className="h-4 w-4" /> Strategic Master Report
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
                        onClick={() => setIsEodHistoryModalOpen(true)}
                        variant="outline"
                        className="h-10 px-3 border-sky-500/30 text-sky-300 hover:bg-sky-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="View daily reports history"
                    >
                        <FileText className="h-4 w-4" /> Reports
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
                            setOpsPostAmount("");
                            setOpsPostNotes("");
                            setIsOpsPostModalOpen(true);
                        }}
                        variant="outline"
                        className="h-10 px-3 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="Post cash from drawer to Operations (Master Vault)"
                    >
                        <Coins className="h-4 w-4" /> Post Ops
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
                        onClick={() => setIsExpensesModalOpen(true)}
                        variant="outline"
                        className="h-10 px-3 border-rose-500/30 text-rose-200 hover:bg-rose-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="View expenses"
                    >
                        <Minus className="h-4 w-4" /> Expenses
                    </Button>

                    <Button
                        onClick={() => setIsLaybyModalOpen(true)}
                        variant="outline"
                        className="h-10 px-3 border-sky-500/30 text-sky-200 hover:bg-sky-500/10 text-[10px] font-black uppercase italic flex items-center gap-2"
                        title="Manage pending Lay-bys"
                    >
                        <RefreshCcw className="h-4 w-4 text-sky-400" /> Lay-bys
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

                <Modal
                    isOpen={isManagerToolsOpen}
                    onClose={() => setIsManagerToolsOpen(false)}
                    title={`Manager Tools${staffDisplayName ? ` — ${staffDisplayName}` : ""}`}
                >
                    <div className="space-y-3">
                        <Button
                            className="w-full bg-amber-600 hover:bg-amber-500 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/admin/settings#opening-balance";
                            }}
                        >
                            <Coins className="mr-2 h-4 w-4" /> Adjust Opening Balance
                        </Button>
                        <Button
                            className="w-full bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/admin/settings";
                            }}
                        >
                            <Settings className="mr-2 h-4 w-4" /> Admin Settings
                        </Button>
                        <Button
                            className="w-full bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/admin/audit";
                            }}
                        >
                            <ShieldCheck className="mr-2 h-4 w-4" /> Security Audit
                        </Button>
                        <Button
                            className="w-full bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/admin/pos-audit";
                            }}
                        >
                            <ShieldCheck className="mr-2 h-4 w-4" /> POS Audit
                        </Button>
                        <Button
                            className="w-full bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/inventory/stocktake";
                            }}
                        >
                            <ClipboardList className="mr-2 h-4 w-4" /> Stocktake Audit
                        </Button>
                        <Button
                            className="w-full bg-sky-900 hover:bg-sky-800 border border-sky-500/30 text-sky-400 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/invest";
                            }}
                        >
                            <Coins className="mr-2 h-4 w-4" /> Perfume Deposits
                        </Button>
                        <Button
                            className="w-full bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase italic tracking-widest"
                            onClick={() => {
                                setIsManagerToolsOpen(false);
                                window.location.href = "/transfers";
                            }}
                        >
                            <ArrowRightLeft className="mr-2 h-4 w-4" /> Cash Transfers
                        </Button>
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                            If you cannot see these pages, your staff role must be Manager/Admin/Owner.
                        </div>
                    </div>
                </Modal>

                <Modal isOpen={isTitheModalOpen} onClose={() => setIsTitheModalOpen(false)} title="Tithe Withdrawal">
                    <div className="space-y-4">
                        <div className="bg-violet-950/30 border border-violet-500/20 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <Heart className="h-4 w-4 text-violet-400" />
                                <span className="text-xs font-bold text-violet-400 uppercase">Cumulative Tithe</span>
                            </div>
                            <p className="text-2xl font-black text-violet-300">${cumulativeTithe.toFixed(2)}</p>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-500">Withdrawal Amount</label>
                            <Input
                                type="number"
                                value={titheWithdrawAmount}
                                onChange={(e) => setTitheWithdrawAmount(e.target.value)}
                                placeholder="0.00"
                                className="mt-1 bg-slate-800 border-slate-700"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase text-slate-500">Description (e.g., Church Name)</label>
                            <Input
                                type="text"
                                value={titheWithdrawDesc}
                                onChange={(e) => setTitheWithdrawDesc(e.target.value)}
                                placeholder="Enter description..."
                                className="mt-1 bg-slate-800 border-slate-700"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button
                                onClick={() => setIsTitheModalOpen(false)}
                                variant="outline"
                                className="flex-1 border-slate-700"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={async () => {
                                    const amount = Number(titheWithdrawAmount);
                                    if (!amount || amount <= 0) return;
                                    setIsRecordingTithe(true);
                                    try {
                                        await recordTitheWithdrawal(shopId, amount, titheWithdrawDesc || "Tithe withdrawal", selectedEmployeeId);
                                        setTitheWithdrawAmount("");
                                        setTitheWithdrawDesc("");
                                        setIsTitheModalOpen(false);
                                        window.location.reload();
                                    } catch (e) {
                                        console.error(e);
                                    } finally {
                                        setIsRecordingTithe(false);
                                    }
                                }}
                                disabled={isRecordingTithe || !titheWithdrawAmount}
                                className="flex-1 bg-violet-600 hover:bg-violet-700"
                            >
                                {isRecordingTithe ? "Recording..." : "Record Tithe"}
                            </Button>
                        </div>
                    </div>
                </Modal>

                <div className="flex gap-1.5 sm:gap-2 w-full mt-4 sm:mt-0 sm:w-auto overflow-x-auto pb-2 scrollbar-hide px-2 sm:px-0">
                    <div className="bg-slate-900 border border-slate-800 px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max">
                        <Coins className="h-4 w-4 text-emerald-400" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Drawer</span>
                            <span className="text-xs font-bold text-slate-200">${liveCashInDrawer.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max">
                        <AlertCircle className="h-4 w-4 text-rose-400" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Exp.</span>
                            <span className="text-xs font-bold text-slate-200">${todaysPosExpenses.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Ops Inc.</span>
                            <span className="text-xs font-bold text-emerald-400">+${todaysOpsIncome.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max">
                        <Coins className="h-4 w-4 text-amber-400" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Post</span>
                            <span className="text-xs font-bold text-slate-200">${todaysOpsPosts.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-sky-500/30 px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max">
                        <Sparkles className="h-4 w-4 text-sky-400" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Invest</span>
                            <span className="text-xs font-bold text-sky-400">${(investBalance?.availableBalance ?? 0).toFixed(2)}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsTitheModalOpen(true)}
                        className="bg-slate-900 border border-violet-500/30 px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max hover:border-violet-500/60 transition-colors cursor-pointer"
                    >
                        <Heart className="h-4 w-4 text-violet-400" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Tithe</span>
                            <span className="text-xs font-bold text-violet-400">${cumulativeTithe.toFixed(2)}</span>
                        </div>
                    </button>

                    <div className={`bg-slate-900 border ${groceriesExceeded ? 'border-red-500/60 bg-red-950/20' : 'border-emerald-500/30'} px-2 sm:px-3 py-2 rounded-lg flex items-center gap-2 sm:gap-3 h-10 shadow-lg min-w-max`}>
                        <ShoppingCart className={`h-4 w-4 ${groceriesExceeded ? 'text-red-400' : 'text-emerald-400'}`} />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black leading-none">Groceries</span>
                            <span className={`text-xs font-bold ${groceriesExceeded ? 'text-red-400' : 'text-emerald-400'}`}>${currentMonthGroceries.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="mb-8 p-4 bg-slate-900/60 border border-amber-500/20 rounded-2xl backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-amber-500/80">Premium Services</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {SHOP_SERVICES.map(service => (
                            <Button
                                key={service.id}
                                onClick={() => addToCart({ id: service.id, name: service.name, category: service.category, landedCost: 0 }, service.basePrice)}
                                variant="outline"
                                className="h-12 border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/40 text-amber-200 text-xs font-black uppercase italic flex items-center justify-between px-4 group transition-all"
                            >
                                <span className="group-hover:translate-x-1 transition-transform">{service.name}</span>
                                <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100 group-hover:scale-125 transition-all" />
                            </Button>
                        ))}
                    </div>
                </div>

                {!searchTerm ? (
                    <div className="flex flex-col items-center justify-center py-12 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
                        <Search className="h-8 w-8 text-slate-700 mb-3" />
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Search for a product to add to cart</p>
                    </div>
                ) : filteredInventory.length === 0 ? (
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
                            // Show GLOBAL master stock instead of shop allocation
                            const checkoutItem = lastCheckoutInventory.find(i => i.id === item.id);
                            const qtyAtShop = checkoutItem ? checkoutItem.quantity : (item.quantity || 0);
                            const totalNetworkStock = item.quantity || 0;

                            const dynamicOverhead = totalShopStock > 0 ? (shopExpenses as number) / totalShopStock : 0;
                            const baseCost = (item.landedCost || 0) + dynamicOverhead;

                            const shipment = db.shipments?.find((s: any) => s.id === item.shipmentId);
                            const supplier = shipment?.supplier || "Global Provider";

                            const daysInStock = Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 3600 * 24));
                            const totalInventoryCount = inventoryState.reduce((sum, i) => sum + i.quantity, 0);
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

            <Card className="md:col-span-4 col-span-1 md:sticky md:top-6 border-slate-800 bg-slate-950/40 backdrop-blur-md mb-safe">
                <CardHeader>
                    {/* Daily Sales Total Badge */}
                    <div className="mb-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Today's Sales</div>
                        <div className="text-2xl font-black text-emerald-300 font-mono">${todaysTotalSales.toFixed(2)}</div>
                        <div className="text-[9px] text-emerald-500 mt-1">{todaysSales.length} transaction{todaysSales.length !== 1 ? 's' : ''}</div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        <Button variant={posMode === 'sale' ? 'default' : 'outline'} onClick={() => setPosMode('sale')} className={cn("flex-1 text-[10px] font-black uppercase italic h-8", posMode === 'sale' ? 'bg-emerald-600' : 'border-slate-800 text-slate-500')}>Direct Sale</Button>
                        <Button variant={posMode === 'layby' ? 'default' : 'outline'} onClick={() => setPosMode('layby')} className={cn("flex-1 text-[10px] font-black uppercase italic h-8", posMode === 'layby' ? 'bg-sky-600' : 'border-slate-800 text-slate-500')}>Lay-by</Button>
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
                            const isService = entry.item.id?.startsWith('service_');
                            const isLossLeading = !isService && entry.price < (landedCostWithOverhead * 1.155);
                            return (
                                <div key={entry.item.id} className={cn("bg-slate-900 p-3 rounded-lg border", isLossLeading ? "border-rose-500/30" : "border-slate-800", isService && "border-amber-500/30 bg-amber-500/5")}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <h4 className="text-[11px] font-black uppercase truncate italic text-white">{entry.item.name}</h4>
                                            {isService && <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest mt-0.5">Intangible Service</span>}
                                        </div>
                                        <button onClick={() => removeFromCart(entry.item.id)} className="text-slate-600 hover:text-rose-500 transition-colors"><Trash2 className="h-3 w-3" /></button>
                                    </div>
                                    <div className="flex items-center justify-between mt-3">
                                        <div className="flex items-center gap-2 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                            <button onClick={() => updateQty(entry.item.id, -1)} className="text-slate-500 hover:text-white transition-colors"><Minus className="h-3 w-3" /></button>
                                            <span className="text-xs font-black min-w-[12px] text-center">{entry.quantity}</span>
                                            <button onClick={() => updateQty(entry.item.id, 1)} className="text-slate-500 hover:text-white transition-colors"><Plus className="h-3 w-3" /></button>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800 group/price">
                                            <span className="text-[10px] font-black text-slate-600 group-hover/price:text-amber-500 transition-colors">$</span>
                                            <input
                                                type="number"
                                                className="bg-transparent w-20 text-right text-xs font-black focus:outline-none text-slate-200"
                                                value={entry.price}
                                                onChange={(e) => updatePrice(entry.item.id, parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                    </div>
                                    {isLossLeading && <p className="text-[8px] font-black text-rose-500 mt-2 uppercase flex items-center gap-1"><ShieldAlert className="h-2 w-2" /> Margin Risk Detected</p>}
                                </div>
                            );
                        })}
                    </div>

                    {cart.length > 0 && (
                        <div className="pt-4 border-t border-slate-800 space-y-2">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase"><span>Subtotal</span><span>${totalBeforeTax.toFixed(2)}</span></div>
                            
                            {/* Discount Input */}
                            <div className="flex items-center justify-between gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Coins className="h-3 w-3 text-amber-500" />
                                    <span className="text-[10px] font-black text-amber-500 uppercase">Discount</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-black text-amber-500">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="5"
                                        step="1"
                                        value={discount || ''}
                                        onChange={(e) => {
                                            const val = Math.floor(parseFloat(e.target.value) || 0);
                                            if (val >= 0 && val <= 5) {
                                                setDiscount(val);
                                            }
                                        }}
                                        placeholder="0"
                                        className="w-16 bg-transparent text-right text-xs font-black focus:outline-none text-amber-500 border-b border-amber-500/30 focus:border-amber-500"
                                    />
                                </div>
                            </div>
                            {discount > 0 && (
                                <div className="flex justify-between text-[10px] font-bold text-amber-500 uppercase">
                                    <span>Discount Applied</span>
                                    <span>-${discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            
                            <div className="flex justify-between text-xl font-black text-white italic tracking-tighter uppercase">
                                <span>Total Due</span>
                                <span className="text-emerald-400">${totalDue.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

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

                    {posMode === 'layby' && (
                        <div className="space-y-3 p-3 bg-sky-500/5 rounded-lg border border-sky-500/20">
                            <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Lay-by Agreement</p>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Client Phone (Required)</label>
                                <Input
                                    placeholder="+263 77 xxx xxxx"
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    className="h-10 bg-slate-900 border-sky-500/30 text-xs"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Deposit Amount ($)</label>
                                <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={laybyDeposit}
                                    onChange={(e) => setLaybyDeposit(e.target.value)}
                                    className="h-10 bg-slate-900 border-sky-500/30 font-mono font-bold text-sky-400"
                                />
                                {laybyDeposit && !isNaN(parseFloat(laybyDeposit)) && (
                                    <p className="text-[10px] text-slate-500 font-bold">
                                        Balance remaining: <span className="text-rose-400">${Math.max(0, totalDue - parseFloat(laybyDeposit)).toFixed(2)}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <Button
                        className={cn(
                            "w-full h-14 font-black text-sm uppercase italic tracking-[0.2em] rounded-xl",
                            posMode === 'sale' ? "bg-emerald-600 hover:bg-emerald-500" :
                                posMode === 'layby' ? "bg-sky-600 hover:bg-sky-500" :
                                    "bg-amber-600 hover:bg-amber-500"
                        )}
                        disabled={cart.length === 0 || isPending}
                        onClick={handleCheckout}
                    >
                        {isPending ? <RefreshCcw className="h-5 w-5 animate-spin" /> :
                            posMode === 'sale' ? "Execute Sale" :
                                posMode === 'layby' ? "Confirm Lay-by" :
                                    "Process Quote"
                        }
                    </Button>
                </CardContent>
            </Card>

            {/* Lay-by Management Modal */}
            <Modal isOpen={isLaybyModalOpen} onClose={() => setIsLaybyModalOpen(false)} title="Pending Lay-bys">
                <div className="space-y-4">
                    {laybyList.length === 0 ? (
                        <p className="text-center text-slate-500 text-xs py-6">No pending lay-bys for this shop.</p>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select a Lay-by</label>
                            <select
                                value={selectedLaybyId}
                                onChange={(e) => setSelectedLaybyId(e.target.value)}
                                className="w-full h-12 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 px-4 outline-none focus:border-sky-500/50 transition-all"
                            >
                                <option value="">Choose a lay-by...</option>
                                {laybyList.map((q: any) => {
                                    const balance = Number(q.totalWithTax || 0) - Number(q.paidAmount || 0);
                                    return (
                                        <option key={q.id} value={q.id}>
                                            #{q.id} — {q.clientName} (Bal: ${balance.toFixed(2)})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    )}

                    {selectedLaybyId && (() => {
                        const lb = laybyList.find((q: any) => q.id === selectedLaybyId);
                        if (!lb) return null;
                        const total = Number(lb.totalWithTax || 0);
                        const paid = Number(lb.paidAmount || 0);
                        const balance = total - paid;
                        return (
                            <div className="space-y-3 p-4 bg-slate-950 rounded-xl border border-slate-800">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Total Amount:</span>
                                    <span className="font-bold text-white">${total.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Already Paid:</span>
                                    <span className="font-bold text-emerald-400">${paid.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs pt-2 border-t border-slate-800">
                                    <span className="text-slate-500 font-black uppercase">Balance Due:</span>
                                    <span className="font-black text-rose-400">${balance.toFixed(2)}</span>
                                </div>

                                <div className="pt-4 space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Amount</label>
                                    <Input
                                        value={laybyPaymentAmount}
                                        onChange={(e) => setLaybyPaymentAmount(e.target.value)}
                                        placeholder={balance.toFixed(2)}
                                        className="bg-slate-900 border-slate-800 font-mono"
                                        type="number"
                                    />
                                    <Button
                                        onClick={() => {
                                            const amt = parseFloat(laybyPaymentAmount);
                                            if (isNaN(amt) || amt <= 0) return alert("Enter a valid payment amount.");
                                            startTransition(async () => {
                                                try {
                                                    const result = await updateLaybyPayment(selectedLaybyId, amt, shopId, selectedEmployeeId || "system");
                                                    // Update local lay-by state for a smoother UX
                                                    setLaybyList((prev: LaybyQuote[]) => {
                                                        const next = prev.map((q: LaybyQuote) => {
                                                            if (q.id !== selectedLaybyId) return q;
                                                            const newPaid = Number(q.paidAmount || 0) + amt;
                                                            return { ...q, paidAmount: newPaid };
                                                        });
                                                        // If fully paid, drop from list
                                                        if (result?.fullyPaid) {
                                                            return next.filter((q: LaybyQuote) => q.id !== selectedLaybyId);
                                                        }
                                                        return next;
                                                    });
                                                    setLaybyPaymentAmount("");
                                                    setSelectedLaybyId("");
                                                    setIsLaybyModalOpen(false);
                                                    alert(amt >= balance ? "Lay-by fully settled!" : "Payment recorded. Balance updated.");
                                                } catch (e) {
                                                    alert("Failed to record payment. Please try again.");
                                                }
                                            });
                                        }}
                                        disabled={isPending}
                                        className="w-full bg-sky-600 hover:bg-sky-500 text-xs font-black uppercase italic h-12 mt-2"
                                    >
                                        {isPending ? <RefreshCcw className="h-4 w-4 animate-spin" /> : 'Record Payment'}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </Modal>

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
                                className={cn(
                                    "w-full text-white font-black uppercase italic tracking-wider h-12 flex items-center justify-center gap-2",
                                    printerTransport === 'usb' ? "bg-blue-600 hover:bg-blue-700" : "bg-indigo-600 hover:bg-indigo-700"
                                )}
                                onClick={async () => {
                                    try {
                                        await thermalPrinter.printReceipt(activeReceipt);
                                    } catch (e: any) {
                                        alert(`Direct printing (${printerTransport.toUpperCase()}) failed. Please check connection.\n\nError: ` + e.message);
                                    }
                                }}
                            >
                                <Printer className="h-5 w-5" /> Print Directly ({printerTransport.toUpperCase()})
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
                        if (confirm("You must open the register to proceed. Close anyway?")) {
                            setHasDismissedRegisterModal(true);
                            setIsCashRegisterModalOpen(false);
                        }
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
                            placeholder="e.g. Perfume restock, Rent payment, Lunch"
                            className="bg-slate-950 border-slate-800 mt-1 placeholder:text-slate-700 font-bold h-12"
                            value={expenseDescription}
                            onChange={(e) => setExpenseDescription(e.target.value)}
                        />
                    </div>

                    {/* Auto-detection info */}
                    <div className="text-[10px] text-slate-500 bg-slate-950/50 rounded-lg p-2 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-sky-400">Perfume</span> in description → Auto-deposits to Invest
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-amber-400">Rent/Utilities</span> in description → Auto-deposits to Operations
                        </div>
                    </div>

                    {/* Manual toggles */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setExpenseToInvest(!expenseToInvest)}
                            className={`p-3 rounded-lg border text-xs font-black uppercase tracking-wider transition-all ${
                                expenseToInvest 
                                    ? 'bg-sky-500/20 border-sky-500 text-sky-400' 
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                        >
                            <div className="flex items-center gap-2 justify-center">
                                <div className={`h-4 w-4 rounded border ${expenseToInvest ? 'bg-sky-500 border-sky-500' : 'border-slate-600'}`}>
                                    {expenseToInvest && <span className="text-[8px]">✓</span>}
                                </div>
                                Deposit to Invest
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setExpenseToOperations(!expenseToOperations)}
                            className={`p-3 rounded-lg border text-xs font-black uppercase tracking-wider transition-all ${
                                expenseToOperations 
                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                                    : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                        >
                            <div className="flex items-center gap-2 justify-center">
                                <div className={`h-4 w-4 rounded border ${expenseToOperations ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                                    {expenseToOperations && <span className="text-[8px]">✓</span>}
                                </div>
                                Deposit to Operations
                            </div>
                        </button>
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

            {/* Operations Post Modal */}
            <Modal
                isOpen={isOpsPostModalOpen}
                onClose={() => setIsOpsPostModalOpen(false)}
                title="Post Cash to Operations (Master Vault)"
            >
                <div className="space-y-4 pt-2">
                    <p className="text-sm text-slate-400 font-medium">
                        This moves cash from the drawer into the business Operations vault. Drawer cash will decrease and Operations will increase.
                    </p>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[10px] font-bold text-slate-400 uppercase">
                        Drawer cash now: <span className="text-slate-200">${liveCashInDrawer.toFixed(2)}</span>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount</label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-[10px] text-slate-500 font-mono font-bold text-lg">$</span>
                            <Input
                                type="number"
                                placeholder="0.00"
                                step="0.01"
                                className="pl-8 bg-slate-950 border-emerald-500/30 text-lg font-mono font-black h-12 text-emerald-300"
                                value={opsPostAmount}
                                onChange={(e) => setOpsPostAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Deposit Type</label>
                        <select
                            value={opsPostKind}
                            onChange={(e) => setOpsPostKind(e.target.value as "eod_deposit" | "overhead_contribution")}
                            className="w-full bg-slate-950 border border-emerald-500/30 text-white px-3 py-2 rounded-md mt-1 font-bold"
                        >
                            <option value="eod_deposit">EOD Deposit (General Sales)</option>
                            <option value="overhead_contribution">Overhead Contribution (Shop's Overhead Target)</option>
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">
                            {opsPostKind === "eod_deposit" 
                                ? "General sales deposit - adds to Master Vault"
                                : "Allocates toward shop's monthly overhead target"}
                        </p>
                    </div>

                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes (optional)</label>
                        <Input
                            placeholder="e.g. Bank deposit / safe drop / transport to HQ"
                            className="bg-slate-950 border-slate-800 mt-1 placeholder:text-slate-700 font-bold h-12"
                            value={opsPostNotes}
                            onChange={(e) => setOpsPostNotes(e.target.value)}
                        />
                    </div>

                    <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase italic tracking-wider h-12 mt-4"
                        onClick={handlePostToOperations}
                        disabled={isPending}
                    >
                        {isPending ? "Posting..." : "Post to Operations"}
                    </Button>
                </div>
            </Modal>

            <Modal
                isOpen={isEodShareModalOpen}
                onClose={() => {
                    setIsEodShareModalOpen(false);
                    if (eodShareUrl) {
                        try { URL.revokeObjectURL(eodShareUrl); } catch { }
                        setEodShareUrl("");
                        setEodShareBlob(null);
                    }
                }}
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
                                    }),
                                    credentials: 'include'
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
                {(() => {
                    const filtered = (todaysSales || []).filter((s: any) => {
                        const pm = String(s?.paymentMethod || '').toLowerCase();
                        return pm === receiptsPaymentFilter;
                    });
                    const totalFiltered = filtered.reduce((sum: number, s: any) => sum + Number(s?.totalWithTax || 0), 0);
                    return (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant={receiptsPaymentFilter === 'cash' ? 'default' : 'outline'}
                                    className={cn(
                                        "h-9 text-[10px] font-black uppercase italic tracking-widest",
                                        receiptsPaymentFilter === 'cash'
                                            ? "bg-emerald-600 hover:bg-emerald-500"
                                            : "border-slate-800 text-slate-400 hover:text-slate-200"
                                    )}
                                    onClick={() => setReceiptsPaymentFilter('cash')}
                                >
                                    Cash Only
                                </Button>
                                <Button
                                    type="button"
                                    variant={receiptsPaymentFilter === 'ecocash' ? 'default' : 'outline'}
                                    className={cn(
                                        "h-9 text-[10px] font-black uppercase italic tracking-widest",
                                        receiptsPaymentFilter === 'ecocash'
                                            ? "bg-sky-600 hover:bg-sky-500"
                                            : "border-slate-800 text-slate-400 hover:text-slate-200"
                                    )}
                                    onClick={() => setReceiptsPaymentFilter('ecocash')}
                                >
                                    EcoCash Only
                                </Button>
                            </div>

                            {(todaysSales || []).length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No sales recorded today</p>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                {filtered.length} {receiptsPaymentFilter} sale{filtered.length !== 1 ? 's' : ''} today • Total ${totalFiltered.toFixed(2)}
                            </p>
                            {filtered.map((sale: any) => (
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
                    );
                })()}
            </Modal>

            <Modal
                isOpen={isExpensesModalOpen}
                onClose={() => setIsExpensesModalOpen(false)}
                title="Expenses History"
            >
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {(() => {
                        const allExpenses = ledger.filter((l: any) =>
                            ['POS Expense', 'Perfume', 'Overhead'].includes(l.category) &&
                            l.shopId === shopId
                        ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

                        if (allExpenses.length === 0) {
                            return <p className="text-slate-500 text-center py-8">No expenses recorded</p>;
                        }

                        const allOpsRouted = opsLedger.filter((r: any) =>
                            r.amount > 0 && r.notes?.includes('Auto-routed from POS expense')
                        );

                        const routedToOps = (expense: any) =>
                            allOpsRouted.some((r: any) =>
                                r.amount === expense.amount &&
                                Math.abs(new Date(r.created_at).getTime() - new Date(expense.date).getTime()) < 60000
                            );

                        const totalExpenses = allExpenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
                        const totalRouted = allExpenses.filter(routedToOps).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
                        const cumulativeRouted = allOpsRouted.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

                        return (
                            <div className="space-y-3">
                                <div className="flex gap-4">
                                    <div className="bg-rose-950/30 border border-rose-800/30 rounded-lg px-3 py-2 flex-1 text-center">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Total Expenses</p>
                                        <p className="text-sm font-black text-rose-400 font-mono">-${totalExpenses.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg px-3 py-2 flex-1 text-center">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Cumul. Ops Income</p>
                                        <p className="text-sm font-black text-emerald-400 font-mono">+${cumulativeRouted.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-sky-950/30 border border-sky-800/30 rounded-lg px-3 py-2 flex-1 text-center">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Today's Ops Inc.</p>
                                        <p className="text-sm font-black text-sky-400 font-mono">+${todaysOpsIncome.toFixed(2)}</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase">
                                        {allExpenses.length} expense{allExpenses.length !== 1 ? 's' : ''} recorded
                                    </p>
                                    {allExpenses.map((expense: any) => {
                                        const isRouted = routedToOps(expense);
                                        const categoryColor = expense.category === 'Perfume' ? 'bg-violet-500/20 text-violet-400' :
                                            expense.category === 'Overhead' ? 'bg-amber-500/20 text-amber-400' :
                                            'bg-slate-700/50 text-slate-400';
                                        return (
                                            <div key={expense.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <p className="text-xs font-black text-slate-100 uppercase italic tracking-tight">{expense.description || expense.category}</p>
                                                            <p className="text-xs font-mono font-bold text-rose-400">-${(expense.amount || 0).toFixed(2)}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${categoryColor}`}>{expense.category}</span>
                                                            {isRouted && (
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">→ Ops Income</span>
                                                            )}
                                                        </div>
                                                        <div className="mt-2 pt-2 border-t border-slate-800/50 flex justify-between items-center">
                                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                                                {expense.date ? new Date(expense.date).toLocaleDateString() : 'Today'}
                                                            </p>
                                                            <p className="text-[9px] text-slate-600 font-mono italic">{expense.id}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </Modal>

            <Modal
                isOpen={isEodHistoryModalOpen}
                onClose={() => setIsEodHistoryModalOpen(false)}
                title="Daily Reports History"
            >
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {eodHistory.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-slate-500 mb-4">No daily reports generated yet</p>
                            <p className="text-[10px] text-slate-600">Use "Power Off" button to generate end-of-day reports</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                {eodHistory.length} report{eodHistory.length !== 1 ? 's' : ''} saved
                            </p>
                            {eodHistory.map((report) => (
                                <div key={report.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="text-xs font-black text-slate-100 uppercase italic">
                                                {new Date(report.date).toLocaleDateString()}
                                            </p>
                                            <p className="text-[9px] text-slate-500 font-mono">
                                                {new Date(report.date).toLocaleTimeString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-[9px] font-black uppercase"
                                                onClick={() => {
                                                    const stamp = (report.id || '').split('-').slice(1).join('-') || (report.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
                                                    const pdfUrl = `/api/eod/pdf?shopId=${encodeURIComponent(report.shopId)}&date=${encodeURIComponent(stamp)}`;
                                                    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
                                                }}
                                            >
                                                View PDF
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-7 bg-emerald-600 hover:bg-emerald-500 text-[9px] font-black uppercase"
                                                onClick={async () => {
                                                    // Try to share via WhatsApp
                                                    if (report.blob) {
                                                        const file = new File([report.blob], `EOD_${report.id}.pdf`, { type: 'application/pdf' });
                                                        const nav: any = navigator;
                                                        if (nav?.canShare?.({ files: [file] }) && nav?.share) {
                                                            await nav.share({
                                                                title: `EOD ${report.id}`,
                                                                text: report.text,
                                                                files: [file],
                                                            });
                                                            return;
                                                        }
                                                    }
                                                    // Fallback: copy text to clipboard
                                                    await navigator.clipboard.writeText(report.text);
                                                    alert('Report text copied to clipboard!');
                                                }}
                                            >
                                                Share
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="text-[9px] text-slate-500 font-mono whitespace-pre-wrap line-clamp-4 bg-slate-900 p-2 rounded">
                                        {report.text}
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
