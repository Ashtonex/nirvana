'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { Calendar } from 'lucide-react';

export type Period = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface PeriodSelectorProps {
    onPeriodChange: (period: Period, startDate?: Date, endDate?: Date) => void;
}

export function PeriodSelector({ onPeriodChange }: PeriodSelectorProps) {
    const [activePeriod, setActivePeriod] = useState<Period>('month');
    const [showCustom, setShowCustom] = useState(false);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const getPeriodDates = (period: Period) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let startDate: Date;

        switch (period) {
            case 'today':
                startDate = new Date(today);
                return { startDate, endDate: new Date(today) };
            case 'week':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - startDate.getDay());
                return { startDate, endDate: new Date(today) };
            case 'month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                return { startDate, endDate: new Date(today) };
            case 'quarter':
                const quarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), quarter * 3, 1);
                return { startDate, endDate: new Date(today) };
            case 'year':
                startDate = new Date(today.getFullYear(), 0, 1);
                return { startDate, endDate: new Date(today) };
            case 'all':
            default:
                return { startDate: null, endDate: null };
        }
    };

    const handlePeriodClick = (period: Period) => {
        setActivePeriod(period);
        setShowCustom(false);
        if (period === 'custom') {
            setShowCustom(true);
        } else {
            const { startDate, endDate } = getPeriodDates(period);
            onPeriodChange(period, startDate || undefined, endDate || undefined);
        }
    };

    const handleCustomApply = () => {
        if (customStart && customEnd) {
            const startDate = new Date(customStart);
            const endDate = new Date(customEnd);
            if (startDate <= endDate) {
                setActivePeriod('custom');
                onPeriodChange('custom', startDate, endDate);
                setShowCustom(false);
            }
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
                <Button
                    variant={activePeriod === 'today' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('today')}
                    className="text-[10px] font-black uppercase h-9"
                >
                    Today
                </Button>
                <Button
                    variant={activePeriod === 'week' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('week')}
                    className="text-[10px] font-black uppercase h-9"
                >
                    This Week
                </Button>
                <Button
                    variant={activePeriod === 'month' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('month')}
                    className="text-[10px] font-black uppercase h-9"
                >
                    This Month
                </Button>
                <Button
                    variant={activePeriod === 'quarter' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('quarter')}
                    className="text-[10px] font-black uppercase h-9"
                >
                    This Quarter
                </Button>
                <Button
                    variant={activePeriod === 'year' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('year')}
                    className="text-[10px] font-black uppercase h-9"
                >
                    This Year
                </Button>
                <Button
                    variant={activePeriod === 'all' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('all')}
                    className="text-[10px] font-black uppercase h-9"
                >
                    All Time
                </Button>
                <Button
                    variant={activePeriod === 'custom' ? 'default' : 'outline'}
                    onClick={() => handlePeriodClick('custom')}
                    className="text-[10px] font-black uppercase h-9 flex items-center gap-1"
                >
                    <Calendar className="h-3 w-3" /> Custom
                </Button>
            </div>

            {showCustom && (
                <div className="flex gap-2 items-end bg-slate-900/30 p-3 rounded border border-slate-800">
                    <div className="flex-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="w-full px-2 py-1 text-sm bg-slate-950 border border-slate-800 rounded text-white"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="w-full px-2 py-1 text-sm bg-slate-950 border border-slate-800 rounded text-white"
                        />
                    </div>
                    <Button
                        onClick={handleCustomApply}
                        className="text-[10px] font-black uppercase h-9"
                    >
                        Apply
                    </Button>
                </div>
            )}
        </div>
    );
}
