import { supabaseAdmin } from "@/lib/supabase";

export const POS_EXPENSE_CATEGORIES = ["POS Expense", "Perfume", "Overhead", "Tithe", "Groceries"] as const;
export type PosExpenseCategory = typeof POS_EXPENSE_CATEGORIES[number];

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
  table?: string;
  hint?: string;
}

export interface ValidationResult {
  status: "ok" | "issues_found";
  timestamp: string;
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
  issues: ValidationIssue[];
}

function getExpenses(shopId?: string, since?: string): Promise<any[]> {
  let query = supabaseAdmin
    .from("ledger_entries")
    .select("id, category, amount, date, shop_id, type, description");

  if (shopId) query = query.eq("shop_id", shopId);
  if (since) query = query.gte("date", since);

  return query.then((r: any) => r.data || []);
}

function getOpsLedger(shopId?: string): Promise<any[]> {
  let query = supabaseAdmin.from("operations_ledger").select("*");
  if (shopId) query = query.eq("shop_id", shopId);
  return query.then((r: any) => r.data || []);
}

function getInvestDeposits(shopId?: string): Promise<any[]> {
  let query = supabaseAdmin.from("invest_deposits").select("*");
  if (shopId) query = query.eq("shop_id", shopId);
  return query.then((r: any) => r.data || []);
}

export async function validateExpenseCategoryConsistency(shopId?: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const expenses = await getExpenses(shopId);
  const opsLedger = await getOpsLedger(shopId);

  const posExpenses = expenses.filter(e => POS_EXPENSE_CATEGORIES.includes(e.category as any));

  if (posExpenses.length === 0) return issues;

  const today = new Date().toISOString().split("T")[0];

  for (const expense of posExpenses) {
    const expenseDate = String(expense.date || "").split("T")[0];

    const matchingOps = opsLedger.filter(op =>
      op.notes?.includes("Auto-routed from POS expense") &&
      Number(op.amount) === Number(expense.amount) &&
      Math.abs(new Date(op.created_at).getTime() - new Date(expense.date).getTime()) < 60000
    );

    if (matchingOps.length > 1) {
      issues.push({
        severity: "warning",
        code: "MULTIPLE_OPS_POSTS",
        message: `Expense "${expense.description}" ($${expense.amount}) has ${matchingOps.length} operations ledger entries — possible duplicate routing.`,
        table: "operations_ledger",
        hint: "Check operations_ledger for duplicate entries with the same amount and timestamp.",
      });
    }

    if (expenseDate === today) {
      const matching = matchingOps.length > 0;
      if (!matching) {
        const hasManualOps = opsLedger.some(op =>
          op.notes?.includes("Auto-routed from POS expense") === false &&
          Number(op.amount) === Number(expense.amount)
        );
        if (!hasManualOps && (expense.category === "Overhead" || expense.category === "Perfume")) {
          issues.push({
            severity: "warning",
            code: "UNROUTED_EXPENSE",
            message: `${expense.category} expense "$${expense.amount}" was not routed to its expected ledger.`,
            table: "ledger_entries",
            hint: `Check if ${expense.category} expenses are being auto-routed correctly.`,
          });
        }
      }
    }
  }

  return issues;
}

