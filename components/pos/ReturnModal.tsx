'use client';

import React, { useState, useMemo } from 'react';
import { 
    X, 
    Search, 
    RotateCcw, 
    AlertCircle, 
    CheckCircle2, 
    Package, 
    Calendar, 
    User, 
    ArrowLeft,
    Receipt,
    ShieldAlert,
    HelpCircle
} from 'lucide-react';
import { Input, Button } from '@/components/ui';

interface ReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    sales: any[];
    shopId: string;
    canIssueReturn: boolean;
    onReturnCompleted: (returnId: string) => void;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
    isOpen,
    onClose,
    sales,
    shopId,
    canIssueReturn,
    onReturnCompleted,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
    const [returnQty, setReturnQty] = useState<number>(1);
    const [returnReason, setReturnReason] = useState<string>('Customer return');
    const [returnNotes, setReturnNotes] = useState<string>('');
    const [stockDisposition, setStockDisposition] = useState<'saleable' | 'damaged'>('saleable');
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'all'>('today');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    // 1. Index all return records to compute already-refunded quantities
    const refundedQuantitiesBySaleId = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of sales) {
            const total = Number(s.totalWithTax || 0);
            if (total < 0) {
                // This is a return/credit note
                const cName = String(s.clientName || '');
                const notes = String(s.notes || '');
                const match = cName.match(/\[REF:([a-zA-Z0-9_-]+)\]/) || notes.match(/\[REF:([a-zA-Z0-9_-]+)\]/);
                const refId = match ? match[1] : s.originalSaleId;
                if (refId) {
                    const existing = map.get(refId) || 0;
                    map.set(refId, existing + Math.abs(Number(s.quantity || 0)));
                }
            }
        }
        return map;
    }, [sales]);

    // 2. Filter eligible original sales
    const eligibleSales = useMemo(() => {
        return sales
            .filter((s) => {
                // Only positive original sales
                const total = Number(s.totalWithTax || 0);
                const qty = Number(s.quantity || 0);
                if (total <= 0 || qty <= 0) return false;
                if (s.shopId && s.shopId !== shopId) return false;

                const alreadyReturned = refundedQuantitiesBySaleId.get(s.id) || 0;
                const remaining = qty - alreadyReturned;
                return remaining > 0;
            })
            .map((s) => {
                const qty = Number(s.quantity || 0);
                const alreadyReturned = refundedQuantitiesBySaleId.get(s.id) || 0;
                const returnableQty = Math.max(0, qty - alreadyReturned);

                const dateObj = new Date(s.date);
                const isToday = s.date?.split('T')[0] === todayStr;
                const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const formattedDate = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                return {
                    ...s,
                    returnableQty,
                    alreadyReturned,
                    isToday,
                    formattedTime,
                    formattedDate,
                    displayLabel: `${s.itemName || 'Item'} - $${Number(s.totalWithTax || 0).toFixed(2)}`,
                };
            });
    }, [sales, shopId, refundedQuantitiesBySaleId, todayStr]);

    // 3. Search and period filtering
    const filteredSales = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return eligibleSales.filter((s) => {
            if (filterPeriod === 'today' && !s.isToday) return false;
            if (!query) return true;

            const nameMatch = (s.itemName || '').toLowerCase().includes(query);
            const clientMatch = (s.clientName || '').toLowerCase().includes(query);
            const idMatch = (s.id || '').toLowerCase().includes(query);
            const methodMatch = (s.paymentMethod || '').toLowerCase().includes(query);

            return nameMatch || clientMatch || idMatch || methodMatch;
        });
    }, [eligibleSales, searchQuery, filterPeriod]);

    // Active selected sale
    const selectedSale = useMemo(() => {
        if (!selectedSaleId) return null;
        return eligibleSales.find((s) => s.id === selectedSaleId) || null;
    }, [eligibleSales, selectedSaleId]);

    if (!isOpen) return null;

    const handleSelectSale = (sale: any) => {
        setSelectedSaleId(sale.id);
        setReturnQty(1);
        setStatusMessage(null);
    };

    const handleBackToList = () => {
        setSelectedSaleId(null);
        setStatusMessage(null);
    };

    const handleSubmitReturn = async () => {
        if (!selectedSale) return;
        if (!canIssueReturn) {
            setStatusMessage({ type: 'error', text: 'Forbidden: Manager role required to issue returns.' });
            return;
        }

        const maxReturnable = selectedSale.returnableQty;
        if (returnQty < 1 || returnQty > maxReturnable) {
            setStatusMessage({
                type: 'error',
                text: `Invalid quantity. You can return between 1 and ${maxReturnable} units.`,
            });
            return;
        }

        setIsSubmitting(true);
        setStatusMessage(null);

        try {
            const res = await fetch('/api/returns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    saleId: selectedSale.id,
                    quantity: returnQty,
                    reason: returnReason,
                    notes: returnNotes.trim(),
                    restock: stockDisposition === 'saleable',
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to record return');
            }

            setStatusMessage({
                type: 'success',
                text: `Return processed successfully! Credit note ID: ${data.returnId || 'OK'}`,
            });

            onReturnCompleted(data.returnId);
            setTimeout(() => {
                onClose();
                handleBackToList();
            }, 1200);
        } catch (err: any) {
            setStatusMessage({ type: 'error', text: err.message || 'Return failed' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate refund details
    const unitPrice = selectedSale ? Number(selectedSale.unitPrice || 0) : 0;
    const totalOriginalWithTax = selectedSale ? Number(selectedSale.totalWithTax || 0) : 0;
    const saleQty = selectedSale ? Number(selectedSale.quantity || 1) : 1;
    const perUnitWithTax = saleQty > 0 ? totalOriginalWithTax / saleQty : 0;
    const calculatedRefund = perUnitWithTax * returnQty;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <RotateCcw className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-100">
                                Product Return & Credit Note
                            </h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                Process customer refunds and manage stock disposition
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

                {/* Body */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                    {!canIssueReturn && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-400 text-xs">
                            <ShieldAlert className="h-5 w-5 shrink-0" />
                            <span>Only Managers, Lead Managers, or Owners are authorized to issue refunds and credit notes.</span>
                        </div>
                    )}

                    {statusMessage && (
                        <div
                            className={`p-3 rounded-xl flex items-center gap-3 text-xs font-bold ${
                                statusMessage.type === 'error'
                                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            }`}
                        >
                            {statusMessage.type === 'error' ? (
                                <AlertCircle className="h-4 w-4 shrink-0" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                            )}
                            <span>{statusMessage.text}</span>
                        </div>
                    )}

                    {!selectedSale ? (
                        /* STEP 1: SELECT SALE (PRODUCT-FIRST) */
                        <div className="space-y-4">
                            {/* Search and Period Filter */}
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                    <Input
                                        placeholder="Search by product name, SKU, customer, or ID..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                    />
                                </div>
                                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setFilterPeriod('today')}
                                        className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all ${
                                            filterPeriod === 'today'
                                                ? 'bg-violet-600 text-white'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        Today
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterPeriod('all')}
                                        className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all ${
                                            filterPeriod === 'all'
                                                ? 'bg-violet-600 text-white'
                                                : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                        Last 60 Days
                                    </button>
                                </div>
                            </div>

                            {/* Product Sales List */}
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                {filteredSales.length === 0 ? (
                                    <div className="py-12 text-center text-slate-500">
                                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                        <p className="text-xs font-bold uppercase tracking-wider">
                                            No eligible returnable sales found
                                        </p>
                                        <p className="text-[10px] text-slate-600 mt-1">
                                            Try searching with a different product name or select "Last 60 Days"
                                        </p>
                                    </div>
                                ) : (
                                    filteredSales.map((sale) => (
                                        <div
                                            key={sale.id}
                                            onClick={() => handleSelectSale(sale)}
                                            className="p-3 bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-slate-950 group"
                                        >
                                            <div className="space-y-1 min-w-0 pr-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black text-slate-100 group-hover:text-amber-400 transition-colors truncate">
                                                        {sale.itemName || 'Product'}
                                                    </span>
                                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                                        #{sale.id}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3 text-slate-500" />
                                                        {sale.formattedDate} {sale.formattedTime}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <User className="h-3 w-3 text-slate-500" />
                                                        {sale.clientName || 'Walk-in'}
                                                    </span>
                                                    <span className="uppercase text-slate-500 font-bold">
                                                        {sale.paymentMethod}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <div className="text-xs font-black text-emerald-400">
                                                    ${Number(sale.totalWithTax || 0).toFixed(2)}
                                                </div>
                                                <div className="text-[10px] font-bold text-amber-400/90">
                                                    {sale.returnableQty} of {sale.quantity} returnable
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        /* STEP 2: RETURN PREVIEW & REASON DETAILS */
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={handleBackToList}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" /> Back to Product Sales
                            </button>

                            {/* Sale Card Summary */}
                            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-[10px] font-bold uppercase text-slate-500">Selected Item</span>
                                        <h3 className="text-sm font-black text-slate-100">{selectedSale.itemName}</h3>
                                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                                            <span>Original Sale: #{selectedSale.id}</span>
                                            <span>•</span>
                                            <span>Sold on: {selectedSale.formattedDate} {selectedSale.formattedTime}</span>
                                            <span>•</span>
                                            <span className="uppercase">{selectedSale.paymentMethod}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-bold uppercase text-slate-500">Unit Price</span>
                                        <div className="text-sm font-mono font-bold text-slate-200">
                                            ${perUnitWithTax.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Return Form Controls */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Quantity selector */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Return Quantity (Max: {selectedSale.returnableQty})
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={returnQty <= 1}
                                            onClick={() => setReturnQty(Math.max(1, returnQty - 1))}
                                            className="h-10 w-10 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded-lg text-slate-200 font-black disabled:opacity-30"
                                        >
                                            -
                                        </button>
                                        <div className="h-10 flex-1 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center font-bold text-slate-100">
                                            {returnQty}
                                        </div>
                                        <button
                                            type="button"
                                            disabled={returnQty >= selectedSale.returnableQty}
                                            onClick={() => setReturnQty(Math.min(selectedSale.returnableQty, returnQty + 1))}
                                            className="h-10 w-10 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded-lg text-slate-200 font-black disabled:opacity-30"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                {/* Stock Disposition */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Item Condition / Restock
                                    </label>
                                    <select
                                        value={stockDisposition}
                                        onChange={(e) => setStockDisposition(e.target.value as any)}
                                        className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                    >
                                        <option value="saleable">Restock to Shop Inventory (Saleable)</option>
                                        <option value="damaged">Do Not Restock (Damaged / Scrapped)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Reason */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Return Reason
                                    </label>
                                    <select
                                        value={returnReason}
                                        onChange={(e) => setReturnReason(e.target.value)}
                                        className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                    >
                                        <option value="Customer return">Customer return</option>
                                        <option value="Damaged / Defective">Damaged / Defective</option>
                                        <option value="Wrong item">Wrong item</option>
                                        <option value="Warranty">Warranty</option>
                                        <option value="Price correction">Price correction</option>
                                        <option value="Goodwill">Goodwill</option>
                                    </select>
                                </div>

                                {/* Notes */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Notes (Audit Context)
                                    </label>
                                    <Input
                                        placeholder="Optional context for manager audit"
                                        value={returnNotes}
                                        onChange={(e) => setReturnNotes(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                    />
                                </div>
                            </div>

                            {/* Refund Summary Calculation Card */}
                            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-black text-emerald-400">
                                        Calculated Refund Value
                                    </span>
                                    <p className="text-[11px] text-slate-400">
                                        {returnQty} unit{returnQty > 1 ? 's' : ''} @ ${perUnitWithTax.toFixed(2)}
                                    </p>
                                </div>
                                <div className="text-xl font-mono font-black text-emerald-400">
                                    -${calculatedRefund.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="border-slate-800 text-slate-400 hover:text-white"
                    >
                        Cancel
                    </Button>

                    {selectedSale && (
                        <Button
                            onClick={handleSubmitReturn}
                            disabled={isSubmitting || !canIssueReturn}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-wider text-xs px-5 h-10 flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                'Processing Return...'
                            ) : (
                                <>
                                    <RotateCcw className="h-4 w-4" />
                                    Process Return (-${calculatedRefund.toFixed(2)})
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
