'use client';

import React, { useState } from 'react';
import { X, DollarSign, ArrowDownRight, ArrowUpRight, Lock, CheckCircle2, Loader2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { queueOfflineDrawerOp, isOnline } from '@/lib/local-db';
import { openCashRegister, closeCashRegister, recordPosExpense } from '@/app/actions';
import { syncEngine } from '@/lib/sync-engine';

interface RegisterDrawerModalProps {
    isOpen: boolean;
    onClose: () => void;
    shopId: string;
    employeeId: string;
    currencySymbol?: string;
    onDrawerActionCompleted: (message: string) => void;
}

export const RegisterDrawerModal: React.FC<RegisterDrawerModalProps> = ({
    isOpen,
    onClose,
    shopId,
    employeeId,
    currencySymbol = '$',
    onDrawerActionCompleted,
}) => {
    const [actionType, setActionType] = useState<'open' | 'expense' | 'close'>('open');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const parsedAmount = parseFloat(amount) || 0;

    const handleSubmit = async () => {
        if (parsedAmount <= 0) {
            setError('Please enter a valid amount greater than 0.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        const online = await isOnline();

        try {
            if (online) {
                // Online execution via server actions
                if (actionType === 'open') {
                    await openCashRegister(shopId, parsedAmount, parsedAmount);
                } else if (actionType === 'close') {
                    await closeCashRegister(shopId, parsedAmount, parsedAmount, reason);
                } else if (actionType === 'expense') {
                    await recordPosExpense(shopId, parsedAmount, reason || 'POS Drawer Expense', employeeId);
                }
                onDrawerActionCompleted(`Drawer ${actionType} recorded successfully.`);
            } else {
                // Offline execution via local queue
                await queueOfflineDrawerOp({
                    shopId,
                    employeeId,
                    type: actionType,
                    amount: parsedAmount,
                    reason: reason || `POS Drawer ${actionType}`,
                    date: new Date().toISOString(),
                });
                await syncEngine.refreshPendingCount();
                onDrawerActionCompleted(`Drawer ${actionType} recorded offline (queued for sync).`);
            }
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Operation failed. Try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-base font-black uppercase italic text-white tracking-tight">
                            Cash Drawer Management
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-3 p-3 gap-1 bg-slate-950/80 border-b border-slate-800">
                    <button
                        type="button"
                        onClick={() => { setActionType('open'); setError(null); }}
                        className={`py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                            actionType === 'open'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Open Shift
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActionType('expense'); setError(null); }}
                        className={`py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                            actionType === 'expense'
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Petty Cash Out
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActionType('close'); setError(null); }}
                        className={`py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                            actionType === 'close'
                                ? 'bg-rose-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Close Shift
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                            {actionType === 'open' && 'Opening Cash Float'}
                            {actionType === 'expense' && 'Cash Outflow Amount'}
                            {actionType === 'close' && 'Final Counted Cash In Drawer'}
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-lg">
                                {currencySymbol}
                            </span>
                            <Input
                                type="number"
                                step="0.01"
                                autoFocus
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="pl-8 h-12 bg-slate-950 border-slate-700 font-mono text-xl font-bold text-white rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                            {actionType === 'expense' ? 'Reason / Expense Category' : 'Notes / Remarks (Optional)'}
                        </label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={actionType === 'expense' ? 'e.g. Electricity token, Cleaning, Water' : 'e.g. Morning float verified'}
                            className="h-10 bg-slate-950 border-slate-700 text-xs rounded-xl"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-800 bg-slate-950/60 flex gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 h-12 rounded-xl text-xs font-black uppercase tracking-wider border-slate-800 hover:bg-slate-800 cursor-pointer"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || parsedAmount <= 0}
                        className={`flex-2 h-12 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                            isSubmitting || parsedAmount <= 0
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : actionType === 'close'
                                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Recording...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>
                                    {actionType === 'open' && 'Record Opening Float'}
                                    {actionType === 'expense' && 'Record Cash Expense'}
                                    {actionType === 'close' && 'Reconcile & Close'}
                                </span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};
