"use client";

import React, { useMemo, useState } from "react";
import { 
    Button, 
    Badge 
} from "@/components/ui";
import {
    FileBarChart,
    Download,
    FileText,
    BarChart3,
    PieChart,
    History,
    ArrowUpRight
} from "lucide-react";
import { triggerAutomatedReports } from "@/app/actions";
import { cn } from "@/lib/utils";

interface StrategicReportVaultProps {
    shops: { id: string; name: string }[];
    defaultShopId?: string;
}

export function StrategicReportVault({ shops, defaultShopId }: StrategicReportVaultProps) {
    const nodes = useMemo(() => {
        const base = (Array.isArray(shops) ? shops : []).map((s) => ({ id: s.id, name: s.name }));
        return [{ id: "global", name: "Global Synthesis" }, ...base];
    }, [shops]);

    const [selectedShopId, setSelectedShopId] = useState<string>(defaultShopId || shops?.[0]?.id || "");
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [selectedDay, setSelectedDay] = useState<string>(new Date().toISOString().split("T")[0]); // YYYY-MM-DD

    const isGlobal = selectedShopId === "global";

    const handleDownload = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <div className="space-y-12">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-2 mb-4">
                    <FileBarChart className="h-5 w-5 text-sky-400" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Strategic Report Vault</h2>
                </div>

                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {nodes.map((shop) => (
                                <button
                                    key={shop.id}
                                    type="button"
                                    onClick={() => setSelectedShopId(shop.id)}
                                    className={cn(
                                        "px-3 py-2 rounded-lg text-[10px] font-black uppercase italic tracking-widest border transition-all duration-200",
                                        selectedShopId === shop.id
                                            ? "bg-sky-600/20 border-sky-500 text-white"
                                            : "bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300",
                                        shop.id === "global" && selectedShopId === shop.id
                                            ? "bg-emerald-600/20 border-emerald-500"
                                            : null
                                    )}
                                >
                                    {shop.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Month</span>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    max={new Date().toISOString().substring(0, 7)}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-black italic text-violet-300"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Day</span>
                                <input
                                    type="date"
                                    value={selectedDay}
                                    max={new Date().toISOString().split("T")[0]}
                                    onChange={(e) => setSelectedDay(e.target.value)}
                                    className="h-9 px-3 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-black italic text-sky-300"
                                />
                            </div>
                        </div>
                    </div>

                    {isGlobal && (
                        <div className="text-[10px] font-bold text-amber-400">
                            Global synthesis supports Monthly/Quarterly PDFs. Daily/Weekly EOD is per-shop.
                        </div>
                    )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center group hover:bg-slate-900/60 hover:border-sky-500/30 transition-all">
                        <FileText className="h-8 w-8 text-sky-500 mb-3 group-hover:scale-110 transition-transform" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 mb-1">Daily EOD</h3>
                        <p className="text-[10px] text-slate-500 mb-4 h-8">Comprehensive end of day operations & pulse.</p>
                        <Button 
                            variant="outline" 
                            className="w-full h-8 text-[10px] font-black uppercase italic tracking-widest border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                            disabled={isGlobal || !selectedShopId}
                            onClick={() => handleDownload(`/api/eod/pdf?shopId=${encodeURIComponent(selectedShopId)}&date=${encodeURIComponent(selectedDay)}`)}
                        >
                            <Download className="mr-2 h-3 w-3" /> Download
                        </Button>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center group hover:bg-slate-900/60 hover:border-emerald-500/30 transition-all">
                        <BarChart3 className="h-8 w-8 text-emerald-500 mb-3 group-hover:scale-110 transition-transform" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 mb-1">Weekly Exec</h3>
                        <p className="text-[10px] text-slate-500 mb-4 h-8">7-day performance with audit & scoreboard.</p>
                        <Button 
                            variant="outline" 
                            className="w-full h-8 text-[10px] font-black uppercase italic tracking-widest border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            disabled={isGlobal || !selectedShopId}
                            onClick={() => handleDownload(`/api/eod/pdf?shopId=${encodeURIComponent(selectedShopId)}&weekly=true&date=${encodeURIComponent(selectedDay)}`)}
                        >
                            <Download className="mr-2 h-3 w-3" /> Download
                        </Button>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center group hover:bg-slate-900/60 hover:border-violet-500/30 transition-all">
                        <PieChart className="h-8 w-8 text-violet-500 mb-3 group-hover:scale-110 transition-transform" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 mb-1">Monthly Strat.</h3>
                        <p className="text-[10px] text-slate-500 mb-4 h-8">Full month breakdown & KPI analytics.</p>
                        <Button 
                            variant="outline" 
                            className="w-full h-8 text-[10px] font-black uppercase italic tracking-widest border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                            disabled={!selectedShopId || !selectedMonth}
                            onClick={() => handleDownload(`/api/reports/monthly/pdf?shopId=${encodeURIComponent(selectedShopId)}&month=${encodeURIComponent(selectedMonth)}`)}
                        >
                            <Download className="mr-2 h-3 w-3" /> Download
                        </Button>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center group hover:bg-slate-900/60 hover:border-amber-500/30 transition-all opacity-80">
                        <History className="h-8 w-8 text-amber-500 mb-3 group-hover:scale-110 transition-transform" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 mb-1">Quarterly Strat.</h3>
                        <p className="text-[10px] text-slate-500 mb-4 h-8">3-month rollup trajectory.</p>
                        <Button 
                            variant="outline" 
                            className="w-full h-8 text-[10px] font-black uppercase italic tracking-widest border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            disabled={!selectedShopId || !selectedMonth}
                            onClick={() => handleDownload(`/api/reports/quarterly/pdf?shopId=${encodeURIComponent(selectedShopId)}&month=${encodeURIComponent(selectedMonth)}`)}
                        >
                            <Download className="mr-2 h-3 w-3" /> Download
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mt-16 flex flex-col items-center gap-4">
                <p className="text-[10px] font-black text-slate-600 uppercase italic tracking-[0.3em]">Manual Scrying overrides (Simulation Only)</p>
                <div className="flex flex-wrap justify-center gap-4">
                    <Button 
                        variant="outline" 
                        className="h-10 border-slate-800 text-[10px] font-black uppercase italic tracking-widest hover:bg-slate-900"
                        onClick={async () => {
                            await triggerAutomatedReports('daily');
                            alert('Daily report triggered');
                        }}
                    >
                        Force Daily Report <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button 
                        variant="outline" 
                        className="h-10 border-slate-800 text-[10px] font-black uppercase italic tracking-widest hover:bg-slate-900"
                        onClick={async () => {
                            await triggerAutomatedReports('weekly');
                            alert('Weekly sync triggered');
                        }}
                    >
                        Force Weekly Sync <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
