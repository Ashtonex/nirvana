'use client';

import React, { useState, useMemo } from 'react';
import {
    X,
    Search,
    ArrowRightLeft,
    CheckCircle2,
    AlertCircle,
    Package,
    Building2,
    Minus,
    Plus,
    Printer,
    RefreshCcw,
    Layers,
    ArrowRight
} from 'lucide-react';
import { Button, Input, Badge } from '@/components/ui';
import { transferStockBetweenShops } from '@/app/actions';
import { thermalPrinter } from '@/lib/thermalPrinter';

interface TransferStockModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentShopId: string;
    currentShopName?: string;
    inventory: any[];
    shops: { id: string; name: string }[];
    employeeId?: string;
    onStockTransferred?: (result: {
        itemId: string;
        itemName: string;
        fromShopId: string;
        toShopId: string;
        transferredQty: number;
        newSourceQty: number;
        newDestQty: number;
    }) => void;
}

export const TransferStockModal: React.FC<TransferStockModalProps> = ({
    isOpen,
    onClose,
    currentShopId,
    currentShopName,
    inventory,
    shops = [],
    employeeId,
    onStockTransferred,
}) => {
    // Form state
    const [fromShopId, setFromShopId] = useState<string>(currentShopId);
    const [toShopId, setToShopId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [transferQty, setTransferQty] = useState<number>(1);
    const [notes, setNotes] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

    // UI State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successResult, setSuccessResult] = useState<any | null>(null);

    // Keep fromShopId in sync if currentShopId changes
    React.useEffect(() => {
        if (currentShopId) {
            setFromShopId(currentShopId);
        }
    }, [currentShopId]);

    // Available destination shops (all shops except fromShopId)
    const destinationShops = useMemo(() => {
        return (shops || []).filter(
            (s) => String(s.id || '').toLowerCase() !== String(fromShopId || '').toLowerCase()
        );
    }, [shops, fromShopId]);

    // Auto-select first destination shop if not set
    React.useEffect(() => {
        if (!toShopId && destinationShops.length > 0) {
            setToShopId(destinationShops[0].id);
        } else if (toShopId && toShopId === fromShopId && destinationShops.length > 0) {
            setToShopId(destinationShops[0].id);
        }
    }, [destinationShops, toShopId, fromShopId]);

    // Categories available in inventory
    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const it of inventory || []) {
            if (it.category) set.add(it.category);
        }
        return ['ALL', ...Array.from(set).sort()];
    }, [inventory]);

    // Filter items that have stock at the source shop (or match search query)
    const filteredInventory = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const items = inventory || [];

        return items.filter((item) => {
            // Category filter
            if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
                return false;
            }

            // Text search
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const catMatch = (item.category || '').toLowerCase().includes(q);
            const idMatch = (item.id || '').toLowerCase().includes(q);

            return !q || nameMatch || catMatch || idMatch;
        }).sort((a, b) => {
            // Sort items with stock at source shop to the top
            const allocA = (a.allocations || []).find(
                (al: any) => String(al.shopId || '').toLowerCase() === String(fromShopId || '').toLowerCase()
            );
            const allocB = (b.allocations || []).find(
                (al: any) => String(al.shopId || '').toLowerCase() === String(fromShopId || '').toLowerCase()
            );
            const qtyA = Number(allocA?.quantity || 0);
            const qtyB = Number(allocB?.quantity || 0);
            return qtyB - qtyA;
        });
    }, [inventory, searchQuery, selectedCategory, fromShopId]);

    // Currently selected item detail
    const selectedItem = useMemo(() => {
        if (!selectedItemId) return null;
        return (inventory || []).find((i) => i.id === selectedItemId) || null;
    }, [inventory, selectedItemId]);

    // Available quantity at source shop
    const sourceAvailableQty = useMemo(() => {
        if (!selectedItem) return 0;
        const alloc = (selectedItem.allocations || []).find(
            (a: any) => String(a.shopId || '').toLowerCase() === String(fromShopId || '').toLowerCase()
        );
        return Math.max(0, Number(alloc?.quantity || 0));
    }, [selectedItem, fromShopId]);

    // Existing quantity at destination shop
    const destExistingQty = useMemo(() => {
        if (!selectedItem || !toShopId) return 0;
        const alloc = (selectedItem.allocations || []).find(
            (a: any) => String(a.shopId || '').toLowerCase() === String(toShopId || '').toLowerCase()
        );
        return Math.max(0, Number(alloc?.quantity || 0));
    }, [selectedItem, toShopId]);

    // Clamp transfer quantity when selected item changes
    React.useEffect(() => {
        if (selectedItem) {
            setTransferQty(sourceAvailableQty > 0 ? 1 : 0);
        }
    }, [selectedItemId, sourceAvailableQty]);

    // Shop name lookup helper
    const getShopName = (id: string) => {
        const found = (shops || []).find((s) => String(s.id || '').toLowerCase() === String(id || '').toLowerCase());
        return found?.name || id.toUpperCase();
    };

    // Quick notes presets
    const quickReasons = ['Stock Rebalance', 'Customer Request', 'Branch Restock', 'Display Sample'];

    const handleExecuteTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!selectedItemId || !selectedItem) {
            setErrorMessage('Please select a product to transfer.');
            return;
        }

        if (!toShopId) {
            setErrorMessage('Please select a destination shop.');
            return;
        }

        if (fromShopId.toLowerCase() === toShopId.toLowerCase()) {
            setErrorMessage('Source and destination shops cannot be identical.');
            return;
        }

        if (transferQty <= 0) {
            setErrorMessage('Transfer quantity must be at least 1.');
            return;
        }

        if (transferQty > sourceAvailableQty) {
            setErrorMessage(`Cannot transfer ${transferQty} pcs. Only ${sourceAvailableQty} pcs available at ${getShopName(fromShopId)}.`);
            return;
        }

        setIsSubmitting(true);

        try {
            const res = await transferStockBetweenShops({
                fromShopId,
                toShopId,
                itemId: selectedItemId,
                quantity: transferQty,
                notes: notes.trim() || undefined,
                employeeId,
            });

            if (!res.success) {
                throw new Error((res as any).message || 'Transfer failed');
            }

            setSuccessResult(res);

            // Notify parent to update live inventory state without page reload
            if (onStockTransferred) {
                onStockTransferred({
                    itemId: selectedItemId,
                    itemName: selectedItem.name,
                    fromShopId,
                    toShopId,
                    transferredQty: transferQty,
                    newSourceQty: res.newSourceQty,
                    newDestQty: res.newDestQty,
                });
            }
        } catch (err: any) {
            console.error('[TransferStockModal] Error:', err);
            setErrorMessage(err?.message || 'Failed to complete stock transfer');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintTransferSlip = () => {
        if (!successResult) return;
        try {
            thermalPrinter.printCustomText(
`================================
   STOCK TRANSFER MANIFEST
================================
Ref: ${successResult.refCode}
Date: ${new Date(successResult.timestamp).toLocaleString()}
--------------------------------
FROM: ${successResult.fromShopName}
TO:   ${successResult.toShopName}
--------------------------------
ITEM: ${successResult.itemName}
QTY TRANSFERRED: ${successResult.transferredQty} pcs

Remaining at ${successResult.fromShopName}: ${successResult.newSourceQty} pcs
New Balance at ${successResult.toShopName}: ${successResult.newDestQty} pcs
${notes ? `Notes: ${notes}\n` : ''}--------------------------------
Authorized By: Staff (${employeeId || 'POS'})
Recipient Sign: ________________
================================
`
            );
        } catch (e) {
            console.warn('Thermal print failed:', e);
        }
    };

    const handleResetForAnother = () => {
        setSelectedItemId(null);
        setTransferQty(1);
        setNotes('');
        setSuccessResult(null);
        setErrorMessage(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
                
                {/* 1. Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/70">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-sm">
                            <ArrowRightLeft className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                                    Inter-Shop Stock Transfer
                                </h2>
                                <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[9px] font-black uppercase tracking-wider">
                                    Live Sync
                                </Badge>
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium">
                                Rebalance and record inventory transfer from <span className="text-white font-bold">{getShopName(fromShopId)}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Close transfer modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 2. Success State View */}
                {successResult ? (
                    <div className="p-6 overflow-y-auto space-y-6 flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-200">
                        <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
                            <CheckCircle2 className="h-9 w-9" />
                        </div>

                        <div className="space-y-1.5 max-w-md">
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-mono uppercase font-black px-3 py-1">
                                {successResult.refCode}
                            </Badge>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white">
                                Stock Transfer Complete!
                            </h3>
                            <p className="text-xs text-slate-400">
                                Successfully deducted from <b className="text-slate-200">{successResult.fromShopName}</b> and credited to <b className="text-slate-200">{successResult.toShopName}</b>.
                            </p>
                        </div>

                        {/* Summary Card */}
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 w-full max-w-md space-y-3 text-left">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                                <span className="text-[10px] font-black uppercase text-slate-500">Transferred Item</span>
                                <span className="text-xs font-black text-white">{successResult.itemName}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase text-slate-500">Quantity Moved</span>
                                <span className="text-sm font-black text-cyan-400 font-mono">+{successResult.transferredQty} pcs</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-center">
                                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                                    <div className="text-[9px] uppercase font-bold text-slate-500 truncate">{successResult.fromShopName} Now</div>
                                    <div className="text-base font-black text-slate-200 font-mono">{successResult.newSourceQty} pcs</div>
                                </div>
                                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                                    <div className="text-[9px] uppercase font-bold text-slate-500 truncate">{successResult.toShopName} Now</div>
                                    <div className="text-base font-black text-emerald-400 font-mono">{successResult.newDestQty} pcs</div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 w-full max-w-md">
                            <Button
                                onClick={handlePrintTransferSlip}
                                variant="outline"
                                className="h-10 px-4 border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-black uppercase tracking-wider flex items-center gap-2 rounded-xl flex-1"
                            >
                                <Printer className="h-4 w-4 text-slate-400" /> Print Manifest Slip
                            </Button>
                            <Button
                                onClick={handleResetForAnother}
                                className="h-10 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 rounded-xl flex-1 shadow-lg shadow-cyan-600/20"
                            >
                                <RefreshCcw className="h-4 w-4" /> Transfer Another
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* 3. Form Body */
                    <form onSubmit={handleExecuteTransfer} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
                        
                        {/* Error Alert */}
                        {errorMessage && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150">
                                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        {/* Route Strip: FROM -> TO */}
                        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-cyan-400" /> Transfer Route
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-11 items-center gap-2">
                                
                                {/* Source Shop */}
                                <div className="sm:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                                    <div className="text-[9px] uppercase font-bold text-slate-500">Source (Deduct From)</div>
                                    <div className="text-xs font-black text-white mt-0.5 flex items-center gap-1.5 truncate">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                                        {getShopName(fromShopId)}
                                    </div>
                                </div>

                                {/* Arrow Indicator */}
                                <div className="sm:col-span-1 flex items-center justify-center text-cyan-400 py-1">
                                    <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
                                </div>

                                {/* Destination Shop Selector */}
                                <div className="sm:col-span-5 bg-slate-900 border border-cyan-500/30 rounded-lg p-2.5 focus-within:border-cyan-500 transition-colors">
                                    <label htmlFor="destination-shop-select" className="text-[9px] uppercase font-bold text-cyan-400">Destination (Credit To)</label>
                                    <select
                                        id="destination-shop-select"
                                        aria-label="Destination shop to credit inventory"
                                        value={toShopId}
                                        onChange={(e) => setToShopId(e.target.value)}
                                        className="w-full bg-transparent text-xs font-black text-white outline-none mt-0.5 cursor-pointer"
                                    >
                                        {destinationShops.map((s) => (
                                            <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                                                {s.name || s.id.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Product Search & Category Filters */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label htmlFor="transfer-product-search" className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-cyan-400" /> Select Product to Transfer
                                </label>
                                <span className="text-[10px] text-slate-500 font-bold">
                                    {filteredInventory.length} items available
                                </span>
                            </div>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <Input
                                    id="transfer-product-search"
                                    placeholder="Search product name, category, or ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 h-10 bg-slate-950 border-slate-800 text-xs focus:border-cyan-500/50 rounded-xl"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Category Quick Pills */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
                                {categories.slice(0, 8).map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-2.5 py-1 rounded-lg font-black uppercase transition-colors shrink-0 ${
                                            selectedCategory === cat
                                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Items Scrollable List */}
                            <div className="border border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800/60 bg-slate-950">
                                {filteredInventory.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-slate-500">
                                        No items matching your search.
                                    </div>
                                ) : (
                                    filteredInventory.slice(0, 40).map((it) => {
                                        const isSelected = selectedItemId === it.id;
                                        const allocSrc = (it.allocations || []).find(
                                            (a: any) => String(a.shopId || '').toLowerCase() === String(fromShopId || '').toLowerCase()
                                        );
                                        const qtySrc = Math.max(0, Number(allocSrc?.quantity || 0));

                                        const allocDest = (it.allocations || []).find(
                                            (a: any) => String(a.shopId || '').toLowerCase() === String(toShopId || '').toLowerCase()
                                        );
                                        const qtyDest = Math.max(0, Number(allocDest?.quantity || 0));

                                        return (
                                            <div
                                                key={it.id}
                                                onClick={() => {
                                                    setSelectedItemId(it.id);
                                                    setTransferQty(qtySrc > 0 ? 1 : 0);
                                                }}
                                                className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-cyan-950/40 border-l-4 border-cyan-400 pl-3'
                                                        : 'hover:bg-slate-900/60'
                                                }`}
                                            >
                                                <div className="flex flex-col min-w-0 pr-2">
                                                    <span className="text-xs font-black text-white truncate">
                                                        {it.name}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 truncate">
                                                        {it.category || 'General'} • Ref: ${Number(it.landed_cost || it.acquisition_price || 0).toFixed(2)} cost
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="text-right">
                                                        <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded ${
                                                            qtySrc > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400'
                                                        }`}>
                                                            {qtySrc} at {getShopName(fromShopId).split(' ')[0]}
                                                        </span>
                                                        <div className="text-[9px] text-slate-500 font-bold mt-0.5">
                                                            {qtyDest} at {getShopName(toShopId).split(' ')[0]}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Selected Item Quantity Config */}
                        {selectedItem && (
                            <div className="p-3.5 bg-slate-950 border border-cyan-500/30 rounded-xl space-y-3 animate-in fade-in duration-150">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-xs font-black text-white">{selectedItem.name}</div>
                                        <div className="text-[10px] text-slate-400 font-medium">
                                            Available to transfer: <b className="text-emerald-400">{sourceAvailableQty} pcs</b>
                                        </div>
                                    </div>
                                    {sourceAvailableQty <= 0 && (
                                        <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[9px] font-black uppercase">
                                            0 In Stock at Source
                                        </Badge>
                                    )}
                                </div>

                                {/* Stepper & Quick Pills */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setTransferQty((prev) => Math.max(1, prev - 1))}
                                            disabled={transferQty <= 1 || sourceAvailableQty === 0}
                                            className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                                        >
                                            <Minus className="h-4 w-4" />
                                        </button>
                                        <input
                                            type="number"
                                            min={1}
                                            max={sourceAvailableQty}
                                            value={transferQty}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                if (Number.isNaN(val)) setTransferQty(1);
                                                else setTransferQty(Math.min(sourceAvailableQty, Math.max(1, val)));
                                            }}
                                            className="h-10 w-20 text-center font-black text-base bg-slate-900 border border-slate-800 rounded-xl text-white outline-none focus:border-cyan-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setTransferQty((prev) => Math.min(sourceAvailableQty, prev + 1))}
                                            disabled={transferQty >= sourceAvailableQty}
                                            className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Quick Preset Pills */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {[1, 5, 10].map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setTransferQty(Math.min(sourceAvailableQty, preset))}
                                                disabled={sourceAvailableQty < preset}
                                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-black text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                                            >
                                                +{preset}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setTransferQty(sourceAvailableQty)}
                                            disabled={sourceAvailableQty === 0}
                                            className="px-2.5 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-[10px] font-black text-cyan-300 hover:text-white disabled:opacity-30 transition-colors"
                                        >
                                            MAX ({sourceAvailableQty})
                                        </button>
                                    </div>
                                </div>

                                {/* Live Projected Balance Preview */}
                                <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] grid grid-cols-2 gap-2 text-center">
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-500">{getShopName(fromShopId)} After:</span>
                                        <div className="font-mono font-black text-slate-200">
                                            {sourceAvailableQty} ➔ <b className="text-amber-400">{Math.max(0, sourceAvailableQty - transferQty)} pcs</b>
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase font-bold text-slate-500">{getShopName(toShopId)} After:</span>
                                        <div className="font-mono font-black text-slate-200">
                                            {destExistingQty} ➔ <b className="text-emerald-400">{destExistingQty + transferQty} pcs</b>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Optional Notes & Quick Reasons */}
                        <div className="space-y-1.5">
                            <label htmlFor="transfer-notes-input" className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                Notes / Reason (Optional)
                            </label>
                            <Input
                                id="transfer-notes-input"
                                placeholder="e.g. Low stock rebalance, customer special request..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="h-9 bg-slate-950 border-slate-800 text-xs focus:border-cyan-500/50 rounded-xl"
                            />
                            <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                                {quickReasons.map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setNotes(r)}
                                        className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[9px] font-bold text-slate-400 hover:text-white transition-colors shrink-0"
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="h-10 px-4 border-slate-800 text-slate-400 hover:text-white text-xs font-black uppercase tracking-wider rounded-xl"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting || !selectedItemId || sourceAvailableQty === 0 || transferQty <= 0}
                                className="h-10 px-6 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 rounded-xl shadow-lg shadow-cyan-600/25 disabled:opacity-50 transition-all hover:scale-[1.02]"
                            >
                                <ArrowRightLeft className={`h-4 w-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                                {isSubmitting ? 'Transferring...' : `Transfer ${transferQty} pcs to ${getShopName(toShopId).split(' ')[0]}`}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
