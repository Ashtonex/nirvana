"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, Loader2, Trash2, ArrowRightLeft, DollarSign, History, TrendingUp, TrendingDown, Warehouse, Upload, Download, Plus, Minus, Activity, Users, Shield, Handshake, LogOut, Wifi, WifiOff, Edit, X, Brain } from "lucide-react";
import { cn } from "@/components/ui";
import { StockvelPanel } from "@/components/StockvelPanel";
import { MoneyAuditBrain } from "@/components/MoneyAuditBrain";

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
  created_at: string;
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
  delta?: number;
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
  const [currentStaffUser, setCurrentStaffUser] = useState<any | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "stockvel" | "moneybrain">("overview");
  const [selectedShop, setSelectedShop] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<"day" | "week" | "month" | "year" | "all">("all");
  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month" | "year">("week");

  const [opsState, setOpsState] = useState<OpsState>(initialState);

  const masterVault = useMemo(() => {
    // Vault-committed POS kinds (these should increase the Vault when posted from POS)
    const vaultKinds = new Set([
      "eod_deposit",
      "savings_contribution",
      "savings_deposit",
      "savings",
      "blackbox",
      "black_box",
      "black-box",
      "capital_injection",
      "loan_injection",
      "overhead_rollover",
      "adjustment", "overhead_contribution", "overhead_deposit", "rent", "salaries", "utilities", "misc",
      // keep drawer_post in case older posts use this label for EOD
      "drawer_post",
    ]);

    return ledger.reduce((sum, entry) => {
      try {
        const amt = Number(entry.amount || 0);
        const k = String(entry.kind || "").toLowerCase();
        
        // Deposits into the vault
        if (amt > 0 && vaultKinds.has(k)) {
          return sum + amt;
        }
        // Expenses from the vault (admin-level deductions only)
        else if (amt < 0 && (!entry.shop_id || entry.shop_id === 'global')) {
          return sum + amt;
        }
        
        // Some older POS flows annotate notes without a canonical kind
        if (amt > 0 && entry.notes && String(entry.notes).includes("Auto-posted from POS Drawer")) {
          return sum + amt;
        }
      } catch (e) {
        // ignore problematic rows
      }
      return sum;
    }, 0);
  }, [ledger]);

  const isPrivileged = useMemo(() => {
    const role = (currentStaffUser?.role || "").toString().toLowerCase();
    return role === "owner" || role === "admin";
  }, [currentStaffUser]);

  const investTotal = opsState?.invest?.available || 0;
  const actualVault = Number(opsState?.actualBalance || 0);
  const computedDelta = actualVault - masterVault;
  const combinedTotal = actualVault + investTotal;

  const overheadSummary: OverheadSummary[] = useMemo(() => {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const summary: Record<string, OverheadSummary> = {};
    shops.forEach(shop => {
      summary[shop.id] = { shopId: shop.id, shopName: shop.name, contributed: 0, paid: 0, net: 0 };
    });
    ledger.forEach(entry => {
      // Only include current month for the overhead tracker "reset"
      const entryMonth = entry.created_at?.substring(0, 7);
      if (entryMonth !== currentMonth) return;

            if (["overhead_contribution", "rent", "salaries", "utilities", "misc"].includes(String(entry.kind || "").toLowerCase()) && entry.shop_id) {

                if (Number(entry.amount || 0) > 0) summary[entry.shop_id].contributed += Number(entry.amount || 0);
        else summary[entry.shop_id].paid += Math.abs(Number(entry.amount || 0));

      } else if (entry.kind === "overhead_payment" && entry.shop_id) {
                summary[entry.shop_id].paid += Math.abs(Number(entry.amount || 0));

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
      const queryParams = new URLSearchParams({
        limit: "500",
        period: selectedPeriod,
      });
      if (selectedShop !== "all") queryParams.append("shopId", selectedShop);

      const [ledgerRes, stateRes, auditRes, staffRes, empRes, staffMeRes] = await Promise.all([
        fetch(`/api/operations/ledger?${queryParams.toString()}`, { cache: "no-store", credentials: "include" }),
        fetch("/api/operations/state", { cache: "no-store", credentials: "include" }),
        fetch("/api/pos-audit/logs?limit=20", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
        fetch("/api/staff/logs?limit=50", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { logs: [] }).catch(() => ({ logs: [] })),
        fetch("/api/employees", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { employees: [] }).catch(() => ({ employees: [] })),
        fetch("/api/staff/me", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : { staff: null }).catch(() => ({ staff: null })),
      ]);

      const ledgerData = await ledgerRes.json().catch(() => ({ rows: [] }));
      const stateData = await stateRes.json().catch(() => ({}));

      if (Array.isArray(ledgerData?.rows)) setLedger(ledgerData.rows);
      if (stateData?.computedBalance != null) setOpsState(stateData);
      if (Array.isArray(auditRes?.logs)) setAuditLogs(auditRes.logs);
      if (Array.isArray(staffRes?.logs)) setStaffLogs(staffRes.logs);
      if (Array.isArray(empRes?.employees)) setEmployees(empRes.employees);
      if (staffMeRes?.staff) setCurrentStaffUser(staffMeRes.staff);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  }, [selectedShop, selectedPeriod]);

  const handleSetActualBalance = async () => {
    try {
      const raw = prompt("Set Actual Vault Balance (numbers only):", String(opsState?.actualBalance || 0));
      if (raw == null) return;
      const val = Number(String(raw).trim());
      if (!Number.isFinite(val)) return alert("Invalid amount");
      const note = prompt("Optional note for override:", "");
      const res = await fetch("/api/operations/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actualBalance: val, note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || j?.message || "Failed to set actual balance");
      }
      await fetchData();
      alert("Actual vault balance updated.");
    } catch (e: any) {
      alert("Failed to set actual balance: " + (e?.message || String(e)));
    }
  };

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
  }, [fetchData, selectedShop, selectedPeriod]);

  const [form, setForm] = useState({
    amount: "",
    type: "income",
    category: "eod_deposit",
    shopId: "",
    title: "",
    date: new Date().toISOString().split('T')[0],
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
      const kind = resolveEntryKind(isExpense, form.category);
      const overheadCategory = resolveOverheadCategory(isExpense, form.category, form.title);
      
      const res = await fetch("/api/operations/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount,
          kind,
          shopId: form.shopId || null,
          overheadCategory,
          title: form.title,
          effectiveDate: form.date,

        }),
      });
      
      if (!res.ok) throw new Error("Failed");
      setForm({ amount: "", type: "income", category: "eod_deposit", shopId: "", title: "", date: new Date().toISOString().split('T')[0] });
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

  const handleGenerateReport = async () => {
    const reportLabels = { day: "today", week: "this week", month: "this month", year: "this year" };
    if (!confirm(`Download PDF operations report for ${reportLabels[reportPeriod]}?`)) return;
    setIsGeneratingReport(true);
    try {
      const res = await fetch("/api/operations/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ period: reportPeriod, format: "pdf" }),
      });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ops-report-${reportPeriod}-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Failed to generate report: " + (e?.message || "Unknown error"));
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "px-4 py-2 text-xs font-black uppercase italic tracking-widest border-b-2 transition-colors",
            activeTab === "overview" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stockvel")}
          className={cn(
            "px-4 py-2 text-xs font-black uppercase italic tracking-widest border-b-2 transition-colors",
            activeTab === "stockvel" ? "border-amber-500 text-amber-300" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          Stockvel
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("moneybrain")}
          className={cn(
            "px-4 py-2 text-xs font-black uppercase italic tracking-widest border-b-2 transition-colors",
            activeTab === "moneybrain" ? "border-violet-500 text-violet-400" : "border-transparent text-slate-500 hover:text-slate-300"
          )}
        >
          <Brain className="h-3 w-3 inline mr-1" />
          Money Brain
        </button>
      </div>

      {activeTab === "stockvel" ? (
        <StockvelPanel ledger={ledger} onRefresh={fetchData} />
      ) : activeTab === "moneybrain" ? (
        <MoneyAuditBrain shops={shops} />
      ) : (
        <>
      {/* Top Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-emerald-950/60 to-slate-950 border-emerald-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-500/70 flex items-center gap-1">
              <Warehouse className="h-3 w-3" /> Actual Vault
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black italic text-emerald-300 font-mono">
              $<AnimatedNumber value={actualVault} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
                Actual vault | pos-posts: ${masterVault.toFixed(2)} | delta: ${computedDelta.toFixed(2)}
            </p>
            {isPrivileged && (
              <div className="mt-3">
                <Button size="sm" onClick={handleSetActualBalance} className="font-black uppercase px-3 bg-emerald-600 hover:bg-emerald-500">
                  Set Actual Balance
                </Button>
              </div>
            )}
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
              $<AnimatedNumber value={investTotal} />
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
              $<AnimatedNumber value={combinedTotal} />
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
                      <div className="text-2xl font-black italic tracking-tighter text-white">
                        $<AnimatedNumber value={shopSavings} />
                      </div>
                <p className="text-[10px] text-slate-500 mt-1">Total committed to ops</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
                      <span className="font-mono text-emerald-400">$<AnimatedNumber value={shop.contributed} /></span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-rose-500 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" /> Paid
                      </span>
                      <span className="font-mono text-rose-400">$<AnimatedNumber value={shop.paid} /></span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-slate-700 pt-2">
                      <span className="text-slate-400">Net</span>
                      <span className={cn("font-mono font-black", shop.net >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {shop.net >= 0 ? "+" : ""}$<AnimatedNumber value={shop.net} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {isPrivileged && (
              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={async () => {
                  if (!confirm('Run month-end rollover: commit leftover shop overhead nets to the vault?')) return;
                  setBusy(true);
                  try {
                    const res = await fetch('/api/operations/rollover', { method: 'POST', credentials: 'include' });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error || 'Rollover failed');
                    await fetchData();
                    alert('Rollover completed. ' + (json?.rolled || 0) + ' shops processed.');
                  } catch (e: any) {
                    alert('Rollover failed: ' + (e?.message || String(e)));
                  } finally {
                    setBusy(false);
                  }
                }} className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase">
                  Run Month-end Rollover
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate Report Button */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <select
          value={reportPeriod}
          onChange={(e) => setReportPeriod(e.target.value as any)}
          className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-black uppercase px-3 py-2 rounded-md"
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <Button
          disabled={isGeneratingReport}
          onClick={handleGenerateReport}
          className="font-black uppercase px-8 bg-amber-600 hover:bg-amber-500 text-white"
        >
          {isGeneratingReport ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download PDF Report
            </>
          )}
        </Button>
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

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500">Date</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 text-white"
                  />
                </div>

                <div className="space-y-1 lg:col-span-1">
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                <History className="h-5 w-5" /> Transactions
              </CardTitle>
              <div className="flex gap-2">
                <select
                  value={selectedShop}
                  onChange={(e) => setSelectedShop(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-black uppercase px-2 py-1 rounded outline-none focus:border-emerald-500/50"
                >
                  <option value="all">All Shops</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-black uppercase px-2 py-1 rounded outline-none focus:border-emerald-500/50"
                >
                  <option value="all">All Time</option>
                  <option value="day">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
              </div>
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

        </>
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
  
  return (
    <Card className={cn(
      "bg-gradient-to-br border-2 overflow-hidden",
      allGood ? "from-violet-950/60 to-slate-950 border-violet-500/50" : "from-amber-950/60 to-slate-950 border-amber-500/50"
    )}>
      <CardContent className="flex flex-col items-center justify-center py-6">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes nirvana-spin {
            from { transform: rotateY(0deg) rotateX(10deg); }
            to { transform: rotateY(360deg) rotateX(10deg); }
          }
          .animate-nirvana-spin {
            animation: nirvana-spin 8s linear infinite;
            transform-style: preserve-3d;
          }
        `}} />
        <div className="perspective-500">
          <div className="w-20 h-20 mb-4 relative animate-nirvana-spin">
            <div className="absolute inset-0 backface-hidden">
              <img 
                src="/logo.png" 
                alt="Nirvana" 
                className="w-full h-full object-contain"
                style={{ filter: 'drop-shadow(0 0 15px rgba(139,92,246,0.6))', backgroundColor: 'transparent' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            {/* Mirror face for 3D effect */}
            <div className="absolute inset-0 backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
              <img 
                src="/logo.png" 
                alt="Nirvana" 
                className="w-full h-full object-contain opacity-50"
                style={{ filter: 'drop-shadow(0 0 15px rgba(139,92,246,0.4))' }}
              />
            </div>
          </div>
        </div>
        <div className="text-center">
          <div className={cn("text-xl font-black italic uppercase tracking-widest", allGood ? "text-violet-300" : "text-amber-300")}>
            {allGood ? "Nirvana" : "Attention"}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono uppercase tracking-tighter">
            {allGood ? "All systems operational" : "Action required"}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-[10px]">
          {allGood ? (
            <Wifi className="h-3 w-3 text-emerald-400 animate-pulse" />
          ) : (
            <WifiOff className="h-3 w-3 text-amber-400 grow-pulse" />
          )}
          <span className={cn("font-bold uppercase", allGood ? "text-emerald-400" : "text-amber-400")}>
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
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [complete, setComplete] = useState(false);

  const lines = useMemo(() => [
    { type: 'text', label: 'initializing nirvana dashboard...' },
    { type: 'text', label: '...' },
    { type: 'value', label: 'vault status: $', value: masterVault },
    { type: 'value', label: 'invest status: $', value: investTotal },
    { type: 'value', label: 'combined: $', value: combinedTotal },
    { type: 'text', label: '' },
    { type: 'text', label: activeShops > 0 ? `${activeShops} shop${activeShops > 1 ? "s" : ""} active` : '' },
    { type: 'text', label: (handshakePending ?? 0) > 0 ? `! ${handshakePending} handshake${(handshakePending ?? 0) > 1 ? "s" : ""} pending` : '' },
    { type: 'text', label: auditFailed > 0 ? `! pos audit variance detected` : '' },
    { type: 'text', label: '' },
    { type: 'text', label: ((handshakePending ?? 0) === 0 && auditFailed === 0 && activeShops > 0) ? "all systems nominal..." : "review pending items." },
    { type: 'text', label: `transactions logged: ${ledgerCount}` },
    { type: 'text', label: 'ready.' },
  ].filter(l => l.label !== ''), [masterVault, investTotal, combinedTotal, ledgerCount, activeShops, handshakePending, auditFailed]);

  useEffect(() => {
    setVisibleLines(0);
    setComplete(false);
    let current = 0;
    const interval = setInterval(() => {
      if (current < lines.length) {
        current++;
        setVisibleLines(current);
      } else {
        setComplete(true);
        clearInterval(interval);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [lines]);

  return (
    <Card className="bg-slate-950/80 border-slate-800/50">
      <CardContent className="py-4">
        <div className="text-xs font-mono text-emerald-400/80 whitespace-pre-wrap leading-relaxed min-h-[180px]">
          {lines.slice(0, visibleLines).map((line, i) => (
            <div key={i} className="flex gap-1 animate-in fade-in slide-in-from-left-1 duration-300">
              <span>{line.label}</span>
              {line.type === 'value' && <AnimatedNumber value={line.value ?? 0} />}
            </div>
          ))}
          {!complete && <span className="animate-pulse">▋</span>}
        </div>
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
  const [auditResult, setAuditResult] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  
  const shopNames = shops.map(s => s.name.toUpperCase());

  const handleRunAudit = async () => {
    setIsAuditing(true);
    setAuditResult(null);
    try {
      const res = await fetch("/api/pos-audit/run", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: shops[0]?.id || "global" })
      });
      if (res.ok) {
        const data = await res.json();
        setAuditResult(data);
        setTimeout(() => setAuditResult(null), 10000);
      }
    } catch (e) {
      console.error("Audit run failed:", e);
    } finally {
      setIsAuditing(false);
    }
  };
  
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
      
      // SURGE DETECTION: Are today's expenses higher than average?
      const totalShopExp = shopExpenses.reduce((s, e) => s + Math.abs(e.amount), 0);
      if (totalShopExp > 200) {
        shopHigh.unshift({ amount: -totalShopExp, title: "TOTAL EXPENSE SURGE", created_at: new Date().toISOString() } as any);
      }
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
          onClick={handleRunAudit}
          disabled={isAuditing}
          className="flex-1 text-[10px] font-black uppercase h-7 border-sky-500/50 text-sky-400 hover:bg-sky-500/10"
        >
          {isAuditing ? "Auditing..." : "▶ RUN AUDIT"}
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => setIsRunning(!isRunning)}
          className={cn(
            "w-20 text-[10px] font-black uppercase h-7",
            isRunning ? "border-rose-500/50 text-rose-400" : "border-emerald-500/50 text-emerald-400"
          )}
        >
          {isRunning ? "⏸" : "▶"}
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => window.location.href = "/pos"}
          className="w-20 text-[10px] font-black uppercase h-7 border-slate-700 text-slate-400"
        >
          GO TO POS
        </Button>
      </div>

      {auditResult && (
        <div className="p-3 bg-slate-900 border border-emerald-500/40 rounded-lg animate-in slide-in-from-bottom duration-500">
          <div className="text-[10px] font-black text-emerald-400 uppercase mb-2">Audit Result: {shops[0]?.name}</div>
          <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
            <div className="text-slate-500">Sales:</div>
            <div className="text-slate-200 text-right">${Number(auditResult.sales || 0).toFixed(2)}</div>
            <div className="text-slate-500">Expenses:</div>
            <div className="text-slate-200 text-right">${Number(auditResult.expenses || 0).toFixed(2)}</div>
            <div className="text-slate-500">Tax:</div>
            <div className="text-slate-200 text-right">${Number(auditResult.tax || 0).toFixed(2)}</div>
            <div className="border-t border-slate-800 col-span-2 my-1" />
            <div className="text-emerald-400 font-bold">Variance:</div>
            <div className={cn("font-bold text-right", auditResult.variance !== 0 ? "text-rose-400" : "text-emerald-400")}>
              ${Number(auditResult.variance || 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}
      
      <div className="flex gap-2">
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
  const [isThinking, setIsThinking] = useState(true);
  const [knowledgeLevel, setKnowledgeLevel] = useState(0);
  const [userQuery, setUserQuery] = useState("");
  const [responses, setResponses] = useState<{q: string; a: string; time: Date}[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [aiResponse, setAiResponse] = useState<any>(null);
  const [teachingMode, setTeachingMode] = useState(false);
  const [activeInquiry, setActiveInquiry] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const [systemHealth, setSystemHealth] = useState<any>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/system/health", { credentials: "include" });
      const data = await res.json();
      setSystemHealth(data);
    } catch (e) {
      console.error("Health fetch failed");
    }
  }, []);

  const knowledgePhases = [
    "SCANNING SYSTEM ARCHITECTURE...",
    "MAPPING DATA FLOWS...",
    "INDEXING TRANSACTION RECORDS...",
    "SCRUTINIZING ECO-CASH MOVEMENTS...",
    "VALIDATING LAY-BY COHESION...",
    "ANALYZING AUDIT LOG ANOMALIES...",
    "IDENTIFYING SYSTEM WEAKNESSES...",
    "CONSULTING PYTHON INTELLIGENCE CORE..."
  ];

  const fetchAI = useCallback(async (params?: { answer?: string, questionId?: string }) => {
    setIsThinking(true);
    try {
      const res = await fetch("/api/oracle/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          shopId: shops[0]?.id || "global",
          ...(params || {})
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiResponse(data);
        if (data.inquiries?.length > 0) {
          setActiveInquiry(data.inquiries[0]);
        } else {
          setActiveInquiry(null);
        }
      }
    } catch (e) {
      console.error("Oracle fetch failed:", e);
    } finally {
      setIsThinking(false);
      setAnswer("");
    }
  }, [shops]);

  useEffect(() => {
    if (knowledgeLevel === 0) setKnowledgeLevel(1);
  }, []);

  useEffect(() => {
    if (knowledgeLevel > 0 && knowledgeLevel < knowledgePhases.length) {
      const timer = setTimeout(() => {
        setKnowledgeLevel(prev => prev + 1);
      }, 600 + Math.random() * 800);
      return () => clearTimeout(timer);
    } else if (knowledgeLevel === knowledgePhases.length) {
      fetchAI();
      fetchHealth();
    }
  }, [knowledgeLevel, fetchAI, fetchHealth]);

  const oracleQuery = async () => {
    if (!userQuery) return;
    setIsProcessing(true);
    setTimeout(() => {
      const response = "Deep scan complete. Structural integrity for " + (shops[0]?.name || "inventory") + " is currently " + (aiResponse?.oracle_mood === 'Optimal' ? "high" : "under scrutiny") + ".";
      setResponses(prev => [...prev, { q: userQuery, a: response, time: new Date() }]);
      setUserQuery("");
      setIsProcessing(false);
    }, 1200);
  };

  const submitAnswer = () => {
    if (!answer || !activeInquiry) return;
    fetchAI({ answer, questionId: activeInquiry.id });
  };

  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-violet-500/20 shadow-xl shadow-violet-500/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex flex-col">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-violet-400" />
            Nirvana Intelligence Oracle
          </CardTitle>
          <CardDescription className="text-[10px] flex items-center gap-2">
             Continuous System Scrutiny & Deep Scan
             {systemHealth && (
               <div className={cn(
                 "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase",
                 systemHealth.status === "HEALTHY" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400 animate-pulse"
               )}>
                 <Shield className="h-2 w-2" />
                 {systemHealth.status}
               </div>
             )}
          </CardDescription>
        </div>
        <div className="flex gap-1">
          {isThinking ? (
            <Badge variant="outline" className="text-[8px] animate-pulse border-violet-500/30 text-violet-400 bg-violet-500/5">
              ANALYZING... {Math.floor((knowledgeLevel / knowledgePhases.length) * 100)}%
            </Badge>
          ) : (
            <Badge variant="outline" className={cn(
              "text-[8px] uppercase font-bold",
              aiResponse?.oracle_mood === "Optimal" ? "border-emerald-500/30 text-emerald-400" : "border-rose-500/30 text-rose-400"
            )}>
              {aiResponse?.oracle_mood || "READY"}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="bg-slate-950/90 border border-violet-500/30 rounded-lg p-4 min-h-[180px] flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
            <Shield className="h-12 w-12 text-violet-400" />
          </div>
          
          {isThinking ? (
            <div className="space-y-4 text-center my-auto">
              <div className="flex justify-center">
                <Loader2 className="h-10 w-10 text-violet-500 animate-spin" />
              </div>
              <div className="text-[10px] font-mono text-violet-400 animate-pulse tracking-widest uppercase">
                {knowledgePhases[knowledgeLevel - 1] || "READY."}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="text-[9px] font-black border-violet-500/50 text-violet-400 bg-violet-500/5 uppercase tracking-tighter">
                  Nirvana Intelligence Oracle v4.0 [DEEP_SCAN]
                </Badge>
                {aiResponse && (
                  <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    CONFIDENCE: {aiResponse.ai_confidence}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Sustainability</div>
                  <div className="text-xl font-black text-violet-300">
                    {aiResponse ? <AnimatedNumber value={aiResponse.sustainability_score} /> : "0.00"}%
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Projected Growth</div>
                  <div className="text-xl font-black text-emerald-400">
                    {aiResponse ? aiResponse.projected_growth : "---"}
                  </div>
                </div>
              </div>

              {/* VULNERABILITIES */}
              {aiResponse?.vulnerabilities?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="h-3 w-3" /> System Weaknesses Detected
                  </div>
                  {aiResponse.vulnerabilities.map((v: any, i: number) => (
                    <div key={i} className="p-2 rounded bg-rose-500/5 border border-rose-500/20 text-[10px] text-rose-300 animate-in slide-in-from-right duration-500">
                       <span className="font-bold uppercase">[{v.type}]</span> {v.message}
                    </div>
                  ))}
                </div>
              )}

              {/* ORACLE INQUIRIES / LEARNING */}
              {activeInquiry && (
                <div className="mt-4 p-3 bg-violet-500/5 border border-violet-500/40 rounded-lg animate-in fade-in zoom-in duration-500">
                  <div className="text-[10px] font-bold text-violet-400 uppercase mb-2 flex items-center gap-2">
                    <Activity className="h-3 w-3 animate-pulse" /> Oracle Clarification Request
                  </div>
                  <div className="text-xs text-slate-200 italic mb-3 leading-relaxed">
                    "{activeInquiry.question}"
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Teach the Oracle..." 
                      className="h-7 text-[10px] bg-slate-900 border-violet-500/30 text-slate-200"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                    />
                    <Button onClick={submitAnswer} size="sm" className="h-7 px-3 bg-violet-600 hover:bg-violet-500 text-[10px] font-bold">
                      TEACH
                    </Button>
                  </div>
                </div>
              )}

              {!activeInquiry && aiResponse?.insights?.length > 0 && (
                <div className="space-y-2">
                  {aiResponse.insights.map((insight: string, i: number) => (
                    <div key={i} className="flex gap-3 text-xs leading-relaxed animate-in slide-in-from-left duration-300" style={{ animationDelay: `${i * 150}ms` }}>
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.6)] shrink-0" />
                      <span className="text-slate-300 font-medium italic">"{insight}"</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input 
              placeholder="Query the Oracle..." 
              className="h-8 text-xs bg-slate-950/50 border-slate-800 text-slate-200 focus-visible:ring-violet-500/50"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && oracleQuery()}
            />
            <Button 
              size="sm" 
              onClick={oracleQuery}
              disabled={isProcessing || !userQuery}
              className="h-8 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs"
            >
              {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchAI()}
              disabled={isThinking}
              className="h-8 border-violet-500/30 text-violet-400 p-2"
              title="Re-scan system"
            >
              ↺
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
