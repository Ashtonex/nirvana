import { supabaseAdmin } from "@/lib/supabase";

export type OperationsLedgerKind =
  | "eod_deposit"
  | "savings_deposit"
  | "savings_withdrawal"
  | "blackbox"
  | "stockvel_deposit"
  | "stockvel_withdrawal"
  | "round_deposit"
  | "round_withdrawal"
  | "invest_deposit"
  | "invest_withdrawal"
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
export type OperationsAccount = "savings" | "overhead" | "stockvel" | "round" | "invest" | "tshirts" | "vault" | "other";

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

export function normalizeOperationsText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function detectOverheadCategoryFromText(value: unknown): OverheadCategory | null {
  const text = normalizeOperationsText(value);
  if (/\brent\b/.test(text)) return "rent";
  if (/\b(salaries|salary|wages|payroll|staff pay)\b/.test(text)) return "salaries";
  if (/\b(utilities|utility|wifi|wi fi|internet|zesa|electric|electricity|water|rates)\b/.test(text)) return "utilities";
  return null;
}

export function classifyOperationsAccount(entry: OperationsLedgerRow): OperationsAccount {
  const kind = normalizeOperationsKind(entry.kind);
  const text = normalizeOperationsText(`${entry.kind || ""} ${entry.title || ""} ${entry.notes || ""}`);

  if (kind.startsWith("stockvel") || /^stockvel\b/.test(text)) return "stockvel";
  if (kind.startsWith("round") || /^round\b/.test(text)) return "round";
  if (isSavingsOrBlackboxOperationsKind(kind) || /\b(savings|saving|blackbox|black box)\b/.test(text)) return "savings";
  if (isShopOverheadKind(kind) || detectOverheadCategoryFromText(text)) return "overhead";
  if (kind.includes("invest")) return "invest";
  if (kind === "eod_deposit" || kind === "drawer_post") return "vault";
  return "other";
}

export function normalizeOperationsLedgerInput(input: {
  amount: number;
  kind?: string | null;
  title?: string | null;
  notes?: string | null;
  overheadCategory?: string | null;
}) {
  const amount = Number(input.amount || 0);
  let rawKind = normalizeOperationsKind(input.kind || "adjustment");
  const title = input.title ? String(input.title) : null;
  const notes = input.notes ? String(input.notes) : null;
  
  // --- HARD-WIRED AUTOMATED KEYWORD SCANNER ---
  // Force overrides based on keywords in title or notes (e.g., from POS)
  const combinedText = normalizeOperationsText(`${rawKind} ${title || ""} ${notes || ""}`);
  
  if (/\b(stock|stock orders|buying stock)\b/.test(combinedText)) {
    rawKind = "stock_orders";
  } else if (/\b(rent)\b/.test(combinedText)) {
    rawKind = "rent";
  } else if (/\b(salaries|salary|wages)\b/.test(combinedText)) {
    rawKind = "salaries";
  } else if (/\b(utilities|utility|wifi|internet|water|electricity)\b/.test(combinedText)) {
    rawKind = "utilities";
  } else if (/\b(savings|saving)\b/.test(combinedText)) {
    rawKind = "savings_deposit";
  } else if (/\b(blackbox|black box)\b/.test(combinedText)) {
    rawKind = "blackbox";
  }
  // --------------------------------------------
  const account = classifyOperationsAccount({ amount, kind: rawKind, title, notes });
  const overheadCategory = input.overheadCategory || detectOverheadCategoryFromText(`${rawKind} ${title || ""} ${notes || ""}`);

  let kind = rawKind;
  if (account === "savings") {
    if (amount < 0) {
      kind = "savings_withdrawal";
    } else {
      kind = normalizeOperationsText(`${rawKind} ${title || ""}`).includes("black") ? "blackbox" : "savings_deposit";
    }
  } else if (account === "overhead") {
    kind = amount < 0 ? "overhead_payment" : "overhead_contribution";
  } else if (account === "stockvel") {
    kind = amount < 0 ? "stockvel_withdrawal" : "stockvel_deposit";
  } else if (account === "round") {
    kind = amount < 0 ? "round_withdrawal" : "round_deposit";
  } else if (account === "invest") {
    kind = amount < 0 ? "invest_withdrawal" : "invest_deposit";
  } else if (rawKind === "stock_orders") {
    kind = "stock_orders";
  }

  return {
    amount,
    kind,
    title,
    notes,
    overheadCategory: account === "overhead" ? (overheadCategory as OverheadCategory | null) : null,
    account,
  };
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
    "stockvel_deposit",
    "round_deposit",
    "invest_deposit",
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
  return ["savings_deposit", "savings_withdrawal", "savings_contribution", "savings", "blackbox", "black_box", "black-box"].includes(k);
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

export function isStockvelKind(kind: unknown) {
  return normalizeOperationsKind(kind).startsWith("stockvel");
}

export function isRoundKind(kind: unknown) {
  return normalizeOperationsKind(kind).startsWith("round");
}

export function getOperationsVaultImpact(entry: OperationsLedgerRow) {
  const amount = Number(entry.amount || 0);
  const account = classifyOperationsAccount(entry);
  const kind = normalizeOperationsKind(entry.kind);

  if (!Number.isFinite(amount) || amount === 0) return 0;

  if (amount > 0 && isVaultDepositKind(kind) && account !== "overhead") {
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
  const normalized = normalizeOperationsLedgerInput(input);
  const row: Record<string, unknown> = {
    amount: normalized.amount,
    kind: normalized.kind,
    shop_id: input.shopId ?? null,
    overhead_category: normalized.overheadCategory ?? null,
    title: normalized.title,
    notes: normalized.notes,
    employee_id: input.employeeId ?? null,
    metadata: { ...(input.metadata ?? {}), account: normalized.account },
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

