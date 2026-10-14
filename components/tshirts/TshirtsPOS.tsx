"use client";

import React, { useEffect, useMemo, useState, useTransition, useDeferredValue } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
} from "@/components/ui";
import {
  Search,
  Shirt,
  Printer,
  X,
  Users,
} from "lucide-react";
import { recordSale, addNewProductFromPos } from "@/app/actions";
import { useOfflineSales } from "@/components/useOfflineSales";
import { thermalPrinter } from "@/lib/thermalPrinter";
import { PRICING_TIERS } from "@/lib/constants";
import {
  TSHIRTS_SHOP_ID,
  TEE_CATEGORY_PLAIN,
  TEE_CATEGORY_GOLF,
  classifyTeeLine,
  teeLineLabel,
  shopAllocationQty,
} from "@/lib/tshirts";
import {
  CategoryBar,
  ProductGrid,
  TicketSidebar,
  TenderModal,
  CashierSwitchModal,
  type PosProductItem,
} from "@/components/pos";
import { cacheCatalogForShop, getLocalCatalogForShop } from "@/lib/local-db";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type CartLine = { item: any; quantity: number; price: number };

function filterValidTees(items: any[], shopId: string): any[] {
  return items.filter((item) => {
    const qty = shopAllocationQty(item, shopId);
    return classifyTeeLine(item) !== "unknown" && qty > 0;
  });
}

function defaultSalePrice(landedCost: number, taxRate: number): number {
  return landedCost * PRICING_TIERS.STANDARD * (1 + taxRate);
}

