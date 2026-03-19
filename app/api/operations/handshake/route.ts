import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));

    const fromShop = String(body?.fromShop || "");
    const toShop = String(body?.toShop || "");
    const amount = Number(body?.amount);
    const associate = String(body?.associate || "");
    const initiatedBy = String(body?.initiatedBy || "");
    const notes = String(body?.notes || "");

    if (!fromShop || !toShop) {
      return NextResponse.json({ error: "Both fromShop and toShop are required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);

    // Create handshake record
    const { data: handshake, error: hsError } = await supabaseAdmin
      .from("operations_handshakes")
      .insert({
        id,
        from_shop: fromShop,
        to_shop: toShop,
        amount,
        associate,
        initiated_by: initiatedBy,
        notes,
        status: "pending",
        created_at: timestamp,
        created_by: actor.type === "staff" ? actor.employeeId : "owner",
      })
      .select("*")
      .maybeSingle();

    if (hsError) {
      // Table might not exist, try creating the entry in operations_ledger instead
      await supabaseAdmin.from("operations_ledger").insert({
        amount: amount,
        kind: "cash_transfer",
        shop_id: fromShop,
        title: `Handshake: ${fromShop} → ${toShop}`,
        notes: `Associate: ${associate} • Initiated by: ${initiatedBy} • ${notes}`,
        employee_id: actor.type === "staff" ? actor.employeeId : null,
        effective_date: timestamp.split("T")[0],
        metadata: { 
          type: "handshake", 
          from_shop: fromShop, 
          to_shop: toShop, 
          associate, 
          initiated_by: initiatedBy,
          status: "completed"
        },
      });
      
      return NextResponse.json({ success: true, message: "Transfer recorded (table pending creation)" });
    }

    return NextResponse.json({ success: true, handshake });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function GET() {
  try {
    await requirePrivilegedActor();
    
    const { data, error } = await supabaseAdmin
      .from("operations_handshakes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ handshakes: [], error: error.message });
    }

    return NextResponse.json({ handshakes: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}
