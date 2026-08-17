import { createOperationsLedgerEntry, getOperationsVaultImpact, type OverheadCategory } from "@/lib/operations";
import { supabaseAdmin } from "@/lib/supabase";

export type CashPoolFundingPool = "savings" | "overhead" | "invest";
export type CashPoolDirection = "deposit" | "withdrawal";

export type CashPoolOperationType =
  | "eod_deposit"
  | "savings_deposit"
  | "savings_withdrawal"
  | "blackbox"
  | "overhead_contribution"
  | "overhead_payment"
  | "invest_deposit"
  | "invest_withdrawal"
  | "stock_orders"
  | "order_payment"
  | "business_expense"
  | "transport"
  | "other_expense"
  | "adjustment";

type ActorInput = {
  type?: string;
  employeeId?: string | null;
};

type CashPoolInput = {
  amount: number;
  operationType: CashPoolOperationType | string;
  fundingPool?: CashPoolFundingPool | string | null;
  direction?: CashPoolDirection | string | null;
  shopId?: string | null;
  title: string;
  notes?: string | null;
  overheadCategory?: OverheadCategory | string | null;
  effectiveDate?: string | null;
  actor?: ActorInput | null;
  metadata?: Record<string, unknown>;
};

type InvestDepositRow = {
  id: string;
  shop_id: string;
  amount?: number | string | null;
  withdrawn_amount?: number | string | null;
};

// ---------------------------------------------------------------------------
// Canonical fund-transaction API (Phase 2 of the fund-bucket rollout).
//
// postFundTransaction() is the single write path every UI entry point migrates
// to in Phase 3, replacing the 5 independent ways money used to reach
// Operations. It writes a real bucket_key on every row instead of relying on
// text/metadata inference after the fact, and moves operations_state.actual_balance
// via the atomic increment_operations_actual_balance() RPC (added in the Phase 1
// migration) instead of the old read-then-upsert race.
//
// It deliberately does NOT go through createOperationsLedgerEntry() for
// non-invest buckets: that function's normalizeOperationsLedgerInput() contains
// a keyword scanner that can silently rewrite `kind` based on words appearing in
// the title/notes (e.g. any mention of "stock" forces kind to stock_orders,
// regardless of what was actually passed in). That's exactly the kind of
// text-inferred reclassification this rewrite is meant to eliminate — bucket_key
// and kind are now decided once, deterministically, from the caller's explicit
// bucketKey + direction, and never second-guessed by string matching.
// ---------------------------------------------------------------------------

export type BucketKey = "rent" | "salaries" | "savings_blackbox" | "stock" | "invest_perfumes" | "general";
export type FundDirection = "deposit" | "withdrawal";

const BUCKET_KIND_MAP: Record<BucketKey, Record<FundDirection, string>> = {
  rent: { deposit: "overhead_contribution", withdrawal: "overhead_payment" },
  salaries: { deposit: "overhead_contribution", withdrawal: "overhead_payment" },
  savings_blackbox: { deposit: "savings_deposit", withdrawal: "savings_withdrawal" },
  stock: { deposit: "stock_contribution", withdrawal: "stock_orders" },
  invest_perfumes: { deposit: "invest_deposit", withdrawal: "invest_withdrawal" },
  general: { deposit: "eod_deposit", withdrawal: "adjustment" },
};

// Legacy metadata.fundingPool tag, kept only so pre-migration readers (classifyOperationsAccount,
// and the operations_ledger_sensitive_cash_pool_metadata / operations_ledger_invest_kind_uses_invest_pool
// CHECK constraints from supabase/migrations/20260725_enforce_cash_pool_metadata.sql, which require a
// valid fundingPool for stock_orders/invest_* kinds) keep working during the Phase 3 migration window.
// bucket_key is the authoritative field going forward — this mapping is transitional scaffolding, not a
// second source of truth: nothing in postFundTransaction ever reads it back to decide behavior.
const BUCKET_LEGACY_FUNDING_POOL: Record<BucketKey, "savings" | "overhead" | "invest" | null> = {
  rent: "overhead",
  salaries: "overhead",
  savings_blackbox: "savings",
  stock: "savings",
  invest_perfumes: "invest",
  general: null,
};

const BUCKET_LEGACY_ACCOUNT: Record<BucketKey, string> = {
  rent: "overhead",
  salaries: "overhead",
  savings_blackbox: "savings",
  stock: "other",
  invest_perfumes: "invest",
  general: "vault",
};

