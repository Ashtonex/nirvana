"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

export function InvestConsole() {
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"peers" | "deposits">("peers");
  
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

  const [deposits, setDeposits] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [newDeposit, setNewDeposit] = useState({
    shopId: "",
    amount: "",
  });
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawTitle, setWithdrawTitle] = useState<string>("");

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

  const refreshDeposits = async () => {
    const res = await fetch("/api/invest/deposits", { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDeposits(Array.isArray(data.deposits) ? data.deposits : []);
  };

  const refreshShops = async () => {
    const res = await fetch("/api/shops", { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.shops)) setShops(data.shops);
  };

  useEffect(() => {
    refreshCycles();
    refreshDeposits();
    refreshShops();
  }, []);

  useEffect(() => {
    refreshEvents(selectedCycleId);
  }, [selectedCycleId]);

  const selected = useMemo(() => cycles.find((c) => c.id === selectedCycleId) || null, [cycles, selectedCycleId]);

  const peers = Number(selected?.peers_count || 0);
  const contrib = Number(selected?.contribution_amount || 0);
  const payout = peers > 0 ? peers * contrib : 0;

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

  const addDeposit = async () => {
    setBusy(true);
    try {
      const amount = Number(newDeposit.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
      if (!newDeposit.shopId) throw new Error("Shop required");
      
      const res = await fetch("/api/invest/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shopId: newDeposit.shopId,
          amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to add deposit");
      setNewDeposit({ shopId: "", amount: "" });
      await refreshDeposits();
    } finally {
      setBusy(false);
    }
  };

  const withdrawFromDeposit = async () => {
    setBusy(true);
    try {
      const amount = Number(withdrawAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
      
      const res = await fetch("/api/invest/deposits/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount,
          title: withdrawTitle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to withdraw");
      setWithdrawAmount("");
      setWithdrawTitle("");
      await refreshDeposits();
    } finally {
      setBusy(false);
    }
  };

  const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalWithdrawn = deposits.reduce((sum, d) => sum + Number(d.withdrawn_amount || 0), 0);
  const totalAvailable = totalDeposits - totalWithdrawn;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setTab("peers")}
          className={`px-4 py-2 text-xs font-black uppercase italic tracking-widest border-b-2 transition-colors ${
            tab === "peers" ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          Peer System
        </button>
        <button
          onClick={() => setTab("deposits")}
          className={`px-4 py-2 text-xs font-black uppercase italic tracking-widest border-b-2 transition-colors ${
            tab === "deposits" ? "border-sky-500 text-sky-400" : "border-transparent text-slate-500 hover:text-slate-300"
          }`}
        >
          Perfume Deposits
        </button>
      </div>

      {tab === "peers" ? (
        <>
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Peer System</CardTitle>
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
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-slate-950/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Deposits</CardDescription>
                <CardTitle className="text-2xl font-black italic text-emerald-400">${totalDeposits.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent className="text-[10px] font-bold text-slate-500 uppercase">From POS Perfume Expenses</CardContent>
            </Card>
            <Card className="bg-slate-950/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Withdrawn</CardDescription>
                <CardTitle className="text-2xl font-black italic text-rose-400">${totalWithdrawn.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent className="text-[10px] font-bold text-slate-500 uppercase">Record of Drawals</CardContent>
            </Card>
            <Card className="bg-slate-950/60 border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Available</CardDescription>
                <CardTitle className="text-2xl font-black italic text-sky-400">${totalAvailable.toFixed(2)}</CardTitle>
              </CardHeader>
              <CardContent className="text-[10px] font-bold text-slate-500 uppercase">Growth Capital</CardContent>
            </Card>
          </div>

          {/* Shop Totals */}
          <Card className="bg-sky-950/20 border-sky-800/30">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic text-sky-400">Deposits by Shop</CardTitle>
              <CardDescription className="text-[10px]">Each shop&apos;s contribution to perfume growth capital</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(() => {
                const byShop: Record<string, { total: number; withdrawn: number; available: number }> = {};
                deposits.forEach((d) => {
                  const shop = d.shop_id || "unknown";
                  if (!byShop[shop]) byShop[shop] = { total: 0, withdrawn: 0, available: 0 };
                  byShop[shop].total += Number(d.amount || 0);
                  byShop[shop].withdrawn += Number(d.withdrawn_amount || 0);
                  byShop[shop].available += (Number(d.amount || 0) - Number(d.withdrawn_amount || 0));
                });
                
                return (
                  <>
                    {Object.entries(byShop).map(([shop, data]) => (
                      <div key={shop} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full bg-sky-500" />
                          <div>
                            <div className="text-sm font-black text-white uppercase">{shop}</div>
                            <div className="text-[10px] text-slate-500">
                              Total: ${data.total.toFixed(2)} • Withdrawn: ${data.withdrawn.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black italic text-sky-400">${data.available.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-500">Available</div>
                        </div>
                      </div>
                    ))}
                    {Object.keys(byShop).length > 1 && (
                      <div className="flex items-center justify-between p-3 bg-sky-950/30 rounded-lg border border-sky-700/30 mt-4">
                        <div className="text-sm font-black text-sky-400">TOTAL</div>
                        <div className="text-lg font-black italic text-sky-400">${totalAvailable.toFixed(2)}</div>
                      </div>
                    )}
                    {Object.keys(byShop).length === 0 && (
                      <div className="text-center py-4 text-slate-600 italic text-xs">No deposits yet</div>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Record Perfume Deposit</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">
                When expenses titled &quot;Perfumes&quot; are entered at POS, record them here as deposits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  value={newDeposit.shopId}
                  onChange={(e) => setNewDeposit((s) => ({ ...s, shopId: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 text-white px-3 py-2 rounded-md md:col-span-1"
                >
                  <option value="">Select Shop</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <Input 
                  value={newDeposit.amount} 
                  onChange={(e) => setNewDeposit((s) => ({ ...s, amount: e.target.value }))} 
                  className="bg-slate-900 border-slate-800 font-mono md:col-span-1" 
                  placeholder="Amount" 
                  inputMode="decimal" 
                />
                <Button disabled={busy || !newDeposit.shopId || !newDeposit.amount} onClick={addDeposit} className="font-black uppercase md:col-span-1">
                  Add Deposit
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Record Withdrawal</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase italic">
                Withdraw a bulk figure from the full perfume capital pool. Oldest active deposits are reduced first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 md:col-span-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pool Available</div>
                  <div className="text-lg font-black italic text-sky-400">${totalAvailable.toFixed(2)}</div>
                </div>
                <Input 
                  value={withdrawAmount} 
                  onChange={(e) => setWithdrawAmount(e.target.value)} 
                  className="bg-slate-900 border-slate-800 font-mono md:col-span-1" 
                  placeholder="Amount" 
                  inputMode="decimal" 
                />
                <Input 
                  value={withdrawTitle} 
                  onChange={(e) => setWithdrawTitle(e.target.value)} 
                  className="bg-slate-900 border-slate-800 md:col-span-1" 
                  placeholder="Purpose/Label" 
                />
                <Button disabled={busy || !withdrawAmount} onClick={withdrawFromDeposit} className="font-black uppercase md:col-span-1">
                  Withdraw
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase italic">Deposit History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deposits.length === 0 ? (
                <div className="text-center py-6 text-[10px] font-black text-slate-600 uppercase italic">No deposits yet.</div>
              ) : (
                deposits.map((d) => {
                  return (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-slate-800">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {d.shop_id} • {new Date(d.deposited_at).toLocaleDateString()}
                        </div>
                        <div className="text-sm font-black text-white">
                          ${Number(d.amount).toFixed(2)} deposited
                          {Number(d.withdrawn_amount) > 0 && (
                            <span className="text-rose-400 ml-2">- ${Number(d.withdrawn_amount).toFixed(2)} withdrawn</span>
                          )}
                        </div>
                        {d.withdraw_title && (
                          <div className="text-[10px] text-slate-500">{d.withdraw_title}</div>
                        )}
                      </div>
                      <Badge className={
                        d.status === 'withdrawn' ? "bg-slate-700 text-slate-300" :
                        d.status === 'partial' ? "bg-amber-600/20 text-amber-400" :
                        "bg-emerald-600/20 text-emerald-400"
                      }>
                        {d.status}
                      </Badge>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
