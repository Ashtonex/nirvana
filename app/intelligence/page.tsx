export const dynamic = "force-dynamic";

import { getOracleMasterPulse } from "../actions";
import { OraclePulse } from "@/components/OraclePulse";
import { MonthlyReportGenerator } from "@/components/MonthlyReportGenerator";
import { StrategicReportVault } from "@/components/StrategicReportVault";
import { Badge } from "@/components/ui";
import { AlertCircle, Calendar, Compass, Flame, ShieldCheck } from "lucide-react";

export default async function IntelligencePage() {
  let pulse: any = null;
  let error: unknown = null;

  try {
    pulse = await getOracleMasterPulse();
  } catch (e) {
    console.error("[Intelligence] getOracleMasterPulse failed:", e);
    error = e;
  }

  const invalidPulse =
    !pulse || !pulse.shopPerformance || !Array.isArray(pulse.shopPerformance) || Boolean(error);

  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : null;

  if (invalidPulse) {
    return (
      <div className="space-y-8 pb-32 pt-8">
        <div className="space-y-2 text-center max-w-3xl mx-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-violet-500/20 blur-2xl rounded-full" />
            <Compass className="h-16 w-16 text-violet-500 relative animate-[spin_10s_linear_infinite]" />
          </div>
          <h1 className="text-6xl font-black tracking-tighter uppercase italic text-white leading-none">
            Oracle&apos;s Eye
          </h1>
          <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
            Read-Only Master Intelligence Layer • Autonomous Operations Enabled
          </p>

          <div className="flex justify-center gap-3 pt-4">
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 font-black uppercase text-[10px] italic">
              <ShieldCheck className="h-3 w-3 mr-2" /> Synchronization Error
            </Badge>
            <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 px-3 py-1 font-black uppercase text-[10px] italic">
              <AlertCircle className="h-3 w-3 mr-2" /> Check Logs
            </Badge>
          </div>
        </div>

        <div className="mt-12 text-center text-sm max-w-xl mx-auto p-4 border border-rose-500/50 bg-rose-900/20 rounded-lg">
          <p className="text-rose-300 font-bold mb-2">CRITICAL FAILURE: Core Data Unavailable</p>
          <p className="text-xs text-rose-400">
            The system failed to load master intelligence data due to a server exception. This is not a
            401 issue. Please check the server logs for details on the error, as the data fetching process
            terminated prematurely.
          </p>
          {errorMessage && (
            <p className="text-[10px] mt-2 text-red-300 font-mono whitespace-pre-wrap">
              Error: {errorMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-3xl mx-auto">
        <div className="relative">
          <div className="absolute inset-0 bg-violet-500/20 blur-2xl rounded-full" />
          <Compass className="h-16 w-16 text-violet-500 relative animate-[spin_10s_linear_infinite]" />
        </div>
        <h1 className="text-6xl font-black tracking-tighter uppercase italic text-white leading-none">
          Oracle&apos;s Eye
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

      <OraclePulse data={pulse} />

      <div className="max-w-6xl mx-auto mt-12 px-4 shadow-sm">
        <MonthlyReportGenerator shops={pulse.shopPerformance.map((s: any) => ({ id: s.id, name: s.name }))} />
      </div>

      <div className="mt-12">
        <StrategicReportVault
          shops={pulse.shopPerformance.map((s: any) => ({ id: s.id, name: s.name }))}
          defaultShopId={pulse.shopPerformance[0]?.id || "kipasa"}
        />
      </div>

      <div className="max-w-2xl mx-auto mt-20 p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 text-center space-y-4">
        <Flame className="h-8 w-8 text-orange-500 mx-auto animate-pulse" />
        <p className="text-xs font-medium text-slate-400 leading-relaxed italic">
          &quot;The eye sees all. Every sale reduces the global physical count. Every expense is apportioned
          from the gross margin. The business is a machine, and the Oracle provides the lubrication.&quot;
        </p>
        <div className="pt-2">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
            — ORACLE MASTER LOGIC V4.0
          </span>
        </div>
      </div>
    </div>
  );
}
