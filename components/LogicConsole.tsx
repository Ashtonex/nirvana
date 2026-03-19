"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import { 
  Activity, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  UserCheck, 
  UserX,
  ShoppingCart,
  Minus,
  ArrowRightLeft,
  AlertCircle,
  RefreshCw,
  Loader2
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

export default function LogicPage() {
  const [tab, setTab] = useState<Tab>("operations");
  const [operations, setOperations] = useState<OperationEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [auditErrors, setAuditErrors] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  
  const auditRef = useRef<HTMLDivElement>(null);
  const autoScrollAudit = useRef(true);

  const fetchAll = async () => {
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
        setAudit(auditData.entries);
        const errorCount = auditData.entries.filter((a: AuditEntry) => 
          a.action?.includes("error") || 
          a.action?.includes("failed") ||
          a.details?.error
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
  };

  useEffect(() => {
    fetchAll();
    
    const interval = setInterval(() => {
      if (tab === "audit" || tab === "sessions") {
        fetchAll();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [tab]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { 
      id: "operations", 
      label: "Recent Ops", 
      icon: <Coins className="h-4 w-4" />,
      color: "emerald"
    },
    { 
      id: "audit", 
      label: "Audit Log", 
      icon: auditErrors > 0 ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />,
      color: auditErrors > 0 ? "rose" : "emerald"
    },
    { 
      id: "sessions", 
      label: "Session Watch", 
      icon: <Clock className="h-4 w-4" />,
      color: "sky"
    },
  ];

  const getActionIcon = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes("sale") || a.includes("checkout")) return <ShoppingCart className="h-3 w-3 text-emerald-400" />;
    if (a.includes("expense") || a.includes("deduct")) return <Minus className="h-3 w-3 text-rose-400" />;
    if (a.includes("transfer") || a.includes("post")) return <ArrowRightLeft className="h-3 w-3 text-sky-400" />;
    if (a.includes("login") || a.includes("session")) return <UserCheck className="h-3 w-3 text-violet-400" />;
    if (a.includes("logout") || a.includes("signout")) return <UserX className="h-3 w-3 text-amber-400" />;
    if (a.includes("error") || a.includes("fail")) return <AlertCircle className="h-3 w-3 text-rose-400" />;
    return <Activity className="h-3 w-3 text-slate-400" />;
  };

  const getActionColor = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes("error") || a.includes("fail")) return "text-rose-400";
    if (a.includes("sale") || a.includes("checkout")) return "text-emerald-400";
    if (a.includes("expense")) return "text-rose-400";
    if (a.includes("transfer") || a.includes("post")) return "text-sky-400";
    return "text-slate-400";
  };

  return (
    <div className="space-y-6 pb-32 pt-4 px-2 md:px-4">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Logic</h1>
        <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          <span>Last sync: {lastRefresh.toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-hide">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
              tab === t.id
                ? `border-${t.color}-500 text-${t.color}-400`
                : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {t.icon}
            {t.label}
            {t.id === "audit" && auditErrors > 0 && (
              <Badge className="ml-1 bg-rose-500/20 text-rose-400 border-rose-500/30 text-[8px]">
                {auditErrors}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === "operations" && (
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
                <Coins className="h-4 w-4 text-emerald-400" /> Recent Operations Movement
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">
                Static - Updates only when something happens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
              {operations.length === 0 ? (
                <div className="text-center py-10 text-[10px] font-black text-slate-600 uppercase italic">
                  No operations data
                </div>
              ) : (
                operations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">
                        {r.kind} {r.shop_id ? `• ${r.shop_id}` : ""} {r.overhead_category ? `• ${r.overhead_category}` : ""}
                      </div>
                      <div className="text-xs font-black text-white truncate">{r.title || r.notes || "—"}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {r.effective_date || ""} • {new Date(r.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className={cn(
                      "text-right text-sm font-black font-mono ml-4",
                      Number(r.amount) >= 0 ? "text-emerald-300" : "text-rose-400"
                    )}>
                      {Number(r.amount) >= 0 ? "+" : ""}
                      {Number(r.amount || 0).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {tab === "audit" && (
          <Card className={cn(
            "border-2",
            auditErrors > 0 ? "border-rose-500/30 bg-rose-950/20" : "border-slate-800 bg-slate-950/60"
          )}>
            <CardHeader>
              <CardTitle className={cn(
                "text-sm font-black uppercase italic flex items-center gap-2",
                auditErrors > 0 ? "text-rose-400" : "text-emerald-400"
              )}>
                {auditErrors > 0 ? (
                  <><ShieldAlert className="h-4 w-4" /> Audit Alert</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" /> Audit Log</>
                )}
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic flex items-center gap-2">
                Live updating • 
                <Badge className={cn(
                  "text-[8px]",
                  auditErrors > 0 ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
                )}>
                  {auditErrors} issues
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto" ref={auditRef}>
              {audit.length === 0 ? (
                <div className="text-center py-10 text-[10px] font-black text-slate-600 uppercase italic">
                  No audit entries
                </div>
              ) : (
                audit.map((a, idx) => {
                  const hasError = a.action?.includes("error") || a.action?.includes("failed") || a.details?.error;
                  return (
                    <div 
                      key={a.id || idx} 
                      className={cn(
                        "p-3 rounded-lg border transition-all",
                        hasError 
                          ? "bg-rose-950/30 border-rose-500/30" 
                          : "bg-slate-900/40 border-slate-800"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1.5 rounded bg-slate-900", hasError ? "text-rose-400" : getActionColor(a.action || ""))}>
                          {getActionIcon(a.action || "")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">
                            {a.action || "action"} • {a.table_name || "table"}
                          </div>
                          <div className="text-xs font-black text-white truncate">
                            {a.details?.description || a.details?.message || "—"}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {new Date(a.timestamp).toLocaleTimeString()} • {a.employee_id || a.shop_id || "system"}
                          </div>
                        </div>
                        {hasError && (
                          <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[8px] animate-pulse">
                            ERROR
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        {tab === "sessions" && (
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-400" /> Session Watch
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">
                Tracks logins, sales, expenses, money movements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="text-center py-10 text-[10px] font-black text-slate-600 uppercase italic">
                  No session activity
                </div>
              ) : (
                sessions.map((s, idx) => (
                  <div key={s.id || idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                    <div className={cn(
                      "p-2 rounded-lg",
                      s.action?.includes("login") ? "bg-violet-500/20 text-violet-400" :
                      s.action?.includes("sale") ? "bg-emerald-500/20 text-emerald-400" :
                      s.action?.includes("expense") ? "bg-rose-500/20 text-rose-400" :
                      s.action?.includes("transfer") ? "bg-sky-500/20 text-sky-400" :
                      "bg-slate-800 text-slate-400"
                    )}>
                      {getActionIcon(s.action || "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">
                        {s.action || "activity"} {s.shop_id ? `• ${s.shop_id}` : ""}
                      </div>
                      <div className="text-xs font-black text-white truncate">
                        {s.employee_name || s.employee_id || "System"}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {new Date(s.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    {s.amount !== undefined && (
                      <div className={cn(
                        "text-right text-sm font-black font-mono",
                        s.amount >= 0 ? "text-emerald-300" : "text-rose-400"
                      )}>
                        {s.amount >= 0 ? "+" : ""}{s.amount.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={fetchAll}
        className="fixed bottom-20 right-4 md:bottom-4 h-10 px-4 border-slate-700 text-slate-400 hover:text-white"
      >
        <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );
}
