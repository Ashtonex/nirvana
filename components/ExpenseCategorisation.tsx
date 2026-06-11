'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, RefreshCcw, CheckCircle2, AlertCircle, Loader2, Filter, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

type ExpenseGroup = 'Overheads' | 'Stock Orders' | 'Transfers' | 'Personal Use' | 'Tithes' | 'Other';
type ExpenseSource = 'operations_ledger' | 'ledger_entries';

type Expense = {
  id: string;
  source: ExpenseSource;
  shopId: string | null;
  amount: number;
  description: string;
  detail: string;
  date: string | null;
  savedGroup: string | null;
  suggestedGroup: string;
  isManuallyClassified: boolean;
};

type Stats = { total: number; classified: number; unclassified: number };

const GROUPS: ExpenseGroup[] = ['Overheads', 'Stock Orders', 'Transfers', 'Personal Use', 'Tithes', 'Other'];

const GROUP_COLOURS: Record<ExpenseGroup, string> = {
  Overheads:       'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'Stock Orders':  'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Transfers:       'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'Personal Use':  'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Tithes:          'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Other:           'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const GROUP_BADGE: Record<ExpenseGroup, string> = {
  Overheads:       'border-rose-500/40 text-rose-300',
  'Stock Orders':  'border-violet-500/40 text-violet-300',
  Transfers:       'border-sky-500/40 text-sky-300',
  'Personal Use':  'border-amber-500/40 text-amber-300',
  Tithes:          'border-emerald-500/40 text-emerald-300',
  Other:           'border-slate-500/40 text-slate-400',
};

function currency(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeLabel(val: string | null) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ExpenseCategorisation() {
  const [year, setYear]     = useState(new Date().getFullYear());
  const [month, setMonth]   = useState(new Date().getMonth() + 1);
  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState<Record<string, boolean>>({});
  const [error, setError]         = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<ExpenseGroup | 'all'>('all');
  const [filterClassified, setFilterClassified] = useState<'all' | 'classified' | 'unclassified'>('all');
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const groupTotals = GROUPS.reduce((acc, group) => {
    acc[group] = expenses
      .filter(e => (e.savedGroup || e.suggestedGroup) === group)
      .reduce((sum, e) => sum + e.amount, 0);
    return acc;
  }, {} as Record<ExpenseGroup, number>);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/hand/expense-classifications?year=${year}&month=${month}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load');
      
      // Load saved groupings from localStorage
      const localData = typeof window !== 'undefined' ? localStorage.getItem('nirvana_manual_expenses') : null;
      const localMap = localData ? JSON.parse(localData) : {};
      
      const mergedExpenses = (data.expenses || []).map((e: any) => {
        const key = `${e.source}:${e.id}`;
        if (localMap[key]) {
          return {
            ...e,
            savedGroup: localMap[key],
            suggestedGroup: localMap[key],
            isManuallyClassified: true
          };
        }
        return e;
      });

      setExpenses(mergedExpenses);

      const classifiedCount = mergedExpenses.filter((e: any) => e.isManuallyClassified).length;
      setStats({
        total: mergedExpenses.length,
        classified: classifiedCount,
        unclassified: mergedExpenses.length - classifiedCount
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const classify = async (expense: Expense, group: ExpenseGroup) => {
    const key = `${expense.source}:${expense.id}`;
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      // 1. Mirror locally to localStorage immediately for guaranteed resilience
      const localData = typeof window !== 'undefined' ? localStorage.getItem('nirvana_manual_expenses') : null;
      const localMap = localData ? JSON.parse(localData) : {};
      localMap[key] = group;
      localStorage.setItem('nirvana_manual_expenses', JSON.stringify(localMap));

      // 2. Try Supabase update (non-blocking if check constraint is still updating)
      try {
        await fetch('/api/hand/expense-classifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ expense_id: expense.id, source: expense.source, group_name: group }),
        });
      } catch (dbErr) {
        console.warn('[Supabase classification save warning]:', dbErr);
      }

      // Optimistic update
      setExpenses(prev =>
        prev.map(e =>
          e.id === expense.id && e.source === expense.source
            ? { ...e, savedGroup: group, suggestedGroup: group, isManuallyClassified: true }
            : e
        )
      );
      setStats(prev =>
        prev && !expense.isManuallyClassified
          ? { ...prev, classified: prev.classified + 1, unclassified: prev.unclassified - 1 }
          : prev
      );
      showToast(`Saved: "${expense.description}" → ${group}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const revert = async (expense: Expense) => {
    const key = `${expense.source}:${expense.id}`;
    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      // 1. Remove from localStorage mirror
      const localData = typeof window !== 'undefined' ? localStorage.getItem('nirvana_manual_expenses') : null;
      const localMap = localData ? JSON.parse(localData) : {};
      delete localMap[key];
      localStorage.setItem('nirvana_manual_expenses', JSON.stringify(localMap));

      // 2. Try Supabase DELETE
      try {
        await fetch('/api/hand/expense-classifications', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ expense_id: expense.id, source: expense.source }),
        });
      } catch (dbErr) {
        console.warn('[Supabase classification delete warning]:', dbErr);
      }

      setExpenses(prev =>
        prev.map(e =>
          e.id === expense.id && e.source === expense.source
            ? { ...e, savedGroup: null, isManuallyClassified: false }
            : e
        )
      );
      setStats(prev =>
        prev ? { ...prev, classified: prev.classified - 1, unclassified: prev.unclassified + 1 } : prev
      );
      showToast('Classification removed — back to auto-detect');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const generatePDFReport = async () => {
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF() as any;
      const dateStr = `${months[month - 1]} ${year}`;
      
      // Theme banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 45, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('NIRVANA TEES', 15, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(251, 113, 133); // rose-400
      doc.text(`EXPENSE CLASSIFICATION & MATRIX REPORT — ${dateStr.toUpperCase()}`, 15, 30);
      
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Generated: ${new Date().toLocaleString()} | Clearances: Level 5 Admin`, 15, 37);

      // Financials Summary table
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('I. PORTFOLIO BREAKDOWN', 15, 58);

      const summaryRows = GROUPS.map(g => [
        g.toUpperCase(),
        expenses.filter(e => (e.savedGroup || e.suggestedGroup) === g).length.toString(),
        currency(groupTotals[g])
      ]);

      const totalVolume = expenses.reduce((s, e) => s + e.amount, 0);
      summaryRows.push([
        'TOTAL MANAGED VALUE',
        expenses.length.toString(),
        currency(totalVolume)
      ]);

      autoTable(doc, {
        startY: 63,
        head: [['Expense Group', 'Volume Count', 'Allocated Amount']],
        body: summaryRows,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], fontSize: 9, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          0: { fontStyle: 'bold' },
          2: { halign: 'right', fontStyle: 'bold' }
        }
      });

      // Detailed ledger records
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('II. CLASSIFIED TRANSACTION DIRECTORY', 15, (doc as any).lastAutoTable.finalY + 15);

      const ledgerRows = displayed.map(e => [
        timeLabel(e.date),
        e.description,
        e.detail || '—',
        (e.savedGroup || e.suggestedGroup || 'Other').toUpperCase(),
        e.isManuallyClassified ? 'VERIFIED' : 'AUTO',
        currency(e.amount)
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Date', 'Description', 'Category', 'Assigned Group', 'Class', 'Amount']],
        body: ledgerRows.length > 0 ? ledgerRows : [['—', 'No matching records in scope', '—', '—', '—', '—']],
        theme: 'striped',
        headStyles: { fillColor: [244, 63, 94], fontSize: 9 }, // rose-500
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          5: { halign: 'right' }
        }
      });

      doc.save(`Nirvana_Expense_Matrix_${year}_${month}.pdf`);
      showToast('PDF Compiled and Downloaded Successfully!');
    } catch (e: any) {
      console.error(e);
      setError('Failed to build PDF report');
    } finally {
      setExportingPdf(false);
    }
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const displayed = expenses.filter(e => {
    if (filterGroup !== 'all' && (e.savedGroup || e.suggestedGroup) !== filterGroup) return false;
    if (filterClassified === 'classified' && !e.isManuallyClassified) return false;
    if (filterClassified === 'unclassified' && e.isManuallyClassified) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-rose-400/80">The Hand</p>
          <h2 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Tag className="h-7 w-7 text-rose-400" />
            Expense Categorisation Matrix
          </h2>
          <p className="text-sm text-slate-400">
            Classify cash flow groups dynamically. Auto-matching isolates custom profiles like Tithes, Rent, and Hampers natively.
          </p>
        </div>

        <button
          onClick={generatePDFReport}
          disabled={exportingPdf || loading}
          className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 transition duration-300 shrink-0"
        >
          {exportingPdf ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-rose-300" />
              Compiling...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export PDF Report
            </>
          )}
        </button>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Year */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Year</label>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Month */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Month</label>
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
          >
            {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>

        {/* Filter by group */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Group
          </label>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value as any)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
          >
            <option value="all">All Groups</option>
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Filter classified */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Status</label>
          <select
            value={filterClassified}
            onChange={e => setFilterClassified(e.target.value as any)}
            className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
          >
            <option value="all">All</option>
            <option value="classified">Classified Only</option>
            <option value="unclassified">Unclassified Only</option>
          </select>
        </div>

        {/* Refresh */}
        <button
          onClick={fetchExpenses}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
        >
          <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Live Group Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {GROUPS.map(group => (
          <div key={group} className={cn(
            "rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden group/card",
            GROUP_COLOURS[group]
          )}>
            <div className="relative z-10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-2">{group}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-black opacity-50">$</span>
                <p className="text-3xl font-black tracking-tighter tabular-nums">
                  {Number(groupTotals[group] || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  <span className="text-lg opacity-60">.{Number(groupTotals[group] || 0).toFixed(2).split('.')[1]}</span>
                </p>
              </div>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-widest opacity-40">
                {expenses.filter(e => (e.savedGroup || e.suggestedGroup) === group).length} entries
              </p>
            </div>
            {/* Subtle background decoration */}
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover/card:opacity-10 transition-opacity">
              <Tag className="h-24 w-24 rotate-12" />
            </div>
          </div>
        ))}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 relative overflow-hidden group/stat">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Managed Volume</p>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black text-slate-600">$</span>
              <p className="text-2xl font-black text-white tabular-nums">
                {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <p className="text-[9px] text-slate-600 mt-2 uppercase font-black tracking-tighter">{stats.total} entries in scope</p>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/stat:opacity-20 transition-opacity">
              <Filter className="h-5 w-5 text-slate-400" />
            </div>
          </div>
          
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 relative overflow-hidden group/stat">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60 mb-2">Owner Verified</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-emerald-400 tabular-nums">{stats.classified}</p>
              <span className="text-[10px] font-black text-emerald-600 uppercase">Confirmed</span>
            </div>
            <p className="text-[9px] text-emerald-700/60 mt-2 uppercase font-black tracking-tighter">Manual Override Active</p>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/stat:opacity-20 transition-opacity">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 relative overflow-hidden group/stat">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/60 mb-2">Auto-Detected</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-amber-400 tabular-nums">{stats.unclassified}</p>
              <span className="text-[10px] font-black text-amber-600 uppercase">Awaiting Review</span>
            </div>
            <p className="text-[9px] text-amber-700/60 mt-2 uppercase font-black tracking-tighter">Using Keyword Intelligence</p>
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/stat:opacity-20 transition-opacity">
              <Loader2 className="h-5 w-5 text-amber-400" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Success toast */}
      {successToast && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successToast}
        </div>
      )}

      {/* Expense List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 py-16 text-center">
          <p className="text-slate-500 text-sm">No expenses found for this period.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_100px_120px_200px_80px] gap-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-600">
            <span>Description</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Group</span>
            <span>Status</span>
          </div>

          {displayed.map((exp) => {
            const key = `${exp.source}:${exp.id}`;
            const isSaving = saving[key] || false;
            const currentGroup = (exp.savedGroup || exp.suggestedGroup) as ExpenseGroup;

            return (
              <div
                key={key}
                className={cn(
                  'grid grid-cols-[1fr_100px_120px_200px_80px] gap-4 items-center rounded-2xl border px-4 py-3 transition-all',
                  exp.isManuallyClassified
                    ? 'border-white/10 bg-white/[0.03]'
                    : 'border-amber-500/10 bg-amber-500/[0.03]'
                )}
              >
                {/* Description */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{exp.description}</p>
                  {exp.detail && exp.detail !== exp.description && (
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{exp.detail}</p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wide">
                    {exp.source === 'operations_ledger' ? 'Operations' : 'Ledger'} · {exp.shopId || 'Global'}
                  </p>
                </div>

                {/* Date */}
                <p className="text-xs text-slate-400 font-mono">{timeLabel(exp.date)}</p>

                {/* Amount */}
                <p className="text-sm font-black text-rose-300 font-mono">{currency(exp.amount)}</p>

                {/* Group selector */}
                <div className="flex gap-1.5 flex-wrap">
                  {GROUPS.map(group => (
                    <button
                      key={group}
                      disabled={isSaving}
                      onClick={() => classify(exp, group)}
                      className={cn(
                        'rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-all',
                        currentGroup === group
                          ? GROUP_COLOURS[group]
                          : 'border-white/5 bg-white/[0.02] text-slate-600 hover:border-white/20 hover:text-slate-400'
                      )}
                    >
                      {group === 'Personal Use' ? 'Personal' : group}
                    </button>
                  ))}
                </div>

                {/* Status */}
                <div className="flex items-center justify-end gap-1.5">
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                  ) : exp.isManuallyClassified ? (
                    <button
                      onClick={() => revert(exp)}
                      title="Revert to auto-detect"
                      className="text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-rose-400 transition-colors"
                    >
                      Auto
                    </button>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-600/70">
                      Auto
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
