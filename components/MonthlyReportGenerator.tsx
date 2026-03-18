"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input } from "@/components/ui";
import {
    FileBarChart,
    Calendar,
    ChevronRight,
    Target,
    Zap,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthlyReportGeneratorProps {
    shops: { id: string, name: string }[];
}

export function MonthlyReportGenerator({ shops: shopsProp }: MonthlyReportGeneratorProps) {
    const shops = Array.isArray(shopsProp) ? shopsProp : [];

    const nodes = useMemo(() => {
        const base = shops.map((s) => ({ id: s.id, name: s.name }));
        return [{ id: "global", name: "Global Synthesis" }, ...base];
    }, [shops]);

    const [selectedShopId, setSelectedShopId] = useState<string>(shops[0]?.id || "");
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
    const [isPending, setIsPending] = useState(false);

    useEffect(() => {
        try {
            const savedShopId = window.localStorage.getItem("nirvana_oracle_shop");
            const savedMonth = window.localStorage.getItem("nirvana_oracle_month");

            if (savedShopId && nodes.some((n) => n.id === savedShopId)) setSelectedShopId(savedShopId);
            if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) setSelectedMonth(savedMonth);
        } catch {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Guard against empty shops
    if (shops.length === 0) {
        return (
            <Card className="bg-slate-950/60 border-slate-800 shadow-2xl">
                <CardContent className="py-10 text-center text-slate-500">
                    No shops available to generate reports.
                </CardContent>
            </Card>
        );
    }

    const handleGenerate = async (selectedShop: string, selectedMonth: string) => {
        if (!selectedShop || !selectedMonth) return;
        setIsPending(true);
        try {
            const response = await fetch(`/api/reports/monthly/pdf?shopId=${encodeURIComponent(selectedShop)}&month=${encodeURIComponent(selectedMonth)}`);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to generate report");
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Strategic_Report_${selectedShop}_${selectedMonth}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(err.message || "An error occurred while generating the report");
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Card className="bg-slate-950/60 border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute -top-24 -right-24 h-64 w-64 bg-violet-600/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-violet-600/20 transition-all duration-700" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 bg-sky-600/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-sky-600/20 transition-all duration-700" />

            <CardHeader className="relative">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
                        <FileBarChart className="h-6 w-6 text-violet-400" />
                    </div>
                    <div>
                        <CardTitle className="text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                            Strategic Monthly Command <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                        </CardTitle>
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">
                            Generate high-level fiscal intelligence & performance analysis
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="relative space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <Target className="h-3 w-3" /> Select Operational Node
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {nodes.map((shop) => (
                                <button
                                    key={shop.id}
                                    type="button"
                                    onClick={() => { setSelectedShopId(shop.id); }}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase italic tracking-widest border transition-all duration-300",
                                        selectedShopId === shop.id
                                            ? "bg-violet-600/20 border-violet-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                                            : "bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300",
                                        shop.id === "global" && selectedShopId === shop.id
                                            ? "bg-emerald-600/20 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                                            : null
                                    )}
                                >
                                    {shop.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <Calendar className="h-3 w-3" /> Fiscal Period
                        </label>
                        <Input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => { setSelectedMonth(e.target.value); }}
                            max={new Date().toISOString().substring(0, 7)}
                            className="bg-slate-900 border-slate-800 font-black italic text-sky-400 h-11 focus:ring-violet-500/50"
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-800/50">
                    <Button
                        onClick={() => handleGenerate(selectedShopId, selectedMonth)}
                        disabled={isPending || !selectedShopId || !selectedMonth}
                        className="w-full h-14 bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white font-black uppercase italic tracking-widest shadow-xl group/btn overflow-hidden relative"
                    >
                        <span className="relative flex items-center justify-center gap-3">
                            <Zap className="h-5 w-5 fill-current" />
                            {isPending ? "SYNTHESIZING..." : "EXECUTE STRATEGIC SYNTHESIS"}
                            <ChevronRight className="h-5 w-5" />
                        </span>
                    </Button>
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                    <div className="h-1 w-1 bg-emerald-500 rounded-full animate-pulse" />
                    <p className="text-[9px] font-bold text-slate-600 uppercase italic">
                        Calculates COGS at 35% revenue threshold as per command directive
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
