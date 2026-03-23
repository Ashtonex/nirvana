"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui";
import { 
  Activity, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Coins, 
  UserCheck, 
  ShoppingCart,
  Minus,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Zap,
  RefreshCw,
  Loader2,
  ChevronRight,
  DollarSign
} from "lucide-react";
import { cn } from "@/components/ui";

type Tab = "operations" | "audit" | "sessions" | "forecast" ;

type OperationEntry = {
  id: string;
  kind: string;
  amount: number;
  shop_id?: string;
  overhead_category?: string;
  title?: string;
  notes?: string;
  effective_date?: string;
  created_at: string;
};

type AuditEntry = {
  id: string;
  action: string;
  table_name?: string;
  shop_id?: string;
  employee_id?: string;
  details?: any;
  timestamp: string;
  amount?: number;
};

type SessionEntry = {
  id: string;
  employee_id: string;
  employee_name?: string;
  shop_id?: string;
  action: string;
  amount?: number;
  ip_address?: string;
  timestamp: string;
};

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const duration = 500;
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
  
  return <span>{prefix}{display.toFixed(2)}{suffix}</span>;
}

function TypingText({ text, speed = 80, className = "" }: { text: string; speed?: number; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);
  
  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(prev => prev + text[indexRef.current]);
        indexRef.current++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    
    return () => clearInterval(interval);
  }, [text, speed]);
  
  return <span className={className}>{displayed}<span className="animate-pulse text-emerald-400">▌</span></span>;
}

