"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, Trash2, ArrowRightLeft, DollarSign, History, TrendingUp, TrendingDown, Warehouse, Upload, Download, Plus, Minus, Activity, Users, Shield, Handshake, LogOut, Wifi, WifiOff, Edit, X, Brain, HandCoins } from "lucide-react";
import { cn } from "@/components/ui";
import { StockvelPanel } from "@/components/StockvelPanel";
import { MoneyAuditBrain } from "@/components/MoneyAuditBrain";
import { NirvanaIntelligenceCards } from "@/components/NirvanaIntelligenceCards";
import { OperationsOverviewIntelligence } from "@/components/OperationsOverviewIntelligence";
import { getOperationsVaultImpact, isOverheadContributionKind, isOverheadPaymentKind } from "@/lib/operations";

function detectOverheadCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("rent")) return "rent";
  if (t.includes("utilities") || t.includes("electric") || t.includes("water")) return "utilities";
  if (t.includes("salar") || t.includes("wage")) return "salaries";
  return "misc";
}

const overheadExpenseCategories = new Set(["overhead_payment", "rent", "utilities", "salaries", "misc"]);

function resolveEntryKind(isExpense: boolean, category: string) {
  if (!isExpense) return category;
  return overheadExpenseCategories.has(category) ? "overhead_payment" : category;
}

function resolveOverheadCategory(isExpense: boolean, category: string, title: string) {
  if (!isExpense && category === "overhead_contribution") return detectOverheadCategory(title);
  if (isExpense && overheadExpenseCategories.has(category)) {
    return category === "overhead_payment" ? detectOverheadCategory(title) : category;
  }
  return null;
}

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const duration = 1000;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
    prevRef.current = value;
  }, [value]);
  
  return <span>{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{suffix}</span>;
}

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
  metadata?: Record<string, unknown>;
  created_at: string;
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
  delta?: number;
  invest?: { available: number; byShop: Record<string, { available: number }> };
  savings?: { byShop: Record<string, number> };
  accounts?: {
    savings: number;
    overhead: number;
    invest: number;
    tshirts: number;
    stockvel: number;
    round: number;
    byShop?: Record<string, Record<string, number>>;
  };
};

type HandshakeEntry = {
  id: string;
  from_shop: string;
  to_shop: string;
  amount: number;
  status: string;
  initiated_by?: string;
  acknowledged_by?: string;
  created_at: string;
  notes?: string;
};

