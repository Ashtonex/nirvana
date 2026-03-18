import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { getOperationsComputedBalance, getOperationsState, setOperationsActualBalance } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePrivilegedActor();
    const [computed, state] = await Promise.all([getOperationsComputedBalance(), getOperationsState()]);
    return NextResponse.json({
      computedBalance: computed,
      actualBalance: Number((state as any)?.actual_balance || 0),
      updatedAt: (state as any)?.updated_at || null,
      delta: Number((state as any)?.actual_balance || 0) - computed,
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));
    const actualBalance = Number(body?.actualBalance);
    if (!Number.isFinite(actualBalance)) {
      return NextResponse.json({ error: "Invalid actualBalance" }, { status: 400 });
    }
    await setOperationsActualBalance(actualBalance);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

