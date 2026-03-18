"use client";

import { useState, useTransition } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Badge,
    Input,
    // Loader2 is from lucide-react
} from "@/components/ui";
import {
    FileBarChart,
    Download,
    Calendar,
    ChevronRight,
    Target,
    Zap,
    Sparkles,
    Loader2
} from "lucide-react";

import { cn } from "@/lib/utils";

interface MonthlyReportGeneratorProps {
    shops: { id: string, name: string }[];
}

export function MonthlyReportGenerator({ shops: shopsProp }: MonthlyReportGeneratorProps) {
    const shops = Array.isArray(shopsProp) ? shopsProp : [];
    const [selectedShop, setSelectedShop] = useState(shops[0]?.id || "");
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().substring(0, 7));
    const [isPending, startTransition] = useTransition();

    // Default to first shop if selectedShop is empty but shops exist
    const effectiveSelectedShop = selectedShop || shops[0]?.id || "";

    const handleGenerate = async () => {
        if (!selectedShop || !selectedMonth) return;

        startTransition(async () => {
            try {
                const response = await fetch(`/api/reports/monthly/pdf?shopId=${encodeURIComponent(selectedShop)}&month=${encodeURIComponent(selectedMonth)}`);
                if (!response.ok) throw new Error("Failed to generate report");
                
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
            }
        });
    };

    return (
        <Card className="bg-slate-950/60 border-slate-800 shadow-2xl relative overflow-hidden group">
            {/* Ambient Background Glow */}
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
                    {/* Node Selection */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <Target className="h-3 w-3" /> Select Operational Node
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {shops.map((shop) => (
                                <button
                                    key={shop.id}
                                    onClick={() => setSelectedShop(shop.id)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase italic tracking-widest border transition-all duration-300",
                                        selectedShop === shop.id
                                            ? "bg-violet-600/20 border-violet-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                                            : "bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                    )}
                                >
                                    {shop.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Period Selection */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                            <Calendar className="h-3 w-3" /> Fiscal Period
                        </label>
                        <Input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            max={new Date().toISOString().substring(0, 7)}
                            className="bg-slate-900 border-slate-800 font-black italic text-sky-400 h-11 focus:ring-violet-500/50"
                        />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-800/50">
                    <Button
                        onClick={handleGenerate}
                        disabled={isPending || !selectedShop || !selectedMonth}
                        className="w-full h-14 bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white font-black uppercase italic tracking-widest shadow-xl group/btn overflow-hidden relative"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                        <span className="relative flex items-center justify-center gap-3">
                            {isPending ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <Zap className="h-5 w-5 fill-current" />
                            )}
                            {isPending ? "SCRIBING STRATEGIC LOGS..." : "EXECUTE STRATEGIC SYNTHESIS"}
                            <ChevronRight className="h-5 w-5 group-hover/btn:translate-x-1 transition-transform" />
                        </span>
                    </Button>
                </div>

                {/* Footer Insight */}
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