export async function validateCashDrawerIntegrity(shopId: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const sinceStr = since.toISOString();

  const [expenses, opsLedger, investDeposits] = await Promise.all([
    getExpenses(shopId, sinceStr),
    getOpsLedger(shopId),
    getInvestDeposits(shopId),
  ]);

  const posExpenses = expenses.filter(e =>
    POS_EXPENSE_CATEGORIES.includes(e.category as any)
  );
  const totalPosExpenses = posExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const todayOpsPosts = opsLedger.filter(op => {
    const opDate = String(op.effective_date || "").split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    return opDate === today &&
      !["POS Expense", "Perfume", "Overhead"].includes(String(op.category || "")) &&
      (op.kind === "eod_deposit" || op.kind === "overhead_payment");
  });
  const totalOpsPosts = todayOpsPosts.reduce((sum, op) => sum + Number(op.amount || 0), 0);

  const opsExpenseAmounts = new Set(
    opsLedger
      .filter(op => op.notes?.includes("Auto-routed from POS expense"))
      .map(op => `${op.amount}-${op.created_at}`)
  );

  let doubleCounted = 0;
  for (const expense of posExpenses) {
    const key = `${expense.amount}-${expense.date}`;
    if (opsExpenseAmounts.has(key)) {
      doubleCounted += Number(expense.amount);
    }
  }

  if (doubleCounted > 0) {
    issues.push({
      severity: "error",
      code: "CASH_DRAWER_DOUBLE_DEDUCTION",
      message: `$${doubleCounted.toFixed(2)} in POS expenses appear to be double-counted between ledger_entries and operations_ledger.`,
      table: "cash_drawer",
      hint: "Verify that todaysOpsPosts excludes POS/Perfume/Overhead categories.",
    });
  }

  const investAmounts = new Set(
    investDeposits.map(d => `${d.amount}-${d.created_at}`)
  );
  let doubleInvest = 0;
  for (const expense of posExpenses) {
    if (investAmounts.has(`${expense.amount}-${expense.date}`)) {
      doubleInvest += Number(expense.amount);
    }
  }

  if (doubleInvest > 0) {
    issues.push({
      severity: "warning",
      code: "INVEST_DOUBLE_DEPOSIT",
      message: `$${doubleInvest.toFixed(2)} in expenses also appear as invest_deposits.`,
      table: "invest_deposits",
      hint: "This may be intentional (perfume auto-deposits). Verify if double-counting is expected.",
    });
  }

  const investWithWithdrawals = investDeposits.filter(d =>
    d.withdrawn_amount && Number(d.withdrawn_amount) > 0
  );
  for (const dep of investWithWithdrawals) {
    if (Number(dep.withdrawn_amount) > Number(dep.amount)) {
      issues.push({
        severity: "error",
        code: "OVER_WITHDRAWAL",
        message: `Invest deposit ${dep.id} has withdrawn_amount ($${dep.withdrawn_amount}) exceeding amount ($${dep.amount}).`,
        table: "invest_deposits",
      });
    }
  }

  return issues;
}

export async function runOracleValidation(shopId?: string): Promise<ValidationResult> {
  const checks: ValidationResult["checks"] = [];
  const allIssues: ValidationIssue[] = [];

  try {
    const categoryIssues = await validateExpenseCategoryConsistency(shopId);
    allIssues.push(...categoryIssues);
    checks.push({
      name: "Expense Category Consistency",
      passed: categoryIssues.filter(i => i.severity === "error").length === 0,
      details: categoryIssues.length > 0
        ? `${categoryIssues.filter(i => i.severity === "error").length} errors, ${categoryIssues.filter(i => i.severity === "warning").length} warnings`
        : "All POS expenses use canonical categories.",
    });
  } catch (e: any) {
    checks.push({ name: "Expense Category Consistency", passed: false, details: e.message });
  }

  if (shopId) {
    try {
      const drawerIssues = await validateCashDrawerIntegrity(shopId);
      allIssues.push(...drawerIssues);
      checks.push({
        name: "Cash Drawer Integrity",
        passed: drawerIssues.filter(i => i.severity === "error").length === 0,
        details: drawerIssues.length > 0
          ? `${drawerIssues.filter(i => i.severity === "error").length} errors, ${drawerIssues.filter(i => i.severity === "warning").length} warnings`
          : "No double-deduction detected.",
      });
    } catch (e: any) {
      checks.push({ name: "Cash Drawer Integrity", passed: false, details: e.message });
    }
  }

  return {
    status: allIssues.filter(i => i.severity === "error").length > 0 ? "issues_found" : "ok",
    timestamp: new Date().toISOString(),
    checks,
    issues: allIssues,
  };
}
