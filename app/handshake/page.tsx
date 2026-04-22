"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input, Badge } from "@/components/ui";
import { ArrowRightLeft, Clock, UserCheck, ShieldCheck, Loader2, MapPin, User, FileText } from "lucide-react";
import { cn } from "@/components/ui";

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
  acknowledged_by?: string;
  notes?: string;
};

type Shop = {
  id: string;
  name: string;
};

export default function HandshakePage() {
  const [handshakes, setHandshakes] = useState<HandshakeEntry[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const [form, setForm] = useState({
    fromShop: "",
    toShop: "",
    amount: "",
    associate: "",
    initiatedBy: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const [handshakesRes, shopsRes] = await Promise.all([
        fetch("/api/operations/handshakes", { credentials: "include" }),
        fetch("/api/shops", { credentials: "include" }).catch(() => ({ ok: false, json: async () => ({ shops: [] }) })),
      ]);
      const hsData = await handshakesRes.json();
      const shopsData = await shopsRes.json();
      
      if (Array.isArray(hsData?.handshakes)) setHandshakes(hsData.handshakes);
      if (Array.isArray(shopsData?.shops)) setShops(shopsData.shops);
    } catch (e) {
      console.error("Failed to fetch:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const initiateHandshake = async () => {
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount");
      return;
    }
    if (!form.fromShop || !form.toShop) {
      alert("Select both shops");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/operations/handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      setForm({ fromShop: "", toShop: "", amount: "", associate: "", initiatedBy: "", notes: "" });
      await fetchData();
    } catch (e) {
      alert("Failed to initiate handshake");
    } finally {
      setBusy(false);
    }
  };

  const acknowledgeHandshake = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/handshake/${id}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      await fetchData();
    } catch (e) {
      alert("Failed to acknowledge");
    } finally {
      setBusy(false);
    }
  };

  const filteredHandshakes = handshakes.filter(h => {
    if (filter === "pending") return h.status === "pending";
    if (filter === "completed") return h.status !== "pending";
    return true;
  });

  const pending = handshakes.filter(h => h.status === "pending");
  const completed = handshakes.filter(h => h.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 pt-8 max-w-6xl mx-auto px-4">
      <div className="space-y-2 text-center">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Cash Handshake</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          Physical Cash Transfer Accountability
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-amber-950/20 border-amber-800/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-amber-500">Pending</CardDescription>
            <CardTitle className="text-3xl font-black italic text-amber-400">{pending.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-emerald-950/20 border-emerald-800/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-emerald-500">Completed</CardDescription>
            <CardTitle className="text-3xl font-black italic text-emerald-400">{completed.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-violet-950/20 border-violet-800/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase text-violet-500">Total Value</CardDescription>
            <CardTitle className="text-3xl font-black italic text-violet-400">
              ${handshakes.reduce((s, h) => s + h.amount, 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Initiate Form */}
      <Card className="bg-gradient-to-br from-violet-950/30 to-slate-900 border-violet-800/30">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic text-violet-400 flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> Initiate Cash Transfer
          </CardTitle>
          <CardDescription className="text-[10px]">
            Create a handshake record when cash moves physically between shops
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> From Shop (Sender)
              </label>
              <select
                value={form.fromShop}
                onChange={(e) => setForm(s => ({ ...s, fromShop: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
              >
                <option value="">Select Shop</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> To Shop (Receiver)
              </label>
              <select
                value={form.toShop}
                onChange={(e) => setForm(s => ({ ...s, toShop: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md"
              >
                <option value="">Select Shop</option>
                {shops.filter(s => s.id !== form.fromShop).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500">Amount</label>
              <Input
                value={form.amount}
                onChange={(e) => setForm(s => ({ ...s, amount: e.target.value }))}
                className="bg-slate-900 border-slate-800 font-mono"
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                <User className="h-3 w-3" /> Courier / Associate
              </label>
              <Input
                value={form.associate}
                onChange={(e) => setForm(s => ({ ...s, associate: e.target.value }))}
                className="bg-slate-900 border-slate-800"
                placeholder="Person carrying cash"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500">Initiated By</label>
              <Input
                value={form.initiatedBy}
                onChange={(e) => setForm(s => ({ ...s, initiatedBy: e.target.value }))}
                className="bg-slate-900 border-slate-800"
                placeholder="Manager name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Notes
              </label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(s => ({ ...s, notes: e.target.value }))}
                className="bg-slate-900 border-slate-800"
                placeholder="Purpose / Reference"
              />
            </div>
          </div>
          <Button
            disabled={busy}
            onClick={initiateHandshake}
            className="w-full bg-violet-600 hover:bg-violet-500 font-black uppercase"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
            Initiate Handshake
          </Button>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {[
          { id: "all" as const, label: "All" },
          { id: "pending" as const, label: "Pending", count: pending.length },
          { id: "completed" as const, label: "Completed", count: completed.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
              filter === tab.id ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge className="ml-2 bg-slate-800 text-slate-300">{tab.count}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* Handshakes List */}
      <div className="space-y-3">
        {filteredHandshakes.length === 0 ? (
          <Card className="bg-slate-950/60 border-slate-800">
            <CardContent className="py-12 text-center text-slate-600 italic">
              No handshakes found
            </CardContent>
          </Card>
        ) : filteredHandshakes.map(h => (
          <Card
            key={h.id}
            className={cn(
              "border",
              h.status === "pending" ? "bg-amber-950/10 border-amber-800/30" : "bg-slate-950/60 border-slate-800"
            )}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  h.status === "pending" ? "bg-amber-500/20" : "bg-emerald-500/20"
                )}>
                  {h.status === "pending" ? (
                    <Clock className="h-6 w-6 text-amber-400" />
                  ) : (
                    <ShieldCheck className="h-6 w-6 text-emerald-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                    <span className="text-emerald-400">{h.from_shop}</span>
                    <ArrowRightLeft className="h-3 w-3" />
                    <span className="text-violet-400">{h.to_shop}</span>
                  </div>
                  <div className="text-sm font-bold text-white">{h.associate || "Unnamed courier"}</div>
                  <div className="text-[10px] text-slate-500">
                    Initiated by {h.initiated_by} • {new Date(h.created_at).toLocaleString()}
                  </div>
                  {h.notes && <div className="text-[10px] text-slate-400 mt-1">{h.notes}</div>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xl font-black font-mono italic text-white">${h.amount.toFixed(2)}</div>
                  {h.status === "pending" && (
                    <div className="text-[10px] text-amber-500 flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {Math.round((Date.now() - new Date(h.created_at).getTime()) / 60000)}m ago
                    </div>
                  )}
                  {h.acknowledged_at && (
                    <div className="text-[10px] text-emerald-500">
                      Acknowledged {new Date(h.acknowledged_at).toLocaleString()}
                    </div>
                  )}
                </div>
                {h.status === "pending" && (
                  <Button
                    size="sm"
                    onClick={() => acknowledgeHandshake(h.id)}
                    disabled={busy}
                    className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase"
                  >
                    <UserCheck className="h-4 w-4 mr-1" />
                    Acknowledge
                  </Button>
                )}
                <Badge className={h.status === "pending" ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}>
                  {h.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      
    </div>
  );
}
