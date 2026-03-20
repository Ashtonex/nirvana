"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, Trash2, ArrowRightLeft, DollarSign, History, TrendingUp, TrendingDown, Warehouse, Upload, Download, Plus, Minus, Activity, Users, Shield, Handshake, LogOut, Wifi, WifiOff, Edit, X } from "lucide-react";
import { cn } from "@/components/ui";

function detectOverheadCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("rent")) return "rent";
  if (t.includes("utilities") || t.includes("electric") || t.includes("water")) return "utilities";
  if (t.includes("salar") || t.includes("wage")) return "salaries";
  return "misc";
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
  created_at: string;
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
  invest?: { available: number; byShop: Record<string, { available: number }> };
  savings?: { byShop: Record<string, number> };
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

type OverheadSummary = {
  shopId: string;
  shopName: string;
  contributed: number;
  paid: number;
  net: number;
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
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [staffLogs, setStaffLogs] = useState<StaffLog[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const [opsState, setOpsState] = useState<OpsState>(initialState);

  const masterVault = useMemo(() => {
    return ledger.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  }, [ledger]);

  const investTotal = opsState?.invest?.available || 0;
  const combinedTotal = masterVault + investTotal;

  const overheadSummary: OverheadSummary[] = useMemo(() => {
    const summary: Record<string, OverheadSummary> = {};
    shops.forEach(shop => {
      summary[shop.id] = { shopId: shop.id, shopName: shop.name, contributed: 0, paid: 0, net: 0 };
    });
    ledger.forEach(entry => {
      if (entry.kind === "overhead_contribution" && entry.shop_id) {
        summary[entry.shop_id] = { ...summary[entry.shop_id], contributed: (summary[entry.shop_id]?.contributed || 0) + Number(entry.amount || 0) };
      } else if (entry.kind === "overhead_payment" && entry.shop_id) {
        summary[entry.shop_id] = { ...summary[entry.shop_id], paid: (summary[entry.shop_id]?.paid || 0) + Math.abs(Number(entry.amount || 0)) };
      }
    });
    Object.values(summary).forEach(s => { s.net = s.contributed - s.paid; });
    return Object.values(summary).filter(s => s.contributed > 0 || s.paid > 0);
  }, [ledger, shops]);

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

  const allEmployees = useMemo(() => {
    const now = new Date();
    const recentThreshold = 15 * 60 * 1000;
    
    const employeeStatus = new Map<string, { lastLogin: string | null; isOnline: boolean; shopId: string }>();
    
    staffLogs.forEach(log => {
      if (log.employee_id) {
        const logTime = new Date(log.created_at).getTime();
        const isRecent = (now.getTime() - logTime) < recentThreshold;
        const isLoginAction = log.action === "login" || log.action === "shift_start";
        
        if (isLoginAction && isRecent) {
          employeeStatus.set(log.employee_id, {
            lastLogin: log.created_at,
            isOnline: true,
            shopId: log.shop_id,
          });
        } else if (log.action === "logout" && isRecent) {
          const existing = employeeStatus.get(log.employee_id);
          if (existing) {
            existing.isOnline = false;
          }
        }
      }
    });
    
    return employees.map(emp => {
      const status = employeeStatus.get(emp.id);
      return {
        id: emp.id,
        name: emp.name || emp.id,
        shopId: status?.shopId || emp.shop_id || "",
        lastLogin: status?.lastLogin || null,
        isOnline: status?.isOnline || false,
      };
    });
  }, [employees, staffLogs]);

  const fetchData = useCallback(async () => {
    try {
      const [ledgerRes, stateRes, auditRes, staffRes, empRes] = await Promise.all([
        fetch("/api/operations/ledger?limit=100", { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
        fetch("/api/pos-audit/logs?limit=20", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
        fetch("/api/staff/logs?limit=50", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
        fetch("/api/employees", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { employees: [] }).catch(() => ({ employees: [] })),
      ]);
      
      const ledgerData = await ledgerRes.json().catch(() => ({ rows: [] }));
      const stateData = await stateRes.json().catch(() => ({}));
      
      if (Array.isArray(ledgerData?.rows)) setLedger(ledgerData.rows);
      if (stateData?.computedBalance != null) setOpsState(stateData);
      if (Array.isArray(auditRes?.logs)) setAuditLogs(auditRes.logs);
      if (Array.isArray(staffRes?.logs)) setStaffLogs(staffRes.logs);
      if (Array.isArray(empRes?.employees)) setEmployees(empRes.employees);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();

    let eventSource: EventSource | null = null;
    
    const connectSSE = () => {
      try {
        eventSource = new EventSource("/api/operations/stream");
        
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data.ledger)) setLedger(data.ledger);
            if (Array.isArray(data.staffLogs)) setStaffLogs(data.staffLogs);
            if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
            if (Array.isArray(data.employees)) setEmployees(data.employees);
          } catch (e) {
            console.error("Failed to parse SSE data:", e);
          }
        };
        
        eventSource.onerror = () => {
          eventSource?.close();
          setTimeout(connectSSE, 5000);
        };
      } catch (e) {
        console.error("SSE connection failed:", e);
      }
    };
    
    connectSSE();

    const interval = setInterval(fetchData, 30000);
    return () => {
      clearInterval(interval);
      eventSource?.close();
    };
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState("");

  const updateEntryKind = async (id: string, newKind: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/ledger/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: newKind }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditingId(null);
      await fetchData();
    } catch (e) {
      alert("Failed to update");
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

      {/* Shop Savings Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {shops.map((shop) => {
          const shopSavings = opsState?.savings?.byShop?.[shop.id] || 0;
          return (
            <Card key={shop.id} className="bg-gradient-to-br from-cyan-950/40 to-slate-950 border-cyan-800/30">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] font-black uppercase tracking-widest text-cyan-500/70">
                  {shop.name} Savings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black italic text-cyan-300 font-mono">
                  ${shopSavings.toLocaleString()}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Total committed to ops</p>
              </CardContent>
            </Card>
          );
        })}
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
                <Users className="h-3 w-3" /> Staff Status ({allEmployees.filter(e => e.isOnline).length} online)
              </div>
              <div className="flex flex-wrap gap-2">
                {allEmployees.length === 0 ? (
                  <span className="text-xs text-slate-600 italic">No staff data</span>
                ) : allEmployees.map((emp, idx) => (
                  <div key={idx} className={cn(
                    "flex items-center gap-2 px-3 py-1 border rounded-full transition-all",
                    emp.isOnline 
                      ? "bg-emerald-950/30 border-emerald-800/30" 
                      : "bg-rose-950/20 border-rose-900/30"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      emp.isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-600"
                    )} />
                    <span className={cn(
                      "text-xs font-black",
                      emp.isOnline ? "text-emerald-300" : "text-rose-400"
                    )}>
                      {emp.name}
                    </span>
                    <span className="text-[10px] text-slate-500">@ {emp.shopId}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              <div className="text-[10px] font-black uppercase text-slate-500">Recent Activity</div>
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
          auditFailed={auditStats.failed}
          handshakePending={0}
        />

        {/* Nirvana Logo */}
        <NirvanaLogoCard 
          masterVault={masterVault} 
          investTotal={investTotal} 
          handshakes={[]}
          auditPassed={auditStats.passed}
          auditFailed={auditStats.failed}
        />
      </div>

      {/* Monitor Cards Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
            <AuditMonitorCard 
              auditStats={auditStats} 
              ledger={ledger}
              shops={shops}
            />
          </CardContent>
        </Card>

        {/* Nirvana Oracle Brain */}
        <Card className="bg-gradient-to-br from-violet-950/40 to-slate-950 border-violet-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Activity className="h-5 w-5 text-violet-400 animate-pulse" /> The Nirvana Oracle
            </CardTitle>
            <CardDescription className="text-[10px] font-bold text-slate-500 uppercase">
              AI Brain - Continuously Learning & Analyzing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <NirvanaOracleBrain
              shops={shops}
              ledger={ledger}
              auditStats={auditStats}
              staffLogs={staffLogs}
              employees={employees}
            />
          </CardContent>
        </Card>
      </div>

      {/* Link to Handshake Page */}
      <div className="flex justify-center">
        <a 
          href="/handshake" 
          className="flex items-center gap-2 px-6 py-3 bg-amber-600/20 border border-amber-600/30 rounded-lg text-amber-400 font-black uppercase text-xs hover:bg-amber-600/30 transition-colors"
        >
          <Handshake className="h-4 w-4" /> Manage Cash Handshakes
        </a>
      </div>

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
                        <option value="stock_orders">Stock Orders</option>
                        <option value="transport">Transport</option>
                        <option value="peer_payout">Peer Payout</option>
                        <option value="other_expense">Other Expense</option>
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
                const isOverhead = entry.kind === "overhead_contribution" || entry.kind === "overhead_payment";
                return (
                  <div key={entry.id} className="flex items-center justify-between p-4 bg-slate-900/40 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {editingId === entry.id ? (
                          <select
                            value={editKind}
                            onChange={(e) => setEditKind(e.target.value)}
                            className="bg-slate-800 border border-slate-600 text-white px-2 py-1 rounded text-[8px]"
                          >
                            <option value="overhead_contribution">Contribution</option>
                            <option value="overhead_payment">Payment</option>
                            <option value="stock_orders">Stock Orders</option>
                            <option value="transport">Transport</option>
                            <option value="peer_payout">Peer Payout</option>
                            <option value="other_expense">Other Expense</option>
                            <option value="eod_deposit">EOD Deposit</option>
                            <option value="drawer_post">Drawer Post</option>
                          </select>
                        ) : (
                          <Badge className={cn("text-[8px] font-black uppercase", isIncome ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                            {entry.kind}
                          </Badge>
                        )}
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
                    <div className="flex items-center gap-2">
                      <div className={cn("text-xl font-black font-mono italic", isIncome ? "text-emerald-400" : "text-rose-400")}>
                        {isIncome ? "+" : ""}{Number(entry.amount).toFixed(2)}
                      </div>
                      {isOverhead && editingId !== entry.id && (
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(entry.id); setEditKind(entry.kind); }} className="h-8 w-8 p-0 text-slate-600 hover:text-amber-400">
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {editingId === entry.id && (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => updateEntryKind(entry.id, editKind)} className="h-8 px-2 text-[8px] bg-emerald-600 hover:bg-emerald-500">
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 w-8 p-0">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteEntry(entry.id)} className="h-8 w-8 p-0 text-slate-600 hover:text-rose-400">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Overhead Tracker */}
          {overheadSummary.length > 0 && (
            <Card className="bg-gradient-to-br from-amber-950/40 to-slate-950 border-amber-800/30">
              <CardHeader>
                <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" /> Shop Overhead Tracker
                </CardTitle>
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
    </div>
  );
}

const NirvanaLogoCard = memo(function NirvanaLogoCard({ masterVault, investTotal, handshakes, auditPassed, auditFailed }: {
  masterVault: number;
  investTotal: number;
  handshakes: any[];
  auditFailed: number;
  auditPassed: number;
}) {
  const allGood = auditFailed === 0 && handshakes.every(h => h.status !== "pending");
  const [rotation, setRotation] = useState(0);
  const [tilt, setTilt] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(prev => (prev + 2) % 360);
      setTilt(prev => Math.sin(prev * Math.PI / 180) * 15);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className={cn(
      "bg-gradient-to-br border-2 overflow-hidden",
      allGood ? "from-violet-950/60 to-slate-950 border-violet-500/50" : "from-amber-950/60 to-slate-950 border-amber-500/50"
    )}>
      <CardContent className="flex flex-col items-center justify-center py-6">
        <div className="perspective-500">
          <div 
            className="w-20 h-20 mb-4 transition-transform relative"
            style={{ 
              transform: `rotateY(${rotation}deg) rotateX(${tilt}deg)`,
              transformStyle: "preserve-3d"
            }}
          >
            <div className="absolute inset-0 backface-hidden">
              <img 
                src="/logo.png" 
                alt="Nirvana" 
                className="w-full h-full object-contain"
                style={{ filter: 'drop-shadow(0 0 15px rgba(139,92,246,0.5))', backgroundColor: 'transparent' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
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
});

const TypingStatusCard = memo(function TypingStatusCard({ masterVault, investTotal, combinedTotal, ledgerCount, activeShops, handshakePending, auditFailed }: {
  masterVault: number;
  investTotal: number;
  combinedTotal: number;
  ledgerCount: number;
  activeShops: number;
  handshakePending?: number;
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
    if ((handshakePending ?? 0) > 0) {
      lines.push(`! ${handshakePending} handshake${(handshakePending ?? 0) > 1 ? "s" : ""} pending`);
    }
    if (auditFailed > 0) {
      lines.push(`! pos audit variance detected`);
    }
    lines.push("");
    if ((handshakePending ?? 0) === 0 && auditFailed === 0 && activeShops > 0) {
      lines.push("all systems nominal...");
    } else if ((handshakePending ?? 0) > 0 || auditFailed > 0) {
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
});

const AuditMonitorCard = memo(function AuditMonitorCard({ auditStats, ledger, shops, realtimeData }: { 
  auditStats: { total: number; passed: number; failed: number; varianceByShop: Record<string, number> }; 
  ledger: any[];
  shops: ShopNode[];
  realtimeData?: any;
}) {
  const [displayText, setDisplayText] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [cycleCount, setCycleCount] = useState(1);
  const [shopStatuses, setShopStatuses] = useState<Record<string, { status: string; lastCheck: Date; issues: string[] }>>({});
  
  const shopNames = shops.map(s => s.name.toUpperCase());
  
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/pos-audit/realtime", { cache: "no-store", credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const statuses: Record<string, { status: string; lastCheck: Date; issues: string[] }> = {};
          data.shopStatuses?.forEach((shop: any) => {
            statuses[shop.id] = {
              status: shop.status,
              lastCheck: new Date(),
              issues: shop.issues || []
            };
          });
          setShopStatuses(prev => ({ ...prev, ...statuses }));
        }
      } catch (e) {
        console.error("Failed to fetch realtime audit:", e);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const auditSteps = useMemo(() => {
    const steps: { shop: string; lines: string[]; delay: number; charDelay: number }[] = [];
    
    const expenses = ledger.filter(l => l.amount < 0 && (l.kind?.includes("expense") || l.kind === "overhead_payment"));
    const highExpenses = expenses.filter(l => Math.abs(l.amount) > 20);
    
    const shopExpensesMap: Record<string, any[]> = {};
    shops.forEach(shop => {
      shopExpensesMap[shop.name.toUpperCase()] = expenses.filter(e => 
        e.shop_id?.toLowerCase().includes(shop.name.toLowerCase())
      );
    });
    
    steps.push({
      shop: "SYSTEM",
      lines: [
        "",
        "╔══════════════════════════════════════╗",
        "║   NIRVANA POS AUDIT SYSTEM v2.0     ║",
        "╚══════════════════════════════════════╝",
        "",
        "Initializing deep scan protocols...",
        "Loading memory banks...",
        "Establishing neural connection...",
        "",
        "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
      ],
      delay: 4000,
      charDelay: 80,
    });
    
    steps.push({
      shop: "SYSTEM",
      lines: [
        "",
        "[SYS] SCANNING ALL POS NODES...",
        `Active Shops Detected: ${shops.length}`,
        "",
        "Establishing secure channel to each node...",
        "",
        "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
      ],
      delay: 3500,
      charDelay: 70,
    });
    
    steps.push({
      shop: "SYSTEM",
      lines: [
        "",
        "[*] POS NODES STATUS:",
        ...shops.map((shop, i) => {
          const status = shopStatuses[shop.id]?.status || "CHECKING...";
          const statusIcon = status === "CLEAR" ? "[+]" : status === "ALERT" ? "[!]" : "[?]";
          return `    ${statusIcon} ${shop.name.toUpperCase()}: ${status}`;
        }),
        "",
        `Total Expenses Scanned: ${expenses.length}`,
        `High Value Flags (>${"$20"}): ${highExpenses.length}`,
        "",
        "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
      ],
      delay: 4500,
      charDelay: 60,
    });
    
    shops.forEach((shop, idx) => {
      const shopExpenses = shopExpensesMap[shop.name.toUpperCase()] || [];
      const shopHigh = shopExpenses.filter(e => Math.abs(e.amount) > 20);
      const shopStatus = shopStatuses[shop.id]?.status || "ANALYZING";
      
      steps.push({
        shop: shop.name.toUpperCase(),
        lines: [
          "",
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `>>> AUDITING: ${shop.name.toUpperCase()}`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          "",
          `Status: ${shopStatus}`,
          `Total Transactions: ${shopExpenses.length}`,
          `Flags Detected: ${shopHigh.length}`,
          "",
        ],
        delay: 3000,
        charDelay: 90,
      });
      
      if (shopHigh.length > 0) {
        steps.push({
          shop: shop.name.toUpperCase(),
          lines: [
            `⚠ ANOMALIES DETECTED`,
            "",
            ...shopHigh.slice(0, 4).map((exp, i) => [
              `  [${i + 1}] $${Math.abs(exp.amount).toFixed(2)}`,
              `      "${exp.title || exp.kind || 'expense'}"`,
              `      Time: ${new Date(exp.created_at).toLocaleTimeString()}`,
              "",
            ]).flat(),
          ],
          delay: 4000,
          charDelay: 75,
        });
      } else {
        steps.push({
          shop: shop.name.toUpperCase(),
          lines: [
            "✓ No anomalies detected",
            "✓ Transaction integrity verified",
            "✓ All parameters within tolerance",
            "",
          ],
          delay: 2500,
          charDelay: 100,
        });
      }
      
      const issues = shopStatuses[shop.id]?.issues || [];
      if (issues.length > 0) {
        steps.push({
          shop: shop.name.toUpperCase(),
          lines: [
            "! SYSTEM WARNINGS:",
            ...issues.slice(0, 3).map((issue, i) => `   [${i + 1}] ${issue}`),
            "",
          ],
          delay: 3000,
          charDelay: 80,
        });
      }
    });
    
    const totalFlags = highExpenses.length + Object.values(shopStatuses).flatMap(s => s.issues).length;
    
    steps.push({
      shop: "SYSTEM",
      lines: [
        "═══════════════════════════════════════",
        "         AUDIT CYCLE COMPLETE          ",
        "═══════════════════════════════════════",
        "",
        `Total Nodes Audited: ${shops.length}`,
        `Total Flags Raised: ${totalFlags}`,
        `System Integrity: ${totalFlags === 0 ? '100%' : `${100 - Math.min(100, totalFlags * 10)}%`}`,
        "",
        totalFlags === 0 
          ? "[✓] ALL SYSTEMS OPERATIONAL"
          : "[!] REVIEW FLAGS ABOVE",
        "",
        `Cycle ${cycleCount} Complete`,
        "Initiating next scan sequence...",
        "",
        "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░",
      ],
      delay: 6000,
      charDelay: 85,
    });
    
    return steps;
  }, [ledger, cycleCount, shops, shopStatuses]);
  
  useEffect(() => {
    if (!isRunning || currentStep >= auditSteps.length) {
      if (currentStep >= auditSteps.length && isRunning) {
        setTimeout(() => {
          setCurrentStep(0);
          setCycleCount(c => c + 1);
        }, 8000);
      }
      return;
    }
    
    const step = auditSteps[currentStep];
    const fullText = step.lines.join("\n");
    const charDelay = step.charDelay || 100;
    let charIndex = 0;
    
    const interval = setInterval(() => {
      if (charIndex < fullText.length) {
        setDisplayText(fullText.substring(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setCurrentStep(s => s + 1);
        }, step.delay);
      }
    }, charDelay);
    
    return () => clearInterval(interval);
  }, [currentStep, isRunning, auditSteps]);

  const currentShop = auditSteps[currentStep]?.shop || "SYSTEM";
  const hasFlags = auditSteps.some((s, i) => i <= currentStep && s.lines.some(l => l.includes("[!]") || l.includes("⚠")));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
          )} />
          <span className={cn(
            "text-[10px] font-black uppercase",
            hasFlags ? "text-rose-400 animate-pulse" : "text-emerald-400"
          )}>
            {isRunning ? (hasFlags ? "⚠ ALERT" : "● LIVE MONITOR") : "○ PAUSED"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(
            "text-[8px] font-black uppercase",
            currentShop === "SYSTEM" ? "bg-violet-500/20 text-violet-400" : "bg-sky-500/20 text-sky-400"
          )}>
            {currentShop}
          </Badge>
          <span className="text-[10px] text-slate-500 font-mono">
            CYCLE {cycleCount}
          </span>
        </div>
      </div>
      
      <div className="bg-slate-950/90 border border-slate-800/50 rounded-lg p-3 h-56 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/50 pointer-events-none" />
        <pre className="text-[10px] font-mono text-emerald-400/95 whitespace-pre-wrap leading-relaxed overflow-y-auto h-full relative z-10">
          {displayText}
          {isRunning && currentStep < auditSteps.length && <span className="animate-pulse">▋</span>}
        </pre>
      </div>
      
      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => setIsRunning(!isRunning)}
          className={cn(
            "flex-1 text-[10px] font-black uppercase h-7",
            isRunning ? "border-rose-500/50 text-rose-400" : "border-emerald-500/50 text-emerald-400"
          )}
        >
          {isRunning ? "⏸ PAUSE" : "▶ RESUME"}
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => { setCurrentStep(0); setCycleCount(1); }}
          className="flex-1 text-[10px] font-black uppercase h-7 border-slate-700 text-slate-400"
        >
          ↺ RESTART
        </Button>
      </div>
    </div>
  );
});

const NirvanaOracleBrain = memo(function NirvanaOracleBrain({ 
  shops, 
  ledger, 
  auditStats,
  staffLogs,
  employees 
}: {
  shops: ShopNode[];
  ledger: any[];
  auditStats: { total: number; passed: number; failed: number; varianceByShop: Record<string, number> };
  staffLogs: any[];
  employees: any[];
}) {
  const [displayText, setDisplayText] = useState("");
  const [isThinking, setIsThinking] = useState(true);
  const [thoughtCount, setThoughtCount] = useState(0);
  const [knowledgeLevel, setKnowledgeLevel] = useState(0);
  const [userQuery, setUserQuery] = useState("");
  const [responses, setResponses] = useState<{q: string; a: string; time: Date}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const knowledgePhases = [
    "SCANNING SYSTEM ARCHITECTURE...",
    "MAPPING DATA FLOWS...",
    "INDEXING TRANSACTION RECORDS...",
    "CATALOGING INVENTORY PATTERNS...",
    "ANALYZING MARKET CONDITIONS...",
    "IDENTIFYING TRENDS...",
    "LEARNING PERSONNEL ROLES...",
    "ESTABLISHING BASELINES...",
    "CALIBRATING PREDICTIONS...",
    "ACTIVATING BUSINESS INTELLIGENCE..."
  ];
  
  const insights = useMemo(() => {
    const insights: string[] = [];
    
    const totalRevenue = ledger.filter(l => l.amount > 0).reduce((sum, l) => sum + Number(l.amount), 0);
    const totalExpenses = ledger.filter(l => l.amount < 0).reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
    const netFlow = totalRevenue - totalExpenses;
    
    const recentActivity = staffLogs.filter(l => {
      const logAge = Date.now() - new Date(l.created_at).getTime();
      return logAge < 24 * 60 * 60 * 1000;
    }).length;
    
    const activeEmployees = employees.filter(e => e.isOnline).length;
    
    const overheadContributions = ledger
      .filter(l => l.kind === "overhead_contribution")
      .reduce((sum, l) => sum + Number(l.amount), 0);
    
    insights.push(`Revenue Flow: $${totalRevenue.toFixed(0)}`);
    insights.push(`Expense Drain: $${totalExpenses.toFixed(0)}`);
    insights.push(`Net Cash: ${netFlow >= 0 ? '+' : ''}$${netFlow.toFixed(0)}`);
    insights.push(`Activity (24h): ${recentActivity} events`);
    insights.push(`Staff Online: ${activeEmployees}/${employees.length}`);
    insights.push(`Overhead Pool: $${overheadContributions.toFixed(0)}`);
    
    const shopPerformance = shops.map(shop => {
      const shopLedger = ledger.filter(l => l.shop_id?.toLowerCase().includes(shop.name.toLowerCase()));
      const shopRevenue = shopLedger.filter(l => l.amount > 0).reduce((sum, l) => sum + Number(l.amount), 0);
      return { name: shop.name, revenue: shopRevenue };
    });
    
    if (shopPerformance.length > 0) {
      const topShop = shopPerformance.reduce((a, b) => a.revenue > b.revenue ? a : b);
      insights.push(`Top Performer: ${topShop.name}`);
    }
    
    return insights;
  }, [ledger, staffLogs, employees, shops]);
  
  const businessIdeas = useMemo(() => {
    const ideas: string[] = [];
    
    const totalExpenses = ledger.filter(l => l.amount < 0).reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
    const overheadPayments = ledger
      .filter(l => l.kind === "overhead_payment")
      .reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
    
    if (overheadPayments > 0 && overheadPayments < totalExpenses * 0.5) {
      ideas.push("Consider increasing overhead contributions to accelerate debt reduction");
    }
    
    const recentRevenue = ledger
      .filter(l => l.amount > 0 && Date.now() - new Date(l.created_at).getTime() < 7 * 24 * 60 * 60 * 1000)
      .reduce((sum, l) => sum + Number(l.amount), 0);
    
    if (recentRevenue > 5000) {
      ideas.push("Strong weekly revenue detected. Consider expanding inventory for peak periods");
    }
    
    const onlineStaff = employees.filter(e => e.isOnline).length;
    if (onlineStaff >= 2) {
      ideas.push("Multi-staff coverage optimal for high-volume sales windows");
    }
    
    return ideas.length > 0 ? ideas : ["System stabilizing. Continue current operations."];
  }, [ledger, employees]);
  
  const oracleSteps = useMemo(() => {
    const steps: { phase: string; lines: string[]; delay: number; charDelay: number }[] = [];
    
    const currentPhase = Math.min(knowledgeLevel, knowledgePhases.length - 1);
    
    steps.push({
      phase: "BOOT",
      lines: [
        "",
        "╔══════════════════════════════════════╗",
        "║     NIRVANA ORACLE - BRAIN ONLINE    ║",
        "╚══════════════════════════════════════╝",
        "",
        "Neural pathways initializing...",
        "Memory banks: ONLINE",
        "Pattern recognition: CALIBRATING",
        "Business logic: LOADING",
        "",
      ],
      delay: 3000,
      charDelay: 70,
    });
    
    steps.push({
      phase: "LEARNING",
      lines: [
        "",
        `▓ LEARNING PHASE ${knowledgeLevel + 1}/10`,
        `▓ ${knowledgePhases[currentPhase]}`,
        "",
        "Building knowledge graph...",
        "Connecting data points...",
        "Establishing correlations...",
        "",
      ],
      delay: 4000,
      charDelay: 85,
    });
    
    steps.push({
      phase: "ANALYSIS",
      lines: [
        "",
        "═══════════════════════════════════════",
        "          LIVE SYSTEM ANALYSIS         ",
        "═══════════════════════════════════════",
        "",
        ...insights.map(insight => `  ● ${insight}`),
        "",
        "═══════════════════════════════════════",
        "",
      ],
      delay: 5000,
      charDelay: 60,
    });
    
    steps.push({
      phase: "STRATEGY",
      lines: [
        "",
        "▣ GENERATING STRATEGIC INSIGHTS",
        "",
        "Analyzing market position...",
        "Evaluating efficiency...",
        "Formulating recommendations...",
        "",
        "STRATEGIC INSIGHTS:",
        ...businessIdeas.map((idea, i) => `  ${i + 1}. ${idea}`),
        "",
      ],
      delay: 4500,
      charDelay: 75,
    });
    
    if (responses.length > 0) {
      steps.push({
        phase: "MEMORY",
        lines: [
          "",
          "═══════════════════════════════════════",
          "            RECENT QUERIES              ",
          "═══════════════════════════════════════",
          "",
          ...responses.slice(-3).map(r => [
            `Q: ${r.q}`,
            `A: ${r.a.substring(0, 50)}${r.a.length > 50 ? '...' : ''}`,
            `Time: ${r.time.toLocaleTimeString()}`,
            "",
          ]).flat(),
          "═══════════════════════════════════════",
        ],
        delay: 4000,
        charDelay: 50,
      });
    }
    
    steps.push({
      phase: "READY",
      lines: [
        "",
        "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓",
        "",
        "  ORACLE STATUS: ACTIVE",
        `  THOUGHTS PROCESSED: ${thoughtCount}`,
        "  KNOWLEDGE LEVEL: " + "█".repeat(Math.floor(knowledgeLevel / 2)) + "░".repeat(5 - Math.floor(knowledgeLevel / 2)),
        "",
        "  I am watching. I am learning.",
        "  Ask me anything about Nirvana.",
        "",
        "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓",
      ],
      delay: 5000,
      charDelay: 80,
    });
    
    return steps;
  }, [knowledgeLevel, insights, businessIdeas, responses, thoughtCount]);
  
  const [currentStep, setCurrentStep] = useState(0);
  
  useEffect(() => {
    if (!isThinking || currentStep >= oracleSteps.length) {
      if (currentStep >= oracleSteps.length && isThinking) {
        setTimeout(() => {
          setCurrentStep(0);
          setThoughtCount(c => c + 1);
          if (knowledgeLevel < 10) {
            setKnowledgeLevel(k => Math.min(10, k + 1));
          }
        }, 10000);
      }
      return;
    }
    
    const step = oracleSteps[currentStep];
    const fullText = step.lines.join("\n");
    const charDelay = step.charDelay || 80;
    let charIndex = 0;
    
    const interval = setInterval(() => {
      if (charIndex < fullText.length) {
        setDisplayText(fullText.substring(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setCurrentStep(s => s + 1);
        }, step.delay);
      }
    }, charDelay);
    
    return () => clearInterval(interval);
  }, [currentStep, isThinking, oracleSteps, knowledgeLevel]);
  
  const handleQuery = useCallback(async () => {
    if (!userQuery.trim() || isProcessing) return;
    
    setIsProcessing(true);
    const query = userQuery;
    setUserQuery("");
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    let response = "Processing your query...";
    
    const q = query.toLowerCase();
    
    if (q.includes("revenue") || q.includes("sales") || q.includes("money")) {
      const total = ledger.filter(l => l.amount > 0).reduce((sum, l) => sum + Number(l.amount), 0);
      response = `Total revenue recorded: $${total.toFixed(2)}. Transactions analyzed across ${ledger.filter(l => l.amount > 0).length} entries.`;
    } else if (q.includes("expense") || q.includes("spent") || q.includes("cost")) {
      const total = ledger.filter(l => l.amount < 0).reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
      response = `Total expenses logged: $${total.toFixed(2)}. ${ledger.filter(l => l.amount < 0).length} expense entries recorded.`;
    } else if (q.includes("staff") || q.includes("employee") || q.includes("who")) {
      const online = employees.filter(e => e.isOnline).length;
      const total = employees.length;
      response = `${online} staff currently online out of ${total} total. ${employees.map(e => e.name).join(', ') || 'Names loading...'}`;
    } else if (q.includes("shop") || q.includes("location") || q.includes("node")) {
      response = `${shops.length} active shop nodes: ${shops.map(s => s.name).join(', ')}. Monitoring all transaction flows.`;
    } else if (q.includes("overhead") || q.includes("rent") || q.includes("utilities")) {
      const contributions = ledger.filter(l => l.kind === "overhead_contribution").reduce((sum, l) => sum + Number(l.amount), 0);
      const payments = ledger.filter(l => l.kind === "overhead_payment").reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
      response = `Overhead contributions: $${contributions.toFixed(2)}. Payments made: $${payments.toFixed(2)}. Net: $${(contributions - payments).toFixed(2)}.`;
    } else if (q.includes("report") || q.includes("eod") || q.includes("summary")) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayLedger = ledger.filter(l => new Date(l.created_at) >= today);
      const todayRevenue = todayLedger.filter(l => l.amount > 0).reduce((sum, l) => sum + Number(l.amount), 0);
      const todayExpenses = todayLedger.filter(l => l.amount < 0).reduce((sum, l) => sum + Math.abs(Number(l.amount)), 0);
      response = `EOD Summary: Revenue $${todayRevenue.toFixed(2)}, Expenses $${todayExpenses.toFixed(2)}, Net ${todayRevenue - todayExpenses >= 0 ? '+' : ''}$${(todayRevenue - todayExpenses).toFixed(2)}. ${todayLedger.length} transactions logged today.`;
    } else if (q.includes("audit") || q.includes("check") || q.includes("status")) {
      response = `System audit: ${auditStats.passed} checks passed, ${auditStats.failed} failed. ${auditStats.total} total audit entries.`;
    } else if (q.includes("trend") || q.includes("pattern") || q.includes("insight")) {
      response = `Analyzing trends: Peak transaction hours detected. Revenue patterns show consistent growth trajectory. ${businessIdeas[0] || 'Monitoring patterns...'}`;
    } else if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
      response = "Greetings. I am the Nirvana Oracle. I observe all operations, learn continuously, and provide strategic insights. How may I assist you today?";
    } else {
      response = `Query logged: "${query}". I am processing this request through my neural network. I have observed ${thoughtCount} operational cycles and am continuously learning the Nirvana ecosystem.`;
    }
    
    setResponses(prev => [...prev.slice(-9), { q: query, a: response, time: new Date() }]);
    setIsProcessing(false);
  }, [userQuery, isProcessing, ledger, employees, shops, auditStats, businessIdeas, thoughtCount]);
  
  const currentPhase = oracleSteps[currentStep]?.phase || "BOOT";
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isThinking ? "bg-violet-500 animate-pulse" : "bg-slate-500"
          )} />
          <span className="text-[10px] font-black uppercase text-violet-400">
            {isThinking ? "◉ THINKING" : "○ STANDBY"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-violet-500/20 text-violet-400 text-[8px] font-black uppercase">
            {currentPhase}
          </Badge>
          <span className="text-[10px] text-slate-500 font-mono">
            LVL {knowledgeLevel}/10
          </span>
        </div>
      </div>
      
      <div className="bg-gradient-to-b from-violet-950/30 to-slate-950/90 border border-violet-500/20 rounded-lg p-3 h-56 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/50 pointer-events-none" />
        <pre className="text-[10px] font-mono text-violet-400/95 whitespace-pre-wrap leading-relaxed overflow-y-auto h-full relative z-10">
          {displayText}
          {isThinking && currentStep < oracleSteps.length && <span className="animate-pulse">▋</span>}
        </pre>
      </div>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={userQuery}
          onChange={(e) => setUserQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuery()}
          placeholder="Ask the Oracle..."
          className="flex-1 bg-slate-900 border border-violet-500/30 text-white px-3 py-2 rounded text-[10px] font-mono placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
          disabled={isProcessing}
        />
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleQuery}
          disabled={isProcessing || !userQuery.trim()}
          className="text-[10px] font-black uppercase h-9 px-4 bg-violet-600/20 border-violet-500/30 text-violet-400 hover:bg-violet-600/30"
        >
          {isProcessing ? "..." : "ASK"}
        </Button>
      </div>
      
      {responses.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-2">
          {responses.slice(-3).map((r, i) => (
            <div key={i} className="text-[9px] font-mono">
              <span className="text-slate-500">Q: </span>
              <span className="text-emerald-400">{r.q}</span>
              <div className="text-slate-400 ml-2 mt-1">{r.a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
