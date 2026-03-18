export const dynamic = 'force-dynamic';

import { getOracleMasterPulse, triggerAutomatedReports } from "../actions";
import { OraclePulse } from "@/components/OraclePulse";
import { MonthlyReportGenerator } from "@/components/MonthlyReportGenerator";

import {
    Input,
    Badge,
    Button
} from "@/components/ui";
import {
    Compass,
    Flame,
    History,
    Mail,
    Zap,
    ShieldCheck,
    Calendar,
    ArrowUpRight,
    FileBarChart,
    Download,
    ChevronRight,
    Target,
    Sparkles,
    Loader2,
    FileText,
    PieChart,
    BarChart3
} from "lucide-react";

interface ShopPerformanceItem {
    id: string;
    name: string;
}

export default async function IntelligencePage() {
    let pulse = null;
    try {
        pulse = await getOracleMasterPulse();
    } catch (e) {
        console.error('[Intelligence] getOracleMasterPulse failed:', e);
    }

    // Guard: if pulse is null or missing expected structure, show fallback
    if (!pulse || !pulse.shopPerformance || !Array.isArray(pulse.shopPerformance)) {
        return (
            <div className="space-y-8 pb-32 pt-8">
                <div className="space-y-2 text-center max-w-3xl mx-auto">
                    <div className="flex justify-center mb-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-violet-500/20 blur-2xl rounded-full" />
                            <Compass className="h-16 w-16 text-violet-500 relative animate-[spin_10s_linear_infinite]" />
                        </div>
                    </div>
                    <h1 className="text-6xl font-black tracking-tighter uppercase italic text-white leading-none">
                        Oracle's Eye
                    </h1>
                    <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
                        Read-Only Master Intelligence Layer • Autonomous Operations Enabled
                    </p>

                    <div className="flex justify-center gap-3 pt-4">
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 font-black uppercase text-[10px] italic">
                            <ShieldCheck className="h-3 w-3 mr-2" /> Live Synchronization
                        </Badge>
                        <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 px-3 py-1 font-black uppercase text-[10px] italic">
                            <Calendar className="h-3 w-3 mr-2" /> Daily Sync: 18:00
                        </Badge>
                    </div>
                </div>

                <div className="mt-12 text-center text-slate-500 text-sm">
                    Oracle intelligence data is not yet available. Once inventory, sales, and settings are fully configured,
                    this panel will activate with live insights.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="space-y-2 text-center max-w-3xl mx-auto">
                <div className="flex justify-center mb-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-violet-500/20 blur-2xl rounded-full" />
                        <Compass className="h-16 w-16 text-violet-500 relative animate-[spin_10s_linear_infinite]" />
                    </div>
                </div>
                <h1 className="text-6xl font-black tracking-tighter uppercase italic text-white leading-none">
                    Oracle's Eye
                </h1>
                <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
                    Read-Only Master Intelligence Layer • Autonomous Operations Enabled
                </p>

                <div className="flex justify-center gap-3 pt-4">
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 font-black uppercase text-[10px] italic">
                        <ShieldCheck className="h-3 w-3 mr-2" /> Live Synchronization
                    </Badge>
                    <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 px-3 py-1 font-black uppercase text-[10px] italic">
                        <Calendar className="h-3 w-3 mr-2" /> Daily Sync: 18:00
                    </Badge>
                </div>
            </div>

            {/* PULSE CONTENT */}
            <OraclePulse data={pulse} />

            <div className="max-w-6xl mx-auto mt-12 px-4 shadow-sm">
                <MonthlyReportGenerator shops={pulse.shopPerformance.map((s: any) => ({ id: s.id, name: s.name }))} />
            </div>


            {/* AD-HOC SIMULATION (For User to test the automation) */}

            <div className="mt-12 max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-2 mb-4">
                    <FileBarChart className="h-5 w-5 text-sky-400" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">Strategic Report Vault</h2>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center group hover:bg-slate-900/60 hover:border-sky-500/30 transition-all">
                        <FileText className="h-8 w-8 text-sky-500 mb-3 group-hover:scale-110 transition-transform" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-200 mb-1">Daily EOD</h3>
                        <p className="text-[10px] text-slate-500 mb-4 h-8">Comprehensive end of day operations & pulse.</p>
                        <Button 
                            variant="outline" 
                            className="w-full h-8 text-[10px] font-black uppercase italic tracking-widest border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                            onClick={() => window.open(`/api/eod/pdf?shopId=${pulse.shopPerformance[0]?.id || 'kipasa'}&date=${new Date().toISOString().split('T')[0]}`, '_blank')}
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
                            onClick={() => window.open(`/api/eod/pdf?shopId=${pulse.shopPerformance[0]?.id || 'kipasa'}&weekly=true`, '_blank')}
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
                            onClick={() => window.open(`/api/reports/monthly/pdf?shopId=${pulse.shopPerformance[0]?.id || 'kipasa'}`, '_blank')}
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
                            onClick={() => window.open(`/api/reports/quarterly/pdf?shopId=${pulse.shopPerformance[0]?.id || 'kipasa'}`, '_blank')}
                        >
                            <Download className="mr-2 h-3 w-3" /> Download
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mt-16 flex flex-col items-center gap-4">
                <p className="text-[10px] font-black text-slate-600 uppercase italic tracking-[0.3em]">Manual Scrying overrides (Simulation Only)</p>
                <div className="flex flex-wrap justify-center gap-4">
                    <form action={async () => {
                        "use server";
                        await triggerAutomatedReports('daily');
                    }}>
                        <Button variant="outline" className="h-10 border-slate-800 text-[10px] font-black uppercase italic tracking-widest hover:bg-slate-900">
                            Force Daily Report <ArrowUpRight className="ml-2 h-4 w-4" />
                        </Button>
                    </form>
                    <form action={async () => {
                        "use server";
                        await triggerAutomatedReports('weekly');
                    }}>
                        <Button variant="outline" className="h-10 border-slate-800 text-[10px] font-black uppercase italic tracking-widest hover:bg-slate-900">
                            Force Weekly Sync <ArrowUpRight className="ml-2 h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </div>

            {/* FOOTER INTELLIGENCE */}
            <div className="max-w-2xl mx-auto mt-20 p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 text-center space-y-4">
                <Flame className="h-8 w-8 text-orange-500 mx-auto animate-pulse" />
                <p className="text-xs font-medium text-slate-400 leading-relaxed italic">
                    "The eye sees all. Every sale reduces the global physical count. Every expense is apportioned from the gross margin. The business is a machine, and the Oracle provides the lubrication."
                </p>
                <div className="pt-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">— ORACLE MASTER LOGIC V4.0</span>
                </div>
            </div>
        </div>
    );
}

