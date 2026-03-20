"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, Pencil, Trash2, ArrowRightLeft, DollarSign, History, TrendingUp, TrendingDown, Warehouse, Upload, Download, Plus, Minus } from "lucide-react";
import { cn } from "@/components/ui";

type ShopNode = {
  id: string;
  name: string;
  expenses?: { rent?: number; salaries?: number; utilities?: number; misc?: number };
};

type LedgerEntry = {
  id: string;
  amount: number;
  kind: string;
  shop_id?: string;
  overhead_category?: string;
  title?: string;
  notes?: string;
  created_at: string;
  metadata?: any;
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
  updatedAt: string | null;
  invest?: { available: number; byShop: Record<string, { available: number }> };
};

type HandshakeEntry = {
  id: string;
  from_shop: string;
  to_shop: string;
  amount: number;
  associate: string;
  initiated_by: string;
  status: string;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  notes?: string;
};

type OverheadSummary = {
  shopId: string;
  shopName: string;
  contributed: number;
  paid: number;
  net: number;
};

export function OperationsConsole({
  shops,
  initialState,
  initialLedger,
}: {
  shops: ShopNode[];
  initialState: OpsState;
  initialLedger: any[];
}) {
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
  const [handshakes, setHandshakes] = useState<HandshakeEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "handshake">("overview");

  // Master Vault = sum of all ledger entries
  const masterVault = useMemo(() => {
    return ledger.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  }, [ledger]);

  // Invest total from state
  const investTotal = initialState?.invest?.available || 0;
  const combinedTotal = masterVault + investTotal;

  // Overhead summary by shop
  const overheadSummary: OverheadSummary[] = useMemo(() => {
    const summary: Record<string, OverheadSummary> = {};

    shops.forEach(shop => {
      summary[shop.id] = {
        shopId: shop.id,
        shopName: shop.name,
        contributed: 0,
        paid: 0,
        net: 0,
      };
    });

    ledger.forEach(entry => {
      if (entry.kind === "overhead_contribution" && entry.shop_id) {
        summary[entry.shop_id] = {
          ...summary[entry.shop_id],
          contributed: (summary[entry.shop_id]?.contributed || 0) + Number(entry.amount || 0),
        };
      } else if (entry.kind === "overhead_payment" && entry.shop_id) {
        summary[entry.shop_id] = {
          ...summary[entry.shop_id],
          paid: (summary[entry.shop_id]?.paid || 0) + Math.abs(Number(entry.amount || 0)),
        };
      }
    });

    // Calculate net for each shop
    Object.values(summary).forEach(s => {
      s.net = s.contributed - s.paid;
    });

    return Object.values(summary).filter(s => s.contributed > 0 || s.paid > 0);
  }, [ledger, shops]);

  // Total overhead stats
  const totalOverheadStats = useMemo(() => {
    return overheadSummary.reduce((acc, s) => ({
      contributed: acc.contributed + s.contributed,
      paid: acc.paid + s.paid,
      net: acc.net + s.net,
    }), { contributed: 0, paid: 0, net: 0 });
  }, [overheadSummary]);

  const fetchData = useCallback(async () => {
    try {
      const [ledgerRes, handshakeRes] = await Promise.all([
        fetch("/api/operations/ledger?limit=100", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/handshakes", { cache: "no-store", credentials: "include" }),
      ]);
      const ledgerData = await ledgerRes.json();
      const handshakeData = await handshakeRes.json();
      
      if (Array.isArray(ledgerData?.rows)) setLedger(ledgerData.rows);
      if (Array.isArray(handshakeData?.handshakes)) setHandshakes(handshakeData.handshakes);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Form state
  const [form, setForm] = useState({
    amount: "",
    type: "income",
    category: "eod_deposit",
    shopId: "",
    title: "",
    notes: "",
  });

  const isExpense = form.type === "expense";
  const displayAmount = Number(form.amount) || 0;

  // Submit entry
  const submitEntry = async () => {
    if (displayAmount <= 0) {
      alert("Enter an amount");
      return;
    }
    if (!form.title) {
      alert("Enter a description");
      return;
    }

    setBusy(true);
    try {
      // For expenses, amount is negative
      const amount = isExpense ? -displayAmount : displayAmount;
      
      const res = await fetch("/api/operations/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount,
          kind: isExpense ? "overhead_payment" : form.category,
          shopId: form.shopId || null,
          overheadCategory: form.category === "overhead_contribution" ? detectOverheadCategory(form.title) : null,
          title: form.title,
          notes: form.notes || null,
        }),
      });
      
      if (!res.ok) throw new Error("Failed");
      setForm({ amount: "", type: "income", category: "eod_deposit", shopId: "", title: "", notes: "" });
      await fetchData();
    } catch (e) {
      alert("Failed to add entry");
    } finally {
      setBusy(false);
    }
  };

  // Delete entry
  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/ledger/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      await fetchData();
    } catch (e) {
      alert("Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  // Handshake functions
  const [handshakeForm, setHandshakeForm] = useState({
    fromShop: "",
    toShop: "",
    amount: "",
    associate: "",
    initiatedBy: "",
    notes: "",
  });

  const initiateHandshake = async () => {
    const amt = Number(handshakeForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount");
      return;
    }
    if (!handshakeForm.fromShop || !handshakeForm.toShop) {
      alert("Select both shops");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(handshakeForm),
      });
      if (!res.ok) throw new Error("Failed");
      setHandshakeForm({ fromShop: "", toShop: "", amount: "", associate: "", initiatedBy: "", notes: "" });
      await fetchData();
    } catch (e) {
      alert("Failed to initiate handshake");
    } finally {
      setBusy(false);
    }
  };

  const acknowledgeHandshake = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/handshake/${id}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      await fetchData();
    } catch (e) {
      alert("Failed to acknowledge");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Master Vault */}
        <Card className="bg-gradient-to-br from-emerald-950/60 to-slate-950 border-emerald-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 flex items-center gap-1">
              <Warehouse className="h-3 w-3" /> Master Vault
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black italic text-emerald-300 font-mono">
              ${masterVault.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Total cash in business</p>
          </CardContent>
        </Card>

        {/* Invest */}
        <Card className="bg-gradient-to-br from-sky-950/60 to-slate-950 border-sky-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-sky-500/70 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Invest
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black italic text-sky-300 font-mono">
              ${investTotal.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Perfume growth fund</p>
          </CardContent>
        </Card>

        {/* Combined */}
        <Card className="bg-gradient-to-br from-violet-950/60 to-slate-950 border-violet-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-violet-500/70 flex items-center gap-1">
              <Coins className="h-3 w-3" /> Combined
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black italic text-violet-300 font-mono">
              ${combinedTotal.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Vault + Invest</p>
          </CardContent>
        </Card>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveSection("overview")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
            activeSection === "overview" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          <DollarSign className="h-4 w-4" /> Operations
        </button>
        <button
          onClick={() => setActiveSection("handshake")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
            activeSection === "handshake" ? "border-violet-500 text-violet-400" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          <ArrowRightLeft className="h-4 w-4" /> Handshake
          {handshakes.filter(h => h.status === "pending").length > 0 && (
            <Badge className="ml-1 bg-amber-500/20 text-amber-400 text-[8px]">
              {handshakes.filter(h => h.status === "pending").length}
            </Badge>
          )}
        </button>
      </div>

      {/* OVERVIEW SECTION */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          {/* Add Entry Form */}
          <Card className={cn(
            "border-2 transition-colors",
            isExpense ? "bg-rose-950/20 border-rose-800/30" : "bg-slate-950/60 border-slate-800"
          )}>
            <CardHeader>
              <CardTitle className={cn(
                "text-lg font-black uppercase italic flex items-center gap-2",
                isExpense ? "text-rose-400" : "text-emerald-400"
              )}>
                {isExpense ? <Download className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                {isExpense ? "Pay Expense" : "Add Money"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Type Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={!isExpense ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, type: "income" }))}
                  className={cn(
                    "flex-1 font-black uppercase",
                    !isExpense ? "bg-emerald-600 hover:bg-emerald-500" : ""
                  )}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Money
                </Button>
                <Button
                  variant={isExpense ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, type: "expense" }))}
                  className={cn(
                    "flex-1 font-black uppercase",
                    isExpense ? "bg-rose-600 hover:bg-rose-500" : ""
                  )}
                >
                  <Minus className="h-4 w-4 mr-1" /> Pay Expense
                </Button>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Amount</label>
                  <Input
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                    className={cn("font-mono text-lg", isExpense ? "border-rose-500/30" : "border-emerald-500/30")}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    {isExpense ? "Expense Type" : "Source"}
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md w-full"
                  >
                    {isExpense ? (
                      <>
                        <option value="overhead_payment">Overhead Payment</option>
                        <option value="rent">Rent</option>
                        <option value="utilities">Utilities</option>
                        <option value="salaries">Salaries</option>
                        <option value="misc">Misc Expense</option>
                      </>
                    ) : (
                      <>
                        <option value="eod_deposit">EOD Deposit</option>
                        <option value="overhead_contribution">Shop Contribution</option>
                        <option value="loan_received">Loan Received</option>
                        <option value="peer_transfer">Peer Transfer</option>
                        <option value="other_income">Other Income</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Shop (Optional)</label>
                  <select
                    value={form.shopId}
                    onChange={(e) => setForm(f => ({ ...f, shopId: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md w-full"
                  >
                    <option value="">No Shop</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Description</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={isExpense ? "e.g. Monthly rent payment" : "e.g. Daily sales deposit"}
                  />
                </div>
              </div>

              {/* Preview & Submit */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div className="text-sm">
                  <span className="text-[10px] text-slate-500 uppercase">Preview:</span>
                  <span className={cn("ml-2 text-lg font-black font-mono italic",
                    isExpense ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {isExpense ? "-" : "+"}${displayAmount.toLocaleString()}
                  </span>
                </div>
                <Button
                  disabled={busy || displayAmount <= 0}
                  onClick={submitEntry}
                  className={cn(
                    "font-black uppercase px-8",
                    isExpense ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (isExpense ? "Record Payment" : "Add Money")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Overhead Summary by Shop */}
          {overheadSummary.length > 0 && (
            <Card className="bg-slate-950/60 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg font-black uppercase italic">Overhead by Shop</CardTitle>
                <CardDescription className="text-[10px]">
                  Contributions IN vs Payments OUT
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {overheadSummary.map(shop => (
                    <div key={shop.shopId} className="p-4 bg-slate-900/40 rounded-lg border border-slate-800">
                      <div className="text-sm font-black uppercase text-white mb-3">{shop.shopName}</div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-emerald-500 flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> Contributed
                          </span>
                          <span className="font-mono text-emerald-400">${shop.contributed.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-rose-500 flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" /> Paid
                          </span>
                          <span className="font-mono text-rose-400">${shop.paid.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-700 pt-2">
                          <span className="text-slate-400">Net</span>
                          <span className={cn("font-mono font-black", shop.net >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {shop.net >= 0 ? "+" : ""}${shop.net.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Transactions */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                <History className="h-5 w-5" /> Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[50vh] overflow-y-auto">
              {ledger.length === 0 ? (
                <div className="text-center py-12 text-slate-600 italic">No transactions yet</div>
              ) : ledger.map(entry => {
                const isIncome = Number(entry.amount) >= 0;
                return (
                  <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-900/40 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn(
                          "text-[8px] font-black uppercase",
                          isIncome ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        )}>
                          {entry.kind}
                        </Badge>
                        {entry.shop_id && (
                          <Badge className="bg-slate-700/50 text-slate-400 text-[8px] font-black uppercase">
                            {entry.shop_id}
                          </Badge>
                        )}
                        {entry.overhead_category && (
                          <Badge className="bg-amber-500/20 text-amber-400 text-[8px] font-black uppercase">
                            {entry.overhead_category}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-bold text-white">{entry.title || entry.notes || "—"}</div>
                      <div className="text-[10px] text-slate-600">
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "text-xl font-black font-mono italic",
                        isIncome ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {isIncome ? "+" : ""}{Number(entry.amount).toFixed(2)}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteEntry(entry.id)}
                        className="h-8 w-8 p-0 text-slate-600 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HANDSHAKE SECTION */}
      {activeSection === "handshake" && (
        <div className="space-y-6">
          {/* Initiate Handshake */}
          <Card className="bg-gradient-to-br from-violet-950/30 to-slate-950 border-violet-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-violet-400 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" /> Initiate Cash Transfer
              </CardTitle>
              <CardDescription className="text-[10px]">
                Record when cash moves physically between shops
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={handshakeForm.fromShop}
                  onChange={(e) => setHandshakeForm(f => ({ ...f, fromShop: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                >
                  <option value="">From Shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select
                  value={handshakeForm.toShop}
                  onChange={(e) => setHandshakeForm(f => ({ ...f, toShop: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                >
                  <option value="">To Shop</option>
                  {shops.filter(s => s.id !== handshakeForm.fromShop).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <Input
                  value={handshakeForm.amount}
                  onChange={(e) => setHandshakeForm(f => ({ ...f, amount: e.target.value }))}
                  className="bg-slate-900 border-slate-800 font-mono"
                  placeholder="Amount"
                  inputMode="decimal"
                />
                <Input
                  value={handshakeForm.associate}
                  onChange={(e) => setHandshakeForm(f => ({ ...f, associate: e.target.value }))}
                  className="bg-slate-900 border-slate-800"
                  placeholder="Courier / Associate"
                />
                <Input
                  value={handshakeForm.initiatedBy}
                  onChange={(e) => setHandshakeForm(f => ({ ...f, initiatedBy: e.target.value }))}
                  className="bg-slate-900 border-slate-800"
                  placeholder="Initiated By"
                />
                <Button
                  disabled={busy}
                  onClick={initiateHandshake}
                  className="bg-violet-600 hover:bg-violet-500 font-black uppercase"
                >
                  Initiate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pending Handshakes */}
          <Card className="bg-amber-950/20 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400">
                Pending Acknowledgments
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {handshakes.filter(h => h.status === "pending").length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No pending handshakes</div>
              ) : handshakes.filter(h => h.status === "pending").map(h => (
                <div key={h.id} className="flex items-center justify-between p-4 bg-slate-900/40 rounded-lg border border-amber-800/30">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                      {h.from_shop} <ArrowRightLeft className="h-3 w-3" /> {h.to_shop}
                    </div>
                    <div className="text-sm font-bold text-white">{h.associate || "Unnamed"}</div>
                    <div className="text-[10px] text-slate-500">By {h.initiated_by} • {new Date(h.created_at).toLocaleTimeString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-black font-mono italic text-amber-400">${h.amount.toFixed(2)}</div>
                    <Button
                      size="sm"
                      onClick={() => acknowledgeHandshake(h.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase"
                    >
                      Acknowledge
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Completed Handshakes */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Handshake History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[40vh] overflow-y-auto">
              {handshakes.filter(h => h.status !== "pending").length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No completed handshakes</div>
              ) : handshakes.filter(h => h.status !== "pending").map(h => (
                <div key={h.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-400">
                      {h.from_shop} <ArrowRightLeft className="h-3 w-3" /> {h.to_shop}
                    </div>
                    <div className="text-sm font-bold text-white">{h.associate || "Unnamed"}</div>
                  </div>
                  <div className="text-lg font-black font-mono italic text-emerald-400">${h.amount.toFixed(2)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Helper to detect overhead category from title
function detectOverheadCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("rent")) return "rent";
  if (t.includes("utilities") || t.includes("electric") || t.includes("water")) return "utilities";
  if (t.includes("salar") || t.includes("wage")) return "salaries";
  return "misc";
}
