'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
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

import { MonthlyPerformanceTracker } from '@/components/MonthlyPerformanceTracker';
import { InventoryHealth } from '@/components/InventoryHealth';
import { cn } from '@/lib/utils';

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

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
  { id: 'inventory', label: 'Inventory', icon: ShieldCheck },
  { id: 'logs', label: 'Audit Logs', icon: Brain },
] as const;

export default function TheHandPage() {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('overview');
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

  const [pastOpeningForm, setPastOpeningForm] = useState({
    shopId: 'kipasa' as SaleForm['shopId'],
    date: new Date().toISOString().split('T')[0],
    amount: 0,
  });

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

  const handleRecordPastOpening = async () => {
    if (pastOpeningForm.amount < 0) {
      addLog('warning', 'Opening balance cannot be negative.');
      return;
    }

    if (!confirm(`OVERRIDE PAST OPENING? You are about to inject or update a ${currency(pastOpeningForm.amount)} opening balance for ${pastOpeningForm.shopId.toUpperCase()} on ${pastOpeningForm.date}. This will directly affect audit variances for that day and subsequent ones. Continue?`)) {
      return;
    }

    try {
      const response = await fetch('/api/hand/update-opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          shop: pastOpeningForm.shopId, 
          amount: pastOpeningForm.amount,
          date: new Date(`${pastOpeningForm.date}T12:00:00Z`).toISOString(),
          isPast: true 
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to record past opening');
      }

      addLog('success', `Past opening balance for ${pastOpeningForm.shopId} on ${pastOpeningForm.date} set to ${currency(pastOpeningForm.amount)}.`);
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to record past opening';
      addLog('error', message);
    }
  };

  const handleRecordSale = async () => {
    if (!saleForm.clientName || !saleForm.itemName || saleForm.unitPrice <= 0) {
      addLog('warning', 'Past sale needs client, item, and valid price.');
      return;
    }

    if (!confirm(`POST PAST SALE? You are about to inject a ${currency(saleForm.quantity * saleForm.unitPrice)} sale into the ledger for ${saleForm.shopId.toUpperCase()} on ${saleForm.date}. Continue?`)) {
      return;
    }

    try {
      const totalAmount = saleForm.quantity * saleForm.unitPrice;
      const tax = 0; // Hand overrides should be direct amounts unless user wants tax added

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
          totalBeforeTax: totalAmount,
          tax,
          totalWithTax: totalAmount,
          date: new Date(`${saleForm.date}T12:00:00Z`).toISOString(),
          employeeId: saleForm.employeeId,
          overwrite: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to record sale');
      }

      addLog('success', `Past sale posted to ${saleForm.shopId} for ${currency(totalAmount)}.`);
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.15),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_22%),linear-gradient(180deg,#020617,#0f172a)] p-4 text-white md:p-6">
      <div className="mx-auto w-full max-w-[1800px] space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between px-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.45em] text-rose-300">The Hand</p>
            <h1 className="mt-3 text-4xl font-black md:text-5xl lg:text-6xl tracking-tighter">God-Tier Command Layer</h1>
            <p className="mt-4 max-w-3xl text-sm md:text-base text-slate-400">
              The Hand sees every shop, every drawer, every vault, every warning signal, and every correction path.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => loadControlRoom(true)}
              disabled={busy}
              className="group relative overflow-hidden rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-left transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-rose-200">
                <ShieldCheck className="h-4 w-4 transition-transform group-hover:scale-110" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">System Audit</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Sweep for live risks.</p>
            </button>
            <button
              onClick={() => loadControlRoom()}
              disabled={busy}
              className="group relative overflow-hidden rounded-2xl border border-sky-400/30 bg-sky-500/10 px-5 py-4 text-left transition-all hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-sky-200">
                <RefreshCcw className={`h-4 w-4 transition-transform group-hover:rotate-180 ${busy ? 'animate-spin' : ''}`} />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Sync Intelligence</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Refresh all matrices.</p>
            </button>
            <button
              onClick={() => runBackupAction('backup')}
              disabled={backupBusy}
              className="group relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-left transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-emerald-200">
                <Database className={`h-4 w-4 ${backupBusy ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Cloud Backup</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Secure current state.</p>
            </button>
            <button
              onClick={() => { if (confirm("FORCE SYSTEM SYNC?")) loadControlRoom(); }}
              className="group relative overflow-hidden rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-left transition-all hover:bg-amber-500/20"
            >
              <div className="flex items-center gap-2 text-amber-200">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Matrix Sync</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Align storefronts.</p>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-2 mt-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border",
                activeTab === tab.id
                  ? "bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/20"
                  : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="grid gap-4 md:grid-cols-4 px-2">
              <MetricCard
                label="Clearance"
                value={controlRoom?.owner.clearance || 'LEVEL_5'}
                hint={`Locked to ${OWNER_EMAIL}`}
                tone="text-rose-300"
              />
              <MetricCard
                label="Tracked Cash"
                value={currency(controlRoom?.money.totalTrackedCash || 0)}
                hint="Drawers + vault + invest"
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

            <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
              <div className="space-y-6">
                <WindowCard eyebrow="Shop Pulse" title="Storefront Health Windows" icon={Building2}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {controlRoom?.shops.map((shop) => (
                      <div key={shop.id} className="rounded-3xl border border-white/10 bg-slate-900/40 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-black text-white">{shop.name}</h3>
                            <p className="mt-1 text-xs text-slate-500 uppercase tracking-widest font-bold">Expected drawer {currency(shop.expectedDrawerCash)}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${statusTone(shop.status)}`}>
                            {shop.status}
                          </span>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                            <p className="text-[10px] uppercase font-bold text-slate-500">Sales 30D</p>
                            <p className="mt-1 text-lg font-black text-emerald-300">{currency(shop.sales30d)}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                            <p className="text-[10px] uppercase font-bold text-slate-500">Expenses 30D</p>
                            <p className="mt-1 text-lg font-black text-rose-300">{currency(shop.expenses30d)}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400 font-mono">
                          <p>Last sale: {timeLabel(shop.lastSaleAt)}</p>
                          <p>Tx 7D: {shop.transactions7d}</p>
                          <p>Stock: {shop.lowStockCount} Low | {shop.zeroStockCount} Zero</p>
                        </div>

                        <div className="mt-4 space-y-2">
                          {shop.issues.map((issue) => (
                            <div key={issue} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/80">
                              {issue}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </WindowCard>

                <WindowCard eyebrow="Correction Layer" title="Manual Overrides" icon={Wrench}>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 mb-4">Opening Balances</p>
                      <div className="space-y-3">
                        {SHOPS.map((shop) => (
                          <div key={shop.id} className="flex flex-col gap-2">
                            <label className="text-[10px] font-black uppercase text-slate-400">{shop.name}</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={openingBalances[shop.id]}
                                onChange={(event) =>
                                  setOpeningBalances((prev) => ({
                                    ...prev,
                                    [shop.id]: Number(event.target.value || 0),
                                  }))
                                }
                                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                              />
                              <button
                                onClick={() => updateOpeningBalance(shop.id)}
                                className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-200 hover:bg-sky-500/20"
                              >
                                Set
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 mb-4">Past Opening Override</p>
                      <div className="space-y-3">
                        <select
                          value={pastOpeningForm.shopId}
                          onChange={(event) => setPastOpeningForm((prev) => ({ ...prev, shopId: event.target.value as SaleForm['shopId'] }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        >
                          {SHOPS.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                        </select>
                        <input
                          type="date"
                          value={pastOpeningForm.date}
                          onChange={(event) => setPastOpeningForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <input
                          type="number"
                          placeholder="Amount"
                          value={pastOpeningForm.amount}
                          onChange={(event) => setPastOpeningForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                        />
                        <button
                          onClick={handleRecordPastOpening}
                          className="w-full rounded-xl border border-sky-400/30 bg-sky-500/10 py-3 text-xs font-black uppercase tracking-widest text-sky-200 hover:bg-sky-500/20"
                        >
                          Set Past Opening
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 mb-4">Past Sale Injection</p>
                      <div className="space-y-3">
                        <select
                          value={saleForm.shopId}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, shopId: event.target.value as SaleForm['shopId'] }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        >
                          {SHOPS.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                        </select>
                        <input
                          type="date"
                          value={saleForm.date}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <input
                          type="text"
                          placeholder="Client"
                          value={saleForm.clientName}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, clientName: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <input
                          type="text"
                          placeholder="Item"
                          value={saleForm.itemName}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, itemName: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Qty"
                            value={saleForm.quantity}
                            onChange={(event) => setSaleForm((prev) => ({ ...prev, quantity: Number(event.target.value || 0) }))}
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            value={saleForm.unitPrice}
                            onChange={(event) => setSaleForm((prev) => ({ ...prev, unitPrice: Number(event.target.value || 0) }))}
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                          />
                        </div>
                        <button
                          onClick={handleRecordSale}
                          className="w-full rounded-xl border border-emerald-400/30 bg-emerald-500/10 py-3 text-xs font-black uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/20"
                        >
                          Post Sale
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 mb-4">Past Expense Injection</p>
                      <div className="space-y-3">
                        <select
                          value={expenseForm.shopId}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, shopId: event.target.value as ExpenseForm['shopId'] }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        >
                          {SHOPS.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                        </select>
                        <input
                          type="date"
                          value={expenseForm.date}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, date: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <select
                          value={expenseForm.category}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        >
                          <option value="rent">Rent</option>
                          <option value="salaries">Salaries</option>
                          <option value="utilities">Utilities</option>
                          <option value="stock">Stock</option>
                          <option value="misc">Miscellaneous</option>
                        </select>
                        <input
                          type="number"
                          placeholder="Amount"
                          value={expenseForm.amount}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: Number(event.target.value || 0) }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <input
                          type="text"
                          placeholder="Description"
                          value={expenseForm.description}
                          onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                        />
                        <button
                          onClick={handleRecordExpense}
                          className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 py-3 text-xs font-black uppercase tracking-widest text-rose-200 hover:bg-rose-500/20"
                        >
                          Post Expense
                        </button>
                      </div>
                    </div>
                  </div>
                </WindowCard>
              </div>

              <div className="space-y-6">
                <WindowCard eyebrow="Threat Grid" title="Live Risks" icon={AlertTriangle}>
                  <div className="space-y-3">
                    {(controlRoom?.risks || []).map((risk, idx) => (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-4 ${risk.severity === 'critical' ? 'border-rose-500/30 bg-rose-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}
                      >
                        <h3 className="text-sm font-black text-white">{risk.title}</h3>
                        <p className="mt-1 text-xs text-slate-400">{risk.message}</p>
                      </div>
                    ))}
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
            </div>
          </>
        )}

        {/* Monthly Performance Tracker Tab */}
        {activeTab === 'performance' && (
          <div className="mt-6 space-y-6">
            <MonthlyPerformanceTracker />
          </div>
        )}

        {/* Inventory Health Tab */}
        {activeTab === 'inventory' && (
          <div className="mt-6 space-y-6">
            <InventoryHealth />
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="grid gap-6 xl:grid-cols-[1fr_400px] mt-6">
            <div className="space-y-6">
              <WindowCard eyebrow="Audit Log" title="System Logs" icon={Brain}>
                <div className="h-[600px] overflow-y-auto space-y-2 pr-2 font-mono text-[10px]">
                  {logs.map((log) => (
                    <div key={log.id} className={`rounded-lg border p-2 ${logTone(log.level)}`}>
                      <span className="opacity-50">[{log.timestamp}]</span> {log.message}
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
                </div>

                <div className="mt-5 grid gap-3">
                  <button
                    onClick={() => runBackupAction('backup')}
                    disabled={backupBusy}
                    className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-left font-bold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Full Backup Snapshot
                  </button>
                </div>
              </WindowCard>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
