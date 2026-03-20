"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, AlertTriangle, CheckCircle2, Pencil, Trash2, ArrowRightLeft, Handshake, TrendingUp, TrendingDown, DollarSign, History, Cpu, Warehouse, Flame } from "lucide-react";
import { cn } from "@/components/ui";

type ShopNode = {
  id: string;
  name: string;
  expenses?: { rent?: number; salaries?: number; utilities?: number; misc?: number };
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
  updatedAt: string | null;
  delta: number;
  invest?: { available: number; byShop: Record<string, { available: number }> };
  overheadTracking?: {
    currentMonth: string;
    byShop: Record<string, number>;
    shopTargets: { id: string; name: string; target: number; tracked: number; progress: number; remaining: number }[];
  };
};

type DriftEntry = {
  id: string;
  amount: number;
  reason: string;
  resolved_kind?: string;
  resolved_shop?: string;
  created_at: string;
  allocations?: any[];
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

type LedgerEntry = {
  id: string;
  amount: number;
  kind: string;
  shop_id?: string;
  overhead_category?: string;
  title?: string;
  notes?: string;
  created_at: string;
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
  const [state, setState] = useState<OpsState>(initialState);
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
  const [drifts, setDrifts] = useState<DriftEntry[]>([]);
  const [handshakes, setHandshakes] = useState<HandshakeEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"status" | "overhead" | "drift" | "handshake">("status");

  // Vault adjustment state
  const [vaultForm, setVaultForm] = useState({ newBalance: "", reason: "" });
  const [showVaultModal, setShowVaultModal] = useState(false);

  // Add cash form
  const [cashForm, setCashForm] = useState({ amount: "", kind: "cash_addition", title: "", shopId: "", overheadCategory: "" });

  // Drift form
  const [driftForm, setDriftForm] = useState({
    reason: "",
    allocations: [{ shopId: "", category: "rent", amount: "" }],
    committed: false,
  });

  // Handshake form
  const [handshakeForm, setHandshakeForm] = useState({
    fromShop: "",
    toShop: "",
    amount: "",
    associate: "",
    initiatedBy: "",
    notes: "",
  });

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, ledgerRes, driftRes, handshakeRes] = await Promise.all([
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/ledger?limit=50", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/drifts", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/handshakes", { cache: "no-store", credentials: "include" }),
      ]);
      const stateData = await stateRes.json();
      const ledgerData = await ledgerRes.json();
      const driftData = await driftRes.json();
      const handshakeData = await handshakeRes.json();
      
      if (stateData?.computedBalance != null) setState(stateData);
      if (Array.isArray(ledgerData?.rows)) setLedger(ledgerData.rows);
      if (Array.isArray(driftData?.drifts)) setDrifts(driftData.drifts);
      if (Array.isArray(handshakeData?.handshakes)) setHandshakes(handshakeData.handshakes);
    } catch (e) {
      console.error("Failed to fetch state:", e);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const combinedTotal = (state?.actualBalance || 0) + (state?.invest?.available || 0);
  const totalValidated = drifts.reduce((sum, d) => sum + Math.abs(Number(d.amount || 0)), 0);
  const remainingDrift = (state?.actualBalance || 0) - (state?.computedBalance || 0);

  // Vault Adjustment - THIS CAUSES DRIFT
  const adjustVault = async () => {
    const newBalance = Number(vaultForm.newBalance);
    if (!Number.isFinite(newBalance) || newBalance < 0) {
      alert("Enter a valid balance");
      return;
    }
    if (!vaultForm.reason) {
      alert("Reason required for vault adjustment");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newBalance, reason: vaultForm.reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setVaultForm({ newBalance: "", reason: "" });
      setShowVaultModal(false);
      await fetchState();
      alert(`Vault adjusted! Change: $${data.vault?.change?.toFixed(2)}`);
    } catch (e: any) {
      alert(e.message || "Failed to adjust vault");
    } finally {
      setBusy(false);
    }
  };

  // Add cash to operations (NO DRIFT)
  const addCash = async () => {
    const amt = Number(cashForm.amount);
    if (!Number.isFinite(amt) || amt === 0) {
      alert("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: amt,
          kind: cashForm.kind,
          shopId: cashForm.shopId || null,
          title: cashForm.title || "Cash addition",
          overheadCategory: cashForm.kind === "overhead_payment" ? (cashForm.overheadCategory || "misc") : null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setCashForm({ amount: "", kind: "cash_addition", title: "", shopId: "", overheadCategory: "" });
      await fetchState();
    } catch (e) {
      alert("Failed to add cash");
    } finally {
      setBusy(false);
    }
  };

  // Resolve drift
  const addAllocation = () => {
    setDriftForm(f => ({
      ...f,
      allocations: [...f.allocations, { shopId: "", category: "rent", amount: "" }]
    }));
  };

  const removeAllocation = (index: number) => {
    setDriftForm(f => ({
      ...f,
      allocations: f.allocations.filter((_, i) => i !== index)
    }));
  };

  const updateAllocation = (index: number, field: string, value: string) => {
    setDriftForm(f => ({
      ...f,
      allocations: f.allocations.map((a, i) => i === index ? { ...a, [field]: value } : a)
    }));
  };

  const resolveDrift = async () => {
    if (!driftForm.reason) {
      alert("Reason required");
      return;
    }
    const validAllocs = driftForm.allocations.filter(a => a.shopId && Number(a.amount) > 0);
    if (validAllocs.length === 0) {
      alert("At least one allocation required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/drifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reason: driftForm.reason,
          committed: driftForm.committed,
          allocations: validAllocs.map(a => ({
            shopId: a.shopId,
            category: a.category,
            amount: Number(a.amount)
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setDriftForm({ reason: "", allocations: [{ shopId: "", category: "rent", amount: "" }], committed: false });
      await fetchState();
    } catch (e: any) {
      alert(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  // Handshake functions
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
        body: JSON.stringify({
          fromShop: handshakeForm.fromShop,
          toShop: handshakeForm.toShop,
          amount: amt,
          associate: handshakeForm.associate,
          initiatedBy: handshakeForm.initiatedBy,
          notes: handshakeForm.notes,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setHandshakeForm({ fromShop: "", toShop: "", amount: "", associate: "", initiatedBy: "", notes: "" });
      await fetchState();
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
      await fetchState();
    } catch (e) {
      alert("Failed to acknowledge");
    } finally {
      setBusy(false);
    }
  };

  // Delete ledger entry
  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/ledger/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      await fetchState();
    } catch (e) {
      alert("Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Master Vault Card */}
        <Card className="bg-gradient-to-br from-emerald-950/50 to-slate-950 border-emerald-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 flex items-center gap-1">
              <Warehouse className="h-3 w-3" /> Master Vault
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic text-emerald-300 font-mono">
              ${Number(state.actualBalance || 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Actual cash in business</p>
          </CardContent>
        </Card>

        {/* Invest Card */}
        <Card className="bg-gradient-to-br from-sky-950/50 to-slate-950 border-sky-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-sky-500/70 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Invest
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic text-sky-300 font-mono">
              ${Number(state?.invest?.available || 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Perfume growth fund</p>
          </CardContent>
        </Card>

        {/* Vault Adjustment Card */}
        <Card className="bg-gradient-to-br from-amber-950/50 to-slate-950 border-amber-800/30 cursor-pointer hover:border-amber-600 transition-colors" onClick={() => {
          setVaultForm({ newBalance: String(state.actualBalance || 0), reason: "" });
          setShowVaultModal(true);
        }}>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-amber-500/70 flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Vault Adjustment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic text-amber-300">
              Update Cash
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Click to adjust actual cash</p>
          </CardContent>
        </Card>

        {/* Combined Card */}
        <Card className="bg-gradient-to-br from-violet-950/50 to-slate-950 border-violet-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-violet-500/70 flex items-center gap-1">
              <Coins className="h-3 w-3" /> Combined Total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic text-violet-300 font-mono">
              ${combinedTotal.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Vault + Invest</p>
          </CardContent>
        </Card>
      </div>

      {/* Drift Warning Banner */}
      {Math.abs(remainingDrift) > 0.01 && (
        <Card className="bg-amber-950/30 border-amber-600/50">
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <span className="text-sm font-bold text-amber-300">
                Variance Detected: ${Math.abs(remainingDrift).toFixed(2)} {remainingDrift > 0 ? "(Surplus)" : "(Shortage)"}
              </span>
            </div>
            <Button size="sm" onClick={() => setActiveTab("drift")} className="bg-amber-600 hover:bg-amber-500 font-black uppercase text-xs">
              Explain Variance
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {[
          { id: "status" as const, label: "Status", icon: <Cpu className="h-4 w-4" /> },
          { id: "overhead" as const, label: "Overhead", icon: <DollarSign className="h-4 w-4" /> },
          { id: "drift" as const, label: "Drift", icon: <AlertTriangle className="h-4 w-4" />, badge: Math.abs(remainingDrift) > 0.01 ? Math.abs(remainingDrift).toFixed(0) : undefined },
          { id: "handshake" as const, label: "Handshake", icon: <Handshake className="h-4 w-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
              activeTab === tab.id ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[8px] ml-1">{tab.badge}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* STATUS TAB */}
      {activeTab === "status" && (
        <div className="space-y-4">
          {/* Add Cash Section */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Add Cash to Operations</CardTitle>
              <CardDescription className="text-[10px]">
                Add loans, peer transfers, or other cash sources. Does NOT cause drift.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  value={cashForm.amount}
                  onChange={(e) => setCashForm(f => ({ ...f, amount: e.target.value }))}
                  className="bg-slate-900 border-slate-800 font-mono"
                  placeholder="Amount"
                  inputMode="decimal"
                />
                <select
                  value={cashForm.kind}
                  onChange={(e) => setCashForm(f => ({ ...f, kind: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                >
                  <option value="cash_addition">Cash Addition</option>
                  <option value="loan_received">Loan Received</option>
                  <option value="peer_transfer">Peer Transfer</option>
                  <option value="other_income">Other Income</option>
                </select>
                <Input
                  value={cashForm.title}
                  onChange={(e) => setCashForm(f => ({ ...f, title: e.target.value }))}
                  className="bg-slate-900 border-slate-800"
                  placeholder="Description"
                />
                <Button disabled={busy} onClick={addCash} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
                  Add Cash
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Operations Health Status */}
          <TypingStatus 
            drift={remainingDrift} 
            ledger={ledger.slice(0, 5)} 
            computedBalance={state.computedBalance}
            actualBalance={state.actualBalance}
          />

          {/* Recent Transactions */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                <History className="h-5 w-5" /> Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[50vh] overflow-y-auto">
              {ledger.length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No transactions yet</div>
              ) : ledger.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      {r.kind} {r.shop_id ? `• ${r.shop_id}` : ""} {r.overhead_category ? `• ${r.overhead_category}` : ""}
                    </div>
                    <div className="text-sm font-bold text-white">{r.title || r.notes || "—"}</div>
                    <div className="text-[10px] text-slate-600">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={cn("text-lg font-black font-mono italic", Number(r.amount) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {Number(r.amount) >= 0 ? "+" : ""}{Number(r.amount || 0).toFixed(2)}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deleteEntry(r.id)} className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* OVERHEAD TAB */}
      {activeTab === "overhead" && (
        <div className="space-y-4">
          {/* Manual Overhead Entry */}
          <Card className="bg-amber-950/20 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400">Validate Overhead</CardTitle>
              <CardDescription className="text-[10px]">
                Track overhead expenses from POS that weren't auto-tracked. Posts to Shop Reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <Input
                  value={cashForm.amount}
                  onChange={(e) => setCashForm(f => ({ ...f, amount: e.target.value }))}
                  className="bg-slate-900 border-amber-500/30 font-mono"
                  placeholder="Amount"
                  inputMode="decimal"
                />
                <select
                  value={cashForm.shopId || ""}
                  onChange={(e) => setCashForm(f => ({ ...f, shopId: e.target.value }))}
                  className="bg-slate-900 border-amber-500/30 text-white px-3 py-2 rounded-md"
                >
                  <option value="">Shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select
                  value={cashForm.overheadCategory || "rent"}
                  onChange={(e) => setCashForm(f => ({ ...f, overheadCategory: e.target.value }))}
                  className="bg-slate-900 border-amber-500/30 text-white px-3 py-2 rounded-md"
                >
                  <option value="rent">Rent</option>
                  <option value="utilities">Utilities</option>
                  <option value="salaries">Salaries</option>
                  <option value="misc">Misc</option>
                </select>
                <Input
                  value={cashForm.title}
                  onChange={(e) => setCashForm(f => ({ ...f, title: e.target.value }))}
                  className="bg-slate-900 border-amber-500/30"
                  placeholder="Description"
                />
                <Button disabled={busy} onClick={() => {
                  setCashForm(f => ({ ...f, kind: "overhead_payment" }));
                  addCash();
                }} className="bg-amber-600 hover:bg-amber-500 font-black uppercase">
                  Validate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Overhead by Shop */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state?.overheadTracking?.shopTargets?.map(shop => (
              <Card key={shop.id} className="bg-slate-950/60 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-black uppercase italic">{shop.name}</CardTitle>
                  <CardDescription className="text-[10px]">{state?.overheadTracking?.currentMonth}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-slate-500">Tracked</span>
                    <span className="text-lg font-black font-mono italic text-emerald-400">${shop.tracked.toFixed(2)}</span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full transition-all", shop.progress >= 100 ? "bg-emerald-500" : shop.progress >= 50 ? "bg-sky-500" : "bg-amber-500")}
                      style={{ width: `${Math.min(100, shop.progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-600">Progress</span>
                    <span className={shop.progress >= 100 ? "text-emerald-400" : "text-amber-400"}>{shop.progress.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-[10px] border-t border-slate-800 pt-2">
                    <span className="text-slate-600">Remaining</span>
                    <span className="text-slate-400">${shop.remaining.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Overhead Ledger Entries */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Overhead Transactions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[40vh] overflow-y-auto">
              {ledger.filter(r => r.kind === "overhead_payment").length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No overhead transactions</div>
              ) : ledger.filter(r => r.kind === "overhead_payment").map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      {r.overhead_category || "overhead"} {r.shop_id ? `• ${r.shop_id}` : ""}
                    </div>
                    <div className="text-sm font-bold text-white">{r.title || r.notes || "—"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-black font-mono italic text-amber-400">
                      -${Math.abs(Number(r.amount || 0)).toFixed(2)}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deleteEntry(r.id)} className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* DRIFT TAB */}
      {activeTab === "drift" && (
        <div className="space-y-4">
          <Card className="bg-amber-950/20 border-amber-800/50">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Explain Variance
              </CardTitle>
              <CardDescription className="text-[10px]">
                Current Variance: <span className="text-amber-400 font-bold">${Math.abs(remainingDrift).toFixed(2)}</span>
                {remainingDrift > 0 ? " (Surplus - more cash than system)" : " (Shortage - less cash than system)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Explanation</label>
                <Input
                  value={driftForm.reason}
                  onChange={(e) => setDriftForm(f => ({ ...f, reason: e.target.value }))}
                  className="bg-slate-900 border-slate-800"
                  placeholder="e.g. Cash count revealed extra $100, Shortage from theft"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500">Allocate to Shop Overhead</label>
                  <Button size="sm" variant="outline" onClick={addAllocation} className="h-7 text-[10px]">+ Add</Button>
                </div>

                {driftForm.allocations.map((alloc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={alloc.shopId}
                      onChange={(e) => updateAllocation(idx, "shopId", e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md text-sm"
                    >
                      <option value="">Select Shop</option>
                      {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select
                      value={alloc.category}
                      onChange={(e) => updateAllocation(idx, "category", e.target.value)}
                      className="w-32 bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md text-sm"
                    >
                      <option value="rent">Rent</option>
                      <option value="utilities">Utilities</option>
                      <option value="salaries">Salaries</option>
                      <option value="misc">Misc</option>
                    </select>
                    <Input
                      value={alloc.amount}
                      onChange={(e) => updateAllocation(idx, "amount", e.target.value)}
                      className="w-28 bg-slate-900 border-slate-800 font-mono"
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                    {driftForm.allocations.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeAllocation(idx)} className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400">×</Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={driftForm.committed}
                    onChange={(e) => setDriftForm(f => ({ ...f, committed: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-black uppercase text-slate-300">Commit to Vault</span>
                    <p className="text-[10px] text-slate-500">
                      {driftForm.committed ? "Move money from variance to tracked overhead" : "Money was already in vault - just explaining"}
                    </p>
                  </div>
                </label>
              </div>

              <Button disabled={busy} onClick={resolveDrift} className="w-full bg-amber-600 hover:bg-amber-500 font-black uppercase">
                <CheckCircle2 className="h-4 w-4 mr-2" /> {driftForm.committed ? "Commit & Explain" : "Explain Variance"}
              </Button>
            </CardContent>
          </Card>

          {/* Drift History */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Variance Explanations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[40vh] overflow-y-auto">
              {drifts.length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No variance explanations yet</div>
              ) : drifts.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-400">{d.resolved_kind}</div>
                    <div className="text-sm font-bold text-white">{d.reason}</div>
                    <div className="text-[10px] text-slate-600">{new Date(d.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-lg font-black font-mono italic text-amber-400">
                    ${Math.abs(d.amount).toFixed(2)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HANDSHAKE TAB */}
      {activeTab === "handshake" && (
        <div className="space-y-4">
          {/* Initiate Handshake */}
          <Card className="bg-gradient-to-br from-violet-950/30 to-slate-900 border-violet-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-violet-400 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" /> Initiate Cash Transfer
              </CardTitle>
              <CardDescription className="text-[10px]">
                Record when cash moves physically between shops for accountability
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
                  {shops.filter(s => s.id !== handshakeForm.fromShop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                <Button disabled={busy} onClick={initiateHandshake} className="bg-violet-600 hover:bg-violet-500 font-black uppercase">
                  Initiate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pending Handshakes */}
          <Card className="bg-amber-950/20 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400">Pending Acknowledgments</CardTitle>
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
                    <div className="text-right">
                      <div className="text-xl font-black font-mono italic text-amber-400">${h.amount.toFixed(2)}</div>
                    </div>
                    <Button size="sm" onClick={() => acknowledgeHandshake(h.id)} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
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
                      <CheckCircle2 className="h-3 w-3" /> {h.from_shop} <ArrowRightLeft className="h-3 w-3" /> {h.to_shop}
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

      {/* Vault Adjustment Modal */}
      {showVaultModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Card className="bg-slate-950 border-slate-800 w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                <Pencil className="h-5 w-5" /> Update Master Vault
              </CardTitle>
              <CardDescription className="text-[10px]">
                Changing this will create a variance. Provide an explanation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Current Balance</label>
                <div className="text-xl font-black font-mono italic text-slate-400">${Number(state.actualBalance || 0).toLocaleString()}</div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">New Balance</label>
                <Input
                  value={vaultForm.newBalance}
                  onChange={(e) => setVaultForm(f => ({ ...f, newBalance: e.target.value }))}
                  className="bg-slate-900 border-slate-800 font-mono"
                  placeholder="0.00"
                  inputMode="decimal"
                />
                {Number(vaultForm.newBalance) !== Number(state.actualBalance) && (
                  <div className={cn("text-[10px] font-bold", Number(vaultForm.newBalance) > Number(state.actualBalance) ? "text-emerald-400" : "text-rose-400")}>
                    Change: {Number(vaultForm.newBalance) > Number(state.actualBalance) ? "+" : ""}${((Number(vaultForm.newBalance) || 0) - (Number(state.actualBalance) || 0)).toFixed(2)}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Explanation</label>
                <Input
                  value={vaultForm.reason}
                  onChange={(e) => setVaultForm(f => ({ ...f, reason: e.target.value }))}
                  className="bg-slate-900 border-slate-800"
                  placeholder="e.g. Physical cash count, Cash found, Cash missing"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowVaultModal(false)} className="flex-1">Cancel</Button>
                <Button disabled={busy} onClick={adjustVault} className="flex-1 bg-amber-600 hover:bg-amber-500 font-black uppercase">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Typing Status Component
function TypingStatus({ drift, ledger, computedBalance, actualBalance }: {
  drift: number;
  ledger: LedgerEntry[];
  computedBalance: number;
  actualBalance: number;
}) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [currentLine, setCurrentLine] = useState(0);
  const fullText = useRef("");
  const charIndex = useRef(0);

  useEffect(() => {
    const lines: string[] = [];
    
    if (Math.abs(drift) < 0.01) {
      lines.push("OPERATIONS STATUS: HEALTHY");
      lines.push(`Vault Balance: $${actualBalance.toLocaleString()}`);
      lines.push(`System Balance: $${computedBalance.toLocaleString()}`);
      lines.push("Variance: NONE DETECTED");
      lines.push("All cash is accounted for and tracked.");
    } else {
      lines.push("OPERATIONS STATUS: VARIANCE DETECTED");
      lines.push(`Vault Balance: $${actualBalance.toLocaleString()}`);
      lines.push(`System Balance: $${computedBalance.toLocaleString()}`);
      lines.push(`Variance: $${Math.abs(drift).toFixed(2)} ${drift > 0 ? "(SURPLUS)" : "(SHORTAGE)"}`);
      lines.push("Please explain this variance in the Drift tab.");
    }

    if (ledger.length > 0) {
      lines.push("---");
      lines.push("RECENT TRANSACTIONS:");
      ledger.slice(0, 5).forEach((l, i) => {
        lines.push(`${i + 1}. ${l.title || l.kind}: $${Number(l.amount).toFixed(2)}`);
      });
    }

    fullText.current = lines.join("\n");
    charIndex.current = 0;
    setCurrentLine(0);
    setDisplayText("");
    setIsTyping(true);

    const interval = setInterval(() => {
      if (charIndex.current < fullText.current.length) {
        const newText = fullText.current.substring(0, charIndex.current + 1);
        setDisplayText(newText);
        
        // Count newlines to track current line
        const newlines = (newText.match(/\n/g) || []).length;
        setCurrentLine(newlines);
        
        charIndex.current++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [drift, ledger, computedBalance, actualBalance]);

  const isHealthy = Math.abs(drift) < 0.01;

  return (
    <Card className={cn(
      "border-2",
      isHealthy ? "bg-emerald-950/20 border-emerald-800/30" : "bg-amber-950/20 border-amber-800/50"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className={cn(
          "text-lg font-black uppercase italic flex items-center gap-2",
          isHealthy ? "text-emerald-400" : "text-amber-400"
        )}>
          <Flame className="h-5 w-5" />
          {isHealthy ? "Operations Healthy" : "Variance Warning"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className={cn(
          "text-xs font-mono whitespace-pre-wrap leading-relaxed",
          isHealthy ? "text-emerald-300/80" : "text-amber-300/80"
        )}>
          {displayText}
          {isTyping && <span className="animate-pulse">▋</span>}
        </pre>
      </CardContent>
    </Card>
  );
}
