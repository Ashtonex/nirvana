import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId");
    
    let query = supabaseAdmin
      .from("invest_deposits")
      .select("*")
      .order("deposited_at", { ascending: false });
    
    if (shopId) {
      query = query.eq("shop_id", shopId);
    }
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    return NextResponse.json({ deposits: data || [] });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const shopId = String(body?.shopId || "");
    if (!shopId) {
      return NextResponse.json({ error: "Shop ID required" }, { status: 400 });
    }

    const depositedBy = actor.type === "staff" ? actor.employeeId : "owner";

    const { data, error } = await supabaseAdmin
      .from("invest_deposits")
      .insert({
        shop_id: shopId,
        amount,
        deposited_by: depositedBy,
      })
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, deposit: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