export default function TshirtsPOS({
  inventory,
  db,
}: {
  inventory: any[];
  db: any;
}) {
  const shopId = TSHIRTS_SHOP_ID;
  const shopName = db.shops?.[0]?.name || "Nirvana Tees";
  const taxRate = Number(db.settings?.taxRate ?? 0.155);
  const employees = db.employees || [];

  const [inventoryState, setInventoryState] = useState<any[]>(() => inventory || []);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearch = useDeferredValue(searchTerm);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "ecocash" | "card">("cash");
  const [discount, setDiscount] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Modals
  const [isTenderModalOpen, setIsTenderModalOpen] = useState(false);
  const [isCashierSwitchModalOpen, setIsCashierSwitchModalOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  // Printer & Backlog Controls
  const [printerTransport, setPrinterTransport] = useState<'usb' | 'bluetooth'>('usb');
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [isBacklogMode, setIsBacklogMode] = useState(false);
  const [backlogDate, setBacklogDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { saveSaleOffline, getPendingCount, isOnline, pendingCount } = useOfflineSales();

  const handleConnectPrinter = async (transport: 'usb' | 'bluetooth') => {
    setIsConnectingPrinter(true);
    try {
      const ok = transport === 'usb'
        ? await thermalPrinter.connectUsb()
        : await thermalPrinter.connectBluetooth();
      if (ok) {
        setPrinterTransport(transport);
        setIsPrinterConnected(true);
      } else {
        alert(`Failed to connect to ${transport.toUpperCase()} printer.`);
      }
    } catch (e: any) {
      alert(`Error connecting to printer: ${e.message}`);
    }
    setIsConnectingPrinter(false);
  };

  useEffect(() => {
    setInventoryState(inventory || []);
  }, [inventory]);

  // Hydrate staff info
  useEffect(() => {
    if (selectedEmployeeId) return;
    fetch("/api/staff/me", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const id = data?.staff?.id;
        const name = data?.staff?.name;
        if (id) {
          setSelectedEmployeeId(String(id));
          if (name) setStaffDisplayName(name);
        }
      })
      .catch(() => {});
  }, [selectedEmployeeId]);

  // Services available at Tee Shop
  const services: PosProductItem[] = useMemo(() => [
    {
      id: "service_branding",
      name: "Branding Service",
      category: "Services",
      price: 1.50,
      shopQuantity: 9999,
      sku: "SRV-BRAND"
    }
  ], []);

  // Tee Categories
  const categories = useMemo(() => ["Plain T-Shirts", "Golf T-Shirts", "Services"], []);

  // Compute full catalogue formatted as PosProductItem
  const allTeeProducts = useMemo<PosProductItem[]>(() => {
    const validTees = filterValidTees(inventoryState || [], shopId);
    const mappedTees: PosProductItem[] = validTees.map((item) => {
      const qty = shopAllocationQty(item, shopId);
      const price = Math.round(defaultSalePrice(Number(item.landedCost || 0), taxRate) * 100) / 100;
      const line = classifyTeeLine(item);
      const catLabel = line === "golf" ? "Golf T-Shirts" : "Plain T-Shirts";

      return {
        id: item.id,
        name: item.name,
        category: catLabel,
        price,
        sellingPrice: price,
        shopQuantity: qty,
        landedCost: Number(item.landedCost || 0),
        sku: item.sku || item.id,
      };
    });

    return [...mappedTees, ...services];
  }, [inventoryState, shopId, taxRate, services]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: allTeeProducts.length };
    for (const p of allTeeProducts) {
      const cat = p.category || "General";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [allTeeProducts]);

  // Filtered catalogue by category and search
  const filteredProducts = useMemo(() => {
    const query = deferredSearch.toLowerCase().trim();
    return allTeeProducts.filter((item) => {
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) {
        return false;
      }
      if (query) {
        return (
          item.name?.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query) ||
          item.sku?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [allTeeProducts, selectedCategory, deferredSearch]);

  // Cache tee catalog locally
  useEffect(() => {
    if (allTeeProducts.length > 0) {
      cacheCatalogForShop(
        shopId,
        allTeeProducts.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category || "General",
          price: Number(p.price || 0),
          shopQuantity: Number(p.shopQuantity || 0),
          shopId,
          sku: p.sku || p.id,
          updatedAt: new Date().toISOString(),
        }))
      ).catch(() => {});
    }
  }, [allTeeProducts, shopId]);

  // Fallback hydration if offline on initial mount
  useEffect(() => {
    if (inventoryState.length === 0) {
      getLocalCatalogForShop(shopId).then((cached) => {
        if (cached.length > 0) {
          setInventoryState(
            cached.map((c) => ({
              id: c.id,
              name: c.name,
              category: c.category,
              landedCost: c.landedCost || 0,
              allocations: [{ shopId: c.shopId, quantity: c.shopQuantity }],
              price: c.price,
              sku: c.sku,
            }))
          );
        }
      }).catch(() => {});
    }
  }, [shopId, inventoryState.length]);

  const addToCart = (item: any, price: number) => {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1, price } : c
        )
      );
    } else {
      setCart([...cart, { item, quantity: 1, price }]);
    }
  };

  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      setCart(cart.filter((c) => c.item.id !== itemId));
    } else {
      setCart(
        cart.map((c) => (c.item.id === itemId ? { ...c, quantity: newQty } : c))
      );
    }
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.item.id !== itemId));
  };

  const totalWithTax = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const totalBeforeTax = cart.reduce(
    (s, c) => s + (c.price / (1 + taxRate)) * c.quantity,
    0
  );
  const totalTax = totalWithTax - totalBeforeTax;
  const totalDue = Math.max(0, totalWithTax - discount);

  const handleExecutePayment = async (tenderData: {
    paymentMethod: "cash" | "ecocash" | "card";
    amountTendered: number;
    changeDue: number;
    clientName: string;
    clientPhone: string;
    printReceipt: boolean;
  }) => {
    if (cart.length === 0) throw new Error("Cart is empty.");
    if (!selectedEmployeeId) throw new Error("Please select or authenticate a cashier first.");

    const cashier =
      staffDisplayName ||
      employees.find((e: any) => e.id === selectedEmployeeId)?.name ||
      "Staff";
    const receiptItems: any[] = [];
    const txnId = Math.random().toString(36).substring(2, 9).toUpperCase();
    const saleDate = isBacklogMode ? backlogDate : new Date().toISOString();
    const dateStamp = new Date(saleDate).toLocaleDateString();
    const timeStamp = new Date(saleDate).toLocaleTimeString();

    if (!isOnline) {
      for (const entry of cart) {
        const netPrice = entry.price / (1 + taxRate);
        const grossPrice = entry.price;
        const lineNet = netPrice * entry.quantity;
        const lineGross = grossPrice * entry.quantity;
        const itemTax = lineGross - lineNet;

        await saveSaleOffline({
          shopId,
          itemId: entry.item.id,
          itemName: entry.item.name,
          quantity: entry.quantity,
          unitPrice: netPrice,
          totalBeforeTax: lineNet,
          employeeId: selectedEmployeeId,
          clientName: tenderData.clientName || "Walk-in",
          paymentMethod: tenderData.paymentMethod,
          discount,
        });

        receiptItems.push({
          name: entry.item.name,
          quantity: entry.quantity,
          priceNet: netPrice,
          priceGross: grossPrice,
          totalNet: lineNet,
          totalGross: lineGross,
          tax: itemTax,
        });
      }
    } else {
      for (const entry of cart) {
        const netPrice = entry.price / (1 + taxRate);
        const grossPrice = entry.price;
        const lineNet = netPrice * entry.quantity;
        const lineGross = grossPrice * entry.quantity;
        const itemTax = lineGross - lineNet;

        await recordSale({
          shopId,
          itemId: entry.item.id,
          itemName: entry.item.name,
          quantity: entry.quantity,
          unitPrice: netPrice,
          totalBeforeTax: lineNet,
          employeeId: selectedEmployeeId,
          clientName: tenderData.clientName || "Walk-in",
          paymentMethod: tenderData.paymentMethod === "card" ? "cash" : tenderData.paymentMethod,
          discount,
          date: saleDate,
        });

        receiptItems.push({
          name: entry.item.name,
          quantity: entry.quantity,
          priceNet: netPrice,
          priceGross: grossPrice,
          totalNet: lineNet,
          totalGross: lineGross,
          tax: itemTax,
        });
      }
    }

    const receipt = {
      receiptNo: `#TEE-${txnId}`,
      orderId: `TEE-${txnId}`,
      transactionId: `TEE-${txnId}`,
      shopName,
      cashier,
      clientName: tenderData.clientName || "Walk-in",
      dateStamp,
      timeStamp,
      items: receiptItems,
      subtotal: totalBeforeTax,
      tax: totalTax,
      discount,
      total: totalDue,
      amountTendered: tenderData.amountTendered,
      changeDue: tenderData.changeDue,
      paymentMethod: tenderData.paymentMethod,
      offline: !isOnline,
    };

    setLastReceipt(receipt);
    setCart([]);
    setReceiptOpen(true);

    if (tenderData.printReceipt) {
      try {
        await thermalPrinter.printReceipt(receipt);
      } catch {
        console.warn("[Thermal Printer] Printer not connected for auto-print.");
      }
    }
  };

  const handleAddProduct = async (name: string) => {
    const lineChoice = prompt(
      "Product line: 1 = Plain T-Shirt, 2 = Plain Golf T-Shirt",
      "1"
    );
    const category =
      lineChoice === "2" ? TEE_CATEGORY_GOLF : TEE_CATEGORY_PLAIN;

    const landed = parseFloat(
      prompt("Landed cost (USD) for this tee:", "8") || ""
    );
    if (!Number.isFinite(landed) || landed <= 0) return;
    const stock = parseInt(prompt("Initial stock at Tees shop:", "1") || "1", 10);

    startTransition(async () => {
      try {
        const added = await addNewProductFromPos({
          name,
          category,
          landedCost: landed,
          shopId,
          initialStock: Math.max(0, stock),
        });
        const newItem = {
          id: added.id,
          name,
          category,
          quantity: stock,
          landedCost: landed,
          allocations: [{ shopId, quantity: stock }],
        };
        setInventoryState((prev) => [...prev, newItem]);
        addToCart(newItem, defaultSalePrice(landed, taxRate));
      } catch {
        alert("Could not add product.");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Left Pane: Search, Category Bar, and Loyverse Product Grid */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-orange-500/70" />
          <Input
            placeholder="Search tees by name or style..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-14 bg-slate-900/60 border-orange-500/20 rounded-2xl text-base focus:border-orange-500/50"
          />
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/40 border border-orange-500/10 rounded-2xl">
          {/* Cashier Switch Button (1s PIN) */}
          <button
            type="button"
            onClick={() => setIsCashierSwitchModalOpen(true)}
            className="bg-slate-950/80 border border-slate-800 hover:border-orange-500/50 px-3 py-1.5 rounded-xl flex items-center gap-2 h-9 text-xs font-bold text-slate-200 cursor-pointer transition-colors"
            title="Switch Cashier"
          >
            <Users className="h-4 w-4 text-orange-400" />
            <span>
              {staffDisplayName ||
                employees.find((e: any) => e.id === selectedEmployeeId)?.name ||
                "Select Cashier"}
            </span>
          </button>

          {/* Quick Add Branding Service */}
          <Button
            onClick={() => {
              const srv = services.find((s) => s.id === "service_branding");
              if (srv) addToCart(srv, srv.price || 1.5);
            }}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-[10px] font-black uppercase italic h-9 px-3 flex items-center gap-2 shadow-lg rounded-xl"
          >
            <Shirt className="h-4 w-4" /> + Branding ($1.50)
          </Button>

          {/* Backlog Controls */}
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-xl p-1 h-9 px-3">
            <div className="flex items-center gap-2 mr-1">
              <input
                type="checkbox"
                id="backlog-mode"
                checked={isBacklogMode}
                onChange={(e) => setIsBacklogMode(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-orange-600 focus:ring-orange-500 focus:ring-offset-slate-900"
              />
              <label
                htmlFor="backlog-mode"
                className="text-[9px] font-black uppercase text-slate-400 cursor-pointer whitespace-nowrap"
              >
                Backlog
              </label>
            </div>
            {isBacklogMode && (
              <input
                type="date"
                value={backlogDate}
                onChange={(e) => setBacklogDate(e.target.value)}
                className="bg-transparent border-none text-[9px] font-black uppercase text-orange-400 focus:ring-0 w-24 p-0 ml-1 font-mono"
              />
            )}
          </div>

          {/* Printer Connection */}
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-xl p-1 h-9">
            <Button
              onClick={() => handleConnectPrinter("usb")}
              disabled={isConnectingPrinter}
              variant="ghost"
              className={cn(
                "h-7 px-2 text-[8px] font-black uppercase italic",
                isPrinterConnected && printerTransport === "usb"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-slate-500"
              )}
            >
              USB
            </Button>
            <Button
              onClick={() => handleConnectPrinter("bluetooth")}
              disabled={isConnectingPrinter}
              variant="ghost"
              className={cn(
                "h-7 px-2 text-[8px] font-black uppercase italic",
                isPrinterConnected && printerTransport === "bluetooth"
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-slate-500"
              )}
            >
              {isConnectingPrinter && printerTransport === "bluetooth" ? "..." : "BT"}
            </Button>
          </div>

          {!isOnline && (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[9px] uppercase font-bold py-1">
              Offline ({pendingCount} queued)
            </Badge>
          )}
        </div>

        {/* Category Selector Pills */}
        <CategoryBar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          categoryCounts={categoryCounts}
        />

        {/* Loyverse Touch-First Product Grid */}
        <ProductGrid
          items={filteredProducts}
          onAddToCart={(item) => addToCart(item, Number(item.price || item.sellingPrice || 0))}
          currencySymbol="$"
        />

        {filteredProducts.length === 0 && deferredSearch && (
          <div className="text-center pt-2">
            <Button
              variant="outline"
              className="border-orange-500/40 text-orange-400 text-xs font-bold uppercase"
              onClick={() => handleAddProduct(deferredSearch)}
              disabled={isPending}
            >
              Add &quot;{deferredSearch}&quot; as new tee
            </Button>
          </div>
        )}
      </div>

      {/* Right Pane: Persistent Loyverse Ticket */}
      <div className="h-full">
        <TicketSidebar
          cart={cart}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveFromCart}
          onClearCart={() => setCart([])}
          onOpenTender={() => setIsTenderModalOpen(true)}
          subtotal={totalBeforeTax}
          tax={totalTax}
          discount={discount}
          total={totalDue}
          taxRatePercent={Math.round(taxRate * 1000) / 10}
          currencySymbol="$"
          className="lg:sticky lg:top-4"
        />
      </div>

      {/* Loyverse Quick Tender Modal */}
      <TenderModal
        isOpen={isTenderModalOpen}
        onClose={() => setIsTenderModalOpen(false)}
        totalDue={totalDue}
        defaultClientName={clientName}
        defaultClientPhone={clientPhone}
        currencySymbol="$"
        onCompletePayment={handleExecutePayment}
      />

      {/* 1-Second Cashier Switch Modal */}
      <CashierSwitchModal
        isOpen={isCashierSwitchModalOpen}
        onClose={() => setIsCashierSwitchModalOpen(false)}
        currentCashierName={
          staffDisplayName ||
          employees.find((e: any) => e.id === selectedEmployeeId)?.name
        }
        onCashierSwitched={(emp) => {
          setSelectedEmployeeId(emp.id);
          setStaffDisplayName(emp.name);
        }}
      />

      {/* Receipt Modal */}
      {receiptOpen && lastReceipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <Card className="w-full max-w-sm border-orange-500/30 bg-slate-900 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-orange-500/10">
              <CardTitle className="text-lg font-black uppercase italic">Sale complete</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setReceiptOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm pt-4">
              <div>
                <p className="font-mono text-xs text-orange-400 font-bold">{lastReceipt.receiptNo}</p>
                <p className="text-slate-500 text-xs font-semibold">{lastReceipt.shopName}</p>
                <p className="text-3xl font-black font-mono text-slate-100 mt-1">${lastReceipt.total.toFixed(2)}</p>
              </div>

              {lastReceipt.offline && (
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 w-full justify-center">
                  Queued for sync when back online
                </Badge>
              )}

              <div className="border-t border-b border-slate-800 py-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold uppercase text-[9px] tracking-wider">Customer</span>
                  <span className="text-slate-200 font-bold">{lastReceipt.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold uppercase text-[9px] tracking-wider">Cashier</span>
                  <span className="text-slate-200">{lastReceipt.cashier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold uppercase text-[9px] tracking-wider">Payment Method</span>
                  <span className="text-slate-200 uppercase">{lastReceipt.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold uppercase text-[9px] tracking-wider">Date</span>
                  <span className="text-slate-200 font-mono">{lastReceipt.dateStamp} {lastReceipt.timeStamp}</span>
                </div>
              </div>

              <div className="max-h-24 overflow-y-auto space-y-1.5 border-b border-slate-800 pb-2">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Items Sold</p>
                {lastReceipt.items.map((line: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-slate-300">{line.name} x{line.quantity}</span>
                    <span className="text-slate-400 font-mono">${line.totalGross.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="w-full border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-400 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 h-11"
                onClick={async () => {
                  try {
                    await thermalPrinter.printReceipt(lastReceipt);
                  } catch {
                    alert("Printer not connected.");
                  }
                }}
              >
                <Printer className="h-4 w-4" /> Print receipt
              </Button>
              <Button className="w-full bg-orange-600 hover:bg-orange-500 font-black uppercase tracking-widest h-11" onClick={() => setReceiptOpen(false)}>
                Done
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
