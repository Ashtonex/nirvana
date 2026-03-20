"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, Trash2, ArrowRightLeft, DollarSign, History, TrendingUp, TrendingDown, Warehouse, Upload, Download, Plus, Minus, Activity, Users, Shield, Handshake, LogOut, Wifi, WifiOff } from "lucide-react";
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
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
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
};

type AuditEntry = {
  id: string;
  shop_id: string;
  status: string;
  variance: number;
  created_at: string;
};

type StaffLog = {
  id: string;
  employee_id: string;
  employee_name: string;
  shop_id: string;
  action: string;
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
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
  const [handshakes, setHandshakes] = useState<HandshakeEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [staffLogs, setStaffLogs] = useState<StaffLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "handshake">("overview");

  const [opsState, setOpsState] = useState<OpsState>(initialState);

  const masterVault = useMemo(() => {
    return ledger.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  }, [ledger]);

  const investTotal = opsState?.invest?.available || 0;
  const combinedTotal = masterVault + investTotal;

  const handshakeStats = useMemo(() => {
    const total = handshakes.length;
    const pending = handshakes.filter(h => h.status === "pending").length;
    const completed = handshakes.filter(h => h.status !== "pending").length;
    const totalValue = handshakes.reduce((sum, h) => sum + Number(h.amount || 0), 0);
    return { total, pending, completed, totalValue };
  }, [handshakes]);

  const auditStats = useMemo(() => {
    const total = auditLogs.length;
    const passed = auditLogs.filter(a => a.status === "passed").length;
    const failed = auditLogs.filter(a => a.status === "failed").length;
    const varianceByShop: Record<string, number> = {};
    auditLogs.forEach(a => {
      if (a.status === "failed") {
        varianceByShop[a.shop_id] = (varianceByShop[a.shop_id] || 0) + Math.abs(Number(a.variance || 0));
      }
    });
    return { total, passed, failed, varianceByShop };
  }, [auditLogs]);

  const activeShops = useMemo(() => {
    const shopMap = new Map<string, { lastLogin: string; staff: string }>();
    staffLogs.forEach(log => {
      if (log.action === "login" || log.action === "shift_start") {
        const existing = shopMap.get(log.shop_id);
        if (!existing || new Date(log.created_at) > new Date(existing.lastLogin)) {
          shopMap.set(log.shop_id, { lastLogin: log.created_at, staff: log.employee_name });
        }
      }
    });
    return Array.from(shopMap.entries()).map(([id, data]) => ({
      id,
      name: shops.find(s => s.id === id)?.name || id,
      lastLogin: data.lastLogin,
      staff: data.staff,
    }));
  }, [staffLogs, shops]);

  const fetchData = useCallback(async () => {
    try {
      const [ledgerRes, handshakeRes, stateRes, auditRes, staffRes] = await Promise.all([
        fetch("/api/operations/ledger?limit=100", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/handshakes", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
        fetch("/api/pos-audit/logs?limit=20", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
        fetch("/api/staff/logs?limit=50", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
      ]);
      
      const ledgerData = await ledgerRes.json().catch(() => ({ rows: [] }));
      const handshakeData = await handshakeRes.json().catch(() => ({ handshakes: [] }));
      const stateData = await stateRes.json().catch(() => ({}));
      
      if (Array.isArray(ledgerData?.rows)) setLedger(ledgerData.rows);
      if (Array.isArray(handshakeData?.handshakes)) setHandshakes(handshakeData.handshakes);
      if (stateData?.computedBalance != null) setOpsState(stateData);
      if (Array.isArray(auditRes?.logs)) setAuditLogs(auditRes.logs);
      if (Array.isArray(staffRes?.logs)) setStaffLogs(staffRes.logs);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const [form, setForm] = useState({
    amount: "",
    type: "income",
    category: "eod_deposit",
    shopId: "",
    title: "",
  });

  const isExpense = form.type === "expense";
  const displayAmount = Number(form.amount) || 0;

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
        }),
      });
      
      if (!res.ok) throw new Error("Failed");
      setForm({ amount: "", type: "income", category: "eod_deposit", shopId: "", title: "" });
      await fetchData();
    } catch (e) {
      alert("Failed to add entry");
    } finally {
      setBusy(false);
    }
  };

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

  const [handshakeForm, setHandshakeForm] = useState({
    fromShop: "",
    toShop: "",
    amount: "",
    associate: "",
    initiatedBy: "",
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
      setHandshakeForm({ fromShop: "", toShop: "", amount: "", associate: "", initiatedBy: "" });
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
      {/* Top Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <p className="text-[10px] text-slate-500 mt-1">Perfume deposits total</p>
          </CardContent>
        </Card>

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

      {/* Monitor Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Live Activity Log */}
        <Card className="bg-gradient-to-br from-slate-900/80 to-slate-950 border-slate-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400" /> Live Log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-2">
                <Users className="h-3 w-3" /> Active Shops ({activeShops.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {activeShops.length === 0 ? (
                  <span className="text-xs text-slate-600 italic">No active logins</span>
                ) : activeShops.map(shop => (
                  <div key={shop.id} className="flex items-center gap-2 px-3 py-1 bg-emerald-950/30 border border-emerald-800/30 rounded-full">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs font-black text-emerald-300">{shop.name}</span>
                    <span className="text-[10px] text-slate-500">{shop.staff}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              <div className="text-[10px] font-black uppercase text-slate-500">Recent</div>
              {staffLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-center justify-between text-[10px] py-1 border-b border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <LogOut className="h-3 w-3 text-slate-600" />
                    <span className="text-slate-400">{log.employee_name || log.employee_id}</span>
                    <span className="text-slate-600">@ {log.shop_id}</span>
                  </div>
                  <span className="text-slate-600">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
              {staffLogs.length === 0 && (
                <span className="text-xs text-slate-600 italic">No recent activity</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Typing Status */}
        <TypingStatusCard 
          masterVault={masterVault}
          investTotal={investTotal}
          combinedTotal={combinedTotal}
          ledgerCount={ledger.length}
          activeShops={activeShops.length}
          handshakePending={handshakeStats.pending}
          auditFailed={auditStats.failed}
        />

        {/* Nirvana Logo */}
        <NirvanaLogoCard 
          masterVault={masterVault} 
          investTotal={investTotal} 
          handshakes={handshakes}
          auditPassed={auditStats.passed}
          auditFailed={auditStats.failed}
        />
      </div>

      {/* Monitor Cards Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* POS Audit Monitor */}
        <Card className={cn(
          "bg-gradient-to-br border",
          auditStats.failed > 0 ? "from-rose-950/60 to-slate-950 border-rose-800/40" : "from-slate-900/60 to-slate-950 border-slate-800/40"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Shield className="h-5 w-5 text-sky-400" /> POS Audit Monitor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className={cn("text-3xl font-black italic", auditStats.failed > 0 ? "text-rose-300" : "text-emerald-300")}>
                  {auditStats.failed > 0 ? "!" : "OK"}
                </div>
                <div className="text-[10px] text-slate-500">Status</div>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-500">Passed</span>
                  <span className="text-emerald-400 font-mono">{auditStats.passed}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className={auditStats.failed > 0 ? "text-rose-500" : "text-slate-500"}>Failed</span>
                  <span className={auditStats.failed > 0 ? "text-rose-400 font-mono" : "text-slate-600 font-mono"}>{auditStats.failed}</span>
                </div>
              </div>
            </div>
            {Object.keys(auditStats.varianceByShop).length > 0 && (
              <div className="pt-2 border-t border-slate-800">
                <div className="text-[10px] font-black uppercase text-slate-500 mb-2">Variance by Shop</div>
                {Object.entries(auditStats.varianceByShop).map(([shop, variance]) => (
                  <div key={shop} className="flex justify-between text-xs py-1">
                    <span className="text-rose-400">{shop}</span>
                    <span className="text-rose-300 font-mono">${variance.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {auditStats.total === 0 && (
              <div className="text-xs text-slate-600 italic text-center py-4">No audits run yet</div>
            )}
          </CardContent>
        </Card>

        {/* Handshake Tracker */}
        <Card className="bg-gradient-to-br from-amber-950/60 to-slate-950 border-amber-800/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Handshake className="h-5 w-5 text-amber-400" /> Handshake Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-black italic text-amber-300">{handshakeStats.total}</div>
                <div className="text-[10px] text-slate-500">Created</div>
              </div>
              <div>
                <div className={cn("text-3xl font-black italic", handshakeStats.pending > 0 ? "text-amber-300" : "text-emerald-300")}>
                  {handshakeStats.pending}
                </div>
                <div className="text-[10px] text-slate-500">Pending</div>
              </div>
              <div>
                <div className="text-3xl font-black italic text-emerald-300">{handshakeStats.completed}</div>
                <div className="text-[10px] text-slate-500">Signed</div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800 text-center">
              <div className="text-xs text-slate-500">Total Value</div>
              <div className="text-xl font-black font-mono italic text-amber-300">${handshakeStats.totalValue.toLocaleString()}</div>
            </div>
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
            activeSection === "handshake" ? "border-amber-500 text-amber-400" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          <ArrowRightLeft className="h-4 w-4" /> Handshake
          {handshakeStats.pending > 0 && (
            <Badge className="ml-1 bg-amber-500/20 text-amber-400 text-[8px]">
              {handshakeStats.pending}
            </Badge>
          )}
        </button>
      </div>

      {/* OPERATIONS SECTION */}
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
              <div className="flex gap-2">
                <Button
                  variant={!isExpense ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, type: "income" }))}
                  className={cn("flex-1 font-black uppercase", !isExpense ? "bg-emerald-600 hover:bg-emerald-500" : "")}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Money
                </Button>
                <Button
                  variant={isExpense ? "default" : "outline"}
                  onClick={() => setForm(f => ({ ...f, type: "expense" }))}
                  className={cn("flex-1 font-black uppercase", isExpense ? "bg-rose-600 hover:bg-rose-500" : "")}
                >
                  <Minus className="h-4 w-4 mr-1" /> Pay Expense
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
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

                <div className="space-y-1 lg:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Description</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={isExpense ? "e.g. Monthly rent" : "e.g. Daily sales"}
                  />
                </div>
              </div>

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
                  className={cn("font-black uppercase px-8",
                    isExpense ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (isExpense ? "Record Payment" : "Add Money")}
                </Button>
              </div>
            </CardContent>
          </Card>

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
                        <Badge className={cn("text-[8px] font-black uppercase", isIncome ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
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
                      <div className="text-[10px] text-slate-600">{new Date(entry.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={cn("text-xl font-black font-mono italic", isIncome ? "text-emerald-400" : "text-rose-400")}>
                        {isIncome ? "+" : ""}{Number(entry.amount).toFixed(2)}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteEntry(entry.id)} className="h-8 w-8 p-0 text-slate-600 hover:text-rose-400">
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
          <Card className="bg-gradient-to-br from-amber-950/30 to-slate-950 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" /> Initiate Cash Transfer
              </CardTitle>
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
                  className="bg-slate-900 border border-slate-800"
                  placeholder="Courier / Associate"
                />
                <Input
                  value={handshakeForm.initiatedBy}
                  onChange={(e) => setHandshakeForm(f => ({ ...f, initiatedBy: e.target.value }))}
                  className="bg-slate-900 border border-slate-800"
                  placeholder="Initiated By"
                />
                <Button disabled={busy} onClick={initiateHandshake} className="bg-amber-600 hover:bg-amber-500 font-black uppercase">
                  Initiate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-950/20 border-amber-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-amber-400">
                Pending Acknowledgments ({handshakeStats.pending})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {handshakeStats.pending === 0 ? (
                <div className="text-center py-8 text-slate-600 italic text-xs">No pending handshakes</div>
              ) : handshakes.filter(h => h.status === "pending").map(h => (
                <div key={h.id} className="flex items-center justify-between p-4 bg-slate-900/40 rounded-lg border border-amber-800/30">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                      {h.from_shop} <ArrowRightLeft className="h-3 w-3" /> {h.to_shop}
                    </div>
                    <div className="text-sm font-bold text-white">{h.associate || "Unnamed"}</div>
                    <div className="text-[10px] text-slate-500">By {h.initiated_by}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xl font-black font-mono italic text-amber-400">${h.amount.toFixed(2)}</div>
                    <Button size="sm" onClick={() => acknowledgeHandshake(h.id)} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
                      Acknowledge
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Handshake History ({handshakeStats.completed})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[40vh] overflow-y-auto">
              {handshakeStats.completed === 0 ? (
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

function NirvanaLogoCard({ masterVault, investTotal, handshakes, auditPassed, auditFailed }: {
  masterVault: number;
  investTotal: number;
  handshakes: any[];
  auditFailed: number;
  auditPassed: number;
}) {
  const allGood = auditFailed === 0 && handshakes.every(h => h.status !== "pending");
  const [rotation, setRotation] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(prev => (prev + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className={cn(
      "bg-gradient-to-br border-2",
      allGood ? "from-violet-950/60 to-slate-950 border-violet-500/50" : "from-amber-950/60 to-slate-950 border-amber-500/50"
    )}>
      <CardContent className="flex flex-col items-center justify-center py-6">
        <div 
          className="w-20 h-20 mb-4 flex items-center justify-center transition-all duration-1000"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-violet-500/30">
            <span className="text-3xl font-black italic text-white tracking-tighter">N</span>
          </div>
        </div>
        <div className="text-center">
          <div className={cn("text-xl font-black italic uppercase", allGood ? "text-violet-300" : "text-amber-300")}>
            {allGood ? "Nirvana" : "Attention"}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {allGood ? "All systems operational" : "Action required"}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px]">
          {allGood ? (
            <Wifi className="h-3 w-3 text-emerald-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-amber-400" />
          )}
          <span className={allGood ? "text-emerald-400" : "text-amber-400"}>
            {allGood ? "Connected" : "Issues"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TypingStatusCard({ masterVault, investTotal, combinedTotal, ledgerCount, activeShops, handshakePending, auditFailed }: {
  masterVault: number;
  investTotal: number;
  combinedTotal: number;
  ledgerCount: number;
  activeShops: number;
  handshakePending: number;
  auditFailed: number;
}) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const charIndex = useRef(0);

  const fullText = useMemo(() => {
    const lines: string[] = [];
    lines.push("initializing nirvana dashboard...");
    lines.push(".");
    lines.push(".");
    lines.push(".");
    lines.push("");
    lines.push(`vault status: $${masterVault.toLocaleString()}`);
    lines.push(`invest status: $${investTotal.toLocaleString()}`);
    lines.push(`combined: $${combinedTotal.toLocaleString()}`);
    lines.push("");
    if (activeShops > 0) {
      lines.push(`${activeShops} shop${activeShops > 1 ? "s" : ""} active`);
    }
    if (handshakePending > 0) {
      lines.push(`! ${handshakePending} handshake${handshakePending > 1 ? "s" : ""} pending`);
    }
    if (auditFailed > 0) {
      lines.push(`! pos audit variance detected`);
    }
    lines.push("");
    if (handshakePending === 0 && auditFailed === 0 && activeShops > 0) {
      lines.push("all systems nominal...");
    } else if (handshakePending > 0 || auditFailed > 0) {
      lines.push("review pending items.");
    } else {
      lines.push("no active operations.");
    }
    lines.push("");
    lines.push(`transactions logged: ${ledgerCount}`);
    lines.push("");
    lines.push("ready.");
    return lines.join("\n");
  }, [masterVault, investTotal, combinedTotal, ledgerCount, activeShops, handshakePending, auditFailed]);

  useEffect(() => {
    charIndex.current = 0;
    setDisplayText("");
    setIsTyping(true);

    const interval = setInterval(() => {
      if (charIndex.current < fullText.length) {
        setDisplayText(fullText.substring(0, charIndex.current + 1));
        charIndex.current++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [fullText]);

  return (
    <Card className="bg-slate-950/80 border-slate-800/50">
      <CardContent className="py-4">
        <pre className="text-xs font-mono text-emerald-400/80 whitespace-pre-wrap leading-relaxed">
          {displayText}
          {isTyping && <span className="animate-pulse">▋</span>}
        </pre>
      </CardContent>
    </Card>
  );
}

function detectOverheadCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("rent")) return "rent";
  if (t.includes("utilities") || t.includes("electric") || t.includes("water")) return "utilities";
  if (t.includes("salar") || t.includes("wage")) return "salaries";
  return "misc";
}