// Shared translation from the pre-bucket kind/operationType vocabulary onto the enforced fund
// buckets. Used by every legacy entry point (Direct Ops modal, generic operations-ledger POST,
// Hand manual expense entry) so they all resolve to the same bucket for the same real-world kind
// instead of each guessing independently. stockvel/round are dormant (stripped from the UI
// already) and fold into "general" — no dedicated bucket for a feature nobody uses any more.
export function legacyKindToBucket(kind: string, overheadCategory?: string | null): { bucketKey: BucketKey; isBlackbox?: boolean } {
  const k = kind.toLowerCase();
  if (k === "invest_deposit" || k === "invest_withdrawal") return { bucketKey: "invest_perfumes" };
  if (k === "stock_orders" || k === "stock_contribution") return { bucketKey: "stock" };
  if (k === "blackbox" || k === "black_box" || k === "black-box") return { bucketKey: "savings_blackbox", isBlackbox: true };
  if (k === "savings_deposit" || k === "savings_withdrawal" || k === "savings_contribution" || k === "savings") return { bucketKey: "savings_blackbox" };
  if (k === "overhead_contribution" || k === "overhead_payment" || k === "overhead_deposit") {
    return { bucketKey: overheadCategory === "salaries" ? "salaries" : "rent" };
  }
  // eod_deposit, capital_injection, other_income, adjustment, order_payment, business_expense,
  // transport, other_expense, stockvel_*, round_*, and anything else not tied to one of the 5
  // named buckets.
  return { bucketKey: "general" };
}

export type PostFundTransactionInput = {
  amount: number;
  direction: FundDirection;
  bucketKey: BucketKey;
  shopId: string | null;
  title: string;
  notes?: string | null;
  isBlackbox?: boolean; // only meaningful for bucketKey === "savings_blackbox" deposits
  effectiveDate?: string | null;
  actor?: ActorInput | null;
  sourceLedgerEntryId?: string | null; // structural link back to the ledger_entries row this came from
  metadata?: Record<string, unknown>;
  stockOverride?: { reason: string } | null; // owner/manager-only escape hatch, see Phase 7 trigger
  investDepositId?: string | null; // invest_perfumes withdrawals only: target one specific deposit instead of FIFO-draining the pool
  overheadCategory?: "rent" | "salaries" | "utilities" | "misc" | null; // sub-detail within the rent bucket (utilities/misc still fold into bucketKey "rent"); defaults from bucketKey if omitted
};

async function applyOperationsStateImpactAtomic(amount: number, kind: string, shopId: string | null, metadata: Record<string, unknown>) {
  const vaultImpact = getOperationsVaultImpact({ amount, kind, shop_id: shopId, metadata });
  if (vaultImpact === 0) return;
  const { error } = await supabaseAdmin.rpc("increment_operations_actual_balance", { delta: vaultImpact });
  if (error) throw new Error(error.message);
}

async function getBucketBalance(bucketKey: BucketKey, shopId: string | null): Promise<number> {
  const { data } = await supabaseAdmin
    .from("operations_bucket_balances")
    .select("balance")
    .eq("shop_key", shopId || "__company__")
    .eq("bucket_key", bucketKey)
    .maybeSingle();
  return Number(data?.balance || 0);
}

