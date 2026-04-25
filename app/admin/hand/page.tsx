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
import { ExpenseCategorisation } from '@/components/ExpenseCategorisation';
import { cn } from '@/lib/utils';
import { updateCashDrawerClosing } from '@/app/actions';

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
  drifts: Array<{
    id: string;
    amount: number;
    reason: string;
    resolved_kind: string | null;
    resolved_shop: string | null;
    created_at: string;
  }>;
  settings: {
    taxRate: number;
    taxThreshold: number;
    taxMode: string;
    zombieDays: number;
    currencySymbol: string;
  };
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
  { id: 'expenses', label: 'Expense Categorisation', icon: BadgeDollarSign },
  { id: 'inventory', label: 'Inventory', icon: ShieldCheck },
  { id: 'logs', label: 'Audit Logs', icon: Brain },
  { id: 'rationalisation', label: 'Rationalisation', icon: AlertTriangle },
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
  const [intelForm, setIntelForm] = useState({
    taxRate: 15.5,
    taxThreshold: 100,
    zombieDays: 60,
  });
  const [newAmount, setNewAmount] = useState<string>("");

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
      setIntelForm({
        taxRate: Number(result.settings.taxRate) * 100,
        taxThreshold: result.settings.taxThreshold,
        zombieDays: result.settings.zombieDays,
      });
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

  const handleRationalize = async () => {
    if (!confirm('RESET VARIANCE TO ZERO? This will pull your Actual Vault Balance to perfectly align with the Computed Ledger. The current discrepancy will be logged as a permanent drift traceback. Continue?')) {
      return;
    }

    try {
      setBusy(true);
      const response = await fetch('/api/hand/rationalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to rationalize variance');
      }

      addLog('success', result.message || 'Variance reset completed successfully.');
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to rationalize variance';
      addLog('error', message);
    } finally {
      setBusy(false);
    }
  };
  
  const handleUpdateIntelligence = async () => {
    try {
      setBusy(true);
      const response = await fetch('/api/hand/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(intelForm),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update settings');
      }
      addLog('success', 'Global intelligence constants synchronized.');
      await loadControlRoom();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update settings';
      addLog('error', message);
    } finally {
      setBusy(false);
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
    <div className="min-h-screen bg-[#020617] text-white selection:bg-rose-500/30">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-violet-500/5 blur-[80px] rounded-full animate-bounce-slow" />
      </div>

      <div className="relative z-10 p-4 md:p-8 lg:p-12 w-full max-w-[2400px] mx-auto space-y-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-[2px] w-12 bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
              <p className="text-xs font-black uppercase tracking-[0.6em] text-rose-400">The Hand</p>
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-none text-white">
              God-Tier <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white/80 to-white/40">Command Layer</span>
            </h1>
            <p className="max-w-3xl text-base md:text-xl text-slate-400 leading-relaxed font-medium">
              Real-time synchronization across every storefront, drawer, and vault. <br className="hidden md:block" />
              Intelligence driven analysis for high-clearance operations.
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

        <div className="flex flex-wrap gap-3 px-2 mt-8 p-1 bg-white/[0.02] rounded-[24px] border border-white/5 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-3 px-8 py-4 rounded-[18px] text-xs font-black uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group/tab",
                activeTab === tab.id
                  ? "bg-rose-500 text-white shadow-[0_10px_40px_rgba(244,63,94,0.3)] scale-105"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              <tab.icon className={cn("h-4 w-4 transition-transform duration-500", activeTab === tab.id ? "scale-110" : "group-hover/tab:scale-110")} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
              )}
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
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 mb-4">Past Closing Override</p>
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
                          placeholder="Closing Amount"
                          value={newAmount}
                          onChange={(event) => setNewAmount(event.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-rose-500/50"
                        />
                        <button
                          onClick={async () => {
                            if (!confirm("OVERRIDE PAST CLOSING?")) return;
                            try {
                              await updateCashDrawerClosing({ 
                                shopId: pastOpeningForm.shopId, 
                                dateYYYYMMDD: pastOpeningForm.date, 
                                newAmount: Number(newAmount) 
                              });
                              addLog('success', `Past closing balance for ${pastOpeningForm.shopId} on ${pastOpeningForm.date} set to ${currency(Number(newAmount))}.`);
                              await loadControlRoom();
                            } catch (e: any) {
                              addLog('error', e.message);
                            }
                          }}
                          className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 py-3 text-xs font-black uppercase tracking-widest text-rose-200 hover:bg-rose-500/20"
                        >
                          Set Past Closing
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 mb-4">Intelligence Constants</p>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500">Tax Rate (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={intelForm.taxRate}
                            onChange={(e) => setIntelForm(prev => ({ ...prev, taxRate: Number(e.target.value) }))}
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500">Tax Threshold ($)</label>
                          <input
                            type="number"
                            value={intelForm.taxThreshold}
                            onChange={(e) => setIntelForm(prev => ({ ...prev, taxThreshold: Number(e.target.value) }))}
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500">Zombie Days</label>
                          <input
                            type="number"
                            value={intelForm.zombieDays}
                            onChange={(e) => setIntelForm(prev => ({ ...prev, zombieDays: Number(e.target.value) }))}
                            className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <button
                          onClick={handleUpdateIntelligence}
                          className="w-full rounded-xl border border-sky-400/30 bg-sky-500/10 py-3 text-xs font-black uppercase tracking-widest text-sky-200 hover:bg-sky-500/20"
                        >
                          Sync Constants
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

        {/* Expense Categorisation Tab */}
        {activeTab === 'expenses' && (
          <div className="mt-6 space-y-6">
            <ExpenseCategorisation />
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

        {activeTab === 'rationalisation' && (
          <div className="space-y-6 mt-6">
            <WindowCard eyebrow="Operations Rationalisation" title="Variance Reset Engine" icon={AlertTriangle} className="border-amber-500/30">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6">
                  <h3 className="text-xl font-black text-white">Current Variance</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    The delta between what the Computed Ledger expects in the vault and what you've declared as the Actual Vault Balance.
                  </p>
                  <div className="mt-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <span className="text-xs uppercase font-bold text-slate-500">Actual Balance</span>
                      <span className="font-mono text-lg font-bold text-sky-300">{currency(controlRoom?.money.operationsActualBalance || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <span className="text-xs uppercase font-bold text-slate-500">Computed Ledger</span>
                      <span className="font-mono text-lg font-bold text-slate-300">{currency(controlRoom?.money.operationsComputedBalance || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm uppercase font-black tracking-widest text-white">Operations Delta</span>
                      <span className={`font-mono text-2xl font-black ${(controlRoom?.money.operationsDelta || 0) !== 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {currency(controlRoom?.money.operationsDelta || 0)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-8">
                    <button
                      onClick={handleRationalize}
                      disabled={busy || (controlRoom?.money.operationsDelta === 0)}
                      className="w-full group relative overflow-hidden rounded-2xl border border-rose-400/30 bg-rose-500/10 py-4 text-center transition-all hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="text-sm font-black uppercase tracking-[0.2em] text-rose-200">
                        {controlRoom?.money.operationsDelta === 0 ? 'Variance is 0' : 'Reset Variance to 0'}
                      </span>
                    </button>
                    <p className="mt-3 text-center text-[10px] text-rose-400/70 uppercase tracking-wider">
                      Requires Level 5 Clearance
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6">
                  <h3 className="text-xl font-black text-white">Traceback History</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    A permanent audit trail of all manual variance resets and ledger adjustments.
                  </p>
                  
                  <div className="mt-6 space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {!controlRoom?.drifts || controlRoom.drifts.length === 0 ? (
                      <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-center text-sm text-slate-500">
                        No historical tracebacks found.
                      </div>
                    ) : (
                      controlRoom.drifts.map((drift) => (
                        <div key={drift.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-sm font-black text-amber-300">{currency(drift.amount)}</span>
                            <span className="text-[10px] font-bold text-slate-500">{timeLabel(drift.created_at)}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-300 leading-relaxed">{drift.reason}</p>
                          {(drift.resolved_kind || drift.resolved_shop) && (
                            <div className="mt-3 flex gap-2">
                              {drift.resolved_kind && (
                                <span className="rounded-md bg-white/5 px-2 py-1 text-[9px] uppercase tracking-wider text-slate-400">
                                  {drift.resolved_kind}
                                </span>
                              )}
                              {drift.resolved_shop && (
                                <span className="rounded-md bg-white/5 px-2 py-1 text-[9px] uppercase tracking-wider text-slate-400">
                                  Shop: {drift.resolved_shop}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </WindowCard>
          </div>
        )}

      </div>
    </div>
  );
}
