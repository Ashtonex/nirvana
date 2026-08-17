import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor } from "@/lib/apiAuth";
import { postFundTransaction } from "@/lib/cash-pools";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    let actor: any;
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
      const role = String(actor.role).toLowerCase();
      if (role !== "manager" && role !== "lead_manager" && role !== "lead manager") {
        throw new Error("Forbidden");
      }
    }
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
    let actor: any;
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
      const role = String(actor.role).toLowerCase();
      if (role !== "manager" && role !== "lead_manager" && role !== "lead manager") {
        throw new Error("Forbidden");
      }
    }
    const body = await req.json().catch(() => ({}));

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const shopId = String(body?.shopId || "");
    if (!shopId) {
      return NextResponse.json({ error: "Shop ID required" }, { status: 400 });
    }

    const result = await postFundTransaction({
      amount,
      direction: "deposit",
      bucketKey: "invest_perfumes",
      shopId,
      title: String(body?.title || "Invest Deposit"),
      notes: body?.notes ? String(body.notes) : "Invest deposit",
      actor,
      sourceLedgerEntryId: body?.sourceLedgerEntryId ? String(body.sourceLedgerEntryId) : null,
      metadata: { source: "invest_deposits_api" },
    });

    return NextResponse.json({ success: true, deposit: (result as any).deposit, row: (result as any).row });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
