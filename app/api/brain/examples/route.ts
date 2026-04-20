import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUSINESS_FLOW_PATTERNS = {
  internalTransfer: [
    "invest", "savings", "perfume deposit", "overhead contribution",
    "stockvel", "perfume invest", "deposit to", "eod", "blackbox",
    "groceries to invest"
  ],
  personal: [
    "personal", "抽钱", "withdrawal", "my", "own", "family",
    "food for home", "groceries for home", "home groceries"
  ],
  realExpense: [
    "rent", "utilities", "electric", "electricity", "water", "rates",
    "salary", "wages", "payroll", "stock", "inventory", "purchases",
    "transport", "petrol", "fuel"
  ]
};

function classifyExpense(title: string, category: string, source: string) {
  const text = `${title} ${category}`.toLowerCase();
  
  if (source === "Invest" || BUSINESS_FLOW_PATTERNS.internalTransfer.some(k => text.includes(k))) {
    return { classification: "internal_transfer", isFiltered: true };
  }
  
  if (BUSINESS_FLOW_PATTERNS.personal.some(k => text.includes(k))) {
    return { classification: "personal", isFiltered: false };
  }
  
  if (BUSINESS_FLOW_PATTERNS.realExpense.some(k => text.includes(k))) {
    if (["rent", "utilities", "electric", "electricity", "water", "salary", "wages"].some(k => text.includes(k))) {
      return { classification: "overhead", isFiltered: false };
    }
    if (["stock", "inventory", "purchases"].some(k => text.includes(k))) {
      return { classification: "stock", isFiltered: false };
    }
    if (["transport", "petrol", "fuel"].some(k => text.includes(k))) {
      return { classification: "transport", isFiltered: false };
    }
  }
  
  return { classification: "other", isFiltered: false };
}

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [posRes, opsRes, rulesRes] = await Promise.all([
      supabaseAdmin
        .from("ledger_entries")
        .select("*")
        .eq("type", "expense")
        .gte("date", thirtyDaysAgo.toISOString())
        .limit(100),
      supabaseAdmin
        .from("operations_ledger")
        .select("*")
        .lt("amount", 0)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(100),
      supabaseAdmin
        .from("brain_learning_rules")
        .select("*")
        .eq("is_active", true)
    ]);

    const existingPatterns = new Set(
      ((rulesRes?.data && !rulesRes.error) ? rulesRes.data : []).map((r: any) => r.match_pattern.toLowerCase())
    );

    const migrationWarning = rulesRes?.error && /does not exist/i.test(rulesRes.error.message)
      ? "Brain learning table is not initialized. Run the migration SQL in your Supabase dashboard."
      : undefined;

    if (migrationWarning) {
      console.warn(migrationWarning);
    }

    const posExamples = (posRes.data || []).map((row: any) => {
      const title = String(row.description || row.category || "POS Expense");
      const category = String(row.category || "POS Expense");
      const { classification, isFiltered } = classifyExpense(title, category, "POS");
      return {
        id: `pos-${row.id}`,
        source: "POS",
        title,
        amount: Math.abs(Number(row.amount || 0)),
        category,
        classification,
        isFiltered,
        date: row.date
      };
    });

    const opsExamples = (opsRes.data || []).map((row: any) => {
      const title = String(row.title || row.kind || "Ops Expense");
      const kind = String(row.kind || "Expense");
      const { classification, isFiltered } = classifyExpense(title, kind, "Operations");
      return {
        id: `ops-${row.id}`,
        source: "Operations",
        title,
        amount: Math.abs(Number(row.amount || 0)),
        category: kind,
        classification,
        isFiltered,
        date: row.created_at
      };
    });

    const allExamples = [...posExamples, ...opsExamples]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 50);

    const suggestions: string[] = [];
    
    const unclassifiedExamples = allExamples.filter(e => 
      e.classification === "other" && !existingPatterns.has(e.title.toLowerCase())
    );
    
    if (unclassifiedExamples.length > 0) {
      suggestions.push(`You have ${unclassifiedExamples.length} unclassified expenses that could be teaching opportunities`);
    }

    const expenseKeywords = ["expense", "payment", "purchase", "cost", "fee", "bill"];
    const potentialPersonal = allExamples.filter(e => 
      !e.isFiltered && expenseKeywords.some(k => e.title.toLowerCase().includes(k)) && e.amount < 50
    );
    if (potentialPersonal.length > 3) {
      suggestions.push(`${potentialPersonal.length} small expenses might be personal - review them`);
    }

    const categoryCounts: Record<string, number> = {};
    allExamples.forEach(e => {
      const cat = e.classification;
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      if (count > 5) {
        const catLabels: Record<string, string> = {
          overhead: "overhead expenses like rent/utilities",
          stock: "stock/inventory purchases",
          transport: "transport/fuel costs",
          personal: "personal/household expenses"
        };
        if (catLabels[cat]) {
          suggestions.push(`Consider teaching the brain about ${catLabels[cat]}`);
        }
      }
    });

    return NextResponse.json({
      examples: allExamples,
      suggestions: suggestions.slice(0, 5),
      summary: {
        total: allExamples.length,
        filtered: allExamples.filter(e => e.isFiltered).length,
        personal: allExamples.filter(e => e.classification === "personal").length,
        unclassified: allExamples.filter(e => e.classification === "other").length
      }
    });
  } catch (e: any) {
    console.error("[Brain Examples GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
