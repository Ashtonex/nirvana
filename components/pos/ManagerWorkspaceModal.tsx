'use client';

import React from 'react';
import { 
    X, 
    ShieldCheck, 
    Coins, 
    ArrowRightLeft, 
    FileText, 
    Settings, 
    ClipboardList, 
    PackagePlus, 
    Warehouse, 
    TrendingUp, 
    Building2,
    Calendar,
    Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui';

interface ManagerWorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    shopId: string;
    staffDisplayName?: string;
    shopRentBalance: number;
    shopInvestBalance: number;
    todaysOpsIncome: number;
    todaysOpsPosts: number;
    onOpenOpsPost: () => void;
    onOpenDirectOps: () => void;
    onOpenReportsHistory: () => void;
    onGenerateStrategicReport: () => void;
}

export const ManagerWorkspaceModal: React.FC<ManagerWorkspaceModalProps> = ({
    isOpen,
    onClose,
    shopId,
    staffDisplayName,
    shopRentBalance,
    shopInvestBalance,
    todaysOpsIncome,
    todaysOpsPosts,
    onOpenOpsPost,
    onOpenDirectOps,
    onOpenReportsHistory,
    onGenerateStrategicReport,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-100">
                                Manager & Operations Workspace
                            </h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase">
                                {staffDisplayName ? `${staffDisplayName} • ` : ''}Location: {shopId.toUpperCase()}
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
                <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
                    {/* Shop Capital Balances */}
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Location Capital Balances
                        </span>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase text-slate-500">Rent Pool</span>
                                    <Coins className="h-3.5 w-3.5 text-emerald-400" />
                                </div>
                                <div className={`text-base font-black ${shopRentBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    ${shopRentBalance.toFixed(2)}
                                </div>
                                <p className="text-[9px] text-slate-500">Allocated rent reserve</p>
                            </div>

                            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase text-slate-500">Invest Capital</span>
                                    <TrendingUp className="h-3.5 w-3.5 text-sky-400" />
                                </div>
                                <div className={`text-base font-black ${shopInvestBalance < 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                                    ${shopInvestBalance.toFixed(2)}
                                </div>
                                <p className="text-[9px] text-slate-500">Perfumes & stock capital</p>
                            </div>
                        </div>
                    </div>

                    {/* Operations Actions */}
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Cash Operations & Transfers
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <Button
                                onClick={() => {
                                    onClose();
                                    onOpenOpsPost();
                                }}
                                className="bg-slate-950 hover:bg-slate-800 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-wider h-11 flex items-center justify-start px-3"
                            >
                                <Coins className="mr-2 h-4 w-4 text-emerald-400" /> Post Drawer to Ops
                            </Button>

                            <Button
                                onClick={() => {
                                    onClose();
                                    onOpenDirectOps();
                                }}
                                className="bg-slate-950 hover:bg-slate-800 border border-violet-500/30 text-violet-300 text-xs font-black uppercase tracking-wider h-11 flex items-center justify-start px-3"
                            >
                                <ArrowRightLeft className="mr-2 h-4 w-4 text-violet-400" /> Direct Ops Transfer
                            </Button>
                        </div>
                    </div>

                    {/* Strategic & Daily Reports */}
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Executive & Audit Reports
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <Button
                                onClick={() => {
                                    onClose();
                                    onGenerateStrategicReport();
                                }}
                                className="bg-slate-950 hover:bg-slate-800 border border-indigo-500/30 text-indigo-300 text-xs font-black uppercase tracking-wider h-11 flex items-center justify-start px-3"
                            >
                                <FileText className="mr-2 h-4 w-4 text-indigo-400" /> Strategic Master Report
                            </Button>

                            <Button
                                onClick={() => {
                                    onClose();
                                    onOpenReportsHistory();
                                }}
                                className="bg-slate-950 hover:bg-slate-800 border border-sky-500/30 text-sky-300 text-xs font-black uppercase tracking-wider h-11 flex items-center justify-start px-3"
                            >
                                <FileText className="mr-2 h-4 w-4 text-sky-400" /> Daily Reports History
                            </Button>
                        </div>
                    </div>

                    {/* Navigation to Administrative Portals */}
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            System Management Portals
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    window.location.href = '/admin/settings#opening-balance';
                                }}
                                className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left text-slate-300 hover:text-white transition-colors"
                            >
                                <Coins className="h-3.5 w-3.5 text-amber-400 mb-1" />
                                <div className="text-[10px] font-black uppercase">Opening Balance</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    window.location.href = '/inventory/stocktake';
                                }}
                                className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left text-slate-300 hover:text-white transition-colors"
                            >
                                <ClipboardList className="h-3.5 w-3.5 text-emerald-400 mb-1" />
                                <div className="text-[10px] font-black uppercase">Stocktake Audit</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    window.location.href = '/inventory';
                                }}
                                className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left text-slate-300 hover:text-white transition-colors"
                            >
                                <PackagePlus className="h-3.5 w-3.5 text-violet-400 mb-1" />
                                <div className="text-[10px] font-black uppercase">Master Inventory</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    window.location.href = '/operations';
                                }}
                                className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left text-slate-300 hover:text-white transition-colors"
                            >
                                <Warehouse className="h-3.5 w-3.5 text-sky-400 mb-1" />
                                <div className="text-[10px] font-black uppercase">Operations Console</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    window.location.href = '/admin/settings';
                                }}
                                className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left text-slate-300 hover:text-white transition-colors"
                            >
                                <Settings className="h-3.5 w-3.5 text-slate-400 mb-1" />
                                <div className="text-[10px] font-black uppercase">Admin Settings</div>
                            </button>

                            {(shopId === 'kipasa' || shopId === 'dubdub') && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        window.location.href = `/invest?shopId=${shopId}`;
                                    }}
                                    className="p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left text-slate-300 hover:text-white transition-colors"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-pink-400 mb-1" />
                                    <div className="text-[10px] font-black uppercase">Perfume Deposits</div>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="border-slate-800 text-slate-400 hover:text-white text-xs font-bold uppercase"
                    >
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};
