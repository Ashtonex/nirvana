"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { X, Bell, ShoppingCart, UserPlus, UserMinus, DollarSign, TrendingUp, AlertTriangle, CheckCircle, Info, ChevronDown, MessageCircle, Package } from "lucide-react";
import { cn } from "@/components/ui";

function playNotificationSound(type: string) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === "sale" || type === "deposit" || type === "chat" || type === "stock_request") {
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.25);
    } else if (type === "alert") {
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.setValueAtTime(400, ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } else {
      oscillator.frequency.setValueAtTime(523, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    }

    ctx.close();
  } catch {
  }
}

export type ToastType = "sale" | "deposit" | "expense" | "staff_login" | "staff_logout" | "chat" | "stock_request" | "alert" | "success" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  amount?: number;
  shop?: string;
  timestamp: Date;
  read?: boolean;
};

type ToastContextType = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "timestamp">) => void;
  removeToast: (id: string) => void;
  markAsRead: (id: string) => void;
  unreadCount: number;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TOAST_CONFIG: Record<ToastType, { icon: ReactNode; color: string; bg: string; border: string }> = {
  sale: { 
    icon: <ShoppingCart className="h-4 w-4" />, 
    color: "text-emerald-400", 
    bg: "bg-emerald-500/10", 
    border: "border-emerald-500/30" 
  },
  deposit: { 
    icon: <DollarSign className="h-4 w-4" />, 
    color: "text-sky-400", 
    bg: "bg-sky-500/10", 
    border: "border-sky-500/30" 
  },
  expense: { 
    icon: <TrendingUp className="h-4 w-4" />, 
    color: "text-rose-400", 
    bg: "bg-rose-500/10", 
    border: "border-rose-500/30" 
  },
  staff_login: { 
    icon: <UserPlus className="h-4 w-4" />, 
    color: "text-violet-400", 
    bg: "bg-violet-500/10", 
    border: "border-violet-500/30" 
  },
  staff_logout: { 
    icon: <UserMinus className="h-4 w-4" />, 
    color: "text-slate-400", 
    bg: "bg-slate-500/10", 
    border: "border-slate-500/30" 
  },
  alert: { 
    icon: <AlertTriangle className="h-4 w-4" />, 
    color: "text-amber-400", 
    bg: "bg-amber-500/10", 
    border: "border-amber-500/30" 
  },
  success: { 
    icon: <CheckCircle className="h-4 w-4" />, 
    color: "text-emerald-400", 
    bg: "bg-emerald-500/10", 
    border: "border-emerald-500/30" 
  },
  info: { 
    icon: <Info className="h-4 w-4" />, 
    color: "text-blue-400", 
    bg: "bg-blue-500/10", 
    border: "border-blue-500/30" 
  },
  chat: { 
    icon: <MessageCircle className="h-4 w-4" />, 
    color: "text-amber-400", 
    bg: "bg-amber-500/10", 
    border: "border-amber-500/30" 
  },
  stock_request: { 
    icon: <Package className="h-4 w-4" />, 
    color: "text-orange-400", 
    bg: "bg-orange-500/10", 
    border: "border-orange-500/30" 
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const addToast = useCallback((toast: Omit<Toast, "id" | "timestamp">) => {
    playNotificationSound(toast.type);
    
    const newToast: Toast = {
      ...toast,
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    
    setToasts(prev => [newToast, ...prev].slice(0, 20));
    setIsVisible(true);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 8000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, read: true } : t));
  }, []);

  const unreadCount = toasts.filter(t => !t.read).length;

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, markAsRead, unreadCount }}>
      {children}
      <ToastContainer 
        toasts={toasts} 
        onRemove={removeToast}
        onMarkRead={markAsRead}
        isVisible={isVisible}
        onClose={() => setIsVisible(false)}
        unreadCount={unreadCount}
      />
    </ToastContext.Provider>
  );
}

