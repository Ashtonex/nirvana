"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

type ShopNode = {
  id: string;
  name: string;
  expenses?: { rent?: number; salaries?: number; utilities?: number; misc?: number };
};

type OpsState = {
  computedBalance: number;
  actualBalance: number;
  updatedAt: string | null;
  delta: number;
};

export function OperationsConsole({
  shops,
  initialState,
  initialLedger,
}: {
  shops: ShopNode[];
  initialState: OpsState;
  initialLedger: any[];
}) {
  const [state, setState] = useState<OpsState>(initialState);
  const [ledger, setLedger] = useState<any[]>(initialLedger);
  const [busy, setBusy] = useState(false);

  const shopOptions = useMemo(() => shops.map((s) => ({ id: s.id, name: s.name })), [shops]);

  const [actualBalance, setActualBalance] = useState(String(initialState.actualBalance ?? 0));

  const [entry, setEntry] = useState({
    amount: "",
    kind: "eod_deposit",
    shopId: "",
    overheadCategory: "",
    title: "",
    notes: "",
    effectiveDate: "",
  });

  const refresh = async () => {
    const [s, l] = await Promise.all([
      fetch("/api/operations/state", { cache: "no-store", credentials: "include" }).then((r) => r.json()),
      fetch("/api/operations/ledger?limit=50", { cache: "no-store", credentials: "include" }).then((r) => r.json()),
    ]);
    if (s?.computedBalance != null) setState(s);
    if (Array.isArray(l?.rows)) setLedger(l.rows);
  };

  const saveActual = async () => {
    setBusy(true);
    try {
      const n = Number(actualBalance);
      if (!Number.isFinite(n)) throw new Error("Invalid actual balance");
      const res = await fetch("/api/operations/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actualBalance: n }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async () => {
    setBusy(true);
    try {
      const amt = Number(entry.amount);
      if (!Number.isFinite(amt) || amt === 0) throw new Error("Amount must be non-zero");

      const payload: any = {
        amount: amt,
        kind: entry.kind,
        shopId: entry.shopId || null,
        overheadCategory: entry.overheadCategory || null,
        title: entry.title || null,
        notes: entry.notes || null,
        effectiveDate: entry.effectiveDate || null,
      };

      const res = await fetch("/api/operations/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to post ledger entry");
      setEntry((e) => ({ ...e, amount: "", title: "", notes: "" }));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const quickEntry = (kind: string, amount: string, title: string, overheadCategory?: string) => {
    setEntry((e) => ({
      ...e,
      kind,
      amount,
      title,
      overheadCategory: overheadCategory || "",
    }));
  };

  const deltaBadge =
    Math.abs(state.delta || 0) < 0.01 ? (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Balanced</Badge>
    ) : (
      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Drift: {state.delta.toFixed(2)}</Badge>
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Operations (Computed)
            </CardDescription>
            <CardTitle className="text-2xl font-black italic text-sky-300">
              ${Number(state.computedBalance || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Sum of ledger</div>
            {deltaBadge}
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Operations (Actual)
            </CardDescription>
            <CardTitle className="text-2xl font-black italic text-emerald-300">
              ${Number(state.actualBalance || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
              className="bg-slate-900 border-slate-800 font-mono"
              placeholder="Set actual vault cash"
              inputMode="decimal"
            />
            <Button disabled={busy} onClick={saveActual} className="font-black uppercase">
              Save
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Last Updated
            </CardDescription>
            <CardTitle className="text-xl font-black italic text-slate-200">
              {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-bold text-slate-500 uppercase">
            Edit actual cash to match reality; drift indicates reconciliation needed.
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="text-[10px] font-black uppercase border-emerald-600/50 text-emerald-400 hover:bg-emerald-600/20"
              onClick={() => quickEntry("eod_deposit", "", "EOD Deposit", "")}
            >
              + EOD Deposit
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-[10px] font-black uppercase border-sky-600/50 text-sky-400 hover:bg-sky-600/20"
              onClick={() => quickEntry("capital_injection", "", "Capital Injection", "")}
            >
              + Capital Injection
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-[10px] font-black uppercase border-amber-600/50 text-amber-400 hover:bg-amber-600/20"
              onClick={() => quickEntry("business_expense", "", "Business Expense", "")}
            >
              + Expense
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-[10px] font-black uppercase border-violet-600/50 text-violet-400 hover:bg-violet-600/20"
              onClick={() => quickEntry("peer_contribution", "", "Peer Contribution", "")}
            >
              + Peer Contribution
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-[10px] font-black uppercase border-rose-600/50 text-rose-400 hover:bg-rose-600/20"
              onClick={() => quickEntry("peer_payout", "", "Peer Payout", "")}
            >
              + Peer Payout
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">Post to Operations Ledger</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase italic">
            Deposits, expenses, overhead movements, injections (everything routes through Operations).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input
              value={entry.amount}
              onChange={(e) => setEntry((s) => ({ ...s, amount: e.target.value }))}
              className="bg-slate-900 border-slate-800 font-mono md:col-span-1"
              placeholder="Amount (+/-)"
              inputMode="decimal"
            />
            <Input
              value={entry.kind}
              onChange={(e) => setEntry((s) => ({ ...s, kind: e.target.value }))}
              className="bg-slate-900 border-slate-800 font-mono md:col-span-1"
              placeholder="kind"
              list="ops-kinds"
            />
            <datalist id="ops-kinds">
              <option value="eod_deposit" />
              <option value="overhead_deposit" />
              <option value="overhead_payment" />
              <option value="capital_injection" />
              <option value="business_expense" />
              <option value="peer_contribution" />
              <option value="peer_payout" />
              <option value="adjustment" />
            </datalist>
            <Input
              value={entry.shopId}
              onChange={(e) => setEntry((s) => ({ ...s, shopId: e.target.value }))}
              list="ops-shops"
              className="bg-slate-900 border-slate-800 font-mono md:col-span-1"
              placeholder="shopId (optional)"
            />
            <datalist id="ops-shops">
              {shopOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </datalist>
            <Input
              value={entry.overheadCategory}
              onChange={(e) => setEntry((s) => ({ ...s, overheadCategory: e.target.value }))}
              className="bg-slate-900 border-slate-800 font-mono md:col-span-1"
              placeholder="overhead (rent)"
              list="ops-categories"
            />
            <datalist id="ops-categories">
              <option value="rent" />
              <option value="salaries" />
              <option value="utilities" />
              <option value="misc" />
            </datalist>
            <Input
              value={entry.effectiveDate}
              onChange={(e) => setEntry((s) => ({ ...s, effectiveDate: e.target.value }))}
              type="date"
              className="bg-slate-900 border-slate-800 font-mono md:col-span-1"
            />
            <Button disabled={busy} onClick={addEntry} className="font-black uppercase md:col-span-1">
              Post
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              value={entry.title}
              onChange={(e) => setEntry((s) => ({ ...s, title: e.target.value }))}
              className="bg-slate-900 border-slate-800"
              placeholder="Title (optional)"
            />
            <Input
              value={entry.notes}
              onChange={(e) => setEntry((s) => ({ ...s, notes: e.target.value }))}
              className="bg-slate-900 border-slate-800"
              placeholder="Notes (optional)"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-950/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase italic">Recent Operations Ledger</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase italic">Latest 50 movements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ledger.length === 0 ? (
            <div className="text-[10px] text-slate-500 font-bold uppercase italic text-center py-6">
              No ledger entries yet.
            </div>
          ) : (
            <div className="space-y-2">
              {ledger.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">
                      {String(r.kind || "entry")} {r.shop_id ? `• ${r.shop_id}` : ""}{" "}
                      {r.overhead_category ? `• ${r.overhead_category}` : ""}
                    </div>
                    <div className="text-sm font-black text-white truncate">{r.title || r.notes || "—"}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {r.effective_date || ""} • {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className={`text-right text-sm font-black font-mono ${Number(r.amount) >= 0 ? "text-emerald-300" : "text-rose-400"}`}>
                    {Number(r.amount) >= 0 ? "+" : ""}
                    {Number(r.amount || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
