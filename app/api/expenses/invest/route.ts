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
    const { data, error } = await supabaseAdmin
      .from("invest_deposits")
      .select("*")
      .gt("withdrawn_amount", 0)
      .order("withdrawn_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("Invest withdrawals fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (e: any) {
    console.error("Invest withdrawals error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}