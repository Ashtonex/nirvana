"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";
import { Coins, TrendingUp, AlertTriangle, ShieldCheck, Wallet, ArrowDownRight, ArrowUpRight, BarChart3, RefreshCcw, Activity, ArrowRightLeft } from "lucide-react";

export function InvestConsole({ shopId }: { shopId?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  
  const [newDeposit, setNewDeposit] = useState({
    shopId: shopId || "",
    amount: "",
  });
  
  const [withdrawShopId, setWithdrawShopId] = useState<string>(shopId || "");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawTitle, setWithdrawTitle] = useState<string>("");

  const refreshDeposits = async () => {
    const url = `/api/invest/deposits${shopId ? `?shopId=${encodeURIComponent(shopId)}` : ""}`;
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setDeposits(Array.isArray(data.deposits) ? data.deposits : []);
  };

  const refreshShops = async () => {
    const res = await fetch("/api/shops", { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.shops)) setShops(data.shops);
  };

  const fetchAnalytics = async () => {
    const res = await fetch("/api/analytics?kind=capital_allocation", { cache: "no-store", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.result?.payload) {
      setAnalytics(data.result.payload);
    }
  };

  useEffect(() => {
    refreshDeposits();
    refreshShops();
    fetchAnalytics();
  }, [shopId]);

  const addDeposit = async () => {
    setBusy(true);
    try {
      const amount = Number(newDeposit.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
      const targetShopId = shopId || newDeposit.shopId;
      if (!targetShopId) throw new Error("Shop required");
      
      const res = await fetch("/api/invest/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shopId: targetShopId,
          amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to add deposit");
      setNewDeposit((s) => ({ ...s, amount: "" }));
      await refreshDeposits();
      await fetchAnalytics();
    } catch (e: any) {
      alert(e.message || "Failed to add deposit");
    } finally {
      setBusy(false);
    }
  };

  const withdrawFromDeposit = async () => {
    setBusy(true);
    try {
      const amount = Number(withdrawAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
      const targetShopId = shopId || withdrawShopId;
      if (!targetShopId) throw new Error("Select a shop first");
      
      const res = await fetch("/api/invest/deposits/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount,
          title: withdrawTitle,
          shopId: targetShopId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to withdraw");
      setWithdrawAmount("");
      setWithdrawTitle("");
      await refreshDeposits();
      await fetchAnalytics();
    } catch (e: any) {
      alert(e.message || "Failed to withdraw");
    } finally {
      setBusy(false);
    }
  };

  const totalDeposits = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalWithdrawn = deposits.reduce((sum, d) => sum + Number(d.withdrawn_amount || 0), 0);
  const totalAvailable = totalDeposits - totalWithdrawn;

  const shopTotals = useMemo(() => {
    const byShop: Record<string, { total: number; withdrawn: number; available: number }> = {};
    deposits.forEach((d) => {
      const shop = d.shop_id || "unknown";
      if (!byShop[shop]) byShop[shop] = { total: 0, withdrawn: 0, available: 0 };
      byShop[shop].total += Number(d.amount || 0);
      byShop[shop].withdrawn += Number(d.withdrawn_amount || 0);
      byShop[shop].available += (Number(d.amount || 0) - Number(d.withdrawn_amount || 0));
    });
    return byShop;
  }, [deposits]);

  const selectedShopBalance = useMemo(() => {
    const target = shopId || withdrawShopId;
    if (!target) return 0;
    return shopTotals[target]?.available || 0;
  }, [shopTotals, shopId, withdrawShopId]);

  // Filter shop options to Kipasa and DubDub since they are the only ones depositing
  const allowedShops = shops.filter(s => s.id === "kipasa" || s.id === "dubdub");

  // Get investment specific optimization metrics
  const investOpt = useMemo(() => {
    if (!analytics) return null;
    const currentWeight = (analytics.current_weights?.invest || 0) * 100;
    const targetWeight = (analytics.target_weights?.invest || 0) * 100;
    const rebalance = analytics.rebalance?.invest || 0;
    const targetAmt = analytics.target_amounts?.invest || 0;
    const currentAmt = analytics.current_amounts?.invest || 0;
    
    return {
      currentWeight,
      targetWeight,
      rebalance,
      targetAmt,
      currentAmt,
      expectedReturn: (analytics.portfolio?.expected_return_annualized || 0) * 100,
      risk: (analytics.portfolio?.risk_annualized || 0) * 100,
      backend: analytics.backend || "SciPy SLSQP"
    };
  }, [analytics]);

  return (
    <div className="space-y-6">
      {/* Interconnect Banner */}
      <Link href="/operations" className="block">
        <div className="group relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-teal-950/40 to-slate-950/40 p-5 transition-all duration-300 hover:border-emerald-400/60 hover:shadow-[0_0_30px_rgba(52,211,153,0.15)] hover:-translate-y-0.5">
          <div className="absolute inset-0 bg-emerald-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-500/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 blur-xl" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)] transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-500/20">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-wider text-emerald-400 group-hover:text-emerald-300 transition-colors">
                  Operations Master Vault
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                  Return to Main Cash Pool & Ledger
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-400 opacity-80 transition-opacity group-hover:opacity-100">
              Go to Operations <ArrowRightLeft className="h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>

      {/* Metrics Row */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-400">Total Deposits</CardTitle>
            <Coins className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">${totalDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[9px] text-slate-500 uppercase font-black mt-1">Cumulative perfume capital</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-400">Total Withdrawn</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-white">${totalWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[9px] text-slate-500 uppercase font-black mt-1">Perfume capital withdrawals</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-950/60 border-slate-800 border-sky-950 shadow-[0_0_20px_rgba(14,165,233,0.05)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-sky-400">Available Balance</CardTitle>
            <Wallet className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black italic text-sky-400">${totalAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[9px] text-sky-500 uppercase font-black mt-1">Net pool balance ready for reinvestment</p>
          </CardContent>
        </Card>
      </div>

      {/* Quantitative Optimization Layer */}
      {investOpt && (
        <Card className="bg-gradient-to-br from-slate-950/80 to-slate-900/40 border-violet-500/20 shadow-[0_10px_30px_rgba(139,92,246,0.05)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/5 blur-[60px] rounded-full" />
          <CardHeader className="pb-3 border-b border-slate-800/40">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-violet-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Portfolio Allocation Engine
                </span>
                <CardTitle className="text-lg font-black uppercase italic text-white mt-1">Capital Optimizer Analysis</CardTitle>
                <CardDescription className="text-[10px] text-slate-400">
                  SciPy SLSQP constrained operating-pool allocation models for business expansion.
                </CardDescription>
              </div>
              <Badge className="bg-violet-600/10 border-violet-500/20 text-violet-400 font-bold uppercase text-[9px]">{investOpt.backend}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 grid gap-4 grid-cols-1 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Invest Pool Target Weight</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white">{investOpt.targetWeight.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-400 font-bold">vs {investOpt.currentWeight.toFixed(1)}% current</span>
              </div>
              <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-violet-500" style={{ width: `${investOpt.targetWeight}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Portfolio Projections (Annualized)</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 font-bold">Expected Return: </span>
                  <span className="font-mono text-emerald-400 font-black">+{investOpt.expectedReturn.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold">Model Risk: </span>
                  <span className="font-mono text-rose-400 font-black">{investOpt.risk.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Optimizer Advisory</div>
              <div className="flex items-center gap-2">
                {investOpt.rebalance > 0 ? (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <ArrowUpRight className="w-4 h-4" /> Add ${investOpt.rebalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                ) : investOpt.rebalance < 0 ? (
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                    <ArrowDownRight className="w-4 h-4" /> Reduce ${Math.abs(investOpt.rebalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-slate-400">Balance Optimal</span>
                )}
                <span className="text-[9px] text-slate-500">Target balance: ${investOpt.targetAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main UI Split */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Left Side: Shop Breakdown & History */}
        <div className="space-y-6">
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-md font-black uppercase italic">Shop Capital Pools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(shopTotals).map(([shop, data]) => {
                if (shopId && shop !== shopId) return null;
                return (
                  <div key={shop} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg border border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                      <div>
                        <div className="text-xs font-black text-white uppercase">{shop}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">
                          Deposited: ${data.total.toFixed(2)} • Withdrawn: ${data.withdrawn.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-md font-black italic text-sky-400">${data.available.toFixed(2)}</div>
                      <div className="text-[9px] text-slate-500 font-black uppercase mt-0.5">Available</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-md font-black uppercase italic">Investment Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
              {deposits.length === 0 ? (
                <div className="text-center py-6 text-[10px] font-black text-slate-600 uppercase italic">No deposits yet.</div>
              ) : (
                deposits.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/20 border border-slate-800/60">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                        {d.shop_id} • {new Date(d.deposited_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs font-black text-white">
                        ${Number(d.amount).toFixed(2)} deposited
                        {Number(d.withdrawn_amount) > 0 && (
                          <span className="text-rose-400 ml-2">- ${Number(d.withdrawn_amount).toFixed(2)} withdrawn</span>
                        )}
                      </div>
                      {d.withdraw_title && (
                        <div className="text-[9px] text-slate-500 italic">Withdrawal Notes: {d.withdraw_title}</div>
                      )}
                    </div>
                    <Badge className={
                      d.status === 'withdrawn' ? "bg-slate-800 text-slate-400 border-slate-700 text-[8px] font-black uppercase" :
                      d.status === 'partial' ? "bg-amber-500/10 text-amber-400 border-amber-500/20 text-[8px] font-black uppercase" :
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] font-black uppercase"
                    }>
                      {d.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Actions (Deposit & Withdraw) */}
        <div className="space-y-6">
          {/* Record Deposit */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-md font-black uppercase italic">Record Perfume Deposit</CardTitle>
              <CardDescription className="text-[10px] font-bold text-slate-400">
                Register manual capital deposits directly into the perfume account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                {!shopId && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Target Shop</label>
                    <select
                      value={newDeposit.shopId}
                      onChange={(e) => setNewDeposit((s) => ({ ...s, shopId: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-md mt-1 text-xs font-bold"
                    >
                      <option value="">Select Shop</option>
                      {allowedShops.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Deposit Amount (USD)</label>
                  <Input 
                    value={newDeposit.amount} 
                    onChange={(e) => setNewDeposit((s) => ({ ...s, amount: e.target.value }))} 
                    className="bg-slate-950 border-slate-800 font-mono text-white text-xs mt-1" 
                    placeholder="e.g. 500.00" 
                    type="number"
                    step="0.01"
                  />
                </div>
                <Button 
                  disabled={busy || (!shopId && !newDeposit.shopId) || !newDeposit.amount} 
                  onClick={addDeposit} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase italic text-xs h-10 mt-2"
                >
                  Record Deposit
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Record Withdrawal */}
          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader>
              <CardTitle className="text-md font-black uppercase italic">Record Withdrawal / Deduction</CardTitle>
              <CardDescription className="text-[10px] font-bold text-slate-400">
                Draw down capital from the shop&apos;s perfume pool.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                {!shopId && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Source Shop</label>
                    <select
                      value={withdrawShopId}
                      onChange={(e) => setWithdrawShopId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-white px-3 py-2 rounded-md mt-1 text-xs font-bold"
                    >
                      <option value="">Select Shop</option>
                      {allowedShops.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="p-3 border border-sky-950 bg-sky-950/15 rounded-lg flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-sky-400">Shop Pool Available</span>
                  <span className="text-md font-mono font-black italic text-sky-400">${selectedShopBalance.toFixed(2)}</span>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Withdrawal Amount (USD)</label>
                  <Input 
                    value={withdrawAmount} 
                    onChange={(e) => setWithdrawAmount(e.target.value)} 
                    className="bg-slate-950 border-slate-800 font-mono text-white text-xs mt-1" 
                    placeholder="e.g. 200.00" 
                    type="number"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Purpose / Description</label>
                  <Input 
                    value={withdrawTitle} 
                    onChange={(e) => setWithdrawTitle(e.target.value)} 
                    className="bg-slate-950 border-slate-800 text-white text-xs mt-1" 
                    placeholder="e.g. Reinvesting in stock / perfume acquisition" 
                  />
                </div>

                <Button 
                  disabled={busy || (!shopId && !withdrawShopId) || !withdrawAmount || Number(withdrawAmount) > selectedShopBalance} 
                  onClick={withdrawFromDeposit} 
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black uppercase italic text-xs h-10 mt-2"
                >
                  Withdraw Capital
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
