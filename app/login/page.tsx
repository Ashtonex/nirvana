"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input } from "@/components/ui";
import { Loader2, Mail, Lock, KeyRound, UserCheck, Shield } from "lucide-react";

type Mode = "staff" | "owner";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialMode = (params.get("mode") as Mode) || "staff";

  const { signIn, loading: ownerAuthLoading } = useAuth();

  const [mode, setMode] = useState<Mode>(initialMode);

  // Staff fields
  const [workEmail, setWorkEmail] = useState("");
  const [pin, setPin] = useState("");

  // Owner fields
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const submitStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workEmail, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to log in");

      const shopId = data.shopId as string | undefined;
      window.location.href = shopId ? `/shops/${shopId}` : "/mobile-menu";
    } catch (e: any) {
      setError(e?.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  const submitOwner = async () => {
    setLoading(true);
    setError(null);
    try {
      // Hardcoded admin/owner login
      if (ownerEmail.toLowerCase() === "flectere@dev.com" && ownerPassword === "Ashytana") {
        console.log("Attempting hardcoded login...");
        const { error } = await signIn("flectere@dev.com", "Ashytana");
        console.log("Login result:", error);
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }
        window.location.href = "/";
        return;
      }
      
      const { error } = await signIn(ownerEmail, ownerPassword);
      if (error) throw error;
      window.location.href = "/";
    } catch (e: any) {
      console.log("Login error:", e);
      setError(e?.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  // Don't block login form on auth loading - user needs to log in
  const showSpinner = false;

  if (showSpinner) {
    return (
      <div className="min-h-[100svh] bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-12 w-12 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-3xl mb-4 shadow-2xl shadow-violet-500/20">
            <Shield className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase text-white">Nirvana</h1>
          <p className="text-slate-400 font-medium mt-2">Login</p>
        </div>

        <Card className="bg-slate-900 border-slate-800 shadow-2xl">
          <CardHeader className="border-b border-slate-800">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("staff")}
                className={`flex-1 h-10 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === "staff"
                    ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                    : "bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => setMode("owner")}
                className={`flex-1 h-10 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === "owner"
                    ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                Owner
              </button>
            </div>
            <CardTitle className="text-xl font-black uppercase italic text-white mt-4">
              {mode === "staff" ? "Staff Login" : "Owner Login"}
            </CardTitle>
            <CardDescription className="text-slate-500">
              {mode === "staff"
                ? "Use your work email and your shop device PIN."
                : "Owners sign in with Supabase email + password."}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            {mode === "staff" ? (
              <>
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
                  <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">{error}</div>
                )}

                <Button
                  className="w-full h-12 font-black uppercase"
                  disabled={loading || !workEmail || !pin}
                  onClick={submitStaff}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="inline-flex items-center gap-2"><UserCheck className="h-4 w-4" /> Log In</span>}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="pl-10 bg-slate-950 border-slate-800"
                      placeholder="owner@dev.com"
                      type="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      className="pl-10 bg-slate-950 border-slate-800"
                      placeholder="Password"
                      type="password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">{error}</div>
                )}

                <Button
                  className="w-full h-12 font-black uppercase"
                  disabled={loading || !ownerEmail || !ownerPassword}
                  onClick={submitOwner}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="min-h-[100svh] bg-slate-950 flex items-center justify-center p-4">
      <Loader2 className="h-12 w-12 text-violet-500 animate-spin" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
