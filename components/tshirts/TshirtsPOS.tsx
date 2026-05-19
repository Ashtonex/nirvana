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

  const { saveSaleOffline, getPendingCount, isOnline } = useOfflineSales();
  const [pendingSync, setPendingSync] = useState(0);

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
    if (!query) {
      return list.filter((item) => shopAllocationQty(item, shopId) > 0);
    }
    return list.filter(
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
        const receiptItems: { name: string; quantity: number; totalGross: number }[] = [];
        const txnId = Math.random().toString(36).substring(2, 9).toUpperCase();

        if (!isOnline) {
          for (const entry of cart) {
            const netPrice = entry.price / (1 + taxRate);
            await saveSaleOffline({
              shopId,
              itemId: entry.item.id,
              itemName: entry.item.name,
              quantity: entry.quantity,
              unitPrice: netPrice,
              totalBeforeTax: netPrice * entry.quantity,
              employeeId: selectedEmployeeId,
              clientName: clientName || "Walk-in",
              paymentMethod,
              discount,
            });
            receiptItems.push({
              name: entry.item.name,
              quantity: entry.quantity,
              totalGross: entry.price * entry.quantity,
            });
          }
          setPendingSync(await getPendingCount());
        } else {
          for (const entry of cart) {
            const netPrice = entry.price / (1 + taxRate);
            await recordSale({
              shopId,
              itemId: entry.item.id,
              itemName: entry.item.name,
              quantity: entry.quantity,
              unitPrice: netPrice,
              totalBeforeTax: netPrice * entry.quantity,
              employeeId: selectedEmployeeId,
              clientName: clientName || "Walk-in",
              paymentMethod,
              discount,
            });
            receiptItems.push({
              name: entry.item.name,
              quantity: entry.quantity,
              totalGross: entry.price * entry.quantity,
            });
          }
        }

        setLastReceipt({
          receiptNo: `#TEE-${txnId}`,
          shopName,
          cashier,
          clientName: clientName || "Walk-in",
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
                    <p className="text-xs text-orange-400 font-mono">
                      ${line.price.toFixed(2)} each
                    </p>
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
          <Card className="w-full max-w-sm border-orange-500/30 bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-black uppercase italic">Sale complete</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setReceiptOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-mono text-orange-400">{lastReceipt.receiptNo}</p>
              <p className="text-slate-400">{lastReceipt.shopName}</p>
              <p className="text-2xl font-black font-mono">${lastReceipt.total.toFixed(2)}</p>
              {lastReceipt.offline && (
                <p className="text-amber-400 text-xs">Queued for sync when back online.</p>
              )}
              <Button
                variant="outline"
                className="w-full border-orange-500/30"
                onClick={async () => {
                  try {
                    await thermalPrinter.printReceipt(lastReceipt);
                  } catch {
                    alert("Printer not connected.");
                  }
                }}
              >
                <Printer className="h-4 w-4 mr-2" /> Print receipt
              </Button>
              <Button className="w-full bg-orange-600" onClick={() => setReceiptOpen(false)}>
                Done
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
