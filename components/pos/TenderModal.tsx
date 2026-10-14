'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, DollarSign, Smartphone, CreditCard, Printer, User, Phone, Loader2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';

interface TenderModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalDue: number;
    currencySymbol?: string;
    onCompletePayment: (data: {
        paymentMethod: 'cash' | 'ecocash' | 'card';
        amountTendered: number;
        changeDue: number;
        clientName: string;
        clientPhone: string;
        printReceipt: boolean;
    }) => Promise<void>;
    defaultClientName?: string;
    defaultClientPhone?: string;
}

const CASH_DENOMINATIONS = [5, 10, 20, 50, 100];

export const TenderModal: React.FC<TenderModalProps> = ({
    isOpen,
    onClose,
    totalDue,
    currencySymbol = '$',
    onCompletePayment,
    defaultClientName = '',
    defaultClientPhone = '',
}) => {
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'ecocash' | 'card'>('cash');
    const [tenderedInput, setTenderedInput] = useState<string>('');
    const [clientName, setClientName] = useState(defaultClientName);
    const [clientPhone, setClientPhone] = useState(defaultClientPhone);
    const [printReceipt, setPrintReceipt] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setTenderedInput(totalDue.toFixed(2));
            setClientName(defaultClientName);
            setClientPhone(defaultClientPhone);
            setError(null);
            setIsSubmitting(false);
        }
    }, [isOpen, totalDue, defaultClientName, defaultClientPhone]);

    if (!isOpen) return null;

    const tenderedAmount = paymentMethod === 'cash'
        ? (parseFloat(tenderedInput) || 0)
        : totalDue;

    const changeDue = Math.max(0, tenderedAmount - totalDue);
    const isUnderpaid = paymentMethod === 'cash' && tenderedAmount < totalDue;

    const handleDenominationClick = (amount: number) => {
        setTenderedInput(amount.toFixed(2));
    };

    const handleExactClick = () => {
        setTenderedInput(totalDue.toFixed(2));
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (isUnderpaid) {
            setError(`Tendered amount is less than total due (${currencySymbol}${totalDue.toFixed(2)})`);
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await onCompletePayment({
                paymentMethod,
                amountTendered: tenderedAmount,
                changeDue,
                clientName: clientName.trim() || 'General Walk-in',
                clientPhone: clientPhone.trim(),
                printReceipt,
            });
            onClose();
        } catch (e: any) {
            setError(e?.message || 'Payment processing failed. Please try again.');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Checkout</span>
                        <h3 className="text-xl font-black uppercase italic text-white tracking-tight">Receive Payment</h3>
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

                {/* Amount Due Hero Banner */}
                <div className="px-6 py-5 bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800/80 text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Amount Due</span>
                    <div className="text-4xl sm:text-5xl font-black font-mono text-emerald-400 mt-1 tracking-tight">
                        {currencySymbol}{totalDue.toFixed(2)}
                    </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
                    {error && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                            {error}
                        </div>
                    )}

                    {/* Payment Method Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                            Payment Method
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                                    paymentMethod === 'cash'
                                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/40'
                                        : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                            >
                                <DollarSign className="w-5 h-5" />
                                <span>Cash</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPaymentMethod('ecocash')}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                                    paymentMethod === 'ecocash'
                                        ? 'bg-sky-600 text-white border-sky-500 shadow-lg shadow-sky-950/40'
                                        : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                            >
                                <Smartphone className="w-5 h-5" />
                                <span>EcoCash</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setPaymentMethod('card')}
                                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                                    paymentMethod === 'card'
                                        ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-950/40'
                                        : 'bg-slate-800/50 hover:bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                            >
                                <CreditCard className="w-5 h-5" />
                                <span>Card</span>
                            </button>
                        </div>
                    </div>

                    {/* Cash Denominations & Change Calculation */}
                    {paymentMethod === 'cash' && (
                        <div className="space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                                    Cash Tendered
                                </label>
                                <button
                                    type="button"
                                    onClick={handleExactClick}
                                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                                >
                                    Exact Amount
                                </button>
                            </div>

                            {/* Preset Denomination Buttons */}
                            <div className="flex flex-wrap gap-2">
                                {CASH_DENOMINATIONS.map((denom) => (
                                    <button
                                        key={denom}
                                        type="button"
                                        onClick={() => handleDenominationClick(denom)}
                                        className="flex-1 min-w-[50px] py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-mono font-bold text-sm transition-all border border-slate-700 cursor-pointer"
                                    >
                                        {currencySymbol}{denom}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Amount Input */}
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-lg">
                                    {currencySymbol}
                                </span>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={tenderedInput}
                                    onChange={(e) => setTenderedInput(e.target.value)}
                                    placeholder="0.00"
                                    className="pl-8 h-12 bg-slate-900 border-slate-700 font-mono text-lg font-bold text-white rounded-xl"
                                />
                            </div>

                            {/* Live Change Due Display */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-sm">
                                <span className="font-bold text-slate-400">Change Due</span>
                                <span className={`font-mono text-xl font-black ${
                                    isUnderpaid ? 'text-rose-400' : 'text-emerald-400'
                                }`}>
                                    {isUnderpaid ? 'Underpaid' : `${currencySymbol}${changeDue.toFixed(2)}`}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Customer CRM info (Optional) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                <User className="w-3 h-3" /> Customer Name
                            </label>
                            <Input
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Walk-in Customer"
                                className="h-10 bg-slate-950/60 border-slate-800 text-xs rounded-xl"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" /> Phone Number
                            </label>
                            <Input
                                value={clientPhone}
                                onChange={(e) => setClientPhone(e.target.value)}
                                placeholder="Optional"
                                className="h-10 bg-slate-950/60 border-slate-800 text-xs rounded-xl"
                            />
                        </div>
                    </div>

                    {/* Receipt Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                        <input
                            type="checkbox"
                            checked={printReceipt}
                            onChange={(e) => setPrintReceipt(e.target.checked)}
                            className="w-4 h-4 rounded text-violet-600 bg-slate-800 border-slate-700 focus:ring-0"
                        />
                        <Printer className="w-3.5 h-3.5 text-slate-400" />
                        <span>Print receipt upon completion</span>
                    </label>
                </div>

                {/* Modal Footer / Complete Action */}
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
                        disabled={isSubmitting || isUnderpaid}
                        className={`flex-2 h-12 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                            isSubmitting || isUnderpaid
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Complete Payment</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};
