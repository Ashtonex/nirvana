"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { 
  Coins, 
  TrendingUp, 
  TrendingDown,
  ArrowRightLeft,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  Package,
  RefreshCw,
  Plus,
  Minus,
  Building2,
  Handshake,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";
import { cn } from "@/components/ui";

type ShopNode = {
  id: string;
  name: string;
  expenses?: { rent?: number; salaries?: number; utilities?: number; misc?: number };
};

type OpsFullState = {
  computedBalance: number;
  actualBalance: number;
  updatedAt: string | null;
  delta: number;
  shopTotals: Record<string, number>;
  overheadTotals: Record<string, number>;
  invest: {
    total: number;
    withdrawn: number;
    available: number;
    byShop: Record<string, { total: number; withdrawn: number; available: number }>;
  };
  combinedTotal: number;
  overheadTracking: {
    currentMonth: string;
    byShop: Record<string, number>;
    shopTargets: {
      id: string;
      name: string;
      target: number;
      tracked: number;
      progress: number;
      remaining: number;
    }[];
  };
};

export function OperationsConsole({
  shops,
  initialLedger,
}: {
  shops: ShopNode[];
  initialLedger: any[];
}) {
  const [state, setState] = useState<OpsFullState | null>(null);
  const [ledger, setLedger] = useState<any[]>(initialLedger);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "overhead" | "handshake">("overview");
  const [busy, setBusy] = useState(false);
  
  const [entry, setEntry] = useState({
    amount: "",
    kind: "eod_deposit",
    shopId: "",
    overheadCategory: "",
    title: "",
    notes: "",
    effectiveDate: "",
  });

  const [handshake, setHandshake] = useState({
    fromShop: "",
    toShop: "",
    amount: "",
    associate: "",
    initiatedBy: "",
    notes: "",
  });

  const [expandedShops, setExpandedShops] = useState<Set<string>>(new Set());

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, ledgerRes] = await Promise.all([
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/ledger?limit=50", { cache: "no-store", credentials: "include" }),
      ]);
      const stateData = await stateRes.json();
      const ledgerData = await ledgerRes.json();
      
      if (stateData.computedBalance !== undefined) {
        setState(stateData);
      }
      if (Array.isArray(ledgerData.rows)) {
        setLedger(ledgerData.rows);
      }
    } catch (e) {
      console.error("Failed to fetch state:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const saveActual = async (amount: number) => {
    setBusy(true);
    try {
      await fetch("/api/operations/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actualBalance: amount }),
      });
      await fetchState();
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

  const initiateHandshake = async () => {
    const amt = Number(handshake.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Amount must be positive");
      return;
    }
    if (!handshake.fromShop || !handshake.toShop) {
      alert("Select both source and destination shops");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromShop: handshake.fromShop,
          toShop: handshake.toShop,
          amount: amt,
          associate: handshake.associate,
          initiatedBy: handshake.initiatedBy,
          notes: handshake.notes,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setHandshake({ fromShop: "", toShop: "", amount: "", associate: "", initiatedBy: "", notes: "" });
      await fetchState();
    } finally {
      setBusy(false);
    }
  };

  const toggleShop = (shopId: string) => {
    setExpandedShops(prev => {
      const next = new Set(prev);
      if (next.has(shopId)) next.delete(shopId);
      else next.add(shopId);
      return next;
    });
  };

  const driftBadge = state && (
    Math.abs(state.delta) < 0.01 ? (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Balanced</Badge>
    ) : Math.abs(state.delta) < 50 ? (
      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Drift: ${state.delta.toFixed(2)}</Badge>
    ) : (
      <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20">Critical Drift: ${state.delta.toFixed(2)}</Badge>
    )
  );

  if (loading && !state) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operations</CardDescription>
            <CardTitle className="text-2xl font-black italic text-emerald-400">
              ${Number(state?.actualBalance || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Cash Vault</div>
            {driftBadge}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-sky-900/50 to-slate-900 border-sky-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-sky-500">Invest</CardDescription>
            <CardTitle className="text-2xl font-black italic text-sky-400">
              ${Number(state?.invest?.available || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">
            Perfume Growth Capital
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-violet-900/50 to-slate-900 border-violet-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-violet-500">Combined</CardDescription>
            <CardTitle className="text-2xl font-black italic text-violet-400">
              ${Number(state?.combinedTotal || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">
            Ops + Invest
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-900/50 to-slate-900 border-amber-800/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-amber-500">This Month</CardDescription>
            <CardTitle className="text-2xl font-black italic text-amber-400">
              {state?.overheadTracking?.currentMonth || "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">
            Overhead Period
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        {[
          { id: "overview", label: "Overview", icon: <Coins className="h-4 w-4" /> },
          { id: "overhead", label: "Overhead Reconciliation", icon: <Building2 className="h-4 w-4" /> },
          { id: "handshake", label: "Cash Handshake", icon: <Handshake className="h-4 w-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
              activeTab === tab.id
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Post to Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <Input
                  value={entry.amount}
                  onChange={(e) => setEntry(s => ({ ...s, amount: e.target.value }))}
                  className="bg-slate-900 border-slate-800 font-mono md:col-span-1"
                  placeholder="Amount"
                  inputMode="decimal"
                />
                <select
                  value={entry.kind}
                  onChange={(e) => setEntry(s => ({ ...s, kind: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md md:col-span-1"
                >
                  <option value="eod_deposit">EOD Deposit</option>
                  <option value="overhead_payment">Overhead</option>
                  <option value="capital_injection">Injection</option>
                  <option value="adjustment">Adjustment</option>
                </select>
                <select
                  value={entry.shopId}
                  onChange={(e) => setEntry(s => ({ ...s, shopId: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md md:col-span-1"
                >
                  <option value="">Any Shop</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Input
                  value={entry.title}
                  onChange={(e) => setEntry(s => ({ ...s, title: e.target.value }))}
                  className="bg-slate-900 border-slate-800 md:col-span-2"
                  placeholder="Title"
                />
                <Button disabled={busy} onClick={addEntry} className="font-black uppercase md:col-span-1">
                  Post
                </Button>
              </div>
            </CardContent>
          </Card>

          {state?.invest?.byShop && Object.keys(state.invest.byShop).length > 0 && (
            <Card className="bg-sky-950/30 border-sky-800/30">
              <CardHeader>
                <CardTitle className="text-lg font-black uppercase italic text-sky-400 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" /> Invest by Shop
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(state.invest.byShop).map(([shop, data]) => (
                  <div key={shop} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                    <div>
                      <div className="text-sm font-black text-white uppercase">{shop}</div>
                      <div className="text-[10px] text-slate-500">
                        Total: ${Number(data.total).toFixed(2)} • Withdrawn: ${Number(data.withdrawn).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black italic text-sky-400">${Number(data.available).toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500">Available</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Recent Ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[50vh] overflow-y-auto">
              {ledger.length === 0 ? (
                <div className="text-center py-8 text-slate-600 italic">No entries yet</div>
              ) : ledger.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      {r.kind} {r.shop_id ? `• ${r.shop_id}` : ""}
                    </div>
                    <div className="text-sm font-bold text-white">{r.title || r.notes || "—"}</div>
                    <div className="text-[10px] text-slate-500">{r.effective_date}</div>
                  </div>
                  <div className={cn("text-lg font-black font-mono italic", Number(r.amount) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {Number(r.amount) >= 0 ? "+" : ""}{Number(r.amount || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "overhead" && (
        <div className="space-y-4">
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Shop Overhead Reconciliation</CardTitle>
              <CardDescription className="text-[10px]">
                Track each shop's contribution to overhead this month. Overhead amounts from POS expenses auto-populate here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {state?.overheadTracking?.shopTargets?.map(shop => (
                <div key={shop.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleShop(shop.id)} className="text-slate-400 hover:text-white">
                        {expandedShops.has(shop.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <span className="text-sm font-black text-white uppercase">{shop.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-400">
                        ${shop.tracked.toFixed(2)} / ${shop.target.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        shop.progress >= 100 ? "bg-emerald-500" : shop.progress >= 50 ? "bg-sky-500" : "bg-amber-500"
                      )}
                      style={{ width: `${Math.min(100, shop.progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{shop.progress.toFixed(0)}% covered</span>
                    <span>Remaining: ${shop.remaining.toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {(!state?.overheadTracking?.shopTargets || state.overheadTracking.shopTargets.length === 0) && (
                <div className="text-center py-8 text-slate-600 italic">
                  No overhead tracking data. Record expenses with "rent" or "utilities" in description from POS.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "handshake" && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-amber-950/30 to-slate-900 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                <Handshake className="h-5 w-5" /> Cash Handshake System
              </CardTitle>
              <CardDescription className="text-[10px]">
                When cash moves between shops, initiate a handshake for full accountability and traceability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">From Shop (Source)</label>
                  <select
                    value={handshake.fromShop}
                    onChange={(e) => setHandshake(s => ({ ...s, fromShop: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                  >
                    <option value="">Select source shop</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">To Shop (Destination)</label>
                  <select
                    value={handshake.toShop}
                    onChange={(e) => setHandshake(s => ({ ...s, toShop: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
                  >
                    <option value="">Select destination shop</option>
                    {shops.filter(s => s.id !== handshake.fromShop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Amount</label>
                  <Input
                    type="number"
                    value={handshake.amount}
                    onChange={(e) => setHandshake(s => ({ ...s, amount: e.target.value }))}
                    className="bg-slate-900 border-slate-800 font-mono"
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Associate (Courier)</label>
                  <Input
                    value={handshake.associate}
                    onChange={(e) => setHandshake(s => ({ ...s, associate: e.target.value }))}
                    className="bg-slate-900 border-slate-800"
                    placeholder="Name of person carrying cash"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Initiated By</label>
                  <Input
                    value={handshake.initiatedBy}
                    onChange={(e) => setHandshake(s => ({ ...s, initiatedBy: e.target.value }))}
                    className="bg-slate-900 border-slate-800"
                    placeholder="Manager name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Notes</label>
                  <Input
                    value={handshake.notes}
                    onChange={(e) => setHandshake(s => ({ ...s, notes: e.target.value }))}
                    className="bg-slate-900 border-slate-800"
                    placeholder="Purpose/notes"
                  />
                </div>
              </div>
              <Button 
                disabled={busy || !handshake.fromShop || !handshake.toShop || !handshake.amount} 
                onClick={initiateHandshake}
                className="w-full bg-amber-600 hover:bg-amber-500 font-black uppercase"
              >
                <Handshake className="h-4 w-4 mr-2" />
                Initiate Handshake
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
