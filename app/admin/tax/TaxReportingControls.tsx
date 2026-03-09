'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { exportTaxLedgerCSV, printZIMRALog } from '../../actions';
import { Period } from './PeriodSelector';

export interface TaxReportingControlsProps {
    period?: Period;
    startDate?: Date;
    endDate?: Date;
}

export function TaxReportingControls({ period = 'month', startDate, endDate }: TaxReportingControlsProps) {
    const [isLoadingCSV, setIsLoadingCSV] = useState(false);
    const [isLoadingZIMRA, setIsLoadingZIMRA] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExportCSV = async () => {
        try {
            setIsLoadingCSV(true);
            setError(null);
            const result = await exportTaxLedgerCSV();
            
            if (!result.success || !result.data || !result.filename) {
                setError(result.error || 'Failed to export CSV');
                return;
            }

            // Create blob and trigger download
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

    const handlePrintZIMRA = async () => {
        try {
            setIsLoadingZIMRA(true);
            setError(null);
            const result = await printZIMRALog();
            
            if (!result.success || !result.data || !result.filename) {
                setError(result.error || 'Failed to generate ZIMRA log');
                return;
            }

            // Create blob and trigger download
            const blob = new Blob([result.data], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = result.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError('Error generating ZIMRA log');
            console.error('ZIMRA log error:', err);
        } finally {
            setIsLoadingZIMRA(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <Button 
                    variant="outline" 
                    className="flex-1 h-10 border-slate-800 hover:bg-slate-900 text-[10px] font-black uppercase italic tracking-widest"
                    onClick={handleExportCSV}
                    disabled={isLoadingCSV || isLoadingZIMRA}
                >
                    {isLoadingCSV ? 'Exporting...' : 'Export CSV'}
                </Button>
                <Button 
                    variant="outline" 
                    className="flex-1 h-10 border-slate-800 hover:bg-slate-900 text-[10px] font-black uppercase italic tracking-widest"
                    onClick={handlePrintZIMRA}
                    disabled={isLoadingCSV || isLoadingZIMRA}
                >
                    {isLoadingZIMRA ? 'Generating...' : 'Print ZIMRA Log'}
                </Button>
            </div>
            {error && (
                <div className="text-xs text-red-500 font-bold italic bg-red-500/10 p-2 rounded border border-red-500/20">
                    {error}
                </div>
            )}
        </div>
    );
}
