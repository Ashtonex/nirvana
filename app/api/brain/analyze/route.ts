import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const INTERNAL_TRANSFER_KEYWORDS = [
  "invest",
  "savings",
  "perfume",
  "deposit to",
  "transfer to",
  "stockvel",
  "operations",
  "overhead contribution",
];

const PERSONAL_KEYWORDS = [
  "personal",
  "抽钱",
  "withdrawal",
  "own",
  "my",
  "me",
  "family",
  "home",
];

const GROCERY_KEYWORDS = [
  "groceries",
  "grocery",
  "food for home",
  "supermarket",
  "market",
  "provisions",
];

const SMALL_EXPENSE_KEYWORDS = [
  "airtime",
  "data",
  "transport",
  "petrol",
  "fuel",
  "lunch",
  "snacks",
  "coffee",
  "water",
  "parking",
  "toll",
  "sms",
];

export async function POST(request: Request) {
  try {
    const { daysBack = 30 } = await request.json();

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysBack);

    const [rulesRes, expensesRes, oracleRes] = await Promise.all([
      supabaseAdmin
        .from("brain_learning_rules")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: false }),
      getExpenses(startDate, now),
      supabaseAdmin.from("sales").select("*").gte("date", startDate.toISOString()).lte("date", now.toISOString()),
    ]);

    const rules = rulesRes.data || [];
    const oracleData = oracleRes.data || [];
    const expenses = expensesRes;

    const classifiedExpenses = expenses.map((expense) =>
      classifyExpense(expense, rules)
    );

    const realBusinessExpenses = classifiedExpenses.filter(
      (e) => !e.isInternalTransfer && !e.isPersonal && e.expenseType !== "ignore"
    );

    const smallExpenses = realBusinessExpenses.filter(
      (e) => e.expenseType === "small" || e.amount < 50
    );

    const groceryExpenses = realBusinessExpenses.filter(
      (e) => e.expenseType === "groceries"
    );

    const analysis = {
      totalExpenses: classifiedExpenses.reduce((sum, e) => sum + e.amount, 0),
      realBusinessExpenses: realBusinessExpenses.reduce((sum, e) => sum + e.amount, 0),
      internalTransfers: classifiedExpenses
        .filter((e) => e.isInternalTransfer)
        .reduce((sum, e) => sum + e.amount, 0),
      personalExpenses: classifiedExpenses
        .filter((e) => e.isPersonal)
        .reduce((sum, e) => sum + e.amount, 0),
      smallExpenses: smallExpenses.reduce((sum, e) => sum + e.amount, 0),
      groceryExpenses: groceryExpenses.reduce((sum, e) => sum + e.amount, 0),
      expenseBreakdown: getExpenseBreakdown(realBusinessExpenses),
      dailyPatterns: getDailyPatterns(realBusinessExpenses),
      anomalyAlerts: detectAnomalies(realBusinessExpenses, smallExpenses, groceryExpenses),
      learnedRulesCount: rules.length,
      oracleInsights: generateOracleInsights(oracleData, realBusinessExpenses),
    };

    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error("[Brain Analyze POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function getExpenses(startDate: Date, endDate: Date) {
  const [posRes, opsRes] = await Promise.all([
    supabaseAdmin
      .from("ledger_entries")
      .select("*")
      .eq("type", "expense")
      .gte("date", startDate.toISOString())
      .lte("date", endDate.toISOString()),
    supabaseAdmin
      .from("operations_ledger")
      .select("*")
      .lt("amount", 0)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString()),
  ]);

  const posExpenses = (posRes.data || []).map((row: any) => ({
    id: `pos-${row.id}`,
    source: "POS",
    amount: Math.abs(Number(row.amount || 0)),
    date: row.date,
    title: row.description || row.category || "Expense",
    category: row.category || "Expense",
    shop_id: row.shop_id,
  }));

  const opsExpenses = (opsRes.data || []).map((row: any) => ({
    id: `ops-${row.id}`,
    source: "Operations",
    amount: Math.abs(Number(row.amount || 0)),
    date: row.created_at,
    title: row.title || row.kind || "Expense",
    category: row.kind || "Expense",
    shop_id: row.shop_id,
  }));

  return [...posExpenses, ...opsExpenses];
}

