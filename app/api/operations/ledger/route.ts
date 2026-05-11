import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor, isPrivilegedRole } from "@/lib/apiAuth";
import { createOperationsLedgerEntry, getOperationsVaultImpact, listOperationsLedgerEntries } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const month = url.searchParams.get("month") || undefined;
    const shopId = url.searchParams.get("shopId") || undefined;
    const period = (url.searchParams.get("period") as any) || undefined;
    
    const rows = await listOperationsLedgerEntries(limit, { month, shopId, period });
    return NextResponse.json({ rows });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    let actor: any;
    try {
      actor = await requirePrivilegedActor();
    } catch (e: any) {
      try {
        actor = await requireStaffActor();
      } catch (e2: any) {
        throw e;
      }
    }
    const body = await req.json().catch(() => ({}));

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const kind = String(body?.kind || "adjustment");
    const shopId = body?.shopId ? String(body.shopId) : null;
    const overheadCategory = body?.overheadCategory ? String(body.overheadCategory) : null;
    const title = body?.title ? String(body.title) : null;
    const notes = body?.notes ? String(body.notes) : null;
    const effectiveDate = body?.effectiveDate ? String(body.effectiveDate) : null;

    // If the poster is a non-privileged staff actor, restrict allowed kinds and shop scope
    if (actor?.type === 'staff' && !isPrivilegedRole(actor.role)) {
      const allowedKinds = ["eod_deposit", "overhead_contribution"];
      if (!allowedKinds.includes(kind)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (shopId && actor.shopId && shopId !== actor.shopId) {
        return NextResponse.json({ error: "Forbidden: shop mismatch" }, { status: 403 });
      }
    }

    const row = await createOperationsLedgerEntry({
      amount,
      kind,
      shopId,
      overheadCategory: overheadCategory as any,
      title,
      notes,
      effectiveDate,
      employeeId: actor.type === "staff" ? actor.employeeId : null,
      metadata: body?.metadata || {},
    });

    // Only true vault movements change the physical master vault.
    // Shop overhead contributions/payments stay on the shop overhead tracker until rollover.
    const vaultImpact = getOperationsVaultImpact({ amount, kind, shop_id: shopId });
    if (vaultImpact !== 0) {
      const { supabaseAdmin } = await import('@/lib/supabase');
      const { data: currentState } = await supabaseAdmin
        .from('operations_state')
        .select('actual_balance')
        .eq('id', 1)
        .maybeSingle();

      const newBalance = Number(currentState?.actual_balance || 0) + vaultImpact;
      await supabaseAdmin
        .from('operations_state')
        .upsert({ 
          id: 1, 
          actual_balance: newBalance, 
          updated_at: new Date().toISOString() 
        });
    }

    return NextResponse.json({ success: true, row });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

