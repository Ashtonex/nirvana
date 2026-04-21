'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  Brain,
  Building2,
  CircleAlert,
  Database,
  Lock,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react';

type ClearanceState = 'checking' | 'granted' | 'denied';
type LogLevel = 'error' | 'warning' | 'info' | 'success';
type ShopStatus = 'online' | 'watch' | 'offline';

type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
};

type ControlRoomResponse = {
  success: boolean;
  generatedAt: string;
  owner: {
    email: string;
    clearance: string;
  };
  system: {
    supabase: boolean;
    localJsonReady: boolean;
    activeStaffCount: number;
    unreadMessagesCount: number;
    pendingStockRequestsCount: number;
  };
  money: {
    sales30d: number;
    expenses30d: number;
    profit30d: number;
    profitMargin: number;
    totalTrackedCash: number;
    drawerExpectedCash: number;
    operationsActualBalance: number;
    operationsComputedBalance: number;
    operationsDelta: number;
    investAvailable: number;
    overheadContributed30d: number;
    overheadPaid30d: number;
  };
  brain: {
    topShop: string;
    insight: string;
    revenueTrend: string;
    expenseTrend: string;
  };
  openingBalances: Record<'kipasa' | 'dubdub' | 'tradecenter', number>;
  shops: Array<{
    id: 'kipasa' | 'dubdub' | 'tradecenter';
    name: string;
    sales30d: number;
    expenses30d: number;
    expectedDrawerCash: number;
    openingBalance: number;
    activeStaff: number;
    lastSaleAt: string | null;
    lastLedgerAt: string | null;
    transactions7d: number;
    lowStockCount: number;
    zeroStockCount: number;
    deadStockCount: number;
    status: ShopStatus;
    issues: string[];
  }>;
  risks: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
  }>;
  forecasts: string[];
  recentTransactions: Array<{
    id: string;
    source: string;
    shopId: string | null;
    type: string | null;
    category: string | null;
    amount: number;
    when: string | null;
    description: string;
  }>;
  recentOperations: Array<{
    id: string;
    shopId: string | null;
    kind: string | null;
    amount: number;
    when: string | null;
    title: string;
    notes: string;
  }>;
};

type SaleForm = {
  shopId: 'kipasa' | 'dubdub' | 'tradecenter';
  clientName: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  date: string;
  employeeId: string;
};

type ExpenseForm = {
  shopId: 'kipasa' | 'dubdub' | 'tradecenter';
  category: string;
  amount: number;
  date: string;
  description: string;
  autoRoute: boolean;
};

const OWNER_EMAIL = 'flectere@dev.com';
const SHOPS = [
  { id: 'kipasa', name: 'Kipasa' },
  { id: 'dubdub', name: 'Dub Dub' },
  { id: 'tradecenter', name: 'Trade Center' },
] as const;

function currency(amount: number) {
  return `$${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function timeLabel(value: string | null) {
  if (!value) return 'No activity';
  return new Date(value).toLocaleString();
}

function statusTone(status: ShopStatus) {
  if (status === 'online') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'offline') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
}

function logTone(level: LogLevel) {
  if (level === 'success') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (level === 'error') return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
  if (level === 'warning') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-sky-500/30 bg-sky-500/10 text-sky-100';
}

function WindowCard({
  title,
  eyebrow,
  children,
  icon: Icon,
  className = "",
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  icon: typeof Brain;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-white/10 bg-slate-950/65 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl ${className}`}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-rose-400/80">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white">{title}</h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-200 shadow-inner">
          <Icon className="h-6 w-6 text-rose-400" />
        </div>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = 'text-white',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