function classifyExpense(
  expense: any,
  rules: any[]
): any {
  const title = (expense.title || "").toLowerCase();
  const category = (expense.category || "").toLowerCase();
  const fullText = `${title} ${category}`;

  let isInternalTransfer = INTERNAL_TRANSFER_KEYWORDS.some((kw) =>
    fullText.includes(kw)
  );
  let isPersonal = PERSONAL_KEYWORDS.some((kw) => fullText.includes(kw));
  let expenseType = "other";
  let classification = "uncategorized";
  let confidence = 0.5;

  if (GROCERY_KEYWORDS.some((kw) => fullText.includes(kw))) {
    expenseType = "groceries";
    classification = "personal_household";
    confidence = 0.85;
  } else if (SMALL_EXPENSE_KEYWORDS.some((kw) => fullText.includes(kw))) {
    expenseType = "small";
    classification = "operational_misc";
    confidence = 0.7;
  }

  for (const rule of rules) {
    const pattern = rule.match_pattern.toLowerCase();
    const field = rule.match_field === "category" ? category : title;

    if (field.includes(pattern) || pattern.includes(field)) {
      if (rule.action === "ignore" || rule.action === "filter") {
        if (rule.action_value === "internal_transfer") isInternalTransfer = true;
        if (rule.action_value === "personal") isPersonal = true;
      }
      if (rule.action === "classify") {
        expenseType = rule.action_value || expenseType;
        classification = rule.category || classification;
        confidence = Math.max(confidence, 0.9);
      }
    }
  }

  return {
    ...expense,
    isInternalTransfer,
    isPersonal,
    expenseType,
    classification,
    confidence,
  };
}

function getExpenseBreakdown(expenses: any[]) {
  const breakdown: Record<string, { total: number; count: number; avg: number }> = {};

  expenses.forEach((e) => {
    const type = e.expenseType || "other";
    if (!breakdown[type]) {
      breakdown[type] = { total: 0, count: 0, avg: 0 };
    }
    breakdown[type].total += e.amount;
    breakdown[type].count += 1;
  });

  Object.keys(breakdown).forEach((type) => {
    const data = breakdown[type];
    data.avg = data.count > 0 ? data.total / data.count : 0;
  });

  return breakdown;
}

function getDailyPatterns(expenses: any[]) {
  const daily: Record<string, number> = {};

  expenses.forEach((e) => {
    const date = new Date(e.date).toLocaleDateString("en-CA");
    daily[date] = (daily[date] || 0) + e.amount;
  });

  const values = Object.values(daily).sort((a, b) => b - a);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = values.length > 0 ? total / values.length : 0;

  return {
    dailyTotals: daily,
    average: avg,
    highest: values[0] || 0,
    lowest: values[values.length - 1] || 0,
    spikeDays: values.filter((v) => v > avg * 1.5).length,
  };
}

function detectAnomalies(realExpenses: any[], smallExpenses: any[], groceryExpenses: any[]) {
  const alerts: any[] = [];

  if (smallExpenses.length > 20) {
    alerts.push({
      type: "high_frequency_small",
      severity: "info",
      title: "Many Small Expenses",
      message: `${smallExpenses.length} small expenses detected - monitor for patterns`,
      count: smallExpenses.length,
      total: smallExpenses.reduce((s, e) => s + e.amount, 0),
    });
  }

  if (groceryExpenses.length > 10) {
    const groceryTotal = groceryExpenses.reduce((s, e) => s + e.amount, 0);
    alerts.push({
      type: "grocery_tracking",
      severity: "info",
      title: "Grocery Expenses",
      message: "Consider if these should be tracked separately or as personal",
      count: groceryExpenses.length,
      total: groceryTotal,
    });
  }

  const byCategory: Record<string, any[]> = {};
  realExpenses.forEach((e) => {
    const cat = e.category || "other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  });

  Object.entries(byCategory).forEach(([cat, items]) => {
    if (items.length >= 3) {
      const amounts = items.map((i) => i.amount);
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const max = Math.max(...amounts);
      if (max > avg * 2.5) {
        alerts.push({
          type: "category_spike",
          severity: "warning",
          title: `${cat} Spike Detected`,
          message: `Max expense ${max} is ${(max / avg).toFixed(1)}x the average`,
          category: cat,
          amount: max,
          average: avg,
        });
      }
    }
  });

  return alerts;
}

function generateOracleInsights(sales: any[], expenses: any[]) {
  const insights: string[] = [];

  const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);

  if (totalSales > 0) {
    const expenseRatio = totalExpenses / totalSales;
    if (expenseRatio > 0.5) {
      insights.push("Expense ratio above 50% - review overhead costs");
    } else if (expenseRatio < 0.3) {
      insights.push("Healthy expense ratio below 30% - good cost control");
    }
  }

  const byDay: Record<string, number> = {};
  expenses.forEach((e) => {
    const day = new Date(e.date).toLocaleDateString("en-CA", { weekday: "long" });
    byDay[day] = (byDay[day] || 0) + e.amount;
  });

  const highestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  if (highestDay) {
    insights.push(`${highestDay[0]}s tend to have highest expenses`);
  }

  if (insights.length === 0) {
    insights.push("No significant patterns detected - continue monitoring");
  }

  return insights;
}
