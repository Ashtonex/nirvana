export const dynamic = 'force-dynamic';

import { getOracleMasterPulse, triggerAutomatedReports } from "../actions";
import { OraclePulse } from "@/components/OraclePulse";
import {
    Compass,
    Flame,
    History,
    Mail,
    Zap,
    ShieldCheck,
    Calendar,
    ArrowUpRight
} from "lucide-react";
import { Badge, Button } from "@/components/ui";

export default async function IntelligencePage() {
    const pulse = await getOracleMasterPulse();

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

            {/* AD-HOC SIMULATION (For User to test the automation) */}
            <div className="mt-12 flex flex-col items-center gap-4">
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

