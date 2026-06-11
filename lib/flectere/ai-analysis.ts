import type { AiInsight } from "./types";

type AnalysisInput = {
  allTimeRevenue: number;
  salesCount: number;
  employeeCount: number;
  totalInventoryValue: number;
  avgDailyRevenue: number;
  growthPct: number;
  currentRevenue: number;
  previousRevenue: number;
  deadStockCount: number;
  deadStockValue: number;
  reorderCount: number;
  premiumValue: number;
  breakEvenValue: number;
  leanValue: number;
  bestSellers: { name: string; qty: number; revenue: number; margin: number }[];
  forecastTrend: "up" | "down" | "flat";
  forecastProjected: number;
  forecastConfidence: number;
  shopCount: number;
};

function buildPrompt(input: AnalysisInput): string {
  return `You are an AI business analyst for Nirvana, a retail business with ${input.shopCount} shops. Analyze this data and return 4-6 concise, actionable insights in JSON format.

DATA:
- All-time revenue: $${input.allTimeRevenue.toLocaleString()} over ${input.salesCount} transactions
- Employees: ${input.employeeCount}
- Inventory value: $${input.totalInventoryValue.toLocaleString()}
- Avg daily revenue (60d): $${Math.round(input.avgDailyRevenue).toLocaleString()}
- Growth (last 30d vs prev 30d): ${input.growthPct >= 0 ? "+" : ""}${input.growthPct.toFixed(1)}% (current $${Math.round(input.currentRevenue).toLocaleString()} vs previous $${Math.round(input.previousRevenue).toLocaleString()})
- Dead stock: ${input.deadStockCount} items worth $${Math.round(input.deadStockValue).toLocaleString()}
- Reorder needed: ${input.reorderCount} items running low
- Stock value premium: $${Math.round(input.premiumValue).toLocaleString()}
- Stock value break-even: $${Math.round(input.breakEvenValue).toLocaleString()}
- Stock value lean: $${Math.round(input.leanValue).toLocaleString()}
- Revenue forecast: ${input.forecastTrend} (projected $${Math.round(input.forecastProjected).toLocaleString()} next 30d, confidence ${(input.forecastConfidence * 100).toFixed(0)}%)
- Best sellers: ${input.bestSellers.map((b) => `${b.name} (${b.qty} units, $${Math.round(b.revenue).toLocaleString()}, ${b.margin.toFixed(1)}% margin)`).join("; ")}

Return a JSON array of objects with:
- category: "sales" | "inventory" | "finance" | "operations"
- title: short headline (max 8 words)
- body: 1-2 sentence insight (max 30 words)
- severity: "positive" | "warning" | "critical" | "info"
- metric: { label, value } — a single key number to highlight, or null
- action: a suggested next step (max 12 words), or null

Rules:
- Be specific, use actual numbers, no generic advice
- Flag the most important finding as first item
- If growth is negative or dead stock is high, flag as warning/critical`;
}

export async function generateAiInsights(input: AnalysisInput): Promise<AiInsight[]> {
  const prompt = buildPrompt(input);

  try {
    const res = await fetch("/api/flectere/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      console.warn("[Flectere AI] API error", res.status);
      return getFallbackInsights(input);
    }

    const data = await res.json();
    if (!Array.isArray(data.insights)) {
      return getFallbackInsights(input);
    }

    return data.insights.map((ins: any, i: number) => ({
      id: `ai-${i}`,
      category: ins.category || "operations",
      title: ins.title || "Analysis point",
      body: ins.body || "",
      severity: ins.severity || "info",
      metric: ins.metric || undefined,
      action: ins.action || undefined,
    }));
  } catch (err) {
    console.warn("[Flectere AI] Fetch failed, using fallback", err);
    return getFallbackInsights(input);
  }
}

function getFallbackInsights(input: AnalysisInput): AiInsight[] {
  const insights: AiInsight[] = [];

  if (input.growthPct < -5) {
    insights.push({
      id: "fallback-growth",
      category: "sales",
      title: "Revenue declining",
      body: `Revenue dropped ${Math.abs(input.growthPct).toFixed(1)}% compared to the previous 30-day period.`,
      severity: "warning",
      metric: { label: "Growth", value: `${input.growthPct.toFixed(1)}%` },
      action: "Review daily operations for the affected period",
    });
  } else if (input.growthPct > 10) {
    insights.push({
      id: "fallback-growth",
      category: "sales",
      title: "Strong revenue growth",
      body: `Revenue grew ${input.growthPct.toFixed(1)}% — ${Math.round(input.currentRevenue - input.previousRevenue).toLocaleString()} above last period.`,
      severity: "positive",
      metric: { label: "Growth", value: `+${input.growthPct.toFixed(1)}%` },
      action: "Analyze what drove the increase and replicate it",
    });
  }

  if (input.deadStockValue > 500) {
    insights.push({
      id: "fallback-deadstock",
      category: "inventory",
      title: `${input.deadStockCount} items in dead stock`,
      body: `$${Math.round(input.deadStockValue).toLocaleString()} tied up in inventory with no sale for 60+ days.`,
      severity: input.deadStockValue > 2000 ? "critical" : "warning",
      metric: { label: "Dead stock value", value: `$${Math.round(input.deadStockValue).toLocaleString()}` },
      action: "Run a promotion or bundle to clear aging stock",
    });
  }

  if (input.reorderCount > 3) {
    insights.push({
      id: "fallback-reorder",
      category: "inventory",
      title: `${input.reorderCount} items need reordering`,
      body: `${input.reorderCount} products are running low based on 30-day sales velocity.`,
      severity: "warning",
      metric: { label: "Items low", value: String(input.reorderCount) },
      action: "Review reorder suggestions and place purchase orders",
    });
  }

  const revenuePerEmployee = input.salesCount > 0 && input.employeeCount > 0
    ? Math.round(input.allTimeRevenue / input.employeeCount)
    : 0;

  insights.push({
    id: "fallback-efficiency",
    category: "finance",
    title: `$${revenuePerEmployee.toLocaleString()} per employee`,
    body: `All-time revenue divided across ${input.employeeCount} staff members.`,
    severity: revenuePerEmployee > 10000 ? "positive" : "info",
    metric: { label: "Revenue/employee", value: `$${revenuePerEmployee.toLocaleString()}` },
    action: undefined,
  });

  const inventoryRatio = input.totalInventoryValue > 0
    ? (input.breakEvenValue / input.totalInventoryValue).toFixed(2)
    : "N/A";

  insights.push({
    id: "fallback-invratio",
    category: "inventory",
    title: `Stock multiplier: ${inventoryRatio}x`,
    body: `At break-even markup, inventory is worth ${inventoryRatio}x its cost. Premium pricing yields ${input.totalInventoryValue > 0 ? (input.premiumValue / input.totalInventoryValue).toFixed(2) : "N/A"}x.`,
    severity: "info",
    metric: { label: "Break-even multiplier", value: `${inventoryRatio}x` },
    action: undefined,
  });

  if (input.forecastTrend === "up" && input.forecastConfidence > 0.5) {
    insights.push({
      id: "fallback-forecast",
      category: "sales",
      title: "Upward trend projected",
      body: `Forecast suggests $${Math.round(input.forecastProjected).toLocaleString()} in the next 30 days (${(input.forecastConfidence * 100).toFixed(0)}% confidence).`,
      severity: "positive",
      metric: { label: "30d projection", value: `$${Math.round(input.forecastProjected).toLocaleString()}` },
      action: "Ensure inventory can meet projected demand",
    });
  }

  return insights;
}
