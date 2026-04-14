import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const INTERNAL_TRANSFER_PATTERNS = [
  "invest", "savings", "perfume", "deposit to", "transfer to",
  "stockvel", "overhead contribution", "perfume invest",
  "groceries to invest", "savings deposit"
];

const PERSONAL_HOUSEHOLD_PATTERNS = [
  "groceries for home", "food for home", "抽钱", "personal withdrawal",
  "my personal", "family food", "home groceries", "groceries for family",
  "household groceries", "personal groceries"
];

const OVERHEAD_PATTERNS = [
  "rent", "utilities", "electric", "electricity", "water", "rates",
  "municipal", "insurance", "security", "cleaning", "maintenance",
  "repair", "salary", "wages", "payroll", "staff salary", "staff wages",
  "site rent", "premises rent", "electricity bill", "water bill"
];

const STOCK_PATTERNS = [
  "stock", "inventory", "purchases", "stock orders", "stock purchase",
  "restock", "reorder", "wholesale", "bulk order", "procurement"
];

const TRANSPORT_PATTERNS = [
  "transport", "petrol", "fuel", "diesel", "uber", "taxi",
  "delivery", "logistics", "courier", "freight", "toll", "parking"
];

const GROCERY_PATTERNS = [
  "groceries", "grocery", "supermarket", "market", "provisions",
  "food items", "household food"
];

const OPERATIONAL_PATTERNS = [
  "airtime", "data", "internet", "wifi", "phone", "communication",
  "advertising", "marketing", "promotion", "signage", "packaging",
  "stationery", "printing", "office supplies", "bank charges",
  "commission", "service fee", "subscription"
];

const PERSONAL_PATTERNS = [
  "personal", "own", "抽钱", "withdrawal", "meals out", "restaurant",
  "entertainment", "leisure", "vacation", "travel personal"
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
      (e) => !e.isInternalTransfer && !e.isPersonal
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
      overheadExpenses: realBusinessExpenses
        .filter((e) => e.expenseType === "overhead")
        .reduce((sum, e) => sum + e.amount, 0),
      stockExpenses: realBusinessExpenses
        .filter((e) => e.expenseType === "stock")
        .reduce((sum, e) => sum + e.amount, 0),
      transportExpenses: realBusinessExpenses
        .filter((e) => e.expenseType === "transport")
        .reduce((sum, e) => sum + e.amount, 0),
      groceryExpenses: realBusinessExpenses
        .filter((e) => e.expenseType === "groceries")
        .reduce((sum, e) => sum + e.amount, 0),
      operationalExpenses: realBusinessExpenses
        .filter((e) => e.expenseType === "operational")
        .reduce((sum, e) => sum + e.amount, 0),
      otherExpenses: realBusinessExpenses
        .filter((e) => e.expenseType === "other")
        .reduce((sum, e) => sum + e.amount, 0),
      expenseBreakdown: getExpenseBreakdown(realBusinessExpenses),
      allClassifiedExpenses: classifiedExpenses,
      dailyPatterns: getDailyPatterns(realBusinessExpenses),
      anomalyAlerts: detectAnomalies(classifiedExpenses, realBusinessExpenses),
      learnedRulesCount: rules.length,
      oracleInsights: generateOracleInsights(oracleData, classifiedExpenses, realBusinessExpenses),
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
    rawKind: row.kind || row.category || "expense",
  }));

  const opsExpenses = (opsRes.data || []).map((row: any) => ({
    id: `ops-${row.id}`,
    source: "Operations",
    amount: Math.abs(Number(row.amount || 0)),
    date: row.created_at,
    title: row.title || row.kind || "Expense",
    category: row.kind || "Expense",
    shop_id: row.shop_id,
    rawKind: row.kind,
  }));

  return [...posExpenses, ...opsExpenses];
}

