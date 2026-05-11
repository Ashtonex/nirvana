import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();

    // current month UTC start
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();

    // Get overhead contribution/payment rows for this month
    const { data: rows, error } = await supabaseAdmin
      .from("operations_ledger")
      .select("shop_id, amount, kind, created_at")
      .gte("created_at", monthStart)
      .lt("created_at", nextMonth)
      .in("kind", ["overhead_contribution", "overhead_payment", "overhead_deposit", "rent", "salaries", "utilities", "misc"]);

    if (error) {
      console.error("rollover fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const netByShop: Record<string, number> = {};
    (rows || []).forEach((r: any) => {
      const shop = r.shop_id || "unknown";
      netByShop[shop] = (netByShop[shop] || 0) + Number(r.amount || 0);
    });

    const timestamp = new Date().toISOString();
    let rolled = 0;
    let totalRolled = 0;

    // Apply rollover for shops with positive net
    for (const shopId of Object.keys(netByShop)) {
      const net = netByShop[shopId];
      if (!net || Number(net) <= 0) continue;

      rolled++;
      totalRolled += net;

      // Insert ledger_entries transfer for audit
      try {
        await supabaseAdmin.from("ledger_entries").insert({
          id: Math.random().toString(36).substring(2, 9),
          shop_id: shopId,
          type: "transfer",
          category: "Operations Transfer",
          amount: net,
          date: timestamp,
          description: `Monthly overhead rollover to Vault`,
        });
      } catch (e) {
        console.warn("rollover ledger_entries insert failed:", e);
      }

      // Insert operations_ledger entry
      try {
        await supabaseAdmin.from("operations_ledger").insert({
          amount: net,
          kind: "overhead_rollover",
          shop_id: shopId,
          title: "Monthly Overhead Rollover",
          notes: "Rollover from overhead tracker",
          effective_date: timestamp.split("T")[0],
          created_at: timestamp,
        });
      } catch (e) {
        console.warn("rollover operations_ledger insert failed:", e);
      }
    }

    // Update operations_state actual_balance by adding totalRolled
    if (totalRolled > 0) {
      const { data: state } = await supabaseAdmin.from("operations_state").select("actual_balance").eq("id", 1).maybeSingle();
      const prev = Number(state?.actual_balance || 0);
      const newBalance = prev + totalRolled;
      await supabaseAdmin.from("operations_state").upsert({ id: 1, actual_balance: newBalance, updated_at: timestamp });
    }

    return NextResponse.json({ success: true, rolled, totalRolled });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
