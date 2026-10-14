'use client';

import React from 'react';

interface CategoryBarProps {
    categories: string[];
    selectedCategory: string;
    onSelectCategory: (category: string) => void;
    categoryCounts?: Record<string, number>;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
    categories,
    selectedCategory,
    onSelectCategory,
    categoryCounts = {},
}) => {
    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none select-none">
            <button
                type="button"
                onClick={() => onSelectCategory('ALL')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                    selectedCategory === 'ALL'
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                        : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
            >
                <span>All Items</span>
                {categoryCounts['ALL'] !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                        selectedCategory === 'ALL' ? 'bg-violet-800/80 text-violet-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                        {categoryCounts['ALL']}
                    </span>
                )}
            </button>

            {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count = categoryCounts[cat];
                return (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => onSelectCategory(cat)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                            isSelected
                                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                    >
                        <span>{cat}</span>
                        {count !== undefined && (
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                                isSelected ? 'bg-violet-800/80 text-violet-100' : 'bg-slate-800 text-slate-400'
                            }`}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
