'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, 
    AlertCircle, 
    CheckCircle2, 
    ShieldCheck, 
    Coins, 
    Heart, 
    TrendingUp, 
    Plus, 
    ArrowRight, 
    Loader2,
    DollarSign,
    Lock,
    HelpCircle
} from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { getTodayPoolMovements, recordPoolMovement } from '@/app/actions';

interface PoolClosingModalProps {
    isOpen: boolean;
    onClose: () => void;
    shopId: string;
    employeeId?: string;
    liveCashInDrawer: number;
    shopRentBalance: number;
    shopInvestBalance: number;
    cumulativeTithe: number;
    onClosingConfirmed: (countedCash: number, poolConfirmed: boolean) => void;
}

export const PoolClosingModal: React.FC<PoolClosingModalProps> = ({
    isOpen,
    onClose,
    shopId,
    employeeId,
    liveCashInDrawer,
    shopRentBalance,
    shopInvestBalance,
    cumulativeTithe,
    onClosingConfirmed,
}) => {
    // Sequence steps: 1 = pool_review, 2 = record_movement, 3 = drawer_reconciliation
    const [step, setStep] = useState<'pool_review' | 'record_movement' | 'drawer_reconciliation'>('pool_review');

    // Recorded pool movements fetched from server
    const [poolData, setPoolData] = useState<any>(null);
    const [isLoadingPools, setIsLoadingPools] = useState(false);

    // Form state for recording missing movement
    const [selectedPool, setSelectedPool] = useState<'rent' | 'invest' | 'tithe'>('rent');
    const [movementType, setMovementType] = useState<'withdrawal' | 'deposit'>('withdrawal');
    const [amount, setAmount] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [cashHandling, setCashHandling] = useState<'drawer_cash' | 'pool_internal' | 'external_account'>('drawer_cash');
    const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);
    const [movementError, setMovementError] = useState<string | null>(null);

    // Drawer reconciliation step
    const [countedCashInput, setCountedCashInput] = useState('');
    const [isFinalizing, setIsFinalizing] = useState(false);

    // Load today's recorded movements whenever modal opens
    const fetchMovements = async () => {
        setIsLoadingPools(true);
        try {
            const data = await getTodayPoolMovements(shopId);
            setPoolData(data);
        } catch (e) {
            console.error('Failed to fetch today pool movements:', e);
        } finally {
            setIsLoadingPools(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setStep('pool_review');
            setCountedCashInput(Number.isFinite(liveCashInDrawer) ? liveCashInDrawer.toFixed(2) : '');
            fetchMovements();
        }
    }, [isOpen, shopId, liveCashInDrawer]);

    // Title presets by pool
    const titlePresets = useMemo(() => {
        if (selectedPool === 'rent') {
            return [
                'Shop Rent Installment',
                'Landlord Levy / Service Charge',
                'Rent Pool Top-up',
                'Rent Adjustment / Correction',
            ];
        }
        if (selectedPool === 'invest') {
            return [
                'Perfume Inventory Restock Withdrawal',
                'Investor Capital Payout',
                'Invest Capital Contribution',
                'Capital Correction',
            ];
        }
        return [
            'Church Tithe Offering Payout',
            'Tithe Allocation Adjustment',
            'Tithe Reimbursement',
        ];
    }, [selectedPool]);

    if (!isOpen) return null;

    const handleRecordMovement = async () => {
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) {
            setMovementError('Please enter a valid positive amount.');
            return;
        }
        if (!title.trim()) {
            setMovementError('Please enter a title / purpose for this movement.');
            return;
        }
        if (!description.trim()) {
            setMovementError('Please enter a brief explanation for audit transparency.');
            return;
        }

        setIsSubmittingMovement(true);
        setMovementError(null);

        try {
            await recordPoolMovement({
                shopId,
                pool: selectedPool,
                movementType,
                amount: amt,
                title: title.trim(),
                description: description.trim(),
                cashHandling,
                employeeId,
            });

            // Reset form and refresh list
            setAmount('');
            setTitle('');
            setDescription('');
            setStep('pool_review');
            await fetchMovements();
        } catch (err: any) {
            setMovementError(err.message || 'Failed to record pool movement');
        } finally {
            setIsSubmittingMovement(false);
        }
    };

    const handleConfirmDrawerAndClose = () => {
        const counted = parseFloat(countedCashInput);
        if (isNaN(counted) || counted < 0) {
            alert('Please enter a valid counted amount.');
            return;
        }
        setIsFinalizing(true);
        onClosingConfirmed(counted, true);
    };

    const countedNum = parseFloat(countedCashInput) || 0;
    const drawerVariance = countedNum - liveCashInDrawer;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                            <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-100">
                                End of Day Shift Closing & Accountability
                            </h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                Location: <span className="text-violet-400 font-black">{shopId.toUpperCase()}</span> • Mandatory Pre-Closing Verification
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/30 text-center text-xs font-black uppercase py-2">
                    <div className={`flex items-center justify-center gap-1.5 ${step !== 'drawer_reconciliation' ? 'text-violet-400' : 'text-slate-500'}`}>
                        <span className="h-4 w-4 rounded-full bg-violet-600/20 border border-violet-500/40 text-[10px] flex items-center justify-center">1</span>
                        Pool Accountability
                    </div>
                    <div className={`flex items-center justify-center gap-1.5 ${step === 'drawer_reconciliation' ? 'text-emerald-400' : 'text-slate-600'}`}>
                        <span className="h-4 w-4 rounded-full bg-slate-800 text-[10px] flex items-center justify-center">2</span>
                        Drawer Count & Reconciliation
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                    {/* STEP 1: POOL MOVEMENTS REVIEW */}
                    {step === 'pool_review' && (
                        <div className="space-y-4">
                            <div className="p-3 bg-violet-950/20 border border-violet-500/20 rounded-xl">
                                <h3 className="text-xs font-black uppercase text-violet-300">
                                    Today's Recorded Pool Movements
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    Below are all Rent, Investment, and Tithe movements recorded during this day.
                                </p>
                            </div>

                            {isLoadingPools ? (
                                <div className="py-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
                                    <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                                    Loading pool ledger...
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {/* Rent Pool Card */}
                                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Rent Pool</span>
                                            <Coins className="h-3.5 w-3.5 text-emerald-400" />
                                        </div>
                                        <div className="text-sm font-black text-slate-100">
                                            ${shopRentBalance.toFixed(2)}
                                        </div>
                                        <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800/80 flex justify-between">
                                            <span>Today:</span>
                                            <span className="font-bold text-slate-300">
                                                +{poolData?.rent?.totalAdditions?.toFixed(2) || '0.00'} / -{poolData?.rent?.totalDeductions?.toFixed(2) || '0.00'}
                                            </span>
                                        </div>
                                        <div className="text-[9px] text-slate-600">
                                            {poolData?.rent?.movements?.length || 0} movement(s) today
                                        </div>
                                    </div>

                                    {/* Invest Capital Card */}
                                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Invest Capital</span>
                                            <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
                                        </div>
                                        <div className="text-sm font-black text-slate-100">
                                            ${shopInvestBalance.toFixed(2)}
                                        </div>
                                        <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800/80 flex justify-between">
                                            <span>Today:</span>
                                            <span className="font-bold text-slate-300">
                                                +{poolData?.invest?.totalAdditions?.toFixed(2) || '0.00'} / -{poolData?.invest?.totalDeductions?.toFixed(2) || '0.00'}
                                            </span>
                                        </div>
                                        <div className="text-[9px] text-slate-600">
                                            {poolData?.invest?.movements?.length || 0} movement(s) today
                                        </div>
                                    </div>

                                    {/* Tithe Pool Card */}
                                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Tithe Pot</span>
                                            <Heart className="h-3.5 w-3.5 text-violet-400" />
                                        </div>
                                        <div className="text-sm font-black text-slate-100">
                                            ${cumulativeTithe.toFixed(2)}
                                        </div>
                                        <div className="text-[9px] text-slate-500 pt-1 border-t border-slate-800/80 flex justify-between">
                                            <span>Today:</span>
                                            <span className="font-bold text-slate-300">
                                                -{poolData?.tithe?.totalDeductions?.toFixed(2) || '0.00'}
                                            </span>
                                        </div>
                                        <div className="text-[9px] text-slate-600">
                                            {poolData?.tithe?.movements?.length || 0} movement(s) today
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Core Question Prompt */}
                            <div className="p-4 bg-slate-950/80 border border-amber-500/30 rounded-xl space-y-3">
                                <div className="flex items-start gap-2.5">
                                    <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="text-xs font-black uppercase text-amber-300">
                                            Are there any rent, investment, or tithe movements from today that have NOT yet been recorded?
                                        </h4>
                                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                                            If any cash was deducted or added for rent, investor payouts, or tithe offerings, record it now so pool balances match reality.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                    <Button
                                        onClick={() => setStep('drawer_reconciliation')}
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs h-10 flex items-center justify-center gap-1.5"
                                    >
                                        <CheckCircle2 className="h-4 w-4" />
                                        No Additional Movements — Confirm
                                    </Button>

                                    <Button
                                        onClick={() => setStep('record_movement')}
                                        variant="outline"
                                        className="flex-1 border-violet-500/40 text-violet-300 hover:bg-violet-500/10 font-black uppercase text-xs h-10 flex items-center justify-center gap-1.5"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Record a Missing Movement
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: RECORD MISSING MOVEMENT FORM */}
                    {step === 'record_movement' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xs font-black uppercase text-violet-400">
                                    Record Unlogged Pool Transaction
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setStep('pool_review')}
                                    className="text-xs text-slate-400 hover:text-white"
                                >
                                    Cancel & Return
                                </button>
                            </div>

                            {movementError && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    {movementError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Pool Choice */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Target Pool
                                    </label>
                                    <select
                                        value={selectedPool}
                                        onChange={(e) => setSelectedPool(e.target.value as any)}
                                        className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                    >
                                        <option value="rent">Rent Pool</option>
                                        <option value="invest">Invest Capital / Perfumes</option>
                                        <option value="tithe">Tithe Pot</option>
                                    </select>
                                </div>

                                {/* Movement Direction */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Movement Type
                                    </label>
                                    <select
                                        value={movementType}
                                        onChange={(e) => setMovementType(e.target.value as any)}
                                        className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                    >
                                        <option value="withdrawal">Deduction / Withdrawal (Outflow)</option>
                                        <option value="deposit">Addition / Deposit / Refund (Inflow)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Amount & Cash Handling */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Amount ($) *
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-bold h-10"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Cash Source / Handling *
                                    </label>
                                    <select
                                        value={cashHandling}
                                        onChange={(e) => setCashHandling(e.target.value as any)}
                                        className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                    >
                                        <option value="drawer_cash">Physical Cash Drawer (Deducts/Adds to Till)</option>
                                        <option value="pool_internal">Internal Pool Allocation (Drawer Unchanged)</option>
                                        <option value="external_account">External Bank / Ecocash (Drawer Unchanged)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Preset Buttons */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                    Quick Title Suggestions
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {titlePresets.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setTitle(preset)}
                                            className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:border-slate-700"
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Title & Description */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                    Transaction Title *
                                </label>
                                <Input
                                    placeholder="e.g. Shop Rent Partial Payment"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 h-10"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                    Description & Audit Notes *
                                </label>
                                <Input
                                    placeholder="e.g. Handed to landlord representative Mr. Moyo"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 h-10"
                                />
                            </div>

                            <Button
                                onClick={handleRecordMovement}
                                disabled={isSubmittingMovement}
                                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-black uppercase text-xs h-10 flex items-center justify-center gap-2"
                            >
                                {isSubmittingMovement ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {isSubmittingMovement ? 'Recording Movement...' : 'Save Movement & Review Summary'}
                            </Button>
                        </div>
                    )}

                    {/* STEP 3: DRAWER COUNT & RECONCILIATION */}
                    {step === 'drawer_reconciliation' && (
                        <div className="space-y-4">
                            <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
                                <h3 className="text-xs font-black uppercase text-emerald-300">
                                    Physical Drawer Cash Reconciliation
                                </h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    Count the actual physical cash in the drawer before generating reports and closing shift.
                                </p>
                            </div>

                            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                                    <span className="text-[10px] font-black uppercase text-slate-400">Expected Register Total:</span>
                                    <span className="text-base font-mono font-black text-slate-200">
                                        ${Number.isFinite(liveCashInDrawer) ? liveCashInDrawer.toFixed(2) : '0.00'}
                                    </span>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Counted Physical Cash in Drawer ($) *
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={countedCashInput}
                                        onChange={(e) => setCountedCashInput(e.target.value)}
                                        className="bg-slate-900 border-slate-700 text-sm font-mono font-black text-emerald-400 h-12"
                                    />
                                </div>

                                {countedCashInput && !isNaN(drawerVariance) && Math.abs(drawerVariance) > 0.01 && (
                                    <div
                                        className={`p-2.5 rounded-lg text-xs font-bold flex items-center justify-between ${
                                            drawerVariance > 0
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        }`}
                                    >
                                        <span>{drawerVariance > 0 ? 'Over By' : 'Short By'}:</span>
                                        <span className="font-mono font-black">${Math.abs(drawerVariance).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep('pool_review')}
                                    className="border-slate-800 text-slate-400 hover:text-white"
                                >
                                    Back to Pools
                                </Button>
                                <Button
                                    onClick={handleConfirmDrawerAndClose}
                                    disabled={isFinalizing || !countedCashInput}
                                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-xs h-10 flex items-center justify-center gap-2"
                                >
                                    {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                                    {isFinalizing ? 'Closing Register...' : 'Confirm Closing & Generate Reports'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
