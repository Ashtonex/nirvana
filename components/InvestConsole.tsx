"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

export function InvestConsole() {
  const [busy, setBusy] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);

  const [newCycle, setNewCycle] = useState({
    name: "Peer Pool",
    peersCount: "5",
    contributionAmount: "0",
    yourPosition: "1",
    frequencyDays: "7",
    startDate: "",
  });

  const [newEvent, setNewEvent] = useState({
    direction: "out",
    amount: "",
    eventDate: "",
    title: "",
    notes: "",
  });

  const refreshCycles = async () => {
    const res = await fetch("/api/invest/peer-cycles", { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCycles(Array.isArray(data.cycles) ? data.cycles : []);
      if (!selectedCycleId && Array.isArray(data.cycles) && data.cycles[0]?.id) setSelectedCycleId(data.cycles[0].id);
    }
  };

  const refreshEvents = async (cycleId: string) => {
    if (!cycleId) return;
    const res = await fetch(`/api/invest/peer-events?cycleId=${encodeURIComponent(cycleId)}`, { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setEvents(Array.isArray(data.events) ? data.events : []);
  };

  useEffect(() => {
    refreshCycles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshEvents(selectedCycleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycleId]);

  const selected = useMemo(() => cycles.find((c) => c.id === selectedCycleId) || null, [cycles, selectedCycleId]);

  const createCycle = async () => {
    setBusy(true);
    try {
      const payload = {
        name: newCycle.name,
        peersCount: Number(newCycle.peersCount),
        contributionAmount: Number(newCycle.contributionAmount),
        yourPosition: Number(newCycle.yourPosition),
        frequencyDays: Number(newCycle.frequencyDays),
        startDate: newCycle.startDate || null,
      };
      const res = await fetch("/api/invest/peer-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create cycle");
      await refreshCycles();
    } finally {
      setBusy(false);
    }
  };

  const postEvent = async () => {
    if (!selectedCycleId) return;
    setBusy(true);
    try {
      const payload = {
        cycleId: selectedCycleId,
        direction: newEvent.direction,
        amount: Number(newEvent.amount),
        eventDate: newEvent.eventDate || null,
        title: newEvent.title || null,
        notes: newEvent.notes || null,
      };
      const res = await fetch("/api/invest/peer-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to post event");
      setNewEvent((s) => ({ ...s, amount: "", title: "", notes: "" }));
      await refreshEvents(selectedCycleId);
    } finally {
      setBusy(false);
    }
  };

  const peers = Number(selected?.peers_count || 0);
  const contrib = Number(selected?.contribution_amount || 0);
  const payout = peers > 0 ? peers * contrib : 0;

  return (
    <div className="space-y-6">
      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">Peer System (Invest)</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase italic">
            Contributions and payouts mirror into Operations automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input value={newCycle.name} onChange={(e) => setNewCycle((s) => ({ ...s, name: e.target.value }))} className="bg-slate-900 border-slate-800 md:col-span-2" placeholder="Cycle name" />
            <Input value={newCycle.peersCount} onChange={(e) => setNewCycle((s) => ({ ...s, peersCount: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono md:col-span-1" placeholder="Peers" inputMode="numeric" />
            <Input value={newCycle.contributionAmount} onChange={(e) => setNewCycle((s) => ({ ...s, contributionAmount: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono md:col-span-1" placeholder="Contribution" inputMode="decimal" />
            <Input value={newCycle.frequencyDays} onChange={(e) => setNewCycle((s) => ({ ...s, frequencyDays: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono md:col-span-1" placeholder="Freq days" inputMode="numeric" />
            <Button disabled={busy} onClick={createCycle} className="font-black uppercase md:col-span-1">
              Create
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {cycles.length === 0 ? (
              <Badge className="bg-slate-800 text-slate-300 border-slate-700">No cycles</Badge>
            ) : (
              cycles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCycleId(c.id)}
                  className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase italic tracking-widest border ${
                    selectedCycleId === c.id ? "bg-emerald-600/20 border-emerald-500 text-white" : "bg-slate-900/50 border-slate-800 text-slate-500"
                  }`}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>

          {selected ? (
            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Peers: {peers} • Contribution: ${contrib.toFixed(2)} • Payout on your turn: ${payout.toFixed(2)}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">Post Round Event</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase italic">
            Direction `out` subtracts from Operations; `in` injects into Operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input value={newEvent.direction} onChange={(e) => setNewEvent((s) => ({ ...s, direction: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono md:col-span-1" placeholder="out|in" />
            <Input value={newEvent.amount} onChange={(e) => setNewEvent((s) => ({ ...s, amount: e.target.value }))} className="bg-slate-900 border-slate-800 font-mono md:col-span-1" placeholder="Amount" inputMode="decimal" />
            <Input value={newEvent.eventDate} onChange={(e) => setNewEvent((s) => ({ ...s, eventDate: e.target.value }))} type="date" className="bg-slate-900 border-slate-800 font-mono md:col-span-1" />
            <Input value={newEvent.title} onChange={(e) => setNewEvent((s) => ({ ...s, title: e.target.value }))} className="bg-slate-900 border-slate-800 md:col-span-2" placeholder="Title (optional)" />
            <Button disabled={busy || !selectedCycleId} onClick={postEvent} className="font-black uppercase md:col-span-1">
              Post
            </Button>
          </div>
          <Input value={newEvent.notes} onChange={(e) => setNewEvent((s) => ({ ...s, notes: e.target.value }))} className="bg-slate-900 border-slate-800" placeholder="Notes (optional)" />

          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-6 text-[10px] font-black text-slate-600 uppercase italic">No events yet.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {ev.event_date} • {ev.direction}
                    </div>
                    <div className="text-sm font-black text-white truncate">{ev.title || ev.notes || "—"}</div>
                  </div>
                  <div className={`text-right text-sm font-black font-mono ${Number(ev.amount) >= 0 ? "text-emerald-300" : "text-rose-400"}`}>
                    {Number(ev.amount) >= 0 ? "+" : ""}
                    {Number(ev.amount || 0).toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

