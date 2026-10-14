'use client';

import React from 'react';
import { Package, Plus } from 'lucide-react';

export interface PosProductItem {
    id: string;
    name: string;
    category?: string;
    sellingPrice?: number;
    price?: number;
    landedCost?: number;
    shopQuantity?: number;
    quantity?: number;
    sku?: string;
}

interface ProductGridProps {
    items: PosProductItem[];
    onAddToCart: (item: PosProductItem) => void;
    isLoading?: boolean;
    currencySymbol?: string;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
    items,
    onAddToCart,
    isLoading = false,
    currencySymbol = '$',
}) => {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-32 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse" />
                ))}
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-slate-900/30 border border-dashed border-slate-800">
                <Package className="w-12 h-12 text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-slate-300">No products found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Try adjusting your search or category filter.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 select-none">
            {items.map((item) => {
                const stock = Number(item.shopQuantity ?? item.quantity ?? 0);
                const price = Number(item.sellingPrice ?? item.price ?? 0);
                const isOutOfStock = stock <= 0 && !item.id.startsWith('service_') && !item.id.startsWith('adhoc');
                const isLowStock = stock > 0 && stock <= 5;

                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => !isOutOfStock && onAddToCart(item)}
                        disabled={isOutOfStock}
                        className={`group relative flex flex-col justify-between p-4 rounded-2xl text-left transition-all duration-150 active:scale-[0.97] cursor-pointer border ${
                            isOutOfStock
                                ? 'bg-slate-900/20 border-slate-800/40 opacity-50 cursor-not-allowed'
                                : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-violet-500/50 shadow-md hover:shadow-xl hover:shadow-violet-950/20'
                        }`}
                    >
                        {/* Top: Category & Stock Badge */}
                        <div className="flex items-center justify-between gap-1 w-full mb-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[90px]">
                                {item.category || 'General'}
                            </span>
                            {isOutOfStock ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                    Out
                                </span>
                            ) : isLowStock ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Low: {stock}
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    {stock} in stock
                                </span>
                            )}
                        </div>

                        {/* Middle: Product Name */}
                        <div className="my-auto py-1">
                            <h4 className="text-sm sm:text-base font-extrabold text-white tracking-tight line-clamp-2 group-hover:text-violet-200 transition-colors">
                                {item.name}
                            </h4>
                            {item.sku && item.sku !== item.id && (
                                <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                                    {item.sku}
                                </p>
                            )}
                        </div>

                        {/* Bottom: Price & Quick Add Button */}
                        <div className="flex items-center justify-between w-full mt-3 pt-2 border-t border-slate-800/60">
                            <span className="text-base sm:text-lg font-black font-mono text-emerald-400 tracking-tight">
                                {currencySymbol}{price.toFixed(2)}
                            </span>
                            <div className="w-7 h-7 rounded-xl bg-violet-600/20 group-hover:bg-violet-600 text-violet-400 group-hover:text-white flex items-center justify-center transition-all shadow-sm">
                                <Plus className="w-4 h-4" />
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};
