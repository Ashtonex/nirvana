export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { InvestConsole } from "@/components/InvestConsole";

export default async function InvestPage() {
  try {
    await requirePrivilegedActor();
  } catch {
    redirect("/login");
  }

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Invest</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          Peer System • Capital Injection Tracking • Mirrors into Operations
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        <InvestConsole />
      </div>
    </div>
  );
}