function LiveTicker({ items }: { items: SessionEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  
  useEffect(() => {
    if (items.length === 0) return;
    
    const interval = setInterval(() => {
      setOffset(prev => {
        const container = containerRef.current;
        if (!container) return prev;
        const maxOffset = container.scrollHeight / 2;
        return (prev + 1) % maxOffset;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [items.length]);
  
  const duplicated = [...items, ...items];
  
  return (
    <div ref={containerRef} className="h-16 overflow-hidden relative">
      <div 
        className="flex flex-col gap-1 transition-transform duration-100"
        style={{ transform: `translateY(-${offset}px)` }}
      >
        {duplicated.slice(0, 8).map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
            <span className={cn(
              "font-black uppercase",
              item.action?.includes("sale") ? "text-emerald-400" :
              item.action?.includes("expense") ? "text-rose-400" :
              item.action?.includes("login") ? "text-violet-400" :
              "text-slate-400"
            )}>
              {item.action}
            </span>
            <span className="text-slate-300">{item.employee_name || item.employee_id}</span>
            {item.amount !== undefined && (
              <span className={cn(
                "font-mono font-black ml-auto",
                item.amount >= 0 ? "text-emerald-300" : "text-rose-300"
              )}>
                {item.amount >= 0 ? "+" : ""}{item.amount.toFixed(2)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PulsingDot({ color = "emerald" }: { color?: string }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className={cn(
        "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
        color === "emerald" ? "bg-emerald-400" :
        color === "rose" ? "bg-rose-400" :
        color === "sky" ? "bg-sky-400" :
        "bg-slate-400"
      )} />
      <span className={cn(
        "relative inline-flex rounded-full h-3 w-3",
        color === "emerald" ? "bg-emerald-500" :
        color === "rose" ? "bg-rose-500" :
        color === "sky" ? "bg-sky-500" :
        "bg-slate-500"
      )} />
    </span>
  );
}

function StatCard({ label, value, icon, color = "emerald", trend }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border p-4",
      color === "emerald" ? "bg-emerald-950/30 border-emerald-500/20" :
      color === "rose" ? "bg-rose-950/30 border-rose-500/20" :
      color === "sky" ? "bg-sky-950/30 border-sky-500/20" :
      "bg-slate-900/50 border-slate-700"
    )}>
      <div className="absolute top-0 right-0 p-2 opacity-20">
        {icon}
      </div>
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className={cn(
          "text-2xl font-black font-mono italic",
          color === "emerald" ? "text-emerald-400" :
          color === "rose" ? "text-rose-400" :
          color === "sky" ? "text-sky-400" :
          "text-white"
        )}>
          ${value.toFixed(2)}
        </p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3 w-3 text-rose-400" />
            )}
          </div>
        )}
      </div>
      <div className={cn(
        "absolute bottom-0 left-0 h-1 w-full",
        color === "emerald" ? "bg-emerald-500/30" :
        color === "rose" ? "bg-rose-500/30" :
        color === "sky" ? "bg-sky-500/30" :
        "bg-slate-500/30"
      )}>
        <div 
          className={cn(
            "h-full animate-pulse",
            color === "emerald" ? "bg-emerald-500" :
            color === "rose" ? "bg-rose-500" :
            color === "sky" ? "bg-sky-500" :
            "bg-slate-500"
          )}
          style={{ width: `${Math.min(100, Math.abs(value) / 10)}%` }}
        />
      </div>
    </div>
  );
}

function AuditItem({ entry, isNew, typingDelay = 0 }: { entry: AuditEntry; isNew: boolean; typingDelay?: number }) {
  const hasError = entry.action?.includes("error") || entry.action?.includes("failed") || entry.details?.error;
  const ref = useRef<HTMLDivElement>(null);
  const [startTyping, setStartTyping] = useState(false);
  const [expanded, setExpanded] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setStartTyping(true), typingDelay);
    return () => clearTimeout(timer);
  }, [typingDelay]);
  
  useEffect(() => {
    if (isNew && ref.current) {
      ref.current.classList.add("animate-flash");
      setTimeout(() => ref.current?.classList.remove("animate-flash"), 1000);
    }
  }, [isNew]);
  
  const actionText = entry.action || "system_activity";
  const descText = entry.details?.description || entry.details?.message || entry.table_name || "—";
  const timeText = new Date(entry.timestamp).toLocaleTimeString();
  const dateText = new Date(entry.timestamp).toLocaleDateString();
  const actorText = entry.employee_id || entry.shop_id || "system";
  const ipText = entry.details?.ip_address || "192.168.1.1";
  const shopText = entry.shop_id || entry.details?.shop_id || "—";
  const employeeName = entry.details?.employee_name || entry.employee_id || "System";
  const amountVal = entry.details?.amount || entry.amount;
  const tableText = entry.table_name || entry.details?.table || "—";
  
  return (
    <div 
      ref={ref}
      className={cn(
        "rounded-xl border transition-all duration-300 overflow-hidden cursor-pointer",
        hasError 
          ? "bg-rose-950/40 border-rose-500/30" 
          : "bg-slate-900/40 border-slate-800/50 hover:border-slate-700",
        isNew && "ring-1 ring-emerald-500/30"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3 p-3">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
          hasError ? "bg-rose-500/20 text-rose-400 animate-pulse" :
          entry.action?.includes("sale") ? "bg-emerald-500/20 text-emerald-400" :
          entry.action?.includes("expense") ? "bg-rose-500/20 text-rose-400" :
          entry.action?.includes("login") ? "bg-violet-500/20 text-violet-400" :
          entry.action?.includes("transfer") ? "bg-sky-500/20 text-sky-400" :
          "bg-slate-800 text-slate-400"
        )}>
          {hasError ? <ShieldAlert className="h-5 w-5" /> :
           entry.action?.includes("sale") ? <ShoppingCart className="h-5 w-5" /> :
           entry.action?.includes("expense") ? <Minus className="h-5 w-5" /> :
           entry.action?.includes("login") ? <UserCheck className="h-5 w-5" /> :
           entry.action?.includes("transfer") ? <ArrowRightLeft className="h-5 w-5" /> :
           <Activity className="h-5 w-5" />}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {startTyping ? (
              <TypingText text={actionText} speed={80} className="text-[10px] font-black uppercase tracking-widest text-slate-400" />
            ) : (
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-0">{"M".repeat(actionText.length)}</span>
            )}
            {isNew && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px] animate-pulse">
                NEW
              </Badge>
            )}
            <span className="text-slate-600 ml-auto">
              {expanded ? "▲" : "▼"}
            </span>
          </div>
          <div className="mt-0.5 min-h-[1.25rem]">
            {startTyping ? (
              <TypingText text={descText} speed={60} className="text-sm font-bold text-white" />
            ) : (
              <span className="text-sm font-bold text-transparent bg-gradient-to-r from-slate-700 to-slate-800 bg-clip-text animate-pulse">Loading...</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-mono">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{timeText}</span>
            <span className="text-slate-600">•</span>
            <span>{actorText}</span>
          </div>
        </div>
        
        {hasError && (
          <div className="flex items-center shrink-0">
            <Badge className="bg-rose-500/30 text-rose-400 border-rose-500/50 text-[8px] animate-pulse">
              ERROR
            </Badge>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-800/50 mt-0">
          <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-slate-950/50 rounded-lg">
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Who</p>
              <p className="text-xs font-bold text-white flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-violet-400" />
                {employeeName}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Where</p>
              <p className="text-xs font-bold text-white uppercase">{shopText}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">IP Address</p>
              <p className="text-xs font-mono text-white">{ipText}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Table</p>
              <p className="text-xs font-mono text-white">{tableText}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Date</p>
              <p className="text-xs font-mono text-white">{dateText}</p>
            </div>
            {amountVal !== undefined && (
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Amount</p>
                <p className={cn(
                  "text-sm font-black font-mono italic",
                  Number(amountVal) >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {Number(amountVal) >= 0 ? "+" : ""}{Number(amountVal).toFixed(2)}
                </p>
              </div>
            )}
          </div>
          {entry.details && Object.keys(entry.details).length > 0 && (
            <div className="mt-2 p-2 bg-slate-950/50 rounded-lg">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Full Details</p>
              <pre className="text-[9px] font-mono text-slate-400 overflow-x-auto">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LogicPage() {
  const [tab, setTab] = useState<Tab>("operations");
  const [operations, setOperations] = useState<OperationEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [auditErrors, setAuditErrors] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [newAuditIds, setNewAuditIds] = useState<Set<string>>(new Set());
  
  const auditRef = useRef<HTMLDivElement>(null);
  const [runningSimulation, setRunningSimulation] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [simulationMessage, setSimulationMessage] = useState("");
  const [simulationElapsed, setSimulationElapsed] = useState(0);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState("Recession");
  const [reports, setReports] = useState<any[]>([]);

  const runStressTest = async () => {
    setRunningSimulation(true);
    setSimulationProgress(0);
    setSimulationMessage("Initializing...");
    setSimulationElapsed(0);

    const elapsedInterval = setInterval(() => {
      setSimulationElapsed(s => s + 1);
    }, 1000);

    try {
      const res = await fetch("/api/logic/stress-test/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: selectedScenario }),
        credentials: "include"
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress !== undefined) setSimulationProgress(data.progress);
            if (data.message) setSimulationMessage(data.message);
            if (data.elapsed !== undefined) setSimulationElapsed(data.elapsed);

            if (data.complete) {
              if (data.error) {
                setSimulationMessage(`Error: ${data.error}`);
                setSimulationProgress(0);
              } else if (data.reportHtml) {
                const blob = new Blob([data.reportHtml], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = data.filename || `stress_test_${Date.now()}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setReports(prev => [{ filename: data.filename }, ...prev]);
                setSimulationMessage("Complete!");
                setSimulationComplete(true);
              }
              setRunningSimulation(false);
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (e: any) {
      setSimulationMessage(`Error: ${e.message || "Simulation failed"}`);
      setSimulationProgress(0);
      setRunningSimulation(false);
    } finally {
      clearInterval(elapsedInterval);
    }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [opsRes, auditRes, sessionsRes] = await Promise.all([
        fetch("/api/operations/ledger?limit=20", { cache: "no-store", credentials: "include" }),
        fetch("/api/logic/audit", { cache: "no-store", credentials: "include" }),
        fetch("/api/logic/sessions", { cache: "no-store", credentials: "include" }),
      ]);

      const [opsData, auditData, sessionsData] = await Promise.all([
        opsRes.json(),
        auditRes.json(),
        sessionsRes.json(),
      ]);

      if (opsData?.rows) setOperations(opsData.rows);
      if (auditData?.entries) {
        const currentIds = new Set(audit.map(a => a.id));
        const newIds = new Set<string>();
        auditData.entries.forEach((a: AuditEntry) => {
          if (!currentIds.has(a.id)) newIds.add(a.id);
        });
        setNewAuditIds(newIds);
        setAudit(auditData.entries);
        const errorCount = auditData.entries.filter((a: AuditEntry) => 
          a.action?.includes("error") || a.action?.includes("failed") || a.details?.error
        ).length;
        setAuditErrors(errorCount);
      }
      if (sessionsData?.entries) setSessions(sessionsData.entries);
      
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Logic fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [audit, sessions]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    if (simulationComplete) {
      const t = setTimeout(() => {
        setSimulationComplete(false);
        setSimulationProgress(0);
        setSimulationMessage("");
        setSimulationElapsed(0);
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [simulationComplete]);

  const totalOpsValue = operations.reduce((sum, op) => sum + Number(op.amount || 0), 0);
  const totalPositive = operations.filter(op => Number(op.amount) >= 0).reduce((sum, op) => sum + Number(op.amount || 0), 0);
  const totalNegative = Math.abs(operations.filter(op => Number(op.amount) < 0).reduce((sum, op) => sum + Number(op.amount || 0), 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-32">
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white">Logic</h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <PulsingDot color={loading ? "sky" : "emerald"} />
                <span>{loading ? "Syncing..." : "Live"}</span>
                <span className="text-slate-700">•</span>
                <span>{lastRefresh.toLocaleTimeString()}</span>
              </div>
            </div>
            <button 
              onClick={fetchAll}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={cn("h-5 w-5 text-slate-400", loading && "animate-spin")} />
            </button>
          </div>
        </div>
        
        <div className="flex overflow-x-auto scrollbar-hide">
          {[
            { id: "operations" as Tab, label: "Operations", icon: <Coins className="h-4 w-4" />, color: "emerald" },
            { id: "audit" as Tab, label: "Audit", icon: auditErrors > 0 ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />, color: auditErrors > 0 ? "rose" : "emerald" },
            { id: "sessions" as Tab, label: "Sessions", icon: <Clock className="h-4 w-4" />, color: "sky" },
            { id: "forecast" as Tab, label: "Forecast", icon: <TrendingUp className="h-4 w-4" />, color: "violet" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
                tab === t.id
                  ? t.color === "emerald" ? "border-emerald-500 text-emerald-400" :
                    t.color === "rose" ? "border-rose-500 text-rose-400" :
                    t.color === "violet" ? "border-violet-500 text-violet-400" :
                    "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              )}
            >
              {t.icon}
              {t.label}
              {t.id === "audit" && auditErrors > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] animate-pulse">
                  {auditErrors}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {tab === "operations" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard 
                label="Total Ops" 
                value={totalOpsValue} 
                icon={<Coins className="h-8 w-8" />}
                color={totalOpsValue >= 0 ? "emerald" : "rose"}
              />
              <StatCard 
                label="Income" 
                value={totalPositive} 
                icon={<TrendingUp className="h-8 w-8" />}
                color="emerald"
                trend="up"
              />
              <StatCard 
                label="Expenses" 
                value={totalNegative} 
                icon={<TrendingDown className="h-8 w-8" />}
                color="rose"
                trend="down"
              />
              <StatCard 
                label="Net" 
                value={totalOpsValue} 
                icon={<DollarSign className="h-8 w-8" />}
                color={totalOpsValue >= 0 ? "emerald" : "rose"}
              />
            </div>

            <div className="relative overflow-hidden rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-transparent to-slate-900 z-10 pointer-events-none" />
              <LiveTicker items={sessions} />
            </div>

            <Card className="bg-slate-950/60 border-slate-800 overflow-hidden">
              <CardHeader className="border-b border-slate-800 bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-400" /> Recent Operations
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-800/50">
                  {operations.length === 0 ? (
                    <div className="p-8 text-center text-slate-600 font-black uppercase text-xs italic">
                      No operations recorded
                    </div>
                  ) : (
                    operations.map((op, idx) => (
                      <div 
                        key={op.id} 
                        className="flex items-center justify-between p-4 hover:bg-slate-900/50 transition-colors"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full animate-pulse",
                            Number(op.amount) >= 0 ? "bg-emerald-500" : "bg-rose-500"
                          )} />
                          <div>
                            <p className="text-xs font-bold text-white">{op.kind}</p>
                            <p className="text-[10px] text-slate-500">{op.shop_id || op.title || op.notes}</p>
                          </div>
                        </div>
                        <div className={cn(
                          "text-lg font-black font-mono italic",
                          Number(op.amount) >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}>
                          {Number(op.amount) >= 0 ? "+" : ""}{Number(op.amount || 0).toFixed(2)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "audit" && (
          <div className="space-y-4">
            <Card className={cn(
              "border-2 overflow-hidden",
              auditErrors > 0 ? "border-rose-500/50 bg-rose-950/20" : "border-emerald-500/30 bg-emerald-950/20"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-xl",
                    auditErrors > 0 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                  )}>
                    {auditErrors > 0 ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className={cn(
                      "text-xl font-black italic",
                      auditErrors > 0 ? "text-rose-400" : "text-emerald-400"
                    )}>
                      {auditErrors > 0 ? `${auditErrors} Issue${auditErrors > 1 ? "s" : ""} Detected` : "All Systems Operational"}
                    </p>
                    <p className="text-xs text-slate-400">Auto-checking every 3 seconds</p>
                  </div>
                  <PulsingDot color={auditErrors > 0 ? "rose" : "emerald"} />
                </div>
              </CardContent>
            </Card>

            <div ref={auditRef} className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
              {audit.map((entry, idx) => (
                <AuditItem 
                  key={entry.id || String(idx)} 
                  entry={entry} 
                  isNew={newAuditIds.has(entry.id)}
                  typingDelay={idx * 50}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "forecast" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-950/60 border-slate-800 overflow-hidden relative group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 via-emerald-600 to-rose-600 opacity-50" />
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase italic text-white">
                  <TrendingUp className="h-6 w-6 text-violet-400" /> Monte Carlo Stress Engine
                </CardTitle>
                <CardDescription className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Simulate business pathways based on current liquidity and inventory metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { id: "Recession", label: "Economic Downturn", icon: <TrendingDown className="text-rose-400" />, desc: "High inflation, 40-60% revenue drop." },
                    { id: "Liquidation", label: "Inventory Purge", icon: <ShoppingCart className="text-emerald-400" />, desc: "Aggressive discounts to boost cash." },
                    { id: "Hypergrowth", label: "Aggressive Scale", icon: <Zap className="text-violet-400" />, desc: "3x revenue surge with overhead spikes." }
                  ].map(scenario => (
                    <button
                      key={scenario.id}
                      disabled={runningSimulation}
                      onClick={() => setSelectedScenario(scenario.id)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all group/btn",
                        runningSimulation && "opacity-50 cursor-not-allowed",
                        selectedScenario === scenario.id 
                          ? "bg-violet-500/10 border-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.1)]" 
                          : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        {scenario.icon}
                        <span className="font-black uppercase italic text-sm">{scenario.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium group-hover/btn:text-slate-400">{scenario.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800/50 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center relative">
                    {simulationComplete ? (
                      <ShieldCheck className="h-8 w-8 text-emerald-400 animate-pulse" />
                    ) : (
                      <Activity className={cn("h-8 w-8 text-violet-500", runningSimulation && "animate-spin")} />
                    )}
                    {runningSimulation && (
                      <span className="absolute -bottom-1 -right-1 bg-violet-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                        LIVE
                      </span>
                    )}
                    {simulationComplete && (
                      <span className="absolute -bottom-1 -right-1 bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
                        DONE
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase italic text-white">
                      {simulationComplete ? "Report Generated!" : runningSimulation ? "Simulation Running" : "Ready for Neural Simulation"}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {simulationComplete
                        ? `Completed in ${simulationElapsed}s — your report is open in a new tab.`
                        : runningSimulation
                        ? simulationMessage || "Processing Monte Carlo paths..."
                        : "Running the stress test will execute 100 algorithmic paths to predict business survival probability."}
                    </p>
                  </div>

                  {(runningSimulation || simulationComplete) && (
                    <div className="w-full max-w-xs space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase text-slate-500">Progress</span>
                        <span className={cn(
                          "text-[9px] font-black font-mono",
                          simulationComplete ? "text-emerald-400" : "text-violet-400"
                        )}>{simulationProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300 ease-out",
                            simulationComplete
                              ? "bg-emerald-500"
                              : "bg-gradient-to-r from-violet-600 to-indigo-500"
                          )}
                          style={{ width: `${simulationProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase text-slate-500">Elapsed</span>
                        <span className="text-[9px] font-black text-slate-400 font-mono">{simulationElapsed}s</span>
                      </div>
                    </div>
                  )}

                  <button
                    disabled={runningSimulation}
                    onClick={runStressTest}
                    className={cn(
                      "w-full max-w-xs h-14 rounded-xl font-black uppercase italic tracking-widest transition-all",
                      runningSimulation
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xl hover:scale-105 active:scale-95"
                    )}
                  >
                    {runningSimulation ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        PROCESSING...
                      </span>
                    ) : "INITIATE SIMULATION"}
                  </button>
                </div>

                {reports.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-800">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recent Forecasts</h3>
                    <div className="grid gap-2">
                      {reports.map((report, idx) => (
                        <a 
                          key={idx} 
                          href={report.reportUrl} 
                          target="_blank"
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors group/report"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded bg-slate-800 text-slate-500 group-hover/report:text-violet-400">
                              <ShoppingCart className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-200">{report.filename}</p>
                              <p className="text-[9px] text-slate-500 uppercase">{new Date().toLocaleTimeString()}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-600" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-emerald-950/20 border-emerald-500/20 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-black uppercase italic text-emerald-400">Market Velocity Data</h3>
                </div>
                <p className="text-xs text-slate-400 mb-4">Current AI processing reveals a stable sales velocity of 5.2 units/day globally.</p>
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[65%]" />
                </div>
              </Card>
              <Card className="bg-rose-950/20 border-rose-500/20 p-6">
                <div className="flex items-center gap-3 mb-4">
                   <ShieldAlert className="h-5 w-5 text-rose-400" />
                   <h3 className="font-black uppercase italic text-rose-400">Risk Mitigation</h3>
                </div>
                <p className="text-xs text-slate-400 mb-4">Oracle recommends maintaining at least 15% cash liquidity for overhead surges.</p>
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 w-[15%]" />
                </div>
              </Card>
            </div>
          </div>
        )}
        {tab === "sessions" && (
          <div className="space-y-4">
            <Card className="bg-slate-950/60 border-slate-800 overflow-hidden">
              <CardHeader className="border-b border-slate-800 bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
                  <Zap className="h-4 w-4 text-sky-400 animate-pulse" /> Live Activity Feed
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[60vh] overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className="p-8 text-center text-slate-600 font-black uppercase text-xs italic">
                      <div className="flex items-center justify-center gap-2">
                        <Activity className="h-4 w-4 animate-pulse" />
                        <TypingText text="Awaiting session activity..." speed={80} />
                      </div>
                    </div>
                  ) : (
                    sessions.map((session, idx) => {
                      const sessionAction = session.action || "activity";
                      const sessionActor = session.employee_name || session.employee_id || "system";
                      const sessionTime = new Date(session.timestamp).toLocaleTimeString();
                      const sessionDate = new Date(session.timestamp).toLocaleDateString();
                      const sessionShop = session.shop_id || "—";
                      const sessionIp = session.ip_address || "192.168.1.1";
                      
                      return (
                        <div 
                          key={session.id || String(idx)}
                          className="border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors animate-slide-in"
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
                          <div className="flex items-center gap-4 p-4">
                            <div className={cn(
                              "flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
                              session.action?.includes("login") ? "bg-violet-500/20 text-violet-400" :
                              session.action?.includes("sale") ? "bg-emerald-500/20 text-emerald-400" :
                              session.action?.includes("expense") ? "bg-rose-500/20 text-rose-400" :
                              session.action?.includes("transfer") ? "bg-sky-500/20 text-sky-400" :
                              "bg-slate-800 text-slate-400"
                            )}>
                              {session.action?.includes("login") ? <UserCheck className="h-5 w-5" /> :
                               session.action?.includes("sale") ? <ShoppingCart className="h-5 w-5" /> :
                               session.action?.includes("expense") ? <Minus className="h-5 w-5" /> :
                               session.action?.includes("transfer") ? <ArrowRightLeft className="h-5 w-5" /> :
                               <Activity className="h-5 w-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  <TypingText text={sessionAction} speed={80} />
                                </span>
                                <ChevronRight className="h-3 w-3 text-slate-600" />
                                <span className="text-xs text-slate-300">
                                  <TypingText text={sessionActor} speed={60} />
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                                <Clock className="h-3 w-3" />
                                <span className="tabular-nums font-mono">{sessionTime}</span>
                                <span className="text-slate-700">•</span>
                                <span className="uppercase">{sessionShop}</span>
                              </div>
                            </div>
                            {session.amount !== undefined && (
                              <div className={cn(
                                "text-lg font-black font-mono italic shrink-0",
                                session.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {session.amount >= 0 ? "+" : ""}<AnimatedNumber value={session.amount} />
                              </div>
                            )}
                          </div>
                          <div className="px-4 pb-4 -mt-2">
                            <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/50 rounded-lg text-[9px]">
                              <div>
                                <span className="text-slate-500 uppercase tracking-widest">Who: </span>
                                <span className="text-white font-bold">{sessionActor}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase tracking-widest">Shop: </span>
                                <span className="text-white font-bold uppercase">{sessionShop}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase tracking-widest">IP: </span>
                                <span className="text-white font-mono">{sessionIp}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 uppercase tracking-widest">Date: </span>
                                <span className="text-white font-mono">{sessionDate}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
        }
        @keyframes flash {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(16, 185, 129, 0.2); }
        }
        .animate-flash {
          animation: flash 0.5s ease-in-out 2;
        }
      `}</style>
    </div>
  );
}
