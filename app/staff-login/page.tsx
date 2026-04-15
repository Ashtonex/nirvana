"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { Mail, Loader2, UserCheck, KeyRound, WifiOff } from "lucide-react";
import { useOfflineAuth } from "@/hooks/useOfflineAuth";
import { isOnline } from "@/lib/local-db";

export default function StaffLoginPage() {
  const router = useRouter();
  const [workEmail, setWorkEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const { login: offlineLogin } = useOfflineAuth();

  useEffect(() => {
    isOnline().then(online => setIsOfflineMode(!online));
    
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const login = async () => {
    setLoading(true);
    setError(null);
    
    const online = await isOnline();
    
    if (!online) {
      try {
        const result = await offlineLogin(pin);
        if (result.success && result.session) {
          const shopId = result.session.shopId;
          window.location.href = shopId ? `/shops/${shopId}` : "/mobile-menu";
          return;
        }
        setError(result.error || "Invalid PIN for offline login");
        return;
      } catch (e: any) {
        setError(e?.message || "Offline login failed");
        return;
      } finally {
        setLoading(false);
      }
    }
    
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workEmail, pin }),
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to log in");
      }

      console.log("[Staff Login] Success, shopId:", data.shopId, "token:", data.tokenPrefix);
      
      const shopId = data.shopId as string | undefined;
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log("[Staff Login] Navigating to:", `/shops/${shopId}`);
      window.location.href = shopId ? `/shops/${shopId}` : "/mobile-menu";
    } catch (e: any) {
      console.error("[Staff Login] Error:", e);
      setError(e?.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md">
        {isOfflineMode && (
          <div className="mb-4 flex items-center justify-center gap-2 bg-amber-500/20 text-amber-400 px-4 py-2 rounded-lg border border-amber-500/30">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">Offline Mode - Enter saved PIN</span>
          </div>
        )}
        
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white font-black uppercase italic">Staff Login</CardTitle>
            <CardDescription className="text-slate-500">
              {isOfflineMode 
                ? "Enter your device PIN to log in offline." 
                : "Enter your work email and your shop device PIN."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isOfflineMode && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Work Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    className="pl-10 bg-slate-950 border-slate-800"
                    placeholder="name.surname@kipasa.com"
                    type="email"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Device PIN</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="pl-10 bg-slate-950 border-slate-800 font-mono tracking-[0.35em] text-center"
                  placeholder="0000"
                  inputMode="numeric"
                  maxLength={8}
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <Button
              className="w-full h-12 font-black uppercase"
              disabled={loading || (!isOfflineMode && (!workEmail || !pin)) || (isOfflineMode && !pin)}
              onClick={login}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-2"><UserCheck className="h-4 w-4" /> Log In</span>
              )}
            </Button>

            <div className="pt-2 text-center">
              <button 
                onClick={() => {
                  if (confirm("Reset app cache and reload? This can fix UI issues.")) {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(regs => {
                        for(let reg of regs) reg.unregister();
                      });
                    }
                    window.location.reload();
                  }
                }}
                className="text-[9px] text-slate-600 uppercase font-black hover:text-slate-400 transition-colors"
              >
                App not working? Reset & Reload
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