function ToastContainer({ 
  toasts, 
  onRemove, 
  onMarkRead,
  isVisible, 
  onClose,
  unreadCount 
}: { 
  toasts: Toast[]; 
  onRemove: (id: string) => void;
  onMarkRead: (id: string) => void;
  isVisible: boolean;
  onClose: () => void;
  unreadCount: number;
}) {
  const [showPanel, setShowPanel] = useState(false);

  if (!isVisible && toasts.length === 0) return null;

  return (
    <>
      <ToastBell 
        unreadCount={unreadCount} 
        onClick={() => setShowPanel(!showPanel)}
      />
      
      {showPanel && (
        <div 
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] w-96"
          onClick={() => setShowPanel(false)}
        >
          <div className="bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-black text-slate-200 uppercase tracking-wide">
                  Recent Activity
                </span>
              </div>
              <span className="text-[10px] text-slate-500">{toasts.length} notifications</span>
            </div>
            
            <div className="max-h-80 overflow-y-auto">
              {toasts.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No recent activity</p>
                </div>
              ) : (
                toasts.map(toast => {
                  const config = TOAST_CONFIG[toast.type];
                  return (
                    <div 
                      key={toast.id}
                      className="p-3 border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors cursor-pointer"
                      onClick={() => onRemove(toast.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn("mt-0.5", config.color)}>
                          {config.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={cn("text-[10px] font-black uppercase", config.color)}>
                              {toast.title}
                            </span>
                            <span className="text-[9px] text-slate-600">
                              {new Date(toast.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                            {toast.message}
                          </p>
                          {toast.amount !== undefined && (
                            <span className={cn(
                              "text-sm font-black font-mono italic mt-1 block",
                              toast.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                            )}>
                              {toast.amount >= 0 ? "+" : ""}${toast.amount.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
        {toasts.slice(0, 5).map((toast, idx) => (
          <ToastItem 
            key={toast.id} 
            toast={toast} 
            onRemove={onRemove}
            onMarkRead={onMarkRead}
            style={{ animationDelay: `${idx * 50}ms` }}
          />
        ))}
      </div>
    </>
  );
}

function ToastItem({ 
  toast, 
  onRemove,
  onMarkRead,
  style 
}: { 
  toast: Toast; 
  onRemove: (id: string) => void;
  onMarkRead: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const config = TOAST_CONFIG[toast.type];
  const [isEntering, setIsEntering] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const enterTimer = setTimeout(() => setIsEntering(false), 300);
    const removeTimer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onRemove(toast.id), 300);
    }, 7700);
    
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, onRemove]);

  const handleClick = () => {
    onMarkRead(toast.id);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto w-80 transform transition-all duration-300",
        isEntering ? "translate-x-full opacity-0 scale-95" : "translate-x-0 opacity-100 scale-100",
        isExiting && "translate-x-full opacity-0 scale-95"
      )}
      style={style}
      onClick={handleClick}
    >
      <div className={cn(
        "relative overflow-hidden rounded-lg border backdrop-blur-sm shadow-2xl",
        "bg-slate-950/90",
        config.border,
        "cursor-pointer hover:scale-[1.02] transition-transform"
      )}>
        <div className={cn("absolute inset-0 opacity-20", config.bg)} />
        
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            <div className={cn("flex-shrink-0 mt-0.5", config.color)}>
              {config.icon}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={cn("text-xs font-black uppercase tracking-wide", config.color)}>
                  {toast.title}
                </p>
                <span className="text-[10px] text-slate-500">
                  {toast.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              <p className="text-xs text-slate-300 mt-1 line-clamp-2">
                {toast.message}
              </p>
              
              {toast.amount !== undefined && (
                <div className={cn(
                  "mt-2 text-lg font-black font-mono italic",
                  toast.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {toast.amount >= 0 ? "+" : ""}${toast.amount.toFixed(2)}
                </div>
              )}
              
              {toast.shop && (
                <div className="mt-2">
                  <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-400">
                    @{toast.shop}
                  </span>
                </div>
              )}
            </div>
            
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(toast.id); }}
              className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-30"
               style={{ width: "100%", animation: "shrink 8s linear forwards" }} />
        </div>
      </div>
      
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

function ToastBell({ unreadCount, onClick }: { unreadCount: number; onClick: () => void }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [prevCount, setPrevCount] = useState(unreadCount);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (unreadCount > prevCount) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 500);
    }
    setPrevCount(unreadCount);
  }, [unreadCount, prevCount]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto",
        "flex items-center gap-3 px-5 py-2.5 rounded-full",
        "bg-slate-950/90 backdrop-blur-md border",
        "transition-all duration-300 hover:scale-105",
        isAnimating && "animate-bounce",
        isHovered ? "border-amber-500/50 shadow-lg shadow-amber-500/10" : "border-slate-800",
        "hover:shadow-2xl"
      )}
    >
      <div className="relative">
        <Bell className={cn(
          "h-5 w-5 transition-all duration-300",
          unreadCount > 0 ? "text-amber-400" : "text-emerald-400",
          isHovered && "scale-110"
        )} />
        {unreadCount > 0 && (
          <span className={cn(
            "absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full",
            "bg-rose-500 text-[9px] font-black text-white",
            "flex items-center justify-center",
            "animate-pulse ring-2 ring-rose-500/30"
          )}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>
      
      <div className="flex flex-col items-start">
        <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
          Nirvana Live
        </span>
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={cn(
                "w-1 h-1 rounded-full",
                "bg-emerald-400",
                "animate-pulse"
              )}
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
          <span className="text-[9px] text-slate-500 ml-1">LIVE</span>
        </div>
      </div>
      
      <ChevronDown className={cn(
        "h-4 w-4 text-slate-500 transition-transform duration-300",
        isHovered && "translate-y-0.5"
      )} />
    </button>
  );
}
