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
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  Search,
  Shirt,
  Receipt,
  X,
  Printer,
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
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type CartLine = { item: any; quantity: number; price: number };

/**
 * Filters items to only show recognized tees with stock > 0
 */
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [clientName, setClientName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "ecocash">("cash");
  const [discount, setDiscount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  const [printerTransport, setPrinterTransport] = useState<'usb' | 'bluetooth'>('usb');
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [isBacklogMode, setIsBacklogMode] = useState(false);
  const [backlogDate, setBacklogDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { saveSaleOffline, getPendingCount, isOnline } = useOfflineSales();
  const [pendingSync, setPendingSync] = useState(0);

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

  useEffect(() => {
    getPendingCount().then(setPendingSync);
  }, [getPendingCount]);

  useEffect(() => {
    if (selectedEmployeeId) return;
    fetch("/api/staff/me", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const id = data?.staff?.id;
        if (id) setSelectedEmployeeId(String(id));
      })
      .catch(() => {});
  }, [selectedEmployeeId]);

  const query = deferredSearch.toLowerCase().trim();

  const catalogue = useMemo(() => {
    const list = inventoryState || [];
    // Always filter to only recognized tees with stock > 0
    const validTees = filterValidTees(list, shopId);
    
    if (!query) {
      return validTees;
    }
    return validTees.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query)
    );
  }, [inventoryState, query, shopId]);

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
    setSearchTerm("");
  };

  const totalWithTax = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const totalBeforeTax = cart.reduce(
    (s, c) => s + (c.price / (1 + taxRate)) * c.quantity,
    0
  );
  const totalTax = totalWithTax - totalBeforeTax;
  const totalDue = Math.max(0, totalWithTax - discount);

  const handleCheckout = () => {
    if (cart.length === 0) {
      alert("Cart is empty.");
      return;
    }
    if (!selectedEmployeeId) {
      alert("Select a cashier.");
      return;
    }

    startTransition(async () => {
      try {
        const cashier =
          employees.find((e: any) => e.id === selectedEmployeeId)?.name || "Staff";
        const receiptItems: { name: string; quantity: number; priceNet: number; priceGross: number; totalNet: number; totalGross: number; tax: number }[] = [];
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
              clientName: clientName || "Walk-in",
              paymentMethod,
              discount,
            });

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
          setPendingSync(await getPendingCount());
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
              clientName: clientName || "Walk-in",
              paymentMethod,
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
              tax: itemTax
            });
          }
        }

        setLastReceipt({
          receiptNo: `#TEE-${txnId}`,
          orderId: `TEE-${txnId}`,
          transactionId: `TEE-${txnId}`,
          shopName,
          cashier,
          clientName: clientName || "Walk-in",
          dateStamp,
          timeStamp,
          items: receiptItems,
          subtotal: totalBeforeTax,
          tax: totalTax,
          discount,
          total: totalDue,
          paymentMethod,
          offline: !isOnline,
        });
        setCart([]);
        setReceiptOpen(true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Checkout failed.";
        alert(msg);
      }
    });
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
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
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
        <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-900/40 border border-orange-500/10 rounded-xl">
          {/* Branding Service Button */}
          <Button
            onClick={() => {
              const existing = cart.find((c) => c.item.id === "service_branding");
              if (existing) {
                setCart(
                  cart.map((c) =>
                    c.item.id === "service_branding"
                      ? { ...c, quantity: c.quantity + 1 }
                      : c
                  )
                );
              } else {
                setCart([
                  ...cart,
                  {
                    item: {
                      id: "service_branding",
                      name: "Branding Service",
                      category: "Services",
                      landedCost: 0,
                      allocations: []
                    },
                    quantity: 1,
                    price: 1.50
                  }
                ]);
              }
            }}
            className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-[10px] font-black uppercase italic h-9 px-3 flex items-center gap-2 shadow-lg rounded-lg"
          >
            <Shirt className="h-4 w-4" /> + Branding Service ($1.50)
          </Button>

          {/* Backlog Controls */}
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg p-1 h-9 px-3">
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
          <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg p-1 h-9">
            <Button
              onClick={() => handleConnectPrinter("usb")}
              disabled={isConnectingPrinter}
              variant="ghost"
              className={cn(
                "h-7 px-2 text-[8px] font-black uppercase italic flex items-center gap-1 rounded",
                isPrinterConnected && printerTransport === "usb"
                  ? "bg-emerald-500/20 text-emerald-400 font-bold"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              USB
            </Button>
            <Button
              onClick={() => handleConnectPrinter("bluetooth")}
              disabled={isConnectingPrinter}
              variant="ghost"
              className={cn(
                "h-7 px-2 text-[8px] font-black uppercase italic flex items-center gap-1 rounded",
                isPrinterConnected && printerTransport === "bluetooth"
                  ? "bg-blue-500/20 text-blue-400 font-bold"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {isConnectingPrinter && printerTransport === "bluetooth" ? "..." : "BT"}
            </Button>
          </div>

          {/* Connected Indicator */}
          {isPrinterConnected && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px] font-black uppercase py-1">
              Printer: {printerTransport.toUpperCase()} Connected
            </Badge>
          )}
        </div>

        {!isOnline && (
          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">
            Offline — {pendingSync} sale(s) queued
          </Badge>
        )}

        {catalogue.length === 0 ? (
          <Card className="border-dashed border-orange-500/20 bg-slate-900/30">
            <CardContent className="py-16 text-center">
              <Shirt className="h-12 w-12 text-orange-500/40 mx-auto mb-4" />
              <p className="text-slate-400 text-sm font-medium">
                {query
                  ? `No tees match "${searchTerm}".`
                  : "No tees in stock at this shop. Allocate T-shirt inventory to Nirvana Tees or add a new tee."}
              </p>
              {query && (
                <Button
                  className="mt-4 bg-orange-600 hover:bg-orange-500"
                  onClick={() => handleAddProduct(searchTerm)}
                  disabled={isPending}
                >
                  Add &quot;{searchTerm}&quot; as new tee
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {catalogue.map((item) => {
              const qty = shopAllocationQty(item, shopId);
              const price = defaultSalePrice(Number(item.landedCost || 0), taxRate);
              const outOfStock = qty <= 0;
              const line = classifyTeeLine(item);

              return (
                <Card
                  key={item.id}
                  className={cn(
                    "bg-slate-900/50 border-orange-500/10 transition-all hover:border-orange-500/40",
                    outOfStock && "opacity-40"
                  )}
                >
                  <CardContent className="pt-5 pb-4">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] uppercase font-black",
                          line === "golf"
                            ? "border-sky-500/30 text-sky-300"
                            : "border-orange-500/20 text-orange-300/80"
                        )}
                      >
                        {teeLineLabel(line)}
                      </Badge>
                      <span className="text-xs font-mono text-slate-500">
                        {qty} in stock
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-100 truncate">{item.name}</h3>
                    <p className="text-lg font-black text-orange-400 mt-2 font-mono">
                      ${price.toFixed(2)}
                    </p>
                    <Button
                      className="w-full mt-3 bg-orange-600 hover:bg-orange-500 font-black uppercase text-[10px] tracking-widest"
                      disabled={outOfStock || isPending}
                      onClick={() => addToCart(item, price)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add to cart
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card className="bg-slate-950/80 border-orange-500/25 h-fit lg:sticky lg:top-4 shadow-2xl shadow-orange-950/20">
        <CardHeader className="pb-3 border-b border-orange-500/10">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase italic">
            <ShoppingCart className="h-5 w-5 text-orange-500" />
            Tee Cart
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
              Cashier
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 text-sm"
            >
              <option value="">Select staff…</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            placeholder="Customer name (optional)"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="bg-slate-900 border-slate-800"
          />

          <div className="flex gap-2">
            {(["cash", "ecocash"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                variant={paymentMethod === m ? "default" : "outline"}
                className={cn(
                  "flex-1 text-[10px] font-black uppercase",
                  paymentMethod === m && "bg-orange-600 hover:bg-orange-500"
                )}
                onClick={() => setPaymentMethod(m)}
              >
                {m}
              </Button>
            ))}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2">
            {cart.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Cart is empty</p>
            ) : (
              cart.map((line) => (
                <div
                  key={line.item.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-slate-800"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{line.item.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-slate-500 font-bold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={line.price}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCart(
                            cart.map((c) =>
                              c.item.id === line.item.id ? { ...c, price: val } : c
                            )
                          );
                        }}
                        className="w-16 h-6 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-orange-400 px-1 text-center focus:outline-none focus:border-orange-500/50"
                      />
                      <span className="text-[9px] text-slate-500 font-bold">each</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() =>
                        setCart(
                          cart.map((c) =>
                            c.item.id === line.item.id
                              ? { ...c, quantity: Math.max(1, c.quantity - 1) }
                              : c
                          )
                        )
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-mono w-6 text-center">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() =>
                        setCart(
                          cart.map((c) =>
                            c.item.id === line.item.id
                              ? { ...c, quantity: c.quantity + 1 }
                              : c
                          )
                        )
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-rose-400"
                    onClick={() => setCart(cart.filter((c) => c.item.id !== line.item.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-800 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">${totalBeforeTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tax</span>
              <span className="font-mono">${totalTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-black text-white pt-1">
              <span>Total</span>
              <span className="font-mono text-orange-400">${totalDue.toFixed(2)}</span>
            </div>
          </div>

          <Button
            className="w-full h-12 bg-orange-600 hover:bg-orange-500 font-black uppercase tracking-widest"
            disabled={isPending || cart.length === 0}
            onClick={handleCheckout}
          >
            <Receipt className="h-4 w-4 mr-2" />
            {isPending ? "Processing…" : "Complete sale"}
          </Button>
        </CardContent>
      </Card>

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
