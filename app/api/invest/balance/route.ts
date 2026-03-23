import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId") || "";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    const { data: deposits, error } = await supabaseAdmin
      .from("invest_deposits")
      .select("*")
      .eq("shop_id", shopId)
      .order("deposited_at", { ascending: false });

    if (error) throw new Error(error.message);

    const totalDeposited = (deposits || []).reduce(
      (sum: number, d: any) => sum + Number(d.amount || 0),
      0
    );
    const totalWithdrawn = (deposits || []).reduce(
      (sum: number, d: any) => sum + Number(d.withdrawn_amount || 0),
      0
    );
    const availableBalance = totalDeposited - totalWithdrawn;
    const depositCount = (deposits || []).length;
    const withdrawalCount = (deposits || []).filter(
      (d: any) => Number(d.withdrawn_amount || 0) > 0
    ).length;

    const recent = (deposits || []).slice(0, 5).map((d: any) => ({
      id: d.id,
      amount: Number(d.amount),
      withdrawnAmount: Number(d.withdrawn_amount || 0),
      depositedAt: d.deposited_at,
      depositedBy: d.deposited_by,
      status: d.status,
    }));

    return NextResponse.json({
      shopId,
      totalDeposited: Number(totalDeposited.toFixed(2)),
      totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
      availableBalance: Number(availableBalance.toFixed(2)),
      depositCount,
      withdrawalCount,
      recent,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
