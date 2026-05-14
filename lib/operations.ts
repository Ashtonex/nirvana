import { supabaseAdmin } from "@/lib/supabase";

export type OperationsLedgerKind =
  | "eod_deposit"
  | "overhead_deposit"
  | "overhead_contribution"
  | "overhead_payment"
  | "order_payment"
  | "stock_orders"
  | "business_expense"
  | "other_expense"
  | "capital_injection"
  | "loan_injection"
  | "loan_received"
  | "loan_payment"
  | "peer_contribution"
  | "peer_transfer"
  | "peer_payout"
  | "other_income"
  | "transport"
  | "adjustment";

export type OverheadCategory = "rent" | "salaries" | "utilities" | "misc";

type OperationsLedgerRow = {
  amount?: unknown;
  kind?: unknown;
  shop_id?: unknown;
  shopId?: unknown;
  notes?: unknown;
  title?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
};

export function normalizeOperationsKind(kind: unknown) {
  return String(kind || "").toLowerCase();
}

export function isVaultDepositKind(kind: unknown) {
  const k = normalizeOperationsKind(kind);
  return [
    "eod_deposit",
    "savings_deposit",
    "savings_contribution",
    "savings",
    "blackbox",
    "black_box",
    "black-box",
    "capital_injection",
    "loan_injection",
    "loan_received",
    "other_income",
    "peer_transfer",
    "peer_contribution",
    "overhead_contribution",
    "overhead_deposit",
    "adjustment",
    "drawer_post",
  ].includes(k);
}

export function isSavingsOrBlackboxOperationsKind(kind: unknown) {
  const k = normalizeOperationsKind(kind);
  return ["savings_deposit", "savings_contribution", "savings", "blackbox", "black_box", "black-box"].includes(k);
}

export function isPosOriginOperationsEntry(entry: OperationsLedgerRow) {
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata as Record<string, unknown> : {};
  const source = String(metadata.source || metadata.origin || "").toLowerCase();
  if (source === "pos" || source === "pos_drawer" || source === "pos_page") return true;

  const text = `${entry.title || ""} ${entry.notes || ""}`.toLowerCase();
  return text.includes("pos") || text.includes("drawer");
}

export function isShopOverheadKind(kind: unknown) {
  const k = normalizeOperationsKind(kind);
  return [
    "overhead_contribution",
    "overhead_payment",
    "overhead_deposit",
    "rent",
    "salaries",
    "utilities",
    "misc"
  ].includes(k);
}

export function isOverheadContributionKind(kind: unknown) {
  const k = normalizeOperationsKind(kind);
  return ["overhead_contribution", "overhead_deposit", "rent", "salaries", "utilities", "misc"].includes(k);
}

export function isOverheadPaymentKind(kind: unknown) {
  const k = normalizeOperationsKind(kind);
  return ["overhead_payment"].includes(k);
}

export function getOperationsVaultImpact(entry: OperationsLedgerRow) {
  const amount = Number(entry.amount || 0);
  const kind = normalizeOperationsKind(entry.kind);
  const shopId = entry.shop_id ?? entry.shopId;

  if (!Number.isFinite(amount) || amount === 0) return 0;

  if (amount > 0 && isVaultDepositKind(kind)) {
    return amount;
  }

  // Any negative operations ledger entry is an outflow from the master vault, 
  // regardless of whether it is shop-scoped (like a specific shop's rent) or global.
  // This ensures the Master Vault reflects immediate impacts from overhead payments.
  if (amount < 0) {
    return amount;
  }

  return 0;
}

export async function getOperationsComputedBalance(month?: string) {
  let query = supabaseAdmin.from("operations_ledger").select("amount, kind, shop_id");

  if (month) {
    query = query.gte("effective_date", `${month}-01`)
                 .lt("effective_date", new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1)).toISOString().split('T')[0]);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getOperationsComputedBalance] Query Error:', error);
    throw new Error(error.message);
  }

  let balance = 0;
  (data || []).forEach((row: OperationsLedgerRow) => {
    balance += getOperationsVaultImpact(row);
  });
  
  return balance;
}

export async function getOperationsState() {
  const { data, error } = await supabaseAdmin
    .from("operations_state")
    .select("id, actual_balance, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || { id: 1, actual_balance: 0, updated_at: null };
}

export async function setOperationsActualBalance(actualBalance: number) {
  const { error } = await supabaseAdmin
    .from("operations_state")
    .upsert({ id: 1, actual_balance: actualBalance, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function createOperationsLedgerEntry(input: {
  amount: number;
  kind: OperationsLedgerKind | string;
  shopId?: string | null;
  overheadCategory?: OverheadCategory | null;
  title?: string | null;
  notes?: string | null;
  effectiveDate?: string | null; // YYYY-MM-DD
  employeeId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const row: Record<string, unknown> = {
    amount: Number(input.amount || 0),
    kind: String(input.kind || "adjustment"),
    shop_id: input.shopId ?? null,
    overhead_category: input.overheadCategory ?? null,
    title: input.title ?? null,
    notes: input.notes ?? null,
    employee_id: input.employeeId ?? null,
    metadata: input.metadata ?? {},
  };

  if (input.effectiveDate) row.effective_date = input.effectiveDate;

  const { data, error } = await supabaseAdmin
    .from("operations_ledger")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listOperationsLedgerEntries(limit = 50, filters?: { month?: string; shopId?: string; period?: 'day' | 'week' | 'month' | 'year' | 'all' }) {
  let query = supabaseAdmin
    .from("operations_ledger")
    .select("*")
    .is("deleted_at", null);
    
  if (filters?.month) {
    const month = filters.month;
    query = query.gte("created_at", `${month}-01T00:00:00Z`)
                 .lt("created_at", new Date(new Date(`${month}-01T00:00:00Z`).setMonth(new Date(`${month}-01`).getMonth() + 1)).toISOString());
  } else if (filters?.period && filters.period !== 'all') {
    const start = new Date();
    
    if (filters.period === 'day') {
      start.setHours(0, 0, 0, 0);
    } else if (filters.period === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
    } else if (filters.period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (filters.period === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    }
    
    query = query.gte("created_at", start.toISOString());
  }

  if (filters?.shopId) {
    query = query.eq("shop_id", filters.shopId);
  }
  
  query = query.order("created_at", { ascending: false }).limit(limit);
  
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