async function insertBucketedLedgerRow(row: {
  amount: number;
  kind: string;
  shopId: string | null;
  overheadCategory: string | null;
  bucketKey: BucketKey;
  title: string;
  notes: string | null;
  effectiveDate: string | null;
  employeeId: string | null;
  metadata: Record<string, unknown>;
}) {
  const insertRow: Record<string, unknown> = {
    amount: row.amount,
    kind: row.kind,
    shop_id: row.shopId,
    overhead_category: row.overheadCategory,
    bucket_key: row.bucketKey,
    title: row.title,
    notes: row.notes,
    employee_id: row.employeeId,
    metadata: { ...row.metadata, account: BUCKET_LEGACY_ACCOUNT[row.bucketKey] },
  };
  if (row.effectiveDate) insertRow.effective_date = row.effectiveDate;

  const { data, error } = await supabaseAdmin.from("operations_ledger").insert(insertRow).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function postFundTransaction(input: PostFundTransactionInput) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
  if (!String(input.title || "").trim()) throw new Error("Description/notes required");
  if (!BUCKET_KIND_MAP[input.bucketKey]) throw new Error(`Unknown bucket: ${input.bucketKey}`);

  const direction = input.direction;
  const shopId = input.shopId ? String(input.shopId) : null;
  const finalAmount = direction === "deposit" ? amount : -amount;
  const employeeId = input.actor?.type === "staff" ? input.actor.employeeId || null : null;

  let kind = BUCKET_KIND_MAP[input.bucketKey][direction];
  if (input.bucketKey === "savings_blackbox" && input.isBlackbox && direction === "deposit") {
    kind = "blackbox";
  }

  // Sub-detail within the bucket for reporting granularity (e.g. distinguishing rent from
  // utilities even though both share bucketKey "rent"). Caller-supplied value wins when it's
  // consistent with the bucket; otherwise falls back to the bucket's own default tag.
  const bucketDefaultOverheadCategory = input.bucketKey === "rent" ? "rent" : input.bucketKey === "salaries" ? "salaries" : null;
  const overheadCategory =
    input.bucketKey === "rent" && input.overheadCategory && input.overheadCategory !== "salaries"
      ? input.overheadCategory
      : bucketDefaultOverheadCategory;

  const legacyFundingPool = BUCKET_LEGACY_FUNDING_POOL[input.bucketKey];
  const metadata: Record<string, unknown> = {
    ...(input.metadata || {}),
    source: String(input.metadata?.source || "fund_transaction"),
    cashPoolTransaction: true,
    bucketKey: input.bucketKey,
    ...(legacyFundingPool ? { fundingPool: legacyFundingPool } : {}),
  };
  if (input.sourceLedgerEntryId) metadata.sourceLedgerEntryId = input.sourceLedgerEntryId;

  // Stock bucket: warn-only solvency check (Phase 2a of the rollout). A hard block via the
  // enforce_stock_bucket_solvency trigger (written in Phase 1, attached in Phase 7) only lands
  // after a soak period confirms this never false-positives against real shop usage — until then
  // an over-draw is tagged and logged, never silently rejected.
  if (input.bucketKey === "stock" && direction === "withdrawal") {
    const currentBalance = await getBucketBalance("stock", shopId);
    if (currentBalance - amount < 0) {
      console.warn(`Stock bucket would go negative for ${shopId || "company"}: balance=${currentBalance} withdrawal=${amount}`);
      metadata.stockBalanceWarning = true;
      metadata.stockBalanceAtTime = currentBalance;
    }
  }
  if (input.stockOverride) {
    metadata.stockOverride = "true";
    metadata.stockOverrideReason = input.stockOverride.reason;
  }

  if (input.bucketKey === "invest_perfumes") {
    const result = direction === "deposit"
      ? await recordInvestDeposit({ ...input, operationType: kind } as CashPoolInput, amount, metadata)
      : await recordInvestWithdrawal({ ...input, operationType: kind } as CashPoolInput, amount, metadata, input.investDepositId || null);

    if (result.row?.id) {
      await supabaseAdmin.from("operations_ledger").update({ bucket_key: "invest_perfumes" }).eq("id", result.row.id);
    }
    if (direction === "deposit" && "deposit" in result && result.deposit?.id) {
      await supabaseAdmin
        .from("invest_deposits")
        .update({
          source_operations_ledger_id: result.row?.id || null,
          source_ledger_entry_id: input.sourceLedgerEntryId || null,
          bucket_key: "invest_perfumes",
        })
        .eq("id", result.deposit.id);
    }

    await applyOperationsStateImpactAtomic(finalAmount, kind, shopId, metadata);
    return { success: true, bucketKey: input.bucketKey, direction, ...result };
  }

  const row = await insertBucketedLedgerRow({
    amount: finalAmount,
    kind,
    shopId,
    overheadCategory,
    bucketKey: input.bucketKey,
    title: input.title,
    notes: input.notes || `Fund transaction (${input.bucketKey})`,
    effectiveDate: input.effectiveDate || null,
    employeeId,
    metadata,
  });

  await applyOperationsStateImpactAtomic(finalAmount, kind, shopId, metadata);
  const bucketBalanceAfter = await getBucketBalance(input.bucketKey, shopId);

  return { success: true, bucketKey: input.bucketKey, direction, row, bucketBalanceAfter };
}

