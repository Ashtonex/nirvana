import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const opsExpenseKinds = new Set([
      "overhead_payment", "stock_orders", "transport", "peer_payout",
      "other_expense", "rent", "utilities", "salaries", "misc",
      "salary", "wages", "electric", "water", "internet"
    ]);

    const { data, error } = await supabaseAdmin
      .from("operations_ledger")
      .select("*")
      .lt("amount", 0)
      .in("kind", Array.from(opsExpenseKinds))
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      console.error("Operations expenses fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (e: any) {
    console.error("Operations expenses error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}