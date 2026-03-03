"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from "@/components/ui";
import { Mail, Loader2, UserCheck } from "lucide-react";

export default function StaffLoginPage() {
  const router = useRouter();
  const [workEmail, setWorkEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to log in");
      router.push("/");
    } catch (e: any) {
      setError(e?.message || "Failed to log in");
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
              Enter your work email to access your POS.
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

            {error && (
              <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <Button
              className="w-full h-12 font-black uppercase"
              disabled={loading || !workEmail}
              onClick={login}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-2"><UserCheck className="h-4 w-4" /> Log In</span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
