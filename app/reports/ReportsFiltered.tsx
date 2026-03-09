'use client';

import { useState } from 'react';
import { PeriodSelector, Period } from '../admin/tax/PeriodSelector';
import { Button } from '@/components/ui';
import { Download, Calendar, Filter } from 'lucide-react';
import { exportReportsCSV } from '../../actions';

interface ReportsFilteredProps {
    sales: any[];
}

export function ReportsFiltered({ sales }: ReportsFilteredProps) {
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [isLoadingCSV, setIsLoadingCSV] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter sales based on selected period
    const filteredSales = sales.filter((sale: any) => {
        if (!startDate || !endDate) return true;
        const saleDate = new Date(sale.date);
        return saleDate >= startDate && saleDate <= endDate;
    });

    const handlePeriodChange = (period: Period, newStartDate?: Date, newEndDate?: Date) => {
        setStartDate(newStartDate);
        setEndDate(newEndDate);
    };

    const handleExportCSV = async () => {
        try {
            setIsLoadingCSV(true);
            setError(null);
            const result = await exportReportsCSV(filteredSales);
            
            if (!result.success || !result.data || !result.filename) {
                setError(result.error || 'Failed to export CSV');
                return;
            }

            const blob = new Blob([result.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError('Error exporting CSV');
            console.error('Export error:', err);
        } finally {
            setIsLoadingCSV(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
                <PeriodSelector onPeriodChange={handlePeriodChange} />
                <Button 
                    onClick={handleExportCSV}
                    disabled={isLoadingCSV}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors w-full sm:w-auto"
                >
                    <Download className="h-4 w-4" /> {isLoadingCSV ? 'Downloading...' : 'Download CSV'}
                </Button>
            </div>

            {error && (
                <div className="text-xs text-red-500 font-bold italic bg-red-500/10 p-2 rounded border border-red-500/20">
                    {error}
                </div>
            )}

            <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-900/50">
                        <tr>
                            <th className="px-6 py-3 font-medium">Time</th>
                            <th className="px-6 py-3 font-medium">Shop</th>
                            <th className="px-6 py-3 font-medium">Item</th>
                            <th className="px-6 py-3 font-medium">Qty</th>
                            <th className="px-6 py-3 font-medium">Price</th>
                            <th className="px-6 py-3 font-medium">Total (inc. Tax)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {filteredSales.map((sale: any) => (
                            <tr key={sale.id} className="hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-4">{new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="px-6 py-4 capitalize">{sale.shopId}</td>
                                <td className="px-6 py-4 font-medium text-slate-100">{sale.itemName}</td>
                                <td className="px-6 py-4">{sale.quantity}</td>
                                <td className="px-6 py-4">${sale.unitPrice.toFixed(2)}</td>
                                <td className="px-6 py-4 text-emerald-400 font-bold">${sale.totalWithTax.toFixed(2)}</td>
                            </tr>
                        ))}
                        {filteredSales.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                                    No sales recorded for the selected period.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
