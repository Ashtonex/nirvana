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
    const posExpenseCategories = new Set(["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"]);

    const { data, error } = await supabaseAdmin
      .from("ledger_entries")
      .select("*")
      .eq("type", "expense")
      .in("category", Array.from(posExpenseCategories))
      .order("date", { ascending: false })
      .limit(2000);

    if (error) {
      console.error("POS expenses fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (e: any) {
    console.error("POS expenses error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}