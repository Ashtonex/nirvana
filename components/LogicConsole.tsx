"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { 
  Activity, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  UserCheck, 
  ShoppingCart,
  Minus,
  ArrowRightLeft,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Wifi,
  Monitor
} from "lucide-react";
import { cn } from "@/components/ui";

type AuditEntry = {
  id: string;
  action: string;
  table_name?: string;
  shop_id?: string;
  employee_id?: string;
  employee_name?: string;
  ip_address?: string;
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
  ip_address?: string;
  timestamp: string;
};

function TypingText({ text, speed = 30 }: { text: string; speed?: number }) {
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
  
  return <span>{displayed}<span className="animate-pulse">▌</span></span>;
}

function LogItem({ 
  entry, 
  type,
  isExpanded, 
  onToggle 
}: { 
  entry: any; 
  type: "audit" | "session";
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasError = entry.action?.includes("error") || entry.action?.includes("failed") || entry.details?.error;
  
  const actionColor = entry.action?.includes("error") || entry.action?.includes("failed") 
    ? "rose" 
    : entry.action?.includes("sale") 
      ? "emerald" 
      : entry.action?.includes("expense") || entry.action?.includes("deduct")
        ? "orange"
        : entry.action?.includes("login") || entry.action?.includes("signin")
          ? "violet"
          : entry.action?.includes("logout") || entry.action?.includes("signout")
            ? "amber"
            : entry.action?.includes("transfer") || entry.action?.includes("post")
              ? "sky"
              : "slate";

  const colorClasses = {
    rose: "text-rose-400 bg-rose-500/20",
    emerald: "text-emerald-400 bg-emerald-500/20",
    orange: "text-orange-400 bg-orange-500/20",
    violet: "text-violet-400 bg-violet-500/20",
    amber: "text-amber-400 bg-amber-500/20",
    sky: "text-sky-400 bg-sky-500/20",
    slate: "text-slate-400 bg-slate-500/20",
  };

  const time = new Date(entry.timestamp).toLocaleTimeString();
  const date = new Date(entry.timestamp).toLocaleDateString();
  const name = entry.employee_name || entry.details?.employee_name || entry.employee_id || "System";
  const shop = entry.shop_id || entry.details?.shop_id || "—";
  const ip = entry.ip_address || entry.details?.ip_address || "192.168.1.1";
  const amount = entry.amount || entry.details?.amount;

  return (
    <div className="group">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 text-left",
          hasError 
            ? "bg-rose-950/40 border-rose-500/30 hover:border-rose-500/50" 
            : "bg-slate-900/40 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/60",
          isExpanded && "rounded-b-none border-b-0"
        )}
      >
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
          colorClasses[actionColor as keyof typeof colorClasses] || colorClasses.slate
        )}>
          {hasError ? <ShieldAlert className="h-5 w-5" /> :
           entry.action?.includes("sale") || entry.action?.includes("checkout") ? <ShoppingCart className="h-5 w-5" /> :
           entry.action?.includes("expense") || entry.action?.includes("deduct") ? <Minus className="h-5 w-5" /> :
           entry.action?.includes("login") || entry.action?.includes("signin") ? <UserCheck className="h-5 w-5" /> :
           entry.action?.includes("logout") || entry.action?.includes("signout") ? <UserCheck className="h-5 w-5" /> :
           entry.action?.includes("transfer") || entry.action?.includes("post") ? <ArrowRightLeft className="h-5 w-5" /> :
           <Activity className="h-5 w-5" />}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest",
              actionColor === "rose" ? "text-rose-400" :
              actionColor === "emerald" ? "text-emerald-400" :
              actionColor === "violet" ? "text-violet-400" :
              actionColor === "sky" ? "text-sky-400" :
              "text-slate-400"
            )}>
              {entry.action}
            </span>
            {hasError && (
              <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[8px] animate-pulse">
                ERROR
              </Badge>
            )}
          </div>
          <p className="text-sm font-bold text-white/80 truncate mt-0.5">
            {entry.details?.description || entry.details?.message || entry.table_name || entry.details?.notes || "—"}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono text-slate-500">{date}</p>
            <p className="text-xs font-mono text-slate-400">{time}</p>
          </div>
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className={cn(
          "p-4 rounded-b-xl border-t-0 border bg-slate-950/80",
          hasError ? "border-rose-500/30" : "border-slate-800"
        )}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <UserCheck className="h-3 w-3" /> Employee
              </p>
              <p className="text-sm font-bold text-white">{name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <Monitor className="h-3 w-3" /> Shop
              </p>
              <p className="text-sm font-bold text-white uppercase">{shop}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <Wifi className="h-3 w-3" /> IP Address
              </p>
              <p className="text-sm font-mono text-white">{ip}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Timestamp
              </p>
              <p className="text-sm font-mono text-white">{time}</p>
            </div>
          </div>
          {amount !== undefined && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Amount</p>
              <p className={cn(
                "text-xl font-black font-mono italic",
                Number(amount) >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {Number(amount) >= 0 ? "+" : ""}{Number(amount).toFixed(2)}
              </p>
            </div>
          )}
          {entry.details && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Raw Details</p>
              <pre className="text-[10px] font-mono text-slate-400 bg-slate-900 p-2 rounded overflow-x-auto">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveTypingFeed({ items, type }: { items: any[]; type: "audit" | "session" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleItems, setVisibleItems] = useState<any[]>([]);
  
  useEffect(() => {
    if (items.length === 0) return;
    
    const newItem = items[0];
    if (!visibleItems.find(i => i.id === newItem.id)) {
      setVisibleItems(prev => [newItem, ...prev].slice(0, 20));
    }
  }, [items]);
  
  return (
    <div ref={containerRef} className="space-y-2">
      {visibleItems.map((item, idx) => (
        <div 
          key={item.id || idx}
          className="transform transition-all duration-300"
          style={{ 
            animation: idx === 0 ? 'slideIn 0.3s ease-out' : undefined,
            opacity: Math.max(0.3, 1 - (idx * 0.05))
          }}
        >
          <LogItem 
            entry={item} 
            type={type}
            isExpanded={false}
            onToggle={() => {}}
          />
        </div>
      ))}
      {visibleItems.length === 0 && (
        <div className="text-center py-12 text-slate-600 font-black uppercase text-xs italic">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-4 w-4 animate-pulse" />
            <TypingText text="Awaiting system logs..." speed={100} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogicPage() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [auditErrors, setAuditErrors] = useState(0);
  const [sessionErrors, setSessionErrors] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<"audit" | "sessions">("audit");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const fetchAll = useCallback(async () => {
    try {
      const [auditRes, sessionsRes] = await Promise.all([
        fetch("/api/logic/audit", { cache: "no-store", credentials: "include" }),
        fetch("/api/logic/sessions", { cache: "no-store", credentials: "include" }),
      ]);

      const [auditData, sessionsData] = await Promise.all([
        auditRes.json(),
        sessionsRes.json(),
      ]);

      if (auditData?.entries) {
        setAudit(auditData.entries);
        const errorCount = auditData.entries.filter((a: AuditEntry) => 
          a.action?.includes("error") || a.action?.includes("failed") || a.details?.error
        ).length;
        setAuditErrors(errorCount);
      }
      if (sessionsData?.entries) {
        setSessions(sessionsData.entries);
        const sessionErrCount = sessionsData.entries.filter((s: SessionEntry) => 
          s.action?.includes("error") || s.action?.includes("failed")
        ).length;
        setSessionErrors(sessionErrCount);
      }
      
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Logic fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 2000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const currentItems = activeTab === "audit" ? audit : sessions;
  const currentErrors = activeTab === "audit" ? auditErrors : sessionErrors;
  const hasErrors = currentErrors > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-32">
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white flex items-center gap-2">
                <Activity className="h-6 w-6 text-emerald-400 animate-pulse" />
                Logic
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  hasErrors ? "bg-rose-500" : "bg-emerald-500"
                )} />
                <span>
                  {loading ? "Syncing" : "Live"} • {lastRefresh.toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={fetchAll}
                className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className={cn("h-5 w-5 text-slate-400", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex px-4">
          <button
            onClick={() => setActiveTab("audit")}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
              activeTab === "audit"
                ? hasErrors ? "border-rose-500 text-rose-400" : "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {hasErrors ? (
              <ShieldAlert className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Audit Log
            {hasErrors && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] animate-pulse">
                {currentErrors}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
              activeTab === "sessions"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            <Clock className="h-4 w-4" />
            Sessions
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className={cn(
          "border-2 overflow-hidden",
          hasErrors ? "border-rose-500/50 bg-rose-950/20" : "border-emerald-500/30 bg-emerald-950/20"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex items-center justify-center w-14 h-14 rounded-xl",
                hasErrors ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"
              )}>
                {hasErrors ? <ShieldAlert className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
              </div>
              <div className="flex-1">
                <p className={cn(
                  "text-xl font-black italic",
                  hasErrors ? "text-rose-400" : "text-emerald-400"
                )}>
                  <TypingText 
                    text={hasErrors 
                      ? `${currentErrors} System Alert${currentErrors > 1 ? "s" : ""} Detected`
                      : "All Systems Operational"
                    } 
                    speed={hasErrors ? 50 : 80}
                  />
                </p>
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <Zap className="h-3 w-3 animate-pulse" />
                  System monitoring active • Auto-refresh every 2s
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {currentItems.map((item, idx) => (
            <LogItem 
              key={item.id || String(idx)}
              entry={item}
              type={activeTab === "audit" ? "audit" : "session"}
              isExpanded={expandedId === (item.id || String(idx))}
              onToggle={() => setExpandedId(expandedId === (item.id || String(idx)) ? null : (item.id || String(idx)))}
            />
          ))}
          
          {currentItems.length === 0 && (
            <Card className="bg-slate-950/60 border-slate-800">
              <CardContent className="p-8 text-center">
                <div className="text-slate-600 font-black uppercase text-xs italic flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4 animate-pulse" />
                  <TypingText text="Awaiting system logs..." speed={100} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-pulse {
          animation: blink 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
