'use client';

import React, { useState } from 'react';
import { X, Lock, Delete, UserCheck, AlertCircle, Loader2 } from 'lucide-react';
import { getLocalAuthByPin, type LocalAuthSession } from '@/lib/local-db';

interface CashierSwitchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCashierSwitched: (employee: { id: string; name: string; role: string }) => void;
    currentCashierName?: string;
}

export const CashierSwitchModal: React.FC<CashierSwitchModalProps> = ({
    isOpen,
    onClose,
    onCashierSwitched,
    currentCashierName,
}) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    if (!isOpen) return null;

    const handleDigitClick = (digit: string) => {
        if (pin.length < 8) {
            const next = pin + digit;
            setPin(next);
            setError(null);
            if (next.length === 4) {
                verifyPin(next);
            }
        }
    };

    const handleDelete = () => {
        setPin((prev) => prev.slice(0, -1));
        setError(null);
    };

    const handleClear = () => {
        setPin('');
        setError(null);
    };

    const verifyPin = async (candidatePin: string) => {
        setIsVerifying(true);
        setError(null);

        try {
            // Check local salted hash first
            const localSession = await getLocalAuthByPin(candidatePin);
            if (localSession) {
                onCashierSwitched({
                    id: localSession.employeeId,
                    name: localSession.employeeName,
                    role: localSession.role,
                });
                onClose();
                return;
            }

            // Fallback to online verification if available
            try {
                const res = await fetch('/api/staff/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: candidatePin }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.employee) {
                        onCashierSwitched({
                            id: data.employee.id,
                            name: data.employee.name,
                            role: data.employee.role || 'sales',
                        });
                        onClose();
                        return;
                    }
                }
            } catch {}

            setError('Incorrect PIN. Please try again.');
            setPin('');
        } catch (e: any) {
            setError(e?.message || 'Verification failed');
            setPin('');
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-violet-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-white">Switch Cashier</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {currentCashierName && (
                    <p className="text-xs text-slate-400 text-center mb-3">
                        Current: <span className="text-white font-bold">{currentCashierName}</span>
                    </p>
                )}

                {/* PIN Display */}
                <div className="flex items-center justify-center gap-3 my-4">
                    {[0, 1, 2, 3].map((idx) => (
                        <div
                            key={idx}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${
                                pin.length > idx
                                    ? 'bg-violet-500 border-violet-400 scale-110 shadow-sm shadow-violet-500/50'
                                    : 'border-slate-700 bg-slate-950'
                            }`}
                        />
                    ))}
                </div>

                {error && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-rose-400 font-semibold mb-3">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                        <button
                            key={digit}
                            type="button"
                            onClick={() => handleDigitClick(digit)}
                            disabled={isVerifying}
                            className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-white font-mono font-black text-xl transition-all border border-slate-700/50 cursor-pointer"
                        >
                            {digit}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={handleClear}
                        disabled={isVerifying}
                        className="h-14 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDigitClick('0')}
                        disabled={isVerifying}
                        className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-white font-mono font-black text-xl transition-all border border-slate-700/50 cursor-pointer"
                    >
                        0
                    </button>
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isVerifying}
                        className="h-14 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                    >
                        <Delete className="w-5 h-5" />
                    </button>
                </div>

                {isVerifying && (
                    <div className="flex items-center justify-center gap-2 text-xs text-violet-400 font-bold mt-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying credentials...</span>
                    </div>
                )}
            </div>
        </div>
    );
};
