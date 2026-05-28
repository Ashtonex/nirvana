export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor, requireStaffActor, isPrivilegedRole } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance, getOperationsState, listOperationsLedgerEntries } from "@/lib/operations";
import { OperationsConsole } from "@/components/OperationsConsole";


function monthKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function OperationsPage() {
  let actor: any;
  try {
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
    }
  } catch {
    redirect("/login");
  }

  const actorShopId = actor?.type === "staff" && !isPrivilegedRole(actor.role) ? actor.shopId : null;

  const currentMonth = monthKeyUTC(new Date());

  let shops: any[] = [];
  try {
    let query = supabaseAdmin.from("shops").select("id,name,expenses").order("id", { ascending: true });
    if (actorShopId) query = query.eq("id", actorShopId);
    const { data } = await query;
    shops = data || [];
  } catch {
    shops = [];
  }

  let opsState = { computedBalance: 0, actualBalance: 0, updatedAt: null as any, delta: 0 };
  let ledger: any[] = [];

  try {
    const [computed, state, ledgerRows] = await Promise.all([
      getOperationsComputedBalance(),
      getOperationsState(),
      listOperationsLedgerEntries(50, actorShopId ? { shopId: actorShopId } : undefined),
    ]);

    opsState = {
      computedBalance: computed,
      actualBalance: Number((state as any)?.actual_balance || 0),
      updatedAt: (state as any)?.updated_at || null,
      delta: Number((state as any)?.actual_balance || 0) - computed,
    };
    ledger = ledgerRows;
  } catch {
    // Tables might not exist yet until migrations are applied.
  }

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="flex justify-between items-end px-6">
        <div className="space-y-2">
          <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Operations</h1>
          <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">Master Vault / Cash Pool • Month: {currentMonth}</p>
        </div>
      </div>

      <div className="px-4 md:px-8 lg:px-12">
        <OperationsConsole shops={shops} initialState={opsState} initialLedger={ledger} />
      </div>
    </div>
  );
}

