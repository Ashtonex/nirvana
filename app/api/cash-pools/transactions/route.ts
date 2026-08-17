import { NextResponse } from "next/server";
import { isPrivilegedRole, requirePrivilegedActor, requireStaffActor } from "@/lib/apiAuth";
import { postFundTransaction, legacyKindToBucket, type FundDirection } from "@/lib/cash-pools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let actor: any;
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
      const role = String(actor.role || "").toLowerCase();
      if (!isPrivilegedRole(actor.role) && !["manager", "lead_manager", "lead manager"].includes(role)) {
        throw new Error("Forbidden");
      }
    }

    const body = await req.json().catch(() => ({}));
    const shopId = body?.shopId ? String(body.shopId) : null;
    if (actor?.type === "staff" && actor.shopId && shopId && shopId !== actor.shopId) {
      return NextResponse.json({ error: "Forbidden: shop mismatch" }, { status: 403 });
    }

    const operationType = String(body?.operationType || body?.kind || "adjustment");
    const direction: FundDirection = body?.direction === "withdrawal" ? "withdrawal" : "deposit";
    const overheadCategory = body?.overheadCategory ? String(body.overheadCategory) : null;
    const { bucketKey, isBlackbox } = legacyKindToBucket(operationType, overheadCategory);

    const result = await postFundTransaction({
      amount: Number(body?.amount),
      direction,
      bucketKey,
      isBlackbox,
      shopId,
      title: String(body?.title || ""),
      notes: body?.notes ? String(body.notes) : null,
      overheadCategory: overheadCategory as "rent" | "salaries" | "utilities" | "misc" | null,
      effectiveDate: body?.effectiveDate ? String(body.effectiveDate) : null,
      actor,
      metadata: {
        ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        legacyOperationType: operationType,
        legacyFundingPool: body?.fundingPool || null,
      },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
