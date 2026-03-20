"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { TrendingUp, TrendingDown, Coins, Loader2, AlertTriangle, CheckCircle2, ArrowRightLeft, Clock, UserCheck, ShieldCheck } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"overview" | "drift" | "handshake">("overview");
  const [drifts, setDrifts] = useState<DriftEntry[]>([]);
  const [handshakes, setHandshakes] = useState<HandshakeEntry[]>([]);

  const shopOptions = useMemo(() => shops.map((s) => ({ id: s.id, name: s.name })), [shops]);

  const [actualBalance, setActualBalance] = useState(String(initialState.actualBalance ?? 0));

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
    amount: "",
    reason: "",
    resolveKind: "overhead_payment",
    resolveShop: "",
  });

  const [handshakeForm, setHandshakeForm] = useState({
    fromShop: "",
    toShop: "",
    amount: "",
    associate: "",
    initiatedBy: "",
    notes: "",
  });

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
    const amt = Number(driftForm.amount);
    if (!Number.isFinite(amt) || amt === 0) {
      alert("Amount required");
      return;
    }
    if (!driftForm.reason) {
      alert("Reason required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/drifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: amt,
          reason: driftForm.reason,
          resolveKind: driftForm.resolveKind,
          resolveShop: driftForm.resolveShop,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setDriftForm({ amount: "", reason: "", resolveKind: "overhead_payment", resolveShop: "" });
      await fetchState();
    } finally {
      setBusy(false);
    }
  };

  const initiateHandshake = async () => {
    const amt = Number(handshakeForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Amount required");
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
    } finally {
      setBusy(false);
    }
  };

  const acknowledgeHandshake = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/handshake/${id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      await fetchState();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operations</CardDescription>
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
        <Card className={cn("border-2", Math.abs(state.delta || 0) < 0.01 ? "bg-emerald-950/20 border-emerald-800/30" : "bg-amber-950/20 border-amber-800/50")}>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Drift</CardDescription>
            <CardTitle className={cn("text-2xl font-black italic", Math.abs(state.delta || 0) < 0.01 ? "text-emerald-400" : "text-amber-400")}>
              {state.delta.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("text-[10px] font-bold uppercase", Math.abs(state.delta || 0) < 0.01 ? "text-emerald-500" : "text-amber-500")}>
            {Math.abs(state.delta || 0) < 0.01 ? "Balanced" : "Needs Resolution"}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {[
          { id: "overview" as const, label: "Overview", icon: <Coins className="h-4 w-4" /> },
          { id: "drift" as const, label: "Drift Resolution", icon: <AlertTriangle className="h-4 w-4" />, badge: Math.abs(state.delta || 0) > 0.01 ? Math.abs(state.delta).toFixed(2) : undefined },
          { id: "handshake" as const, label: "Cash Handshake", icon: <ArrowRightLeft className="h-4 w-4" /> },
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
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Post to Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <Input value={entry.amount} onChange={(e) => setEntry(s => ({ ...s, amount: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono" placeholder="Amount" inputMode="decimal" />
                <select value={entry.kind} onChange={(e) => setEntry(s => ({ ...s, kind: e.target.value }))} className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                  <option value="eod_deposit">EOD Deposit</option>
                  <option value="overhead_payment">Overhead</option>
                  <option value="capital_injection">Injection</option>
                  <option value="adjustment">Adjustment</option>
                </select>
                <select value={entry.shopId} onChange={(e) => setEntry(s => ({ ...s, shopId: e.target.value }))} className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                  <option value="">Any Shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={entry.overheadCategory} onChange={(e) => setEntry(s => ({ ...s, overheadCategory: e.target.value }))} className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                  <option value="">No Category</option>
                  <option value="rent">Rent</option>
                  <option value="utilities">Utilities</option>
                  <option value="salaries">Salaries</option>
                  <option value="misc">Misc</option>
                </select>
                <Input value={entry.title} onChange={(e) => setEntry(s => ({ ...s, title: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="Title" />
                <Button disabled={busy} onClick={addEntry} className="font-black uppercase">Post</Button>
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
                  <div className={cn("text-lg font-black font-mono italic", Number(r.amount) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {Number(r.amount) >= 0 ? "+" : ""}{Number(r.amount || 0).toFixed(2)}
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
                <AlertTriangle className="h-5 w-5" /> Resolve Drift
              </CardTitle>
              <CardDescription className="text-[10px]">
                Explain where drift came from and route it to the right place (overhead, cash, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Amount</label>
                  <Input value={driftForm.amount} onChange={(e) => setDriftForm(s => ({ ...s, amount: e.target.value }))} className="bg-slate-900 border-amber-500/30 font-mono" placeholder="0.00" inputMode="decimal" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Route As</label>
                  <select value={driftForm.resolveKind} onChange={(e) => setDriftForm(s => ({ ...s, resolveKind: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                    <option value="overhead_payment">Overhead Payment</option>
                    <option value="cash_adjustment">Cash Adjustment</option>
                    <option value="eod_deposit">EOD Deposit</option>
                    <option value="explained">Explained (No Change)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Shop (if overhead)</label>
                  <select value={driftForm.resolveShop} onChange={(e) => setDriftForm(s => ({ ...s, resolveShop: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                    <option value="">Auto-detect</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Reason / Description</label>
                  <Input value={driftForm.reason} onChange={(e) => setDriftForm(s => ({ ...s, reason: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="e.g. Rent from Dub Dub ($100) + Trade Center ($10)" />
                </div>
              </div>
              <Button disabled={busy} onClick={resolveDrift} className="w-full bg-amber-600 hover:bg-amber-500 font-black uppercase">
                <CheckCircle2 className="h-4 w-4 mr-2" /> Resolve & Route Drift
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
                    <div className="text-[10px] font-black uppercase text-slate-400">{d.resolved_kind} {d.resolved_shop ? `• ${d.resolved_shop}` : ""}</div>
                    <div className="text-sm font-bold text-white">{d.reason}</div>
                  </div>
                  <div className="text-lg font-black font-mono italic text-amber-400">${d.amount.toFixed(2)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cash Handshake Tab */}
      {activeTab === "handshake" && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-violet-950/30 to-slate-900 border-violet-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-violet-400 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" /> Initiate Cash Handshake
              </CardTitle>
              <CardDescription className="text-[10px]">
                When cash moves physically between shops, create a handshake for accountability
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">From Shop (Sender)</label>
                  <select value={handshakeForm.fromShop} onChange={(e) => setHandshakeForm(s => ({ ...s, fromShop: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                    <option value="">Select Shop</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">To Shop (Receiver)</label>
                  <select value={handshakeForm.toShop} onChange={(e) => setHandshakeForm(s => ({ ...s, toShop: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md">
                    <option value="">Select Shop</option>
                    {shops.filter(s => s.id !== handshakeForm.fromShop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Amount</label>
                  <Input value={handshakeForm.amount} onChange={(e) => setHandshakeForm(s => ({ ...s, amount: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono" placeholder="0.00" inputMode="decimal" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Courier / Associate</label>
                  <Input value={handshakeForm.associate} onChange={(e) => setHandshakeForm(s => ({ ...s, associate: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="Person carrying cash" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Initiated By</label>
                  <Input value={handshakeForm.initiatedBy} onChange={(e) => setHandshakeForm(s => ({ ...s, initiatedBy: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="Manager name" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Notes</label>
                  <Input value={handshakeForm.notes} onChange={(e) => setHandshakeForm(s => ({ ...s, notes: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="Purpose" />
                </div>
              </div>
              <Button disabled={busy} onClick={initiateHandshake} className="w-full bg-violet-600 hover:bg-violet-500 font-black uppercase">
                <ArrowRightLeft className="h-4 w-4 mr-2" /> Initiate Handshake
              </Button>
            </CardContent>
          </Card>

          {/* Pending Handshakes - Need Acknowledgment */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Pending Acknowledgments</CardTitle>
              <CardDescription className="text-[10px]">Handshakes waiting to be signed off by receiver</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {handshakes.filter(h => h.status === "pending").length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No pending handshakes</div>
              ) : handshakes.filter(h => h.status === "pending").map(h => (
                <div key={h.id} className="flex items-center justify-between p-4 bg-amber-950/20 rounded-lg border border-amber-800/30">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                      <ArrowRightLeft className="h-3 w-3" />
                      {h.from_shop} → {h.to_shop}
                    </div>
                    <div className="text-sm font-bold text-white">{h.associate} carrying cash</div>
                    <div className="text-[10px] text-slate-500">
                      Initiated by {h.initiated_by} • {new Date(h.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xl font-black font-mono italic text-amber-400">${h.amount.toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {Math.round((Date.now() - new Date(h.created_at).getTime()) / 60000)}m ago
                      </div>
                    </div>
                    <Button size="sm" onClick={() => acknowledgeHandshake(h.id)} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
                      <UserCheck className="h-4 w-4 mr-1" /> Acknowledge
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
            <CardContent className="space-y-2">
              {handshakes.filter(h => h.status !== "pending").length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No completed handshakes</div>
              ) : handshakes.filter(h => h.status !== "pending").map(h => (
                <div key={h.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" />
                      {h.from_shop} → {h.to_shop}
                    </div>
                    <div className="text-sm font-bold text-white">{h.associate}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black font-mono italic text-emerald-400">${h.amount.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500">Acknowledged</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
