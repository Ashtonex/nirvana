import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor, isPrivilegedRole } from "@/lib/apiAuth";
import { listOperationsLedgerEntries } from "@/lib/operations";
import { postFundTransaction, legacyKindToBucket, type FundDirection } from "@/lib/cash-pools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    let actor: any;
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
    }
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const month = url.searchParams.get("month") || undefined;
    const requestedShopId = url.searchParams.get("shopId") || undefined;
    const shopId = requestedShopId;
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

    const rawAmount = Number(body?.amount);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // This route historically took a signed amount (positive = deposit, negative = withdrawal)
    // rather than an explicit direction field like the Direct Ops modal does.
    const direction: FundDirection = rawAmount > 0 ? "deposit" : "withdrawal";
    const kindInput = String(body?.kind || "adjustment").toLowerCase();
    const shopId = body?.shopId ? String(body.shopId) : null;
    const overheadCategory = body?.overheadCategory ? String(body.overheadCategory) : null;
    const title = body?.title ? String(body.title) : null;
    const notes = body?.notes ? String(body.notes) : null;
    const effectiveDate = body?.effectiveDate ? String(body.effectiveDate) : null;

    if (["invest_deposit", "invest_withdrawal", "stock_orders"].includes(kindInput)) {
      return NextResponse.json(
        { error: "Use /api/cash-pools/transactions for invest and stock-order pool transactions" },
        { status: 400 }
      );
    }

    // If the poster is a non-privileged staff actor, restrict allowed kinds and shop scope
    if (actor?.type === 'staff' && !isPrivilegedRole(actor.role)) {
      const allowedKinds = [
        "eod_deposit",
        "savings_deposit",
        "savings_withdrawal",
        "blackbox",
        "overhead_contribution",
        "overhead_payment",
        "stockvel_deposit",
        "stockvel_withdrawal",
        "round_deposit",
        "round_withdrawal",
        "order_payment",
        "capital_injection",
        "business_expense",
        "other_expense",
        "other_income",
        "transport",
        "adjustment",
      ];
      if (!allowedKinds.includes(kindInput)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (shopId && actor.shopId && shopId !== actor.shopId) {
        return NextResponse.json({ error: "Forbidden: shop mismatch" }, { status: 403 });
      }
    }

    const { bucketKey, isBlackbox } = legacyKindToBucket(kindInput, overheadCategory);

    const result = await postFundTransaction({
      amount: Math.abs(rawAmount),
      direction,
      bucketKey,
      isBlackbox,
      shopId,
      title: title || "Operations Ledger Entry",
      notes,
      overheadCategory: overheadCategory as "rent" | "salaries" | "utilities" | "misc" | null,
      effectiveDate,
      actor,
      metadata: {
        ...(body?.metadata || {}),
        legacyKind: kindInput,
      },
    });

    return NextResponse.json({ success: true, row: result.row });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