export function OperationsConsole({
  shops,
  initialState,
  initialLedger,
}: {
  shops: ShopNode[];
  initialState: OpsState;
  initialLedger: LedgerEntry[];
}) {
  const [activeTab, setActiveTab] = useState<"metrics" | "ledger" | "audit">("metrics");
  const [state, setState] = useState<OpsState>(initialState);
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
  const [handshakes, setHandshakes] = useState<HandshakeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [isExpense, setIsExpense] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("eod_deposit");
  const [shopId, setShopId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [actualBalanceInput, setActualBalanceInput] = useState("");

  // Handshake Form
  const [hsFrom, setHsFrom] = useState("");
  const [hsTo, setHsTo] = useState("");
  const [hsAmount, setHsAmount] = useState("");
  const [hsNotes, setHsNotes] = useState("");

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = new Date().toISOString().substring(0, 7);
      const queryParams = new URLSearchParams({
        limit: "150",
        month: monthStr
      });
      const [ledgerRes, stateRes] = await Promise.all([
        fetch(`/api/operations/ledger?${queryParams.toString()}`, { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
      ]);

      if (ledgerRes.ok && stateRes.ok) {
        const lData = await ledgerRes.json();
        const sData = await stateRes.json();
        setLedger(lData.rows || []);
        setState({
          computedBalance: sData.computedBalance,
          actualBalance: sData.actualBalance,
          delta: sData.delta,
          invest: sData.invest,
          savings: sData.savings,
          accounts: sData.accounts,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshHandshakes = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/handshakes", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHandshakes(data.handshakes || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshHandshakes();
  }, [refreshHandshakes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawVal = parseFloat(amount);
    if (isNaN(rawVal) || rawVal <= 0) {
      alert("Invalid amount");
      return;
    }

    setSubmitting(true);
    try {
      const finalVal = isExpense ? -rawVal : rawVal;
      const kind = resolveEntryKind(isExpense, category);
      const overheadCategory = resolveOverheadCategory(isExpense, category, title || notes);

      const res = await fetch("/api/operations/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: finalVal,
          kind,
          shopId: shopId || null,
          title: title || (isExpense ? "Expense Outflow" : "Deposit Inflow"),
          notes: notes || null,
          overheadCategory,
          metadata: { manualEntry: true },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit entry");
      }

      setAmount("");
      setTitle("");
      setNotes("");
      setShopId("");
      setIsExpense(false);
      setCategory("eod_deposit");
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcile = async () => {
    const val = parseFloat(actualBalanceInput);
    if (isNaN(val)) {
      alert("Please enter a valid amount");
      return;
    }
    setReconciling(true);
    try {
      const res = await fetch("/api/operations/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actualBalance: val }),
      });
      if (!res.ok) throw new Error("Reconciliation failed");
      setActualBalanceInput("");
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReconciling(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;
    try {
      const res = await fetch(`/api/operations/ledger/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Deletion failed");
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const createHandshake = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(hsAmount);
    if (!hsFrom || !hsTo || hsFrom === hsTo || isNaN(val) || val <= 0) {
      alert("Invalid handshake configuration");
      return;
    }
    try {
      const res = await fetch("/api/operations/handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromShop: hsFrom,
          toShop: hsTo,
          amount: val,
          notes: hsNotes,
        }),
      });
      if (!res.ok) throw new Error("Handshake registration failed");
      setHsFrom("");
      setHsTo("");
      setHsAmount("");
      setHsNotes("");
      await refreshHandshakes();
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const acknowledgeHandshake = async (id: string) => {
    try {
      const res = await fetch(`/api/operations/handshake/${id}/acknowledge`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Acknowledgement failed");
      await refreshHandshakes();
      await refreshData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Interconnect Banner */}
      <Link href="/invest" className="block">
        <div className="group relative overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-indigo-950/40 to-slate-950/40 p-5 transition-all duration-300 hover:border-sky-400/60 hover:shadow-[0_0_30px_rgba(56,189,248,0.15)] hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-sky-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-sky-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 blur-xl" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.2)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-sky-500/20">
                <HandCoins className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-wider text-sky-400 group-hover:text-sky-300 transition-colors">
                  Perfume Capital Pool
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                  Access Reinvestments & Stock Capital Allocation
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-sky-400 opacity-80 transition-opacity group-hover:opacity-100">
              Go to Invest <ArrowRightLeft className="h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>

      {/* Metrics Snapshots */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-500">Calculated Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white font-mono">
              <AnimatedNumber value={state.computedBalance} prefix="$" />
            </div>
            <p className="text-[9px] text-slate-500 uppercase font-black mt-1">Book balance based on ledger</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 border-emerald-950/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-emerald-400">Vault Physical Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              <AnimatedNumber value={state.actualBalance} prefix="$" />
            </div>
            <p className="text-[9px] text-emerald-500 uppercase font-black mt-1">Actual counted cash vault</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-500">Discrepancy / Delta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-black font-mono", (state.delta || 0) < 0 ? "text-rose-400" : "text-sky-400")}>
              <AnimatedNumber value={state.delta || 0} prefix={ (state.delta || 0) >= 0 ? "+" : "" } />
            </div>
            <p className="text-[9px] text-slate-500 uppercase font-black mt-1">Difference between actual & book</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-500">Active Handshakes</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-black text-white">
              {handshakes.filter(h => h.status === 'pending').length}
            </div>
            <Badge className="bg-amber-600/10 text-amber-400 border-amber-500/20 text-[8px] font-black uppercase">
              In Transit
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 pb-px gap-2">
        <Button onClick={() => setActiveTab("metrics")} variant="ghost" className={cn("px-4 py-2 border-b-2 rounded-none text-xs font-black uppercase", activeTab === "metrics" ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-400")}>
          <Warehouse className="w-4 h-4 mr-2" /> General & Goals
        </Button>
        <Button onClick={() => setActiveTab("ledger")} variant="ghost" className={cn("px-4 py-2 border-b-2 rounded-none text-xs font-black uppercase", activeTab === "ledger" ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-400")}>
          <History className="w-4 h-4 mr-2" /> Ledger Log
        </Button>

        <Button onClick={() => setActiveTab("audit")} variant="ghost" className={cn("px-4 py-2 border-b-2 rounded-none text-xs font-black uppercase", activeTab === "audit" ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-400")}>
          <Brain className="w-4 h-4 mr-2" /> Money Audit Brain
        </Button>
      </div>

      {/* Tab Panels */}
      {activeTab === "metrics" && (
        <div className="space-y-6">
          {/* Python ML Intelligence */}
          <OperationsOverviewIntelligence />

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Account Pools */}
            <Card className="bg-slate-950/60 border-slate-800">
              <CardHeader>
                <CardTitle className="text-md font-black uppercase italic">Operations Cash Pools</CardTitle>
                <CardDescription className="text-[10px] text-slate-500">
                  Allocations within Operations. Note: Invest pool holds the Perfume deposits balance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: "Reserves (Savings)", amount: state.accounts?.savings || 0, color: "bg-emerald-500", desc: "Accumulated business savings" },
                  { name: "Overheads Tracker", amount: state.accounts?.overhead || 0, color: "bg-amber-500", desc: "Per-shop overhead contributions minus overhead payments" },
                  { name: "Invest (Perfume Capital)", amount: state.accounts?.invest || 0, color: "bg-sky-500", desc: "Active Perfume capital pools" },
                  { name: "Nirvana Tees", amount: state.accounts?.tshirts || 0, color: "bg-violet-500", desc: "T-Shirt compounding cycle pool" },
                ].map((pool) => (
                  <div key={pool.name} className="flex items-center justify-between p-3 bg-slate-900/20 rounded-lg border border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-2.5 h-2.5 rounded-full", pool.color)} />
                      <div>
                        <div className="text-xs font-black text-white uppercase">{pool.name}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{pool.desc}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-md font-black italic text-white">${pool.amount.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Reconciliation and Manual Entry */}
            <div className="space-y-6">
              <Card className="bg-slate-950/60 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-md font-black uppercase italic">Vault Physical Reconciliation</CardTitle>
                  <CardDescription className="text-[10px] text-slate-500">
                    Submit actual cash counted in the vault to recalculate system discrepancy (delta).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Counted cash amount..."
                      value={actualBalanceInput}
                      onChange={(e) => setActualBalanceInput(e.target.value)}
                      className="bg-slate-950 border-slate-800 font-mono text-white text-xs"
                      step="0.01"
                    />
                    <Button disabled={reconciling} onClick={handleReconcile} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase text-xs">
                      {reconciling ? "Saving..." : "Reconcile"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-950/60 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-md font-black uppercase italic">Record Operations Transaction</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="flex border border-slate-800 rounded-lg p-0.5 bg-slate-950">
                      <Button type="button" onClick={() => setIsExpense(false)} className={cn("flex-1 text-[10px] font-black uppercase h-8", !isExpense ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-transparent text-slate-400")}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Addition
                      </Button>
                      <Button type="button" onClick={() => setIsExpense(true)} className={cn("flex-1 text-[10px] font-black uppercase h-8", isExpense ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-transparent text-slate-400")}>
                        <Minus className="w-3.5 h-3.5 mr-1" /> Deduction
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">Amount (USD)</label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-xs font-mono font-bold mt-1 text-white"
                          step="0.01"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">Pool / Category</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-md mt-1 text-xs font-bold"
                        >
                          {!isExpense ? (
                            <>
                              <option value="eod_deposit">EOD Deposit</option>
                              <option value="savings_deposit">Savings</option>
                              <option value="blackbox">Black Box</option>
                              <option value="overhead_contribution">Overhead Contribution</option>
                              <option value="stockvel_deposit">Stockvel Deposit</option>
                              <option value="round_deposit">Round Deposit</option>
                              <option value="capital_injection">Capital Injection</option>
                              <option value="other_income">Other Income</option>
                            </>
                          ) : (
                            <>
                              <option value="overhead_payment">Overhead (Rent/Salaries)</option>
                              <option value="savings_withdrawal">Savings Withdrawal</option>
                              <option value="stock_orders">Stock Purchases</option>
                              <option value="stockvel_withdrawal">Stockvel Payout</option>
                              <option value="round_withdrawal">Round Payout</option>
                              <option value="business_expense">Business Expense</option>
                              <option value="other_expense">Other Expense</option>
                            </>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">Shop Reference (optional)</label>
                        <select
                          value={shopId}
                          onChange={(e) => setShopId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-md mt-1 text-xs font-bold"
                        >
                          <option value="">Global / None</option>
                          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-500">Title / Purpose</label>
                        <Input
                          placeholder="e.g. June Rent / Safe Drop"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-xs mt-1 text-white"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500">Notes / Audit Memo</label>
                      <Input
                        placeholder="e.g. Bank slip #98439 / paid to landlord..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-xs mt-1 text-white"
                      />
                    </div>

                    <Button disabled={submitting} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase italic tracking-wider h-10 mt-2">
                      {submitting ? "Submitting..." : "Submit Transaction"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {activeTab === "ledger" && (
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-md font-black uppercase italic">Operations Ledger Log</CardTitle>
              <CardDescription className="text-[10px] text-slate-500">Showing recent vault movements, overhead payments, and additions.</CardDescription>
            </div>
            <Button onClick={refreshData} disabled={loading} size="sm" variant="outline" className="border-slate-800 font-black uppercase text-xs">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500">
                  <th className="py-2.5 text-left pl-2">Date</th>
                  <th className="py-2.5 text-left">Shop</th>
                  <th className="py-2.5 text-left">Pool/Kind</th>
                  <th className="py-2.5 text-left">Title</th>
                  <th className="py-2.5 text-left">Notes</th>
                  <th className="py-2.5 text-right pr-2">Amount</th>
                  <th className="py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(row => (
                  <tr key={row.id} className="border-b border-slate-900/50 hover:bg-slate-900/20">
                    <td className="py-3 pl-2 font-mono">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="py-3 uppercase font-black text-slate-400">{row.shop_id || "global"}</td>
                    <td className="py-3">
                      <Badge className={cn("text-[9px] font-black uppercase",
                        row.amount > 0 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      )}>
                        {row.overhead_category ? `overhead (${row.overhead_category})` : row.kind}
                      </Badge>
                    </td>
                    <td className="py-3 font-bold text-white">{row.title}</td>
                    <td className="py-3 text-slate-400 max-w-xs truncate" title={row.notes || ""}>{row.notes || "-"}</td>
                    <td className={cn("py-3 text-right pr-2 font-mono font-black italic text-sm", row.amount > 0 ? "text-emerald-400" : "text-rose-400")}>
                      {row.amount > 0 ? "+" : ""}${Number(row.amount).toFixed(2)}
                    </td>
                    <td className="py-3 text-center">
                      <Button size="icon" onClick={() => deleteEntry(row.id)} variant="ghost" className="h-6 w-6 text-slate-500 hover:text-rose-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 italic">No operations ledger records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}



      {activeTab === "audit" && (
        <Card className="bg-slate-950/60 border-slate-800">
          <CardContent className="pt-6">
            <MoneyAuditBrain shops={shops} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
