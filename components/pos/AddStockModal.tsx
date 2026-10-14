'use client';

import React, { useState, useMemo } from 'react';
import { 
    X, 
    Search, 
    PackagePlus, 
    Layers, 
    ArrowRightLeft, 
    CheckCircle2, 
    AlertCircle, 
    Package, 
    Building2,
    DollarSign,
    ClipboardCheck
} from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { receiveStockInShop } from '@/app/actions';

interface AddStockModalProps {
    isOpen: boolean;
    onClose: () => void;
    shopId: string;
    inventory: any[];
    shops?: { id: string; name: string }[];
    employeeId?: string;
    onStockReceived: (item: any, deltaQty: number) => void;
}

export const AddStockModal: React.FC<AddStockModalProps> = ({
    isOpen,
    onClose,
    shopId,
    inventory,
    shops = [],
    employeeId,
    onStockReceived,
}) => {
    const [activeTab, setActiveTab] = useState<'existing' | 'new_product'>('existing');

    // Existing SKU form state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [movementType, setMovementType] = useState<'received_new' | 'allocated_from_central' | 'inter_shop_transfer' | 'count_correction'>('received_new');
    const [sourceShopId, setSourceShopId] = useState<string>('');
    const [quantityToAdd, setQuantityToAdd] = useState<string>('1');
    const [unitLandedCost, setUnitLandedCost] = useState<string>('');
    const [supplier, setSupplier] = useState<string>('');
    const [deliveryRef, setDeliveryRef] = useState<string>('');
    const [notes, setNotes] = useState<string>('');

    // New Product form state
    const [newProductName, setNewProductName] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [newCustomCategory, setNewCustomCategory] = useState('');
    const [newSku, setNewSku] = useState('');
    const [newLandedCost, setNewLandedCost] = useState('');
    const [newInitialStock, setNewInitialStock] = useState('1');
    const [newSupplier, setNewSupplier] = useState('');
    const [newNotes, setNewNotes] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

    // Categories list for autocomplete
    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const i of inventory) {
            if (i.category) set.add(i.category);
        }
        return Array.from(set).sort();
    }, [inventory]);

    // Filtered inventory list
    const filteredInventory = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return inventory.slice(0, 30);
        return inventory.filter((item) => {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const catMatch = (item.category || '').toLowerCase().includes(q);
            const idMatch = (item.id || '').toLowerCase().includes(q);
            return nameMatch || catMatch || idMatch;
        }).slice(0, 50);
    }, [inventory, searchQuery]);

    // Selected item detail
    const selectedItem = useMemo(() => {
        if (!selectedItemId) return null;
        return inventory.find((i) => i.id === selectedItemId) || null;
    }, [inventory, selectedItemId]);

    // Current shop allocation of selected item
    const currentShopStock = useMemo(() => {
        if (!selectedItem) return 0;
        const alloc = (selectedItem.allocations || []).find((a: any) => a.shopId === shopId);
        return alloc ? Number(alloc.quantity || 0) : 0;
    }, [selectedItem, shopId]);

    // Other shops for transfer
    const otherShops = useMemo(() => {
        return shops.filter((s) => s.id !== shopId);
    }, [shops, shopId]);

    // Check duplicate name for new product
    const duplicateMatch = useMemo(() => {
        if (!newProductName.trim()) return null;
        const nameClean = newProductName.trim().toLowerCase();
        return inventory.find((i) => (i.name || '').toLowerCase() === nameClean) || null;
    }, [newProductName, inventory]);

    if (!isOpen) return null;

    const handleSelectExistingItem = (item: any) => {
        setSelectedItemId(item.id);
        setUnitLandedCost(String(item.landedCost || ''));
        setStatusMessage(null);
    };

    const handleSwitchToExistingDuplicate = (item: any) => {
        setActiveTab('existing');
        setSelectedItemId(item.id);
        setUnitLandedCost(String(item.landedCost || ''));
        setStatusMessage(null);
    };

    const handleSubmitExisting = async () => {
        if (!selectedItem) return;
        const qtyNum = Number(quantityToAdd);
        if (movementType !== 'count_correction' && (isNaN(qtyNum) || qtyNum <= 0)) {
            setStatusMessage({ type: 'error', text: 'Please enter a valid positive quantity received.' });
            return;
        }
        if (movementType === 'count_correction' && (isNaN(qtyNum) || qtyNum < 0)) {
            setStatusMessage({ type: 'error', text: 'Count correction requires a non-negative count.' });
            return;
        }
        if (movementType === 'inter_shop_transfer' && !sourceShopId) {
            setStatusMessage({ type: 'error', text: 'Please select a source shop for inter-shop transfer.' });
            return;
        }

        setIsSubmitting(true);
        setStatusMessage(null);

        try {
            const res = await receiveStockInShop({
                mode: 'existing',
                shopId,
                itemId: selectedItem.id,
                quantityToAdd: qtyNum,
                unitLandedCost: parseFloat(unitLandedCost) || 0,
                movementType,
                sourceShopId: movementType === 'inter_shop_transfer' ? sourceShopId : undefined,
                supplier: supplier.trim(),
                deliveryRef: deliveryRef.trim(),
                notes: notes.trim(),
                employeeId,
            });

            if (!res.success) {
                throw new Error((res as any).message || 'Failed to receive stock');
            }

            setStatusMessage({
                type: 'success',
                text: `Successfully received stock for "${selectedItem.name}". New shop stock: ${res.newShopQty} units.`,
            });

            onStockReceived(res.item, res.addedStock);

            setTimeout(() => {
                onClose();
                setSelectedItemId(null);
                setQuantityToAdd('1');
                setNotes('');
            }, 1200);
        } catch (err: any) {
            setStatusMessage({ type: 'error', text: err.message || 'Stock receipt failed' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmitNew = async () => {
        if (!newProductName.trim()) {
            setStatusMessage({ type: 'error', text: 'Product name is required.' });
            return;
        }
        const initialQty = parseInt(newInitialStock) || 0;
        const landedCostNum = parseFloat(newLandedCost) || 0;
        const resolvedCategory = newCategory === '__custom__' ? newCustomCategory.trim() : newCategory.trim();

        setIsSubmitting(true);
        setStatusMessage(null);

        try {
            const res = await receiveStockInShop({
                mode: 'new_product',
                shopId,
                name: newProductName.trim(),
                category: resolvedCategory || 'General',
                sku: newSku.trim() || undefined,
                landedCost: landedCostNum,
                initialStock: initialQty,
                supplier: newSupplier.trim(),
                notes: newNotes.trim(),
                employeeId,
            });

            if ((res as any).duplicateFound) {
                setStatusMessage({
                    type: 'error',
                    text: (res as any).message || 'Product already exists. Please select it in Existing SKU mode.',
                });
                return;
            }

            if (!res.success) {
                throw new Error((res as any).message || 'Failed to create product');
            }

            setStatusMessage({
                type: 'success',
                text: `Product "${newProductName}" created with ${initialQty} initial units!`,
            });

            onStockReceived(res.item, initialQty);

            setTimeout(() => {
                onClose();
                setNewProductName('');
                setNewCategory('');
                setNewLandedCost('');
                setNewInitialStock('1');
            }, 1200);
        } catch (err: any) {
            setStatusMessage({ type: 'error', text: err.message || 'Product creation failed' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <PackagePlus className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-100">
                                Stock Management & Intake
                            </h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                Location: <span className="text-emerald-400 font-black">{shopId.toUpperCase()}</span>
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

                {/* Mode Tabs */}
                <div className="flex border-b border-slate-800 bg-slate-950/30 px-4 pt-2 gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('existing');
                            setStatusMessage(null);
                        }}
                        className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'existing'
                                ? 'border-emerald-500 text-emerald-400'
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <Layers className="h-3.5 w-3.5" /> Receive to Existing SKU
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('new_product');
                            setStatusMessage(null);
                        }}
                        className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                            activeTab === 'new_product'
                                ? 'border-violet-500 text-violet-400'
                                : 'border-transparent text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <PackagePlus className="h-3.5 w-3.5" /> Create Brand-New Product
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
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

                    {activeTab === 'existing' ? (
                        /* TAB 1: RECEIVE TO EXISTING SKU */
                        <div className="space-y-4">
                            {!selectedItem ? (
                                /* Substep 1: Search & Pick Product */
                                <div className="space-y-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                        <Input
                                            placeholder="Search existing items by name, category, or ID..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                        />
                                    </div>

                                    <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                                        {filteredInventory.length === 0 ? (
                                            <div className="py-10 text-center text-slate-500">
                                                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                                <p className="text-xs font-bold uppercase">No matching products found</p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setNewProductName(searchQuery);
                                                        setActiveTab('new_product');
                                                    }}
                                                    className="mt-3 text-xs font-bold text-violet-400 hover:underline"
                                                >
                                                    + Create "{searchQuery}" as a new product
                                                </button>
                                            </div>
                                        ) : (
                                            filteredInventory.map((item) => {
                                                const shopAlloc = (item.allocations || []).find((a: any) => a.shopId === shopId);
                                                const qtyHere = shopAlloc ? Number(shopAlloc.quantity || 0) : 0;
                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => handleSelectExistingItem(item)}
                                                        className="p-3 bg-slate-950/60 border border-slate-800 hover:border-emerald-500/40 rounded-xl flex items-center justify-between cursor-pointer transition-all hover:bg-slate-950 group"
                                                    >
                                                        <div className="min-w-0 pr-3">
                                                            <div className="text-xs font-black text-slate-100 group-hover:text-emerald-400 transition-colors truncate">
                                                                {item.name}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                                                <span className="uppercase">{item.category || 'General'}</span>
                                                                <span>•</span>
                                                                <span>Cost: ${Number(item.landedCost || 0).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <div className="text-xs font-black text-emerald-400">
                                                                {qtyHere} in shop
                                                            </div>
                                                            <div className="text-[9px] text-slate-500">
                                                                Total: {item.quantity || 0}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* Substep 2: Configure Stock Receipt for Selected Item */
                                <div className="space-y-4">
                                    {/* Item Summary Pill */}
                                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center">
                                        <div>
                                            <span className="text-[9px] font-bold uppercase text-slate-500">Receiving Item</span>
                                            <h3 className="text-sm font-black text-slate-100">{selectedItem.name}</h3>
                                            <p className="text-[10px] text-slate-400">Category: {selectedItem.category || 'General'}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[9px] font-bold uppercase text-slate-500">Current Stock</span>
                                            <div className="text-xs font-black text-emerald-400">{currentShopStock} units</div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedItemId(null)}
                                                className="text-[10px] text-sky-400 hover:underline mt-0.5"
                                            >
                                                Change Item
                                            </button>
                                        </div>
                                    </div>

                                    {/* Movement Type */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                            Movement Operation
                                        </label>
                                        <select
                                            value={movementType}
                                            onChange={(e) => setMovementType(e.target.value as any)}
                                            className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                        >
                                            <option value="received_new">New Goods Received (Increases Shop & Company Stock)</option>
                                            <option value="allocated_from_central">Allocate from Central Stock (Company Stock Unchanged)</option>
                                            <option value="inter_shop_transfer">Inter-Shop Transfer (Move from Another Shop)</option>
                                            <option value="count_correction">Stock Count Adjustment (Reconcile to Physical Audit)</option>
                                        </select>
                                    </div>

                                    {/* Source Shop (if transfer) */}
                                    {movementType === 'inter_shop_transfer' && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                                                Transfer From Which Location?
                                            </label>
                                            <select
                                                value={sourceShopId}
                                                onChange={(e) => setSourceShopId(e.target.value)}
                                                className="h-10 bg-slate-950 border border-amber-500/40 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                            >
                                                <option value="">-- Select Source Shop --</option>
                                                {otherShops.map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name} ({s.id.toUpperCase()})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Quantity & Unit Cost */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                                {movementType === 'count_correction' ? 'Target Physical Count' : 'Quantity Received'}
                                            </label>
                                            <div className="flex gap-1.5">
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    placeholder="e.g. 10"
                                                    value={quantityToAdd}
                                                    onChange={(e) => setQuantityToAdd(e.target.value)}
                                                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-bold h-10"
                                                />
                                                {movementType !== 'count_correction' && (
                                                    <div className="flex gap-1">
                                                        {['5', '10', '25'].map((q) => (
                                                            <button
                                                                key={q}
                                                                type="button"
                                                                onClick={() => setQuantityToAdd(q)}
                                                                className="px-2 bg-slate-950 border border-slate-800 text-[10px] font-black text-slate-300 rounded hover:bg-slate-800"
                                                            >
                                                                +{q}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                                Unit Landed Cost ($)
                                            </label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={unitLandedCost}
                                                onChange={(e) => setUnitLandedCost(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-xs text-slate-100 h-10"
                                            />
                                        </div>
                                    </div>

                                    {/* Supplier & Delivery Reference */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                                Supplier (Optional)
                                            </label>
                                            <Input
                                                placeholder="e.g. Acme Imports"
                                                value={supplier}
                                                onChange={(e) => setSupplier(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                                Delivery / Invoice Ref
                                            </label>
                                            <Input
                                                placeholder="e.g. INV-8492"
                                                value={deliveryRef}
                                                onChange={(e) => setDeliveryRef(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                            Intake Notes
                                        </label>
                                        <Input
                                            placeholder="Optional audit notes"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                        />
                                    </div>

                                    {/* Live Preview Card */}
                                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-300">New Shop Stock Level:</span>
                                        <span className="font-mono font-black text-emerald-400 text-sm">
                                            {movementType === 'count_correction'
                                                ? `${Number(quantityToAdd || 0)} units`
                                                : `${currentShopStock + (Number(quantityToAdd) || 0)} units (+${Number(quantityToAdd) || 0})`}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* TAB 2: CREATE BRAND NEW PRODUCT */
                        <div className="space-y-4">
                            {duplicateMatch && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2 text-amber-400">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>Item with this name already exists in catalog.</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleSwitchToExistingDuplicate(duplicateMatch)}
                                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase text-[10px] rounded-lg shrink-0"
                                    >
                                        Use Existing Product
                                    </button>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                    Product Name *
                                </label>
                                <Input
                                    placeholder="e.g. Classic Oversized Hoodie - Charcoal (L)"
                                    value={newProductName}
                                    onChange={(e) => setNewProductName(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-bold h-10"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Category
                                    </label>
                                    <select
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        className="h-10 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-200 px-3 outline-none w-full"
                                    >
                                        <option value="">-- Select Category --</option>
                                        {categories.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                        <option value="__custom__">+ Enter Custom Category...</option>
                                    </select>
                                    {newCategory === '__custom__' && (
                                        <Input
                                            placeholder="Type custom category name..."
                                            value={newCustomCategory}
                                            onChange={(e) => setNewCustomCategory(e.target.value)}
                                            className="mt-2 bg-slate-950 border-slate-800 text-xs text-slate-200 h-9"
                                        />
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        SKU / Barcode (Optional)
                                    </label>
                                    <Input
                                        placeholder="Leave blank to auto-generate"
                                        value={newSku}
                                        onChange={(e) => setNewSku(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Unit Landed Cost ($)
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={newLandedCost}
                                        onChange={(e) => setNewLandedCost(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-100 h-10"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Initial Stock for {shopId.toUpperCase()}
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={newInitialStock}
                                        onChange={(e) => setNewInitialStock(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-bold text-sky-400 h-10"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Supplier / Origin
                                    </label>
                                    <Input
                                        placeholder="e.g. Factory Direct"
                                        value={newSupplier}
                                        onChange={(e) => setNewSupplier(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Notes
                                    </label>
                                    <Input
                                        placeholder="Optional intake notes"
                                        value={newNotes}
                                        onChange={(e) => setNewNotes(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs text-slate-200 h-10"
                                    />
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

                    {activeTab === 'existing' ? (
                        selectedItem && (
                            <Button
                                onClick={handleSubmitExisting}
                                disabled={isSubmitting}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider text-xs px-5 h-10 flex items-center gap-2"
                            >
                                <PackagePlus className="h-4 w-4" />
                                {isSubmitting ? 'Receiving Stock...' : `Confirm Intake (+${quantityToAdd} units)`}
                            </Button>
                        )
                    ) : (
                        <Button
                            onClick={handleSubmitNew}
                            disabled={isSubmitting || !newProductName.trim()}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-wider text-xs px-5 h-10 flex items-center gap-2"
                        >
                            <PackagePlus className="h-4 w-4" />
                            {isSubmitting ? 'Creating Product...' : 'Create & Receive Stock'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
