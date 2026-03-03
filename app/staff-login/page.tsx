"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { Mail, KeyRound, Loader2 } from "lucide-react";

export default function StaffLoginPage() {
  const router = useRouter();
  const [workEmail, setWorkEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setStep("verify");
    } catch (e: any) {
      setError(e?.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workEmail, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Invalid code");
      router.push("/");
    } catch (e: any) {
      setError(e?.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white font-black uppercase italic">Staff Login</CardTitle>
            <CardDescription className="text-slate-500">
              Enter your work email. We'll send a one-time code to your personal email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {step === "verify" && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Login Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-10 bg-slate-950 border-slate-800 tracking-[0.4em] text-center font-mono"
                    placeholder="123456"
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                {error}
              </div>
            )}

            {step === "request" ? (
              <Button
                className="w-full h-12 font-black uppercase"
                disabled={loading || !workEmail}
                onClick={requestCode}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Code"}
              </Button>
            ) : (
              <Button
                className="w-full h-12 font-black uppercase"
                disabled={loading || !workEmail || code.length < 6}
                onClick={verifyCode}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Login"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