function classifyExpense(expense: any, rules: any[]): any {
  const title = (expense.title || "").toLowerCase();
  const category = (expense.category || "").toLowerCase();
  const rawKind = (expense.rawKind || "").toLowerCase();
  const fullText = `${title} ${category}`;

  let isInternalTransfer = false;
  let isPersonal = false;
  let expenseType = "other";
  let classification = "uncategorized";
  let confidence = 0.5;
  let appliedRules: string[] = [];

  if (INTERNAL_TRANSFER_PATTERNS.some((kw) => fullText.includes(kw))) {
    isInternalTransfer = true;
    classification = "internal_transfer";
    confidence = 0.95;
    return { ...expense, isInternalTransfer, isPersonal, expenseType, classification, confidence, appliedRules };
  }

  if (PERSONAL_HOUSEHOLD_PATTERNS.some((kw) => fullText.includes(kw))) {
    isPersonal = true;
    expenseType = "personal";
    classification = "personal_household";
    confidence = 0.9;
    return { ...expense, isInternalTransfer, isPersonal, expenseType, classification, confidence, appliedRules };
  }

  if (OVERHEAD_PATTERNS.some((kw) => fullText.includes(kw))) {
    expenseType = "overhead";
    classification = "business_overhead";
    confidence = 0.9;
  } else if (STOCK_PATTERNS.some((kw) => fullText.includes(kw))) {
    expenseType = "stock";
    classification = "inventory_stock";
    confidence = 0.85;
  } else if (TRANSPORT_PATTERNS.some((kw) => fullText.includes(kw))) {
    expenseType = "transport";
    classification = "operational_transport";
    confidence = 0.8;
  } else if (GROCERY_PATTERNS.some((kw) => fullText.includes(kw))) {
    expenseType = "groceries";
    classification = "groceries";
    confidence = 0.85;
  } else if (OPERATIONAL_PATTERNS.some((kw) => fullText.includes(kw))) {
    expenseType = "operational";
    classification = "operational_misc";
    confidence = 0.75;
  }

  if (rules.length > 0) {
    for (const rule of rules) {
      const pattern = rule.match_pattern.toLowerCase();
      const field = rule.match_field === "category" ? category : title;
      const matches = field.includes(pattern) || pattern.includes(field);

      if (matches) {
        appliedRules.push(rule.id);

        if (rule.action === "personal" || rule.action === "mark_personal") {
          isPersonal = true;
          expenseType = "personal";
          classification = rule.category || "personal";
          confidence = 0.95;
        }

        if (rule.action === "overhead") {
          expenseType = "overhead";
          classification = rule.category || "business_overhead";
          confidence = 0.95;
        }

        if (rule.action === "stock" || rule.action === "inventory") {
          expenseType = "stock";
          classification = rule.category || "inventory_stock";
          confidence = 0.95;
        }

        if (rule.action === "filter" || rule.action === "ignore") {
          isInternalTransfer = true;
          classification = "filtered";
          confidence = 0.95;
        }

        if (rule.action === "classify") {
          expenseType = rule.action_value || expenseType;
          classification = rule.category || classification;
          confidence = 0.95;
        }
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
    appliedRules,
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

function detectAnomalies(allExpenses: any[], businessExpenses: any[]) {
  const alerts: any[] = [];

  const personalExpenses = allExpenses.filter((e) => e.isPersonal);
  if (personalExpenses.length > 0) {
    const personalTotal = personalExpenses.reduce((s, e) => s + e.amount, 0);
    alerts.push({
      type: "personal_expenses",
      severity: "info",
      title: "Personal/Household Expenses",
      message: `${personalExpenses.length} personal expenses totaling $${personalTotal.toFixed(2)}`,
      count: personalExpenses.length,
      total: personalTotal,
      items: personalExpenses.slice(0, 5).map((e) => ({ title: e.title, amount: e.amount })),
    });
  }

  const internalTransfers = allExpenses.filter((e) => e.isInternalTransfer);
  if (internalTransfers.length > 0) {
    const transferTotal = internalTransfers.reduce((s, e) => s + e.amount, 0);
    alerts.push({
      type: "internal_transfers",
      severity: "info",
      title: "Internal Transfers Filtered",
      message: `${internalTransfers.length} transfers to Invest/Savings filtered from business expenses`,
      count: internalTransfers.length,
      total: transferTotal,
    });
  }

  const groceryExpenses = businessExpenses.filter((e) => e.expenseType === "groceries");
  if (groceryExpenses.length > 0) {
    const groceryTotal = groceryExpenses.reduce((s, e) => s + e.amount, 0);
    alerts.push({
      type: "grocery_expenses",
      severity: "info",
      title: "Grocery Expenses",
      message: `${groceryExpenses.length} grocery expenses totaling $${groceryTotal.toFixed(2)}`,
      count: groceryExpenses.length,
      total: groceryTotal,
    });
  }

  const byCategory: Record<string, any[]> = {};
  businessExpenses.forEach((e) => {
    const cat = e.expenseType || "other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  });

  Object.entries(byCategory).forEach(([cat, items]) => {
    if (items.length >= 3) {
      const amounts = items.map((i) => i.amount);
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const max = Math.max(...amounts);
      if (avg > 0 && max > avg * 2.5) {
        alerts.push({
          type: "category_spike",
          severity: "warning",
          title: `${cat} Spike Detected`,
          message: `Max expense $${max.toFixed(2)} is ${(max / avg).toFixed(1)}x the ${cat} average`,
          category: cat,
          amount: max,
          average: avg,
        });
      }
    }
  });

  return alerts;
}

function generateOracleInsights(sales: any[], allExpenses: any[], businessExpenses: any[]) {
  const insights: string[] = [];

  const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalExpenses = businessExpenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const personalTotal = allExpenses.filter((e) => e.isPersonal).reduce((sum: number, e: any) => sum + e.amount, 0);
  const internalTotal = allExpenses.filter((e) => e.isInternalTransfer).reduce((sum: number, e: any) => sum + e.amount, 0);

  insights.push(`Business expenses: $${totalExpenses.toFixed(2)} | Personal: $${personalTotal.toFixed(2)} | Internal transfers: $${internalTotal.toFixed(2)}`);

  if (totalSales > 0) {
    const expenseRatio = totalExpenses / totalSales;
    if (expenseRatio > 0.5) {
      insights.push("Warning: Expense ratio above 50% - review overhead costs");
    } else if (expenseRatio < 0.3) {
      insights.push("Healthy expense ratio below 30% - good cost control");
    } else {
      insights.push(`Expense ratio at ${(expenseRatio * 100).toFixed(1)}% - within acceptable range`);
    }
  }

  const overheadTotal = businessExpenses.filter((e) => e.expenseType === "overhead").reduce((sum: number, e: any) => sum + e.amount, 0);
  const stockTotal = businessExpenses.filter((e) => e.expenseType === "stock").reduce((sum: number, e: any) => sum + e.amount, 0);

  if (overheadTotal > 0) {
    insights.push(`Overhead expenses: $${overheadTotal.toFixed(2)}`);
  }
  if (stockTotal > 0) {
    insights.push(`Stock/inventory purchases: $${stockTotal.toFixed(2)}`);
  }

  if (insights.length === 0) {
    insights.push("Continue monitoring expenses - no significant patterns detected");
  }

  return insights;
}
