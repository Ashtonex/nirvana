import { NextResponse } from "next/server";
import { requirePrivilegedActor, requireStaffActor } from "@/lib/apiAuth";
import { postFundTransaction } from "@/lib/cash-pools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const title = String(body?.title || "Withdrawal");
    const shopId = body?.shopId ? String(body.shopId) : "";
    const depositId = body?.depositId ? String(body.depositId) : "";

    const result = await postFundTransaction({
      amount,
      direction: "withdrawal",
      bucketKey: "invest_perfumes",
      shopId: shopId || null,
      title,
      notes: "Invest pool withdrawal",
      actor,
      investDepositId: depositId || null,
      metadata: { source: "invest_deposits_withdraw_api" },
    });

    const r = result as any;
    return NextResponse.json({
      success: true,
      mode: r.mode,
      deposit: r.deposit,
      affected: r.affected,
      totalWithdrawn: r.totalWithdrawn,
      row: r.row,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg.includes("not found") ? 404 : msg.includes("available") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
