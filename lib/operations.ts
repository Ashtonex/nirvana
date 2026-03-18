import { supabaseAdmin } from "@/lib/supabase";

export type OperationsLedgerKind =
  | "eod_deposit"
  | "overhead_deposit"
  | "overhead_payment"
  | "order_payment"
  | "business_expense"
  | "capital_injection"
  | "loan_injection"
  | "loan_payment"
  | "peer_contribution"
  | "peer_payout"
  | "adjustment";

export type OverheadCategory = "rent" | "salaries" | "utilities" | "misc";

export async function getOperationsComputedBalance() {
  const { data, error } = await supabaseAdmin
    .from("operations_ledger")
    .select("amount");
  if (error) throw new Error(error.message);
  const sum = (data || []).reduce((acc: number, row: any) => acc + Number(row.amount || 0), 0);
  return sum;
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
  metadata?: any;
}) {
  const row: any = {
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

export async function listOperationsLedgerEntries(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("operations_ledger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

