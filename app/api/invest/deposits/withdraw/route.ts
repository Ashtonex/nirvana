import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvestDepositRow = {
  id: string;
  shop_id: string;
  amount: number | string;
  withdrawn_amount?: number | string | null;
  status?: string | null;
};

type BulkWithdrawResult = {
  id: string;
  shopId: string;
  amount: number;
  deposit: InvestDepositRow | null;
};

export async function POST(req: Request) {
  try {
    const actor = await requirePrivilegedActor();
    const body = await req.json().catch(() => ({}));

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const title = String(body?.title || "Withdrawal");
    const withdrawnBy = actor.type === "staff" ? actor.employeeId : "owner";
    const depositId = body?.depositId ? String(body.depositId) : "";
    const withdrawnAt = new Date().toISOString();

    if (depositId) {
      const { data: deposit, error: fetchError } = await supabaseAdmin
        .from("invest_deposits")
        .select("*")
        .eq("id", depositId)
        .maybeSingle();

      if (fetchError || !deposit) {
        return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
      }

      const available = Number(deposit.amount) - Number(deposit.withdrawn_amount || 0);
      if (amount > available) {
        return NextResponse.json({ error: `Only ${available.toFixed(2)} available` }, { status: 400 });
      }

      const newWithdrawn = Number(deposit.withdrawn_amount || 0) + amount;
      const status = newWithdrawn >= Number(deposit.amount) ? "withdrawn" : "partial";

      const { data, error } = await supabaseAdmin
        .from("invest_deposits")
        .update({
          withdrawn_amount: newWithdrawn,
          withdrawn_at: withdrawnAt,
          withdrawn_by: withdrawnBy,
          withdraw_title: title,
          status,
        })
        .eq("id", depositId)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);

      return NextResponse.json({ success: true, deposit: data, mode: "single" });
    }

    const { data: deposits, error: listError } = await supabaseAdmin
      .from("invest_deposits")
      .select("*")
      .in("status", ["active", "partial"])
      .order("deposited_at", { ascending: true });

    if (listError) throw new Error(listError.message);

    const rows: InvestDepositRow[] = deposits || [];
    const totalAvailable = rows.reduce((sum: number, row: InvestDepositRow) => {
      return sum + (Number(row.amount || 0) - Number(row.withdrawn_amount || 0));
    }, 0);

    if (amount > totalAvailable) {
      return NextResponse.json({ error: `Only ${totalAvailable.toFixed(2)} available` }, { status: 400 });
    }

    let remaining = amount;
    const affected: BulkWithdrawResult[] = [];

    for (const deposit of rows) {
      if (remaining <= 0) break;

      const available = Number(deposit.amount || 0) - Number(deposit.withdrawn_amount || 0);
      if (available <= 0) continue;

      const draw = Math.min(available, remaining);
      const newWithdrawn = Number(deposit.withdrawn_amount || 0) + draw;
      const status = newWithdrawn >= Number(deposit.amount || 0) ? "withdrawn" : "partial";

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("invest_deposits")
        .update({
          withdrawn_amount: newWithdrawn,
          withdrawn_at: withdrawnAt,
          withdrawn_by: withdrawnBy,
          withdraw_title: title,
          status,
        })
        .eq("id", deposit.id)
        .select("*")
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);

      affected.push({
        id: deposit.id,
        shopId: deposit.shop_id,
        amount: draw,
        deposit: updated,
      });
      remaining -= draw;
    }

    return NextResponse.json({
      success: true,
      mode: "bulk",
      affected,
      totalWithdrawn: amount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
