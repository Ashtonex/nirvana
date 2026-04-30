import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor, isPrivilegedRole } from "@/lib/apiAuth";
import { createOperationsLedgerEntry, listOperationsLedgerEntries } from "@/lib/operations";

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

    return NextResponse.json({ success: true, row });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

