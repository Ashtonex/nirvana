'use client';

import { useState } from 'react';
import { PeriodSelector, Period } from './PeriodSelector';
import { TaxReportingControls } from './TaxReportingControls';
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardDescription,
    Badge,
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from "@/components/ui";
import { TrendingUp, TrendingDown, Scale, FileText } from 'lucide-react';

interface TaxLedgerFilteredProps {
    shops: any[];
    sales: any[];
    settings: any;
}

export function TaxLedgerFiltered({ shops, sales, settings }: TaxLedgerFilteredProps) {
    const [period, setPeriod] = useState<Period>('month');
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [endDate, setEndDate] = useState<Date | undefined>();

    const flatTaxRate = 0.155;

    // Filter sales based on selected period and tax threshold
    // Sales ABOVE threshold should NOT appear in tax ledger (only in financials)
    const filteredSales = sales.filter((sale: any) => {
        const saleDate = new Date(sale.date);
        
        // Filter by period
        if (startDate && endDate) {
            if (saleDate < startDate || saleDate > endDate) return false;
        }
        
        // Filter out above-threshold sales from tax ledger
        // These sales are NOT filed with ZIMRA, only shown in financials
        if (settings.taxMode === 'above_threshold' && sale.totalBeforeTax > settings.taxThreshold) {
            return false;
        }
        
        return true;
    });

    // Count excluded sales (above threshold) for display
    const excludedSales = settings.taxMode === 'above_threshold' 
        ? sales.filter((sale: any) => {
            const saleDate = new Date(sale.date);
            if (startDate && endDate) {
                if (saleDate < startDate || saleDate > endDate) return false;
            }
            return sale.totalBeforeTax > settings.taxThreshold;
        })
        : [];

    // Calculate metrics
    const totalSales = filteredSales.reduce((sum: number, s: any) => sum + s.totalWithTax, 0);
    const theoreticalTax = filteredSales.reduce((sum: number, s: any) => sum + (s.totalBeforeTax * flatTaxRate), 0);
    const reportedTax = filteredSales.reduce((sum: number, s: any) => sum + s.tax, 0);
    const taxSaving = theoreticalTax - reportedTax;

    const handlePeriodChange = (newPeriod: Period, newStartDate?: Date, newEndDate?: Date) => {
        setPeriod(newPeriod);
        setStartDate(newStartDate);
        setEndDate(newEndDate);
    };

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Select Period</h3>
                <PeriodSelector onPeriodChange={handlePeriodChange} />
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Standard Liability</p>
                    </div>
                    <div className="text-lg font-black text-white font-mono">${theoreticalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Theoretical 15.5%</p>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Scale className="h-3 w-3 text-sky-500" />
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reported Liability</p>
                    </div>
                    <div className="text-lg font-black text-sky-400 font-mono">${reportedTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Based on {settings.taxMode === 'all' ? 'Flat' : 'Threshold'}</p>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="h-3 w-3 text-emerald-500" />
                        <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest">Strategic Delta</p>
                    </div>
                    <div className="text-lg font-black text-emerald-400 font-mono">${taxSaving.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Efficiency Gain</p>
                </div>
            </div>

            {/* Reporting Controls */}
            <div className="border-t border-slate-800 pt-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Export & Print</h3>
                <TaxReportingControls period={period} startDate={startDate} endDate={endDate} />
            </div>

            {/* Tax Ledger Table */}
            <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-black uppercase italic flex items-center gap-2">
                            <FileText className="h-4 w-4 text-sky-500" /> Itemized Tax Ledger
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                            Showing {filteredSales.length} transaction{filteredSales.length !== 1 ? 's' : ''}
                            {settings.taxMode === 'above_threshold' && excludedSales.length > 0 && (
                                <span className="text-amber-500 ml-2">
                                    ({excludedSales.length} above ${settings.taxThreshold} threshold - NOT filed)
                                </span>
                            )}
                        </p>
                    </div>
                    <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[10px] uppercase font-black">
                        Strategy: {settings.taxMode.replace('_', ' ')}
                    </Badge>
                </div>

                <div className="rounded-md border border-slate-800 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                                <TableHead className="text-[10px] font-black uppercase text-slate-500">Date/ID</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-500">Product</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-500">Shop</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Unit Price</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Standard Tax</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Reported Tax</TableHead>
                                <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSales.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500 font-bold italic text-sm">
                                        The ledger is silent. No fiscal records found for this period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSales.map((sale: any) => {
                                    const standardTax = sale.totalBeforeTax * flatTaxRate;
                                    const shopName = shops.find((s: any) => s.id === sale.shopId)?.name || sale.shopId;
                                    const isUnderThreshold = settings.taxMode === 'above_threshold' && sale.totalBeforeTax <= settings.taxThreshold;
                                    const isCredit = Number(sale.totalWithTax || 0) < 0 || Number(sale.tax || 0) < 0;

                                    return (
                                        <TableRow key={sale.id} className="border-slate-800 hover:bg-slate-900/30 transition-colors">
                                            <TableCell className="font-mono text-[10px] text-slate-400">
                                                <div>{new Date(sale.date).toLocaleDateString()}</div>
                                                <div className="text-[8px] opacity-50">#{sale.id}</div>
                                            </TableCell>
                                            <TableCell className="font-bold text-white text-xs">
                                                {sale.itemName}
                                                <div className="text-[9px] text-slate-500 font-medium">Qty: {sale.quantity}</div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="border-slate-800 text-[9px] uppercase font-black py-0">
                                                    {shopName}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs font-bold">
                                                ${sale.unitPrice.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs text-slate-500">
                                                ${standardTax.toFixed(2)}
                                            </TableCell>
                                            <TableCell className={`text-right font-mono text-xs font-black ${sale.tax > 0 ? 'text-sky-400' : 'text-slate-600'}`}>
                                                ${sale.tax.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {isCredit ? (
                                                    <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[8px] font-black italic">CREDIT</Badge>
                                                ) : isUnderThreshold ? (
                                                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] font-black italic">EXEMPT</Badge>
                                                ) : (
                                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[8px] font-black italic">FILED</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
