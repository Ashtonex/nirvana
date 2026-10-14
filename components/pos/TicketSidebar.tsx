'use client';

import React from 'react';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, Tag } from 'lucide-react';
import { Button } from '@/components/ui';

export interface CartLineItem {
    item: {
        id: string;
        name: string;
        category?: string;
        sku?: string;
        shopQuantity?: number;
    };
    quantity: number;
    price: number;
}

interface TicketSidebarProps {
    cart: CartLineItem[];
    onUpdateQuantity: (itemId: string, newQuantity: number) => void;
    onRemoveItem: (itemId: string) => void;
    onClearCart: () => void;
    onOpenTender: () => void;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    taxRatePercent?: number;
    currencySymbol?: string;
    onApplyDiscountClick?: () => void;
    className?: string;
}

export const TicketSidebar: React.FC<TicketSidebarProps> = ({
    cart,
    onUpdateQuantity,
    onRemoveItem,
    onClearCart,
    onOpenTender,
    subtotal,
    tax,
    discount,
    total,
    taxRatePercent = 15.5,
    currencySymbol = '$',
    onApplyDiscountClick,
    className = '',
}) => {
    const totalItemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

    return (
        <div className={`flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl ${className}`}>
            {/* Ticket Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-violet-400" />
                    <h3 className="text-base font-black uppercase italic tracking-tight text-white">
                        Ticket
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-violet-600/30 text-violet-300 border border-violet-500/30">
                        {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                    </span>
                </div>

                {cart.length > 0 && (
                    <button
                        type="button"
                        onClick={onClearCart}
                        title="Clear Ticket"
                        className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 font-semibold transition-colors px-2 py-1 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear</span>
                    </button>
                )}
            </div>

            {/* Cart Line Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-800/40">
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
                        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                            <ShoppingCart className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-400">Ticket is empty</p>
                        <p className="text-xs text-slate-600 mt-1 max-w-[200px]">
                            Tap items on the left to add them to this sale.
                        </p>
                    </div>
                ) : (
                    cart.map((line) => {
                        const lineTotal = line.price * line.quantity;
                        return (
                            <div
                                key={line.item.id}
                                className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group"
                            >
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-sm font-bold text-white truncate">
                                        {line.item.name}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs font-mono font-medium text-slate-400">
                                            {currencySymbol}{line.price.toFixed(2)} each
                                        </span>
                                    </div>
                                </div>

                                {/* Touch Stepper */}
                                <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => onUpdateQuantity(line.item.id, line.quantity - 1)}
                                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center transition-all cursor-pointer"
                                    >
                                        <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="w-7 text-center font-mono font-bold text-sm text-white select-none">
                                        {line.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onUpdateQuantity(line.item.id, line.quantity + 1)}
                                        className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center transition-all cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Line Total & Remove */}
                                <div className="flex items-center gap-2 shrink-0 text-right">
                                    <span className="font-mono font-black text-sm text-emerald-400 w-16">
                                        {currencySymbol}{lineTotal.toFixed(2)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveItem(line.item.id)}
                                        className="text-slate-600 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                                        title="Remove line"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Ticket Summary & Checkout Action */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-3">
                {/* Breakdown */}
                <div className="space-y-1.5 text-xs select-none">
                    <div className="flex justify-between text-slate-400">
                        <span>Subtotal</span>
                        <span className="font-mono text-slate-200">{currencySymbol}{subtotal.toFixed(2)}</span>
                    </div>

                    {discount > 0 && (
                        <div className="flex justify-between text-amber-400">
                            <span className="flex items-center gap-1">
                                <Tag className="w-3 h-3" /> Discount
                            </span>
                            <span className="font-mono">-{currencySymbol}{discount.toFixed(2)}</span>
                        </div>
                    )}

                    <div className="flex justify-between text-slate-400">
                        <span>Tax ({taxRatePercent}%)</span>
                        <span className="font-mono text-slate-200">{currencySymbol}{tax.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-baseline pt-2 border-t border-slate-800/80">
                        <span className="text-sm font-black uppercase text-slate-300">Total Due</span>
                        <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                            {currencySymbol}{total.toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Big Loyverse-style Charge Button */}
                <Button
                    type="button"
                    onClick={onOpenTender}
                    disabled={cart.length === 0}
                    className={`w-full h-14 rounded-2xl font-black text-base uppercase tracking-wider transition-all duration-150 flex items-center justify-between px-6 shadow-xl cursor-pointer ${
                        cart.length > 0
                            ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white shadow-emerald-950/50'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <span>Charge</span>
                        <ArrowRight className="w-5 h-5" />
                    </span>
                    <span className="font-mono text-xl tracking-tight">
                        {currencySymbol}{total.toFixed(2)}
                    </span>
                </Button>
            </div>
        </div>
    );
};
