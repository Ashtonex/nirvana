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

type Tab = "operations" | "audit" | "sessions";

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
};

type SessionEntry = {
  id: string;
  employee_id: string;
  employee_name?: string;
  shop_id?: string;
  action: string;
  amount?: number;
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

function TypingText({ text, speed = 20, className = "" }: { text: string; speed?: number; className?: string }) {
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
  
  const actionText = entry.action || "action";
  const descText = entry.details?.description || entry.details?.message || entry.table_name || "—";
  const timeText = new Date(entry.timestamp).toLocaleTimeString();
  const actorText = entry.employee_id || entry.shop_id || "system";
  
  return (
    <div 
      ref={ref}
      className={cn(
        "relative flex items-start gap-3 p-3 rounded-xl border transition-all duration-300",
        hasError 
          ? "bg-rose-950/40 border-rose-500/30" 
          : "bg-slate-900/40 border-slate-800/50 hover:border-slate-700",
        isNew && "ring-1 ring-emerald-500/30"
      )}
    >
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
            <TypingText text={actionText} speed={15} className="text-[10px] font-black uppercase tracking-widest text-slate-400" />
          ) : (
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-0">{"M".repeat(actionText.length)}</span>
          )}
          {isNew && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px] animate-pulse">
              NEW
            </Badge>
          )}
        </div>
        <div className="mt-0.5 min-h-[1.25rem]">
          {startTyping ? (
            <TypingText text={descText} speed={10} className="text-sm font-bold text-white" />
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
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
                tab === t.id
                  ? t.color === "emerald" ? "border-emerald-500 text-emerald-400" :
                    t.color === "rose" ? "border-rose-500 text-rose-400" :
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
                      const sessionShop = session.shop_id || "";
                      
                      return (
                        <div 
                          key={session.id || String(idx)}
                          className="flex items-center gap-4 p-4 border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors animate-slide-in"
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
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
                                <TypingText text={sessionAction} speed={20} />
                              </span>
                              <ChevronRight className="h-3 w-3 text-slate-600" />
                              <span className="text-xs text-slate-300">
                                <TypingText text={sessionActor} speed={15} />
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                              <Clock className="h-3 w-3" />
                              <span className="tabular-nums font-mono">{sessionTime}</span>
                              {sessionShop && (
                                <>
                                  <span className="text-slate-700">•</span>
                                  <span>{sessionShop}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {session.amount !== undefined && (
                            <div className={cn(
                              "text-lg font-black font-mono italic shrink-0",
                              session.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {session.amount >= 0 ? "+" : ""}{session.amount.toFixed(2)}
                            </div>
                          )}
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
