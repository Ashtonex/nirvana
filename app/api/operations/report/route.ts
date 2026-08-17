import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor } from "@/lib/apiAuth";
import { getBucketPeriodReport } from "@/lib/operations";

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
    const now = new Date();
    const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defaultEnd = new Date().toISOString().slice(0, 10);

    const startDate = url.searchParams.get("start") || defaultStart;
    const endDate = url.searchParams.get("end") || defaultEnd;
    let shopId = url.searchParams.get("shopId") || undefined;

    if (actor?.type === "staff" && actor.shopId) {
      shopId = actor.shopId;
    }

    const report = await getBucketPeriodReport({ startDate, endDate, shopId });
    return NextResponse.json(report);
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
