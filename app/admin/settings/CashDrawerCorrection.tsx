"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Badge } from "@/components/ui";
import { getCashDrawerOpening, updateCashDrawerOpening, getCashDrawerClosing, updateCashDrawerClosing } from "../../actions";
import { Coins, ShieldCheck, Save } from "lucide-react";

export function CashDrawerCorrection({ shops }: { shops: { id: string; name: string }[] }) {
  const router = useRouter();
  const [shopId, setShopId] = useState<string>(shops?.[0]?.id || "");
  const [date, setDate] = useState<string>(() => new Date().toLocaleDateString('en-CA'));
  const [mode, setMode] = useState<'opening' | 'closing'>('opening');
  const [newAmount, setNewAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [current, setCurrent] = useState<any | null>(null);
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  const canQuery = Boolean(shopId && date);

  useEffect(() => {
    if (!canQuery) return;
    let cancelled = false;
    setError("");
    startTransition(async () => {
      try {
        const res = mode === 'opening' 
          ? await getCashDrawerOpening(shopId, date)
          : await getCashDrawerClosing(shopId, date);
        if (cancelled) return;
        setCurrent(res?.entry || null);
        setNewAmount(res?.entry?.amount !== undefined && res?.entry?.amount !== null ? String(res.entry.amount) : "");
      } catch (e: any) {
        if (!cancelled) setError(e?.message || `Failed to load ${mode}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shopId, date, mode, canQuery]);

  const currentLabel = useMemo(() => {
    if (!current) return `No ${mode} recorded for this day (you can set one).`;
    const t = current?.date ? new Date(current.date).toLocaleString() : "";
    return `Current ${mode}: $${Number(current.amount || 0).toFixed(2)} ${t ? `(${t})` : ""}`;
  }, [current, mode]);

  return (
    <div id="opening-balance">
      <Card className="bg-slate-950/40 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" /> Drawer Adjustment
            </CardTitle>
            <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800">
              <button 
                onClick={() => setMode('opening')}
                className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${mode === 'opening' ? 'bg-amber-500 text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Opening
              </button>
              <button 
                onClick={() => setMode('closing')}
                className={`px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all ${mode === 'closing' ? 'bg-amber-500 text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Closing
              </button>
            </div>
          </div>
          <CardDescription className="text-[10px] font-bold uppercase italic">
            Manager/Owner only. Fix the {mode} cash drawer amount for a day. Every change is logged in Security Audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Shop</label>
            <select
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-bold"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-900 border-slate-800 font-bold"
              max={new Date().toLocaleDateString('en-CA')}
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <div className="space-y-1">
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] font-black uppercase">
              <ShieldCheck className="h-3 w-3 mr-2" /> Controlled Change
            </Badge>
            <div className="text-xs font-bold text-slate-300">{currentLabel}</div>
            {error ? <div className="text-[10px] font-black uppercase text-rose-400">{error}</div> : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Corrected Opening Amount</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="bg-slate-900 border-slate-800 font-mono font-black"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Reason (Optional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-slate-900 border-slate-800 font-bold"
              placeholder="e.g. staff forgot to update opening"
            />
          </div>
        </div>

        <Button
          disabled={loading || !shopId || !date || !newAmount}
          className="w-full h-12 bg-amber-600 hover:bg-amber-500 text-[10px] font-black uppercase italic tracking-widest"
          onClick={() => {
            setError("");
            startTransition(async () => {
              try {
                if (mode === 'opening') {
                  await updateCashDrawerOpening({
                    shopId,
                    dateYYYYMMDD: date,
                    newAmount: Number(newAmount),
                    reason,
                  });
                } else {
                  await updateCashDrawerClosing({
                    shopId,
                    dateYYYYMMDD: date,
                    newAmount: Number(newAmount),
                    reason,
                  });
                }
                const res = mode === 'opening' 
                  ? await getCashDrawerOpening(shopId, date)
                  : await getCashDrawerClosing(shopId, date);
                setCurrent(res?.entry || null);
                router.refresh();
                alert(`${mode === 'opening' ? 'Opening' : 'Closing'} balance updated and logged.`);
              } catch (e: any) {
                setError(e?.message || `Failed to update ${mode}`);
              }
            });
          }}
        >
          <Save className="mr-2 h-4 w-4" /> Apply Correction
        </Button>
        </CardContent>
      </Card>
    </div>
  );
}