async function recordInvestDeposit(input: CashPoolInput, amount: number, metadata: Record<string, unknown>) {
  const shopId = String(input.shopId || "");
  if (!shopId) throw new Error("Shop ID required for invest deposit");

  const depositedBy = input.actor?.type === "staff" ? input.actor.employeeId : "owner";
  const { data: deposit, error } = await supabaseAdmin
    .from("invest_deposits")
    .insert({
      shop_id: shopId,
      amount,
      deposited_by: depositedBy,
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = await createOperationsLedgerEntry({
    amount,
    kind: String(input.operationType),
    shopId,
    title: input.title,
    notes: input.notes || "Cash pool invest deposit",
    effectiveDate: input.effectiveDate || null,
    employeeId: input.actor?.type === "staff" ? input.actor.employeeId || null : null,
    metadata: { ...metadata, investDepositId: deposit?.id },
  });

  return { row, deposit };
}

async function recordInvestWithdrawal(input: CashPoolInput, amount: number, metadata: Record<string, unknown>, depositId?: string | null) {
  const shopId = input.shopId ? String(input.shopId) : "";
  const withdrawnBy = input.actor?.type === "staff" ? input.actor.employeeId : "owner";
  const withdrawnAt = new Date().toISOString();

  // Targeted mode: withdraw from one specific deposit instead of FIFO-draining the whole pool.
  // Mirrors the "single deposit" mode that previously lived only in
  // app/api/invest/deposits/withdraw/route.ts as a separate, duplicated implementation.
  if (depositId) {
    const { data: deposit, error: fetchError } = await supabaseAdmin
      .from("invest_deposits")
      .select("*")
      .eq("id", depositId)
      .maybeSingle();
    if (fetchError || !deposit) throw new Error("Deposit not found");

    const depositRow = deposit as InvestDepositRow;
    const available = Number(depositRow.amount || 0) - Number(depositRow.withdrawn_amount || 0);
    if (amount > available) throw new Error(`Only ${available.toFixed(2)} available`);

    const newWithdrawn = Number(depositRow.withdrawn_amount || 0) + amount;
    const status = newWithdrawn >= Number(depositRow.amount || 0) ? "withdrawn" : "partial";

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("invest_deposits")
      .update({
        withdrawn_amount: newWithdrawn,
        withdrawn_at: withdrawnAt,
        withdrawn_by: withdrawnBy,
        withdraw_title: input.title,
        withdraw_shop_id: shopId || null,
        status,
      })
      .eq("id", depositId)
      .select("*")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);

    const affected = [{ id: depositId, shopId: depositRow.shop_id, amount }];
    const row = await createOperationsLedgerEntry({
      amount: -amount,
      kind: String(input.operationType),
      shopId: shopId || depositRow.shop_id || null,
      title: input.title,
      notes: input.notes || "Cash pool invest withdrawal",
      effectiveDate: input.effectiveDate || null,
      employeeId: input.actor?.type === "staff" ? input.actor.employeeId || null : null,
      metadata: { ...metadata, investAffectedDeposits: affected },
    });

    return { row, affected, totalWithdrawn: amount, mode: "single" as const, deposit: updated };
  }

  let query = supabaseAdmin
    .from("invest_deposits")
    .select("*")
    .in("status", ["active", "partial"])
    .order("deposited_at", { ascending: true });

  if (shopId) query = query.eq("shop_id", shopId);

  const { data: deposits, error: listError } = await query;
  if (listError) throw new Error(listError.message);

  const rows = (deposits || []) as InvestDepositRow[];
  const totalAvailable = rows.reduce((sum: number, row) => {
    return sum + (Number(row.amount || 0) - Number(row.withdrawn_amount || 0));
  }, 0);

  if (amount > totalAvailable) {
    throw new Error(`Only ${totalAvailable.toFixed(2)} available in the invest pool`);
  }

  let remaining = amount;
  const affected: Array<{ id: string; shopId: string; amount: number }> = [];

  for (const deposit of rows) {
    if (remaining <= 0) break;

    const available = Number(deposit.amount || 0) - Number(deposit.withdrawn_amount || 0);
    if (available <= 0) continue;

    const draw = Math.min(available, remaining);
    const newWithdrawn = Number(deposit.withdrawn_amount || 0) + draw;
    const status = newWithdrawn >= Number(deposit.amount || 0) ? "withdrawn" : "partial";

    const { error: updateError } = await supabaseAdmin
      .from("invest_deposits")
      .update({
        withdrawn_amount: newWithdrawn,
        withdrawn_at: withdrawnAt,
        withdrawn_by: withdrawnBy,
        withdraw_title: input.title,
        withdraw_shop_id: shopId || null,
        status,
      })
      .eq("id", deposit.id);
    if (updateError) throw new Error(updateError.message);

    affected.push({ id: deposit.id, shopId: deposit.shop_id, amount: draw });
    remaining -= draw;
  }

  const row = await createOperationsLedgerEntry({
    amount: -amount,
    kind: String(input.operationType),
    shopId: shopId || null,
    title: input.title,
    notes: input.notes || "Cash pool invest withdrawal",
    effectiveDate: input.effectiveDate || null,
    employeeId: input.actor?.type === "staff" ? input.actor.employeeId || null : null,
    metadata: { ...metadata, investAffectedDeposits: affected },
  });

  return { row, affected, totalWithdrawn: amount, mode: "bulk" as const };
}