export default function TheHandPage() {
  const [clearance, setClearance] = useState<ClearanceState>('checking');
  const [controlRoom, setControlRoom] = useState<ControlRoomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<'kipasa' | 'dubdub' | 'tradecenter', number>>({
    kipasa: 0,
    dubdub: 0,
    tradecenter: 0,
  });
  const [saleForm, setSaleForm] = useState<SaleForm>({
    shopId: 'kipasa',
    clientName: '',
    itemName: '',
    quantity: 1,
    unitPrice: 0,
    date: new Date().toISOString().split('T')[0],
    employeeId: 'SYSTEM',
  });
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({
    shopId: 'kipasa',
    category: 'rent',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    autoRoute: true,
  });

  const addLog = (level: LogLevel, message: string) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toLocaleTimeString(),
        level,
        message,
      },
      ...prev,
    ].slice(0, 60));
  };

  const loadControlRoom = useCallback(async (withAuditLog = false) => {
    setBusy(true);
    try {
      const response = await fetch('/api/hand/control-center', { cache: 'no-store', credentials: 'include' });
      if (response.status === 403) {
        setClearance('denied');
        throw new Error('Access denied. Level 5 clearance required.');
      }

      const result = (await response.json()) as ControlRoomResponse & { message?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load control center');
      }

      setControlRoom(result);
      setOpeningBalances(result.openingBalances);
      if (withAuditLog) {
        addLog('success', `System audit complete. ${result.risks.length} active warnings surfaced.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', message);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    async function boot() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
        const auth = await response.json();
        const email = String(auth?.user?.email || auth?.employee?.email || '').toLowerCase();

        if (email !== OWNER_EMAIL) {
          setClearance('denied');
          setLoading(false);
          return;
        }

        setClearance('granted');
        addLog('success', 'Level 5 clearance granted.');
        await loadControlRoom(true);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to validate clearance';
        addLog('error', message);
        setClearance('denied');
        setLoading(false);
      }
    }

    boot();
  }, [loadControlRoom]);

  const updateOpeningBalance = async (shop: 'kipasa' | 'dubdub' | 'tradecenter') => {
    if (!confirm(`ARE YOU SURE? This will override the historical opening balance for ${shop.toUpperCase()} at the source. This cannot be undone automatically.`)) {
      return;
    }
    try {
      const response = await fetch('/api/hand/update-opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shop, amount: Number(openingBalances[shop] || 0) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Failed to update ${shop}`);
      }
      addLog('success', `${shop} opening balance corrected to ${currency(openingBalances[shop])}.`);
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update opening balance';
      addLog('error', message);
    }
  };

  const handleRecordSale = async () => {
    if (!saleForm.clientName || !saleForm.itemName || saleForm.unitPrice <= 0) {
      addLog('warning', 'Past sale needs client, item, and valid price.');
      return;
    }

    if (!confirm(`POST PAST SALE? You are about to inject a ${currency(saleForm.quantity * saleForm.unitPrice * 1.155)} sale into the ledger for ${saleForm.shopId.toUpperCase()} on ${saleForm.date}. Continue?`)) {
      return;
    }

    try {
      const subtotal = saleForm.quantity * saleForm.unitPrice;
      const tax = subtotal * 0.155;
      const totalWithTax = subtotal + tax;

      const response = await fetch('/api/hand/add-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          shopId: saleForm.shopId,
          clientName: saleForm.clientName,
          itemName: saleForm.itemName,
          quantity: saleForm.quantity,
          unitPrice: saleForm.unitPrice,
          totalBeforeTax: subtotal,
          tax,
          totalWithTax,
          date: new Date(`${saleForm.date}T12:00:00Z`).toISOString(),
          employeeId: saleForm.employeeId,
          overwrite: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to record sale');
      }

      addLog('success', `Past sale posted to ${saleForm.shopId} for ${currency(totalWithTax)}.`);
      setSaleForm((prev) => ({
        ...prev,
        clientName: '',
        itemName: '',
        quantity: 1,
        unitPrice: 0,
      }));
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to record sale';
      addLog('error', message);
    }
  };

  const handleRecordExpense = async () => {
    if (expenseForm.amount <= 0) {
      addLog('warning', 'Past expense needs a valid amount.');
      return;
    }

    if (!confirm(`POST PAST EXPENSE? You are about to inject a ${currency(expenseForm.amount)} ${expenseForm.category} expense for ${expenseForm.shopId.toUpperCase()} on ${expenseForm.date}. Continue?`)) {
      return;
    }

    try {
      const response = await fetch('/api/hand/add-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          shopId: expenseForm.shopId,
          category: expenseForm.category,
          amount: expenseForm.amount,
          date: new Date(`${expenseForm.date}T12:00:00Z`).toISOString(),
          description: expenseForm.description,
          autoRoute: expenseForm.autoRoute,
          overwrite: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to record expense');
      }

      addLog('success', `Past expense posted: ${expenseForm.category} for ${currency(expenseForm.amount)}.`);
      setExpenseForm((prev) => ({
        ...prev,
        amount: 0,
        description: '',
      }));
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to record expense';
      addLog('error', message);
    }
  };

  const runBackupAction = async (mode: 'backup' | 'restore') => {
    try {
      setBackupBusy(true);
      const response = await fetch(`/api/hand/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Failed to ${mode}`);
      }

      addLog('success', mode === 'backup' ? 'Full backup completed.' : 'Restore completed.');
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Failed to ${mode}`;
      addLog('error', message);
    } finally {
      setBackupBusy(false);
    }
  };

  if (clearance === 'checking' || loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.22),_transparent_35%),linear-gradient(180deg,#020617,#0f172a)] p-8 text-white">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-white/10 bg-slate-950/60 p-10 text-center shadow-[0_35px_120px_rgba(0,0,0,0.45)]">
          <Lock className="mx-auto h-12 w-12 text-amber-300" />
          <h1 className="mt-6 text-4xl font-black">LEVEL 5 CLEARANCE CHECK</h1>
          <p className="mt-3 text-slate-400">Validating owner identity and loading The Hand control matrix.</p>
        </div>
      </div>
    );
  }

  if (clearance === 'denied') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(127,29,29,0.45),_transparent_35%),linear-gradient(180deg,#020617,#0f172a)] p-8 text-white">
        <div className="mx-auto max-w-5xl rounded-[32px] border border-rose-500/25 bg-slate-950/75 p-10 text-center shadow-[0_35px_120px_rgba(0,0,0,0.45)]">
          <ShieldAlert className="mx-auto h-14 w-14 text-rose-400" />
          <p className="mt-6 text-[11px] font-black uppercase tracking-[0.45em] text-rose-300">Access Denied</p>
          <h1 className="mt-4 text-5xl font-black">THE HAND REQUIRES LEVEL 5 CLEARANCE</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            This page is reserved for the owner account signed in as <span className="font-black text-white">{OWNER_EMAIL}</span>.
            Any other actor is blocked from command, audit, correction, and ledger override functions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.2),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_22%),linear-gradient(180deg,#020617,#0f172a)] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[32px] border border-white/10 bg-slate-950/60 p-6 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.45em] text-rose-300">The Hand</p>
              <h1 className="mt-3 text-4xl font-black md:text-6xl">God-Tier Command And Correction Layer</h1>
              <p className="mt-4 max-w-3xl text-base text-slate-300 md:text-lg">
                The Hand sees every shop, every drawer, every vault, every warning signal, and every correction path.
                It audits the system, predicts pressure, and lets you intervene from one page without surrendering precision.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={() => loadControlRoom(true)}
                disabled={busy}
                className="group relative overflow-hidden rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-left transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-2 text-rose-200">
                  <ShieldCheck className="h-4 w-4 transition-transform group-hover:scale-110" />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Run System Audit</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Sweep business units for live risk signals.</p>
              </button>
              <button
                onClick={() => loadControlRoom()}
                disabled={busy}
                className="group relative overflow-hidden rounded-2xl border border-sky-400/30 bg-sky-500/10 px-5 py-4 text-left transition-all hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-2 text-sky-200">
                  <RefreshCcw className={`h-4 w-4 transition-transform group-hover:rotate-180 ${busy ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Refresh Intelligence</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Sync latest balances and shop pulses.</p>
              </button>
              <button
                onClick={() => runBackupAction('backup')}
                disabled={backupBusy}
                className="group relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-left transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center gap-2 text-emerald-200">
                  <Database className={`h-4 w-4 ${backupBusy ? 'animate-pulse' : ''}`} />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Full Backup</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Secure current state to cloud vault.</p>
              </button>
              <button
                onClick={() => { if(confirm("FORCE SYSTEM SYNC?")) loadControlRoom(); }}
                className="group relative overflow-hidden rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-left transition-all hover:bg-amber-500/20"
              >
                <div className="flex items-center gap-2 text-amber-200">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Matrix Sync</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Force alignment across all storefronts.</p>
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <MetricCard
              label="Clearance"
              value={controlRoom?.owner.clearance || 'LEVEL_5'}
              hint={`Locked to ${OWNER_EMAIL}`}
              tone="text-rose-300"
            />
            <MetricCard
              label="Tracked Cash"
              value={currency(controlRoom?.money.totalTrackedCash || 0)}
              hint="Drawers + operations + invest"
              tone="text-emerald-300"
            />
            <MetricCard
              label="Profit 30D"
              value={currency(controlRoom?.money.profit30d || 0)}
              hint={`Margin ${(controlRoom?.money.profitMargin || 0).toFixed(1)}%`}
              tone={(controlRoom?.money.profit30d || 0) >= 0 ? 'text-sky-300' : 'text-rose-300'}
            />
            <MetricCard
              label="Top Shop"
              value={controlRoom?.brain.topShop || 'Unknown'}
              hint={controlRoom?.brain.insight || 'Awaiting analysis'}
              tone="text-amber-300"
            />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.75fr_1fr]">
          <div className="space-y-6">
            <WindowCard eyebrow="Threat Grid" title="Live Risks And Countermoves" icon={AlertTriangle}>
              <div className="grid gap-4 lg:grid-cols-2">
                {(controlRoom?.risks || []).length === 0 ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-100">
                    No active risks detected. The Hand has the field under control.
                  </div>
                ) : (
                  controlRoom?.risks.map((risk) => (
                    <div
                      key={`${risk.title}-${risk.message}`}
                      className={`rounded-2xl border p-4 ${
                        risk.severity === 'critical'
                          ? 'border-rose-500/30 bg-rose-500/10'
                          : risk.severity === 'warning'
                          ? 'border-amber-500/30 bg-amber-500/10'
                          : 'border-sky-500/30 bg-sky-500/10'
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">{risk.severity}</p>
                      <h3 className="mt-2 text-lg font-bold text-white">{risk.title}</h3>
                      <p className="mt-2 text-sm text-slate-200">{risk.message}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-slate-100">
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <p className="text-sm font-bold uppercase tracking-[0.22em]">Anticipation Engine</p>
                </div>
                <div className="mt-4 space-y-3">
                  {(controlRoom?.forecasts || []).map((forecast) => (
                    <div key={forecast} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
                      {forecast}
                    </div>
                  ))}
                </div>
              </div>
            </WindowCard>

            <WindowCard eyebrow="Shop Pulse" title="Storefront Health Windows" icon={Building2}>
              <div className="grid gap-4 xl:grid-cols-3">
                {controlRoom?.shops.map((shop) => (
                  <div key={shop.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-black text-white">{shop.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">Expected drawer {currency(shop.expectedDrawerCash)}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${statusTone(shop.status)}`}>
                        {shop.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-slate-500">Sales 30D</p>
                        <p className="mt-1 text-lg font-bold text-emerald-300">{currency(shop.sales30d)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-slate-500">Expenses 30D</p>
                        <p className="mt-1 text-lg font-bold text-rose-300">{currency(shop.expenses30d)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-slate-500">Live Staff</p>
                        <p className="mt-1 text-lg font-bold text-sky-300">{shop.activeStaff}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-slate-500">Tx 7D</p>
                        <p className="mt-1 text-lg font-bold text-white">{shop.transactions7d}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
                      <p>Last sale: {timeLabel(shop.lastSaleAt)}</p>
                      <p>Last ledger move: {timeLabel(shop.lastLedgerAt)}</p>
                      <p>Low stock: {shop.lowStockCount} | Zero stock: {shop.zeroStockCount} | Dead stock: {shop.deadStockCount}</p>
                    </div>

                    <div className="mt-4 space-y-2">
                      {shop.issues.length === 0 ? (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                          No direct faults detected in this shop window.
                        </div>
                      ) : (
                        shop.issues.map((issue) => (
                          <div key={issue} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                            {issue}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </WindowCard>

            <WindowCard eyebrow="Vault And Brain" title="Operations, Money Brain, And Ledger Discipline" icon={Brain}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <MetricCard
                      label="Overheads Gathered"
                      value={currency(controlRoom?.money.overheadContributed30d || 0)}
                      hint="Positive ops contributions in the last 30 days"
                      tone="text-emerald-300"
                    />
                    <MetricCard
                      label="Overheads Paid"
                      value={currency(controlRoom?.money.overheadPaid30d || 0)}
                      hint="Actual vault drawdowns for overhead pressure"
                      tone="text-rose-300"
                    />
                    <MetricCard
                      label="Operations Vault"
                      value={currency(controlRoom?.money.operationsActualBalance || 0)}
                      hint={`Computed ${currency(controlRoom?.money.operationsComputedBalance || 0)}`}
                      tone="text-sky-300"
                    />
                    <MetricCard
                      label="Invest Reserve"
                      value={currency(controlRoom?.money.investAvailable || 0)}
                      hint="Withdrawable perfume capital still in play"
                      tone="text-violet-300"
                    />
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Money Brain</p>
                    <p className="mt-3 text-lg font-semibold text-white">{controlRoom?.brain.insight}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300">
                        Revenue trend: <span className="font-bold text-white">{controlRoom?.brain.revenueTrend}</span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300">
                        Expense trend: <span className="font-bold text-white">{controlRoom?.brain.expenseTrend}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-slate-100">
                    <Wallet className="h-4 w-4 text-emerald-300" />
                    <p className="text-sm font-bold uppercase tracking-[0.22em]">Recent Operations</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(controlRoom?.recentOperations || []).map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{entry.title}</p>
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{entry.shopId || 'global'} • {entry.kind || 'operation'}</p>
                          </div>
                          <p className={`text-lg font-black ${entry.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {currency(entry.amount)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{entry.notes || 'No notes attached.'}</p>
                        <p className="mt-2 text-xs text-slate-500">{timeLabel(entry.when)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </WindowCard>

            <WindowCard eyebrow="Correction Layer" title="Opening Balance Override And Ledger Recovery" icon={Wrench}>
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-100">Opening Balances</p>
                  <div className="mt-4 space-y-3">
                    {SHOPS.map((shop) => (
                      <div key={shop.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-lg font-bold text-white">{shop.name}</p>
                            <p className="text-sm text-slate-400">Fix opening balance at the source and force the dashboard to respect it.</p>
                          </div>
                          <div className="flex w-full gap-2 md:w-auto">
                            <input
                              type="number"
                              value={openingBalances[shop.id]}
                              onChange={(event) =>
                                setOpeningBalances((prev) => ({
                                  ...prev,
                                  [shop.id]: Number(event.target.value || 0),
                                }))
                              }
                              className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-400/50 md:w-44"
                            />
                            <button
                              onClick={() => updateOpeningBalance(shop.id)}
                              className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 font-bold text-sky-200 transition hover:bg-sky-500/20"
                            >
                              Commit
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-100">Record Past Sale</p>
                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={saleForm.shopId}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, shopId: event.target.value as SaleForm['shopId'] }))}
                          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        >
                          {SHOPS.map((shop) => (
                            <option key={shop.id} value={shop.id}>{shop.name}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={saleForm.date}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Client name"
                        value={saleForm.clientName}
                        onChange={(event) => setSaleForm((prev) => ({ ...prev, clientName: event.target.value }))}
                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Item name"
                        value={saleForm.itemName}
                        onChange={(event) => setSaleForm((prev) => ({ ...prev, itemName: event.target.value }))}
                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                      />
                      <div className="grid gap-3 md:grid-cols-3">
                        <input
                          type="number"
                          placeholder="Qty"
                          value={saleForm.quantity}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, quantity: Number(event.target.value || 0) }))}
                          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        />
                        <input
                          type="number"
                          placeholder="Unit price"
                          value={saleForm.unitPrice}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, unitPrice: Number(event.target.value || 0) }))}
                          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        />
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200">Projected Total</p>
                          <p className="mt-1 text-xl font-black text-white">
                            {currency(saleForm.quantity * saleForm.unitPrice * 1.155)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleRecordSale}
                        className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 font-bold text-emerald-200 transition hover:bg-emerald-500/20"
                      >
                        Post Past Sale To Proper Ledgers
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-100">Record Past Expense</p>
                    <div className="mt-4 grid gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={expenseForm.shopId}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, shopId: event.target.value as ExpenseForm['shopId'] }))}
                          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        >
                          {SHOPS.map((shop) => (
                            <option key={shop.id} value={shop.id}>{shop.name}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={expenseForm.date}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                        />
                      </div>
                      <select
                        value={expenseForm.category}
                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                      >
                        <option value="rent">Rent contribution</option>
                        <option value="salaries">Salaries contribution</option>
                        <option value="utilities">Utilities</option>
                        <option value="perfume">Perfume / Invest</option>
                        <option value="groceries">Groceries</option>
                        <option value="supplies">Supplies</option>
                        <option value="misc">Miscellaneous</option>
                      </select>
                      <input
                        type="number"
                        placeholder="Amount"
                        value={expenseForm.amount}
                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={expenseForm.description}
                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none"
                      />
                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={expenseForm.autoRoute}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, autoRoute: event.target.checked }))}
                        />
                        Auto-route this expense into Operations or Invest when the category calls for it.
                      </label>
                      <button
                        onClick={handleRecordExpense}
                        className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 font-bold text-amber-100 transition hover:bg-amber-500/20"
                      >
                        Post Past Expense To Proper Ledgers
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </WindowCard>

            <WindowCard eyebrow="Transaction Sight" title="Recent Ledger Movement" icon={BadgeDollarSign}>
              <div className="space-y-3">
                {(controlRoom?.recentTransactions || []).map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">{entry.description}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                        {entry.shopId || 'global'} • {entry.category || entry.type || 'entry'} • {timeLabel(entry.when)}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className={`text-2xl font-black ${entry.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {currency(entry.amount)}
                      </p>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{entry.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </WindowCard>
          </div>

          <div className="space-y-6">
            <WindowCard eyebrow="Control Integrity" title="System Status And Recovery" icon={Database}>
              <div className="grid gap-4">
                <MetricCard
                  label="Supabase"
                  value={controlRoom?.system.supabase ? 'ONLINE' : 'FAULT'}
                  hint="Primary data plane"
                  tone={controlRoom?.system.supabase ? 'text-emerald-300' : 'text-rose-300'}
                />
                <MetricCard
                  label="Local JSON"
                  value={controlRoom?.system.localJsonReady ? 'READY' : 'MISSING'}
                  hint="Secondary backup plane"
                  tone={controlRoom?.system.localJsonReady ? 'text-sky-300' : 'text-amber-300'}
                />
                <MetricCard
                  label="Active Staff"
                  value={String(controlRoom?.system.activeStaffCount || 0)}
                  hint={`${controlRoom?.system.unreadMessagesCount || 0} unread messages`}
                  tone="text-white"
                />
                <MetricCard
                  label="Pending Requests"
                  value={String(controlRoom?.system.pendingStockRequestsCount || 0)}
                  hint="Unresolved stock pressure"
                  tone="text-amber-300"
                />
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => runBackupAction('backup')}
                  disabled={backupBusy}
                  className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-left font-bold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Full Backup Snapshot
                </button>
                <button
                  onClick={() => runBackupAction('restore')}
                  disabled={backupBusy}
                  className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-left font-bold text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Restore From Backup
                </button>
              </div>
            </WindowCard>

            <WindowCard eyebrow="Operator Feed" title="Merciless Event Log" icon={CircleAlert}>
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                    The Hand is quiet for now.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className={`rounded-2xl border p-3 text-sm ${logTone(log.level)}`}>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-80">
                        {log.timestamp} • {log.level}
                      </p>
                      <p className="mt-2">{log.message}</p>
                    </div>
                  ))
                )}
              </div>
            </WindowCard>

            <WindowCard eyebrow="Doctrine" title="What The Hand Is Watching" icon={ArrowUpRight}>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  Shops that go silent, lose staff presence, or stop selling are treated as threat signals.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  Overhead contributions and actual overhead payments are separated so the vault does not lie.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  Opening balances, past sales, and past expenses can be corrected here so downstream dashboards reflect reality.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  Any user who is not <span className="font-black text-white">{OWNER_EMAIL}</span> gets locked out. No shared admin shortcuts. No soft bypasses.
                </div>
              </div>
            </WindowCard>
          </div>
        </div>
      </div>
    </div>
  );
}
