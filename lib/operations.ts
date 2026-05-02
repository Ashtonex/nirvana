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

  // Vault deposits: ONLY these kinds increase the global vault balance.
  // Overhead contributions (rent, salaries, overhead_contribution, etc.) go to the
  // per-shop overhead tracker and do NOT inflate the vault.
  const vaultDepositKinds = [
    'eod_deposit',
    'savings_deposit', 'savings_contribution', 'savings',
    'blackbox', 'black_box', 'black-box',
    'capital_injection', 'loan_injection',
    'adjustment',
  ];

  let balance = 0;
  (data || []).forEach((row: any) => {
    const amt = Number(row.amount || 0);
    const k = String(row.kind || "").toLowerCase();
    
    // Deposits into the vault (EOD, savings, blackbox, capital)
    if (amt > 0 && vaultDepositKinds.includes(k)) {
      balance += amt;
    }
    // Expenses from the vault (admin-level deductions only — no shop_id or 'global')
    else if (amt < 0 && (!row.shop_id || row.shop_id === 'global')) {
      balance += amt; // amount is negative, so it reduces balance
    }
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
    const now = new Date();
    let start = new Date();
    
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

