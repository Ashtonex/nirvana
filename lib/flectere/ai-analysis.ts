"use client";

import type { AiInsight } from "./types";
import type { DeadStockItem, ReorderSuggestion } from "@/lib/analytics";

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
  deadStockDetails: { name: string; qty: number; value: number; days: number }[];
  reorderCount: number;
  reorderDetails: { name: string; stock: number; daysToZero: number; suggested: number }[];
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
  const deadLines = input.deadStockDetails.slice(0, 8).map(
    (d) => `  - ${d.name}: ${d.qty} units, $${d.value.toLocaleString()}, ${d.days} days`
  ).join("\n");
  const reorderLines = input.reorderDetails.slice(0, 8).map(
    (r) => `  - ${r.name}: ${r.stock} left, ${r.daysToZero}d remaining`
  ).join("\n");

  return `You are an AI business analyst for Nirvana, a retail business with ${input.shopCount} shops. Analyze this data and return 4-6 concise, actionable insights in JSON format.

DATA:
- All-time revenue: $${input.allTimeRevenue.toLocaleString()} over ${input.salesCount} transactions
- Employees: ${input.employeeCount}
- Inventory value: $${input.totalInventoryValue.toLocaleString()}
- Avg daily revenue (60d): $${Math.round(input.avgDailyRevenue).toLocaleString()}
- Growth (last 30d vs prev 30d): ${input.growthPct >= 0 ? "+" : ""}${input.growthPct.toFixed(1)}%
- Dead stock (${input.deadStockCount} items worth $${Math.round(input.deadStockValue).toLocaleString()}):
${deadLines}
- Reorder needed (${input.reorderCount} items):
${reorderLines}
- Stock value premium: $${Math.round(input.premiumValue).toLocaleString()}
- Revenue forecast: ${input.forecastTrend} (projected $${Math.round(input.forecastProjected).toLocaleString()} next 30d, confidence ${(input.forecastConfidence * 100).toFixed(0)}%)
- Best sellers: ${input.bestSellers.map((b) => `${b.name} (${b.qty} units, $${Math.round(b.revenue).toLocaleString()}, ${b.margin}% margin)`).join("; ")}

Return a JSON array of objects with:
- category: "sales" | "inventory" | "finance" | "operations"
- title: short headline (max 10 words)
- body: 2-3 sentence insight (max 50 words) — be specific, mention actual item names and amounts
- severity: "positive" | "warning" | "critical" | "info"
- metric: { label, value } — a single key number to highlight
- action: a suggested next step (max 15 words)

Rules:
- Mention specific item names from dead stock and reorder lists
- If growth is negative, explain what it means in plain terms
- Be specific, use actual numbers, no generic advice`;
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
    if (!Array.isArray(data.insights)) return getFallbackInsights(input);
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
      id: "fg-1",
      category: "sales",
      title: input.growthPct < -15
        ? `Revenue dropped ${Math.abs(input.growthPct).toFixed(0)}% — urgent review needed`
        : `Revenue declined ${Math.abs(input.growthPct).toFixed(1)}% month-over-month`,
      body: input.growthPct < -15
        ? `Revenue fell from $${Math.round(input.previousRevenue).toLocaleString()} to $${Math.round(input.currentRevenue).toLocaleString()}, a drop of $${(input.previousRevenue - input.currentRevenue).toLocaleString()}. This is a significant decline that needs immediate investigation across all shops.`
        : `Last 30 days generated $${Math.round(input.currentRevenue).toLocaleString()} vs $${Math.round(input.previousRevenue).toLocaleString()} the period before — a gap of $${(input.previousRevenue - input.currentRevenue).toLocaleString()}. Check if any shop underperformed or if operational issues contributed.`,
      severity: input.growthPct < -15 ? "critical" : "warning",
      metric: { label: "Revenue change", value: `${input.growthPct.toFixed(1)}%` },
      action: "Compare daily sales across shops for the affected period",
    });
  } else if (input.growthPct > 10) {
    insights.push({
      id: "fg-1",
      category: "sales",
      title: `Strong growth: +${input.growthPct.toFixed(1)}% revenue increase`,
      body: `Revenue grew from $${Math.round(input.previousRevenue).toLocaleString()} to $${Math.round(input.currentRevenue).toLocaleString()} — an additional $${(input.currentRevenue - input.previousRevenue).toLocaleString()}. This outpaces the ${Math.round(input.avgDailyRevenue).toLocaleString()}/day average.`,
      severity: "positive",
      metric: { label: "Growth", value: `+${input.growthPct.toFixed(1)}%` },
      action: "Analyze what drove the increase and replicate it",
    });
  }

  if (input.deadStockValue > 500) {
    const topItems = input.deadStockDetails.slice(0, 5);
    const itemList = topItems.map((d) => `${d.name} (${d.qty} units, $${Math.round(d.value).toLocaleString()})`).join(", ");
    insights.push({
      id: "fg-2",
      category: "inventory",
      title: `${input.deadStockCount} dead stock items worth $${Math.round(input.deadStockValue).toLocaleString()}`,
      body: `These items haven't sold in 60+ days, tying up capital that could be used elsewhere. ${topItems.length > 0 ? `Top items: ${itemList}.` : ""}`,
      severity: input.deadStockValue > 2000 ? "critical" : "warning",
      metric: { label: "Dead stock value", value: `$${Math.round(input.deadStockValue).toLocaleString()}` },
      action: `Run clearance on ${topItems.slice(0, 3).map((d) => d.name).join(", ")}`,
    });
  }

  if (input.reorderCount > 0) {
    const topReorder = input.reorderDetails.slice(0, 5);
    const itemList = topReorder.map((r) => `${r.name} (${r.stock} left, ${r.daysToZero}d)`).join(", ");
    insights.push({
      id: "fg-3",
      category: "inventory",
      title: `${input.reorderCount} items ${input.reorderCount === 1 ? "is" : "are"} running low`,
      body: `${itemList.length > 0 ? `${itemList}. ` : ""}Based on 30-day velocity, these items risk stockout within ${Math.min(...input.reorderDetails.map((r) => r.daysToZero))} days if not reordered soon.`,
      severity: input.reorderCount > 5 ? "critical" : "warning",
      metric: { label: "Items low", value: String(input.reorderCount) },
      action: `Prioritize reorder for ${topReorder.slice(0, 3).map((r) => r.name).join(", ")}`,
    });
  }

  const revPerEmp = input.salesCount > 0 && input.employeeCount > 0
    ? Math.round(input.allTimeRevenue / input.employeeCount) : 0;
  insights.push({
    id: "fg-4",
    category: "finance",
    title: `$${revPerEmp.toLocaleString()} revenue per employee`,
    body: `With ${input.employeeCount} staff across ${input.shopCount} shops generating $${input.allTimeRevenue.toLocaleString()}, each employee averages $${revPerEmp.toLocaleString()}. ${revPerEmp > 10000 ? "This is a healthy ratio." : "Consider if staffing levels match traffic patterns."}`,
    severity: revPerEmp > 10000 ? "positive" : "info",
    metric: { label: "Revenue/employee", value: `$${revPerEmp.toLocaleString()}` },
  });

  const multiplier = input.totalInventoryValue > 0
    ? (input.breakEvenValue / input.totalInventoryValue).toFixed(2) : "N/A";
  insights.push({
    id: "fg-5",
    category: "inventory",
    title: `Stock-to-value multiplier: ${multiplier}x`,
    body: `At break-even (35% markup) the ${input.totalInventoryValue > 0 ? `$${Math.round(input.totalInventoryValue).toLocaleString()}` : ""} inventory is worth ${multiplier}x cost. ${Number(multiplier) > 1.3 ? "This is a healthy margin buffer." : "Margins are tight — review pricing strategy."}`,
    severity: Number(multiplier) > 1.3 ? "positive" : "warning",
    metric: { label: "Break-even multiplier", value: `${multiplier}x` },
  });

  if (input.bestSellers.length > 0) {
    const top = input.bestSellers[0];
    insights.push({
      id: "fg-6",
      category: "sales",
      title: `Top seller: ${top.name} (${top.qty} units, $${Math.round(top.revenue).toLocaleString()})`,
      body: `This item accounts for the highest volume in the last 30 days with a ${top.margin}% margin. ${top.margin >= 40 ? "Strong profitability — ensure adequate stock." : "Consider if pricing can be optimized for better margin."}`,
      severity: top.margin >= 40 ? "positive" : "info",
      metric: { label: "Top seller revenue", value: `$${Math.round(top.revenue).toLocaleString()}` },
      action: top.margin >= 40 ? "Keep well-stocked and cross-promote" : "Review pricing on top seller",
    });
  }

  if (input.forecastTrend === "up" && input.forecastConfidence > 0.5) {
    insights.push({
      id: "fg-7",
      category: "sales",
      title: `Upward trend: $${Math.round(input.forecastProjected).toLocaleString()} projected next 30d`,
      body: `With ${(input.forecastConfidence * 100).toFixed(0)}% confidence, the forecast suggests continued growth. This is $${Math.round(input.forecastProjected - input.avgDailyRevenue * 30).toLocaleString()} above the current daily run rate.`,
      severity: "positive",
      metric: { label: "30d projection", value: `$${Math.round(input.forecastProjected).toLocaleString()}` },
      action: "Ensure inventory levels support projected demand",
    });
  } else if (input.forecastTrend === "down" && input.forecastConfidence > 0.5) {
    insights.push({
      id: "fg-7",
      category: "sales",
      title: `Downward trend: $${Math.round(input.forecastProjected).toLocaleString()} projected`,
      body: `The forecast shows a declining trend with ${(input.forecastConfidence * 100).toFixed(0)}% confidence. Expected revenue is $${Math.round(input.forecastProjected).toLocaleString()} over the next 30 days, which is below the current run rate.`,
      severity: "warning",
      metric: { label: "30d projection", value: `$${Math.round(input.forecastProjected).toLocaleString()}` },
      action: "Review marketing efforts and identify declining categories",
    });
  }

  return insights;
}