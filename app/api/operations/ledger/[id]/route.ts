import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePrivilegedActor();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (!id) {
      return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
      updates.amount = amount;
    }
    if (body.kind !== undefined) updates.kind = String(body.kind);
    if (body.shopId !== undefined) updates.shop_id = body.shopId ? String(body.shopId) : null;
    if (body.overheadCategory !== undefined) updates.overhead_category = body.overheadCategory ? String(body.overheadCategory) : null;
    if (body.title !== undefined) updates.title = body.title ? String(body.title) : null;
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes) : null;
    if (body.effectiveDate !== undefined) updates.effective_date = body.effectiveDate ? String(body.effectiveDate) : null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("operations_ledger")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, row: data });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePrivilegedActor();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("operations_ledger")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
