"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, AlertTriangle, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/components/ui";

type ShopNode = {
  id: string;
  name: string;
  expenses?: { rent?: number; salaries?: number; utilities?: number; misc?: number };
};

type DriftEntry = {
  id: string;
  amount: number;
  reason: string;
  resolved_kind?: string;
  resolved_shop?: string;
  created_at: string;
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
  const [ledger, setLedger] = useState<any[]>(initialLedger);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "drift">("overview");
  const [drifts, setDrifts] = useState<DriftEntry[]>([]);

  const shopOptions = useMemo(() => shops.map((s) => ({ id: s.id, name: s.name })), [shops]);

  const [actualBalance, setActualBalance] = useState(String(initialState.actualBalance ?? 0));

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, ledgerRes, driftRes] = await Promise.all([
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/ledger?limit=50", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/drifts", { cache: "no-store", credentials: "include" }),
      ]);
      const stateData = await stateRes.json();
      const ledgerData = await ledgerRes.json();
      const driftData = await driftRes.json();
      
      if (stateData?.computedBalance != null) setState(stateData);
      if (Array.isArray(ledgerData?.rows)) setLedger(ledgerData.rows);
      if (Array.isArray(driftData?.drifts)) setDrifts(driftData.drifts);
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

  const [entry, setEntry] = useState({
    amount: "",
    kind: "eod_deposit",
    shopId: "",
    overheadCategory: "",
    title: "",
    notes: "",
    effectiveDate: "",
  });

  const [driftForm, setDriftForm] = useState({
    reason: "",
    allocations: [{ shopId: "", category: "rent", amount: "" }],
    committed: false,
  });

  const [vaultForm, setVaultForm] = useState({
    newBalance: "",
    reason: "",
  });

  const [showVaultModal, setShowVaultModal] = useState(false);
  
  const currentDrift = state.delta;
  
  // Calculate total validated drift
  const totalValidated = drifts.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const remainingDrift = currentDrift - totalValidated;
  
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

  const totalAllocated = driftForm.allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);

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
        body: JSON.stringify({
          newBalance,
          reason: vaultForm.reason,
        }),
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

  const addEntry = async () => {
    const amt = Number(entry.amount);
    if (!Number.isFinite(amt) || amt === 0) {
      alert("Amount must be non-zero");
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
          kind: entry.kind,
          shopId: entry.shopId || null,
          overheadCategory: entry.overheadCategory || null,
          title: entry.title || null,
          notes: entry.notes || null,
          effectiveDate: entry.effectiveDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setEntry({ amount: "", kind: "eod_deposit", shopId: "", overheadCategory: "", title: "", notes: "", effectiveDate: "" });
      await fetchState();
    } finally {
      setBusy(false);
    }
  };

  const resolveDrift = async () => {
    if (!driftForm.reason) {
      alert("Reason required");
      return;
    }
    const validAllocs = driftForm.allocations.filter(a => a.shopId && Number(a.amount) > 0);
    if (validAllocs.length === 0) {
      alert("At least one allocation with shop and amount required");
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
      const msg = driftForm.committed
        ? `Drift committed! $${data.validation?.validatedAmount?.toFixed(2) || 0} moved from drift to tracked.`
        : `Drift validated! $${data.validation?.validatedAmount?.toFixed(2) || 0} explained.`;
      alert(msg);
    } catch (e: any) {
      alert(e.message || "Failed to resolve drift");
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this ledger entry?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/ledger/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      await fetchState();
    } catch (e) {
      alert("Failed to delete entry");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-950/60 border-slate-800 relative">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center justify-between">
              <span>Operations</span>
              <button onClick={() => {
                setVaultForm({ newBalance: String(state.actualBalance || 0), reason: "" });
                setShowVaultModal(true);
              }} className="text-slate-600 hover:text-white">
                <Pencil className="h-3 w-3" />
              </button>
            </CardDescription>
            <CardTitle className="text-2xl font-black italic text-emerald-300">${Number(state.actualBalance || 0).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">Cash Vault</CardContent>
        </Card>
        <Card className="bg-sky-950/30 border-sky-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-sky-500">Invest</CardDescription>
            <CardTitle className="text-2xl font-black italic text-sky-400">${Number(state?.invest?.available || 0).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">Perfume Growth</CardContent>
        </Card>
        <Card className="bg-violet-950/30 border-violet-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-violet-500">Combined</CardDescription>
            <CardTitle className="text-2xl font-black italic text-violet-400">${combinedTotal.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">Ops + Invest</CardContent>
        </Card>
        <Card className={cn("border-2", Math.abs(remainingDrift) < 0.01 ? "bg-emerald-950/20 border-emerald-800/30" : "bg-amber-950/20 border-amber-800/50")}>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Drift
              {totalValidated > 0 && <span className="text-emerald-500 ml-1">(Validated: ${totalValidated.toFixed(2)})</span>}
            </CardDescription>
            <CardTitle className={cn("text-2xl font-black italic", Math.abs(remainingDrift) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
              {remainingDrift.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("text-[10px] font-bold uppercase", Math.abs(remainingDrift) < 0.01 ? "text-emerald-500" : "text-amber-500")}>
            {Math.abs(remainingDrift) < 0.01 ? "Balanced" : "Needs Resolution"}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {[
          { id: "overview" as const, label: "Overview", icon: <Coins className="h-4 w-4" /> },
          { id: "drift" as const, label: "Drift Resolution", icon: <AlertTriangle className="h-4 w-4" />, badge: Math.abs(state.delta || 0) > 0.01 ? Math.abs(state.delta).toFixed(2) : undefined },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
              activeTab === tab.id
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
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

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Post to Operations</CardTitle>
              <CardDescription className="text-[10px]">
                Post EOD deposits, overhead payments, or capital injections. Does NOT cause drift.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Amount</label>
                  <Input value={entry.amount} onChange={(e) => setEntry(s => ({ ...s, amount: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono" placeholder="0.00" inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Type</label>
                  <select value={entry.kind} onChange={(e) => setEntry(s => ({ ...s, kind: e.target.value }))} className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md w-full">
                    <option value="eod_deposit">EOD Deposit</option>
                    <option value="overhead_payment">Overhead Payment</option>
                    <option value="capital_injection">Capital Injection</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Shop</label>
                  <select value={entry.shopId} onChange={(e) => setEntry(s => ({ ...s, shopId: e.target.value }))} className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md w-full">
                    <option value="">Any Shop</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Category</label>
                  <select value={entry.overheadCategory} onChange={(e) => setEntry(s => ({ ...s, overheadCategory: e.target.value }))} className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md w-full">
                    <option value="">None</option>
                    <option value="rent">Rent</option>
                    <option value="utilities">Utilities</option>
                    <option value="salaries">Salaries</option>
                    <option value="misc">Misc</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Title</label>
                  <Input value={entry.title} onChange={(e) => setEntry(s => ({ ...s, title: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="Description" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">&nbsp;</label>
                  <Button disabled={busy} onClick={addEntry} className="w-full bg-emerald-600 hover:bg-emerald-500 font-black uppercase">Post</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-950/20 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400">Validate Overhead</CardTitle>
              <CardDescription className="text-[10px]">
                Track overhead expenses that weren't auto-tracked. Posts to Shop Overhead Reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <Input value={entry.amount} onChange={(e) => setEntry(s => ({ ...s, amount: e.target.value }))} className="bg-slate-900 border-amber-500/30 font-mono" placeholder="Amount" inputMode="decimal" />
                <select value={entry.shopId} onChange={(e) => setEntry(s => ({ ...s, shopId: e.target.value }))} className="bg-slate-900 border-amber-500/30 text-white px-3 py-2 rounded-md">
                  <option value="">Select Shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={entry.overheadCategory} onChange={(e) => setEntry(s => ({ ...s, overheadCategory: e.target.value }))} className="bg-slate-900 border-amber-500/30 text-white px-3 py-2 rounded-md">
                  <option value="rent">Rent</option>
                  <option value="utilities">Utilities</option>
                  <option value="salaries">Salaries</option>
                  <option value="misc">Misc</option>
                </select>
                <Input value={entry.title} onChange={(e) => setEntry(s => ({ ...s, title: e.target.value }))} className="bg-slate-900 border-amber-500/30" placeholder="Description" />
                <Button disabled={busy} onClick={() => {
                  setEntry(e => ({ ...e, kind: "overhead_payment" }));
                  addEntry();
                }} className="bg-amber-600 hover:bg-amber-500 font-black uppercase">Validate</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Recent Ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[50vh] overflow-y-auto">
              {ledger.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-400">{r.kind} {r.shop_id ? `• ${r.shop_id}` : ""} {r.overhead_category ? `• ${r.overhead_category}` : ""}</div>
                    <div className="text-sm font-bold text-white">{r.title || r.notes || "—"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={cn("text-lg font-black font-mono italic", Number(r.amount) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {Number(r.amount) >= 0 ? "+" : ""}{Number(r.amount || 0).toFixed(2)}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const newAmount = prompt("Edit amount:", String(r.amount));
                      if (newAmount) {
                        fetch(`/api/operations/ledger/${r.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ amount: Number(newAmount) }),
                        }).then(() => fetchState());
                      }
                    }} className="h-8 w-8 p-0 text-slate-500 hover:text-white">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteEntry(r.id)} className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-amber-950/20 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400">Overhead Reconciliation</CardTitle>
              <CardDescription className="text-[10px]">{state?.overheadTracking?.currentMonth || new Date().toISOString().split('T')[0].substring(0, 7)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {state?.overheadTracking?.shopTargets?.map(shop => (
                <div key={shop.id} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm font-black text-white uppercase">{shop.name}</span>
                    <span className="text-xs font-bold text-slate-400">${shop.tracked.toFixed(2)} / ${shop.target.toFixed(2)}</span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div className={cn("h-full", shop.progress >= 100 ? "bg-emerald-500" : shop.progress >= 50 ? "bg-sky-500" : "bg-amber-500")} style={{ width: `${Math.min(100, shop.progress)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Drift Resolution Tab */}
      {activeTab === "drift" && (
        <div className="space-y-4">
          <Card className="bg-amber-950/20 border-amber-800/50">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Link Drift to Overhead
              </CardTitle>
              <CardDescription className="text-[10px]">
                Current Drift: <span className="text-amber-400 font-bold">${Math.abs(currentDrift).toFixed(2)}</span> {currentDrift < 0 ? "(Shortage)" : "(Surplus)"}. Link to shop overhead allocations to track in reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">Explanation</label>
                <Input 
                  value={driftForm.reason} 
                  onChange={(e) => setDriftForm(s => ({ ...s, reason: e.target.value }))} 
                  className="bg-slate-900 border-slate-800" 
                  placeholder="e.g. Rent payments collected, utilities paid" 
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-500">Overhead Allocations</label>
                  <Button size="sm" variant="outline" onClick={addAllocation} className="h-7 text-[10px]">+ Add Line</Button>
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
              
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-[10px] font-black uppercase text-slate-500">Total Allocated</span>
                <span className={cn("text-lg font-black font-mono italic", totalAllocated === Math.abs(currentDrift) ? "text-emerald-400" : "text-amber-400")}>
                  ${totalAllocated.toFixed(2)}
                </span>
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
                      {driftForm.committed
                        ? "Money will be moved from drift to tracked overhead"
                        : "Money was already in vault - just validating explanation"
                      }
                    </p>
                  </div>
                </label>
              </div>
              
              <Button disabled={busy} onClick={resolveDrift} className="w-full bg-amber-600 hover:bg-amber-500 font-black uppercase">
                <CheckCircle2 className="h-4 w-4 mr-2" /> {driftForm.committed ? "Commit & Validate" : "Validate Drift"}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Drift History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {drifts.length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No drift resolutions yet</div>
              ) : drifts.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-400">{d.resolved_kind}</div>
                    <div className="text-sm font-bold text-white">{d.reason}</div>
                  </div>
                  <div className="text-lg font-black font-mono italic text-amber-400">${d.amount.toFixed(2)}</div>
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
              <CardTitle className="text-lg font-black uppercase italic text-emerald-400 flex items-center gap-2">
                <Pencil className="h-5 w-5" /> Edit Master Vault
              </CardTitle>
              <CardDescription className="text-[10px]">
                Changing the vault balance will create a drift record. Provide an explanation.
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
                  placeholder="e.g. Cash count revealed $50 more, Physical verification"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowVaultModal(false)} className="flex-1">Cancel</Button>
                <Button disabled={busy} onClick={adjustVault} className="flex-1 bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Adjustment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
