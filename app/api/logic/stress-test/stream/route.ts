import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance } from "@/lib/operations";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

function sf(v: any, def = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : def;
}

interface RiskEvent {
  id: string;
  label: string;
  type: "revenue" | "overhead" | "one_time" | "mixed";
  probability: number;
  revImpact: [number, number];
  ohImpact: [number, number];
  oneTimePct: [number, number];
  dayMin: number;
  dayMax: number;
  durationDays: [number, number];
  description: string;
  color: string;
  correlated?: string[];
}

const RISK_EVENTS: RiskEvent[] = [
  {
    id: "recession",
    label: "Economic Recession",
    type: "revenue",
    probability: 0.18,
    revImpact: [-0.70, -0.35],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 15, dayMax: 90,
    durationDays: [60, 180],
    description: "Prolonged demand contraction from economic downturn. Affects consumer spending across all categories.",
    color: "#ef4444",
    correlated: ["seasonal_slump", "competitor_war"],
  },
  {
    id: "seasonal_slump",
    label: "Seasonal Dip",
    type: "revenue",
    probability: 0.25,
    revImpact: [-0.50, -0.20],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 30,
    durationDays: [21, 60],
    description: "Post-holiday slowdown, January-February dip, or Ramadan effect. Predictable but painful.",
    color: "#f97316",
    correlated: ["recession"],
  },
  {
    id: "supply_shock",
    label: "Supply Chain Shock",
    type: "overhead",
    probability: 0.15,
    revImpact: [0, 0],
    ohImpact: [0.15, 0.45],
    oneTimePct: [0, 0],
    dayMin: 20, dayMax: 90,
    durationDays: [30, 120],
    description: "Supplier price increase, import duty hike, or delivery delays. Raises cost of goods sold.",
    color: "#eab308",
  },
  {
    id: "overhead_surge",
    label: "Overhead Surge",
    type: "overhead",
    probability: 0.20,
    revImpact: [0, 0],
    ohImpact: [0.10, 0.40],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 60,
    durationDays: [30, 180],
    description: "Rent increase, utility spike, municipal rate hike, or new insurance premium.",
    color: "#f59e0b",
    correlated: ["interest_rate"],
  },
  {
    id: "tax_event",
    label: "Tax / Levy Event",
    type: "one_time",
    probability: 0.12,
    revImpact: [0, 0],
    ohImpact: [0, 0],
    oneTimePct: [0.03, 0.15],
    dayMin: 30, dayMax: 150,
    durationDays: [1, 1],
    description: "Unexpected tax assessment, VAT audit liability, or regulatory levy. One-time cash drain.",
    color: "#dc2626",
  },
  {
    id: "staff_crisis",
    label: "Staff Crisis",
    type: "overhead",
    probability: 0.18,
    revImpact: [0, 0],
    ohImpact: [0.20, 0.60],
    oneTimePct: [0, 0],
    dayMin: 7, dayMax: 60,
    durationDays: [14, 90],
    description: "Mass sick leave, resignations, or emergency hiring at premium rates. Temporarily inflates payroll.",
    color: "#a855f7",
  },
  {
    id: "interest_rate",
    label: "Interest Rate Spike",
    type: "overhead",
    probability: 0.14,
    revImpact: [0, 0],
    ohImpact: [0.15, 0.35],
    oneTimePct: [0, 0],
    dayMin: 30, dayMax: 120,
    durationDays: [30, 180],
    description: "Central bank rate hike increases cost of credit lines and supplier financing.",
    color: "#7c3aed",
    correlated: ["overhead_surge"],
  },
  {
    id: "competitor_war",
    label: "Competitor Price War",
    type: "revenue",
    probability: 0.20,
    revImpact: [-0.35, -0.10],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 10, dayMax: 60,
    durationDays: [21, 90],
    description: "New competitor enters with aggressive discounting. Forces margin compression.",
    color: "#06b6d4",
    correlated: ["recession"],
  },
  {
    id: "demand_surge",
    label: "Demand Surge (Strain)",
    type: "mixed",
    probability: 0.15,
    revImpact: [0.50, 1.50],
    ohImpact: [0, 0],
    oneTimePct: [0.05, 0.20],
    dayMin: 5, dayMax: 45,
    durationDays: [14, 60],
    description: "Unexpected viral demand. Revenue spikes but working capital is strained stocking up.",
    color: "#10b981",
  },
  {
    id: "inventory_overhang",
    label: "Inventory Overhang",
    type: "mixed",
    probability: 0.16,
    revImpact: [-0.20, -0.05],
    ohImpact: [0.05, 0.20],
    oneTimePct: [0, 0],
    dayMin: 15, dayMax: 75,
    durationDays: [30, 120],
    description: "Slow-moving stock ties up capital. Must discount to clear, reducing margins.",
    color: "#64748b",
  },
  {
    id: "currency_shock",
    label: "Currency Devaluation",
    type: "overhead",
    probability: 0.10,
    revImpact: [0, 0],
    ohImpact: [0.10, 0.30],
    oneTimePct: [0, 0],
    dayMin: 20, dayMax: 100,
    durationDays: [30, 180],
    description: "Local currency weakens against import currencies. Raises all import-linked costs.",
    color: "#f43f5e",
  },
  {
    id: "regulatory_fine",
    label: "Regulatory Fine",
    type: "one_time",
    probability: 0.08,
    revImpact: [0, 0],
    ohImpact: [0, 0],
    oneTimePct: [0.05, 0.20],
    dayMin: 30, dayMax: 180,
    durationDays: [1, 1],
    description: "Compliance violation or licensing issue. Unexpected penalty payment.",
    color: "#b91c1c",
  },
];

type ScenarioMode = "base" | "recession" | "black_swan_2" | "black_swan_3" | "full_monte";

const SCENARIOS: Record<ScenarioMode, { label: string; description: string; events: string[] }> = {
  base: {
    label: "Normal Operations",
    description: "No stress events. Tests baseline cash runway under normal market conditions.",
    events: [],
  },
  recession: {
    label: "Recession Stress",
    description: "Sustained economic downturn with 35-70% revenue drop for 60-180 days. Tests pure demand contraction.",
    events: ["recession"],
  },
  black_swan_2: {
    label: "Black Swan (2 Events)",
    description: "Any two economic shocks fire simultaneously — e.g. recession + overhead surge. Tests multi-event resilience.",
    events: ["*2"],
  },
  black_swan_3: {
    label: "Black Swan (3 Events)",
    description: "Three correlated shocks fire together — recession + overhead + tax. Tests worst-case multi-event survival.",
    events: ["*3"],
  },
  full_monte: {
    label: "Full Monte Carlo",
    description: "All 12 risk events have independent probability of firing. Every path is unique. Most realistic test.",
    events: ["*all"],
  },
};

const SCENARIO_MODE_LABELS: Record<string, string> = {
  Recession: "recession",
  Liquidation: "base",
  Hypergrowth: "base",
  "Black Swan (2 Events)": "black_swan_2",
  "Black Swan (3 Events)": "black_swan_3",
  "Full Monte Carlo": "full_monte",
  "Normal Operations": "base",
};

const SCENARIO_DISPLAY_NAMES: Record<string, string> = {
  base: "Normal Operations",
  recession: "Recession Stress",
  black_swan_2: "Black Swan (2 Events)",
  black_swan_3: "Black Swan (3 Events)",
  full_monte: "Full Monte Carlo",
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function gaussianRand(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

interface ActiveEvent {
  event: RiskEvent;
  startDay: number;
  endDay: number;
  revMult: number;
  ohMult: number;
  oneTimeCost: number;
  fired: boolean;
}

interface SimPath {
  cash: number;
  survived: boolean;
  deathDay: number;
  activeEvents: string[];
  cashHistory: number[];
  eventsFired: number;
  peakDrawdown: number;
}

function runSimulation(
  params: {
    scenario: string;
    cashBalance: number;
    avgDailyRevenue: number;
    monthlyOverhead: number;
    inventory: any[];
    sales: any[];
    ledger: any[];
  },
  onProgress?: (msg: string) => void
): {
  paths: SimPath[];
  summary: Record<string, any>;
  eventStats: Record<string, any>;
  percentileResults: number[];
  daysToInsolvencyDist: number[];
} {
  const { scenario, cashBalance, avgDailyRevenue, monthlyOverhead } = params;
  const TOTAL_PATHS = 1000;
  const FORECAST_DAYS = 180;
  const DAILY_OVERHEAD = monthlyOverhead / 30;

  const mode = (SCENARIO_MODE_LABELS[scenario] || "base") as ScenarioMode;
  const config = SCENARIOS[mode];

  const eventFiredCounts: Record<string, number> = {};
  const eventInsolvencyCounts: Record<string, number> = {};
  const deathDays: number[] = [];
  const percentileCashes: number[] = [];

  const paths: SimPath[] = [];

  for (let p = 0; p < TOTAL_PATHS; p++) {
    if (p % 100 === 0 && onProgress) {
      onProgress(`Simulating path ${p + 1}/${TOTAL_PATHS}...`);
    }

    const cashHistory: number[] = [cashBalance];
    const activeEvents: string[] = [];
    const firedEvents: ActiveEvent[] = [];

    // Decide which events fire this path
    for (const event of RISK_EVENTS) {
      let fires = false;

      if (mode === "base") {
        fires = false;
      } else if (mode === "recession") {
        fires = event.id === "recession";
      } else if (mode === "black_swan_2") {
        if (event.probability >= 0.15) {
          fires = Math.random() < event.probability * 1.5;
        }
      } else if (mode === "black_swan_3") {
        if (event.probability >= 0.10) {
          fires = Math.random() < event.probability * 2.0;
        }
      } else if (mode === "full_monte") {
        fires = Math.random() < event.probability;
      }

      if (fires) {
        const startDay = randInt(event.dayMin, event.dayMax);
        const duration = randInt(event.durationDays[0], event.durationDays[1]);
        const endDay = Math.min(startDay + duration, FORECAST_DAYS);

        const revMult = event.revImpact[0] !== 0 ? rand(event.revImpact[0], event.revImpact[1]) : 0;
        const ohMult = event.ohImpact[0] !== 0 ? rand(event.ohImpact[0], event.ohImpact[1]) : 0;
        const oneTimeCost = event.oneTimePct[0] !== 0 ? rand(event.oneTimePct[0], event.oneTimePct[1]) : 0;

        firedEvents.push({
          event,
          startDay,
          endDay,
          revMult,
          ohMult,
          oneTimeCost: oneTimeCost * cashBalance,
          fired: true,
        });
        activeEvents.push(event.id);
        eventFiredCounts[event.id] = (eventFiredCounts[event.id] || 0) + 1;
      }
    }

    // Run the 180-day simulation
    let cash = cashBalance;
    let peakDrawdown = 0;
    let deathDay = FORECAST_DAYS + 1;

    // One-time costs fire on day 1
    for (const fe of firedEvents) {
      if (fe.event.type === "one_time" && fe.oneTimeCost > 0) {
        cash -= fe.oneTimeCost;
      }
    }

    for (let day = 1; day <= FORECAST_DAYS; day++) {
      // Base daily revenue with slight variance
      const baseRev = avgDailyRevenue * (1 + gaussianRand() * 0.15);
      let dailyRev = Math.max(0, baseRev);
      let dailyOverhead = DAILY_OVERHEAD;

      // Apply active events
      for (const fe of firedEvents) {
        if (day >= fe.startDay && day <= fe.endDay) {
          if (fe.revMult !== 0) {
            dailyRev *= (1 + fe.revMult);
          }
          if (fe.ohMult !== 0) {
            dailyOverhead *= (1 + fe.ohMult);
          }
          // Mixed events: demand surge also has cash strain
          if (fe.event.type === "mixed" && fe.event.id === "demand_surge") {
            cash -= Math.abs(dailyRev * 0.15); // working capital strain
          }
          if (fe.event.type === "mixed" && fe.event.id === "inventory_overhang") {
            dailyRev *= 0.85; // discounted to move stock
          }
        }
      }

      cash += dailyRev - dailyOverhead;
      cashHistory.push(cash);

      const drawdown = cashBalance - cash;
      if (drawdown > peakDrawdown) peakDrawdown = drawdown;

      if (cash < 0 && deathDay > FORECAST_DAYS) {
        deathDay = day;
      }
    }

    const survived = cash >= 0;

    if (!survived) {
      deathDays.push(deathDay);
      for (const eid of activeEvents) {
        eventInsolvencyCounts[eid] = (eventInsolvencyCounts[eid] || 0) + 1;
      }
    }

    percentileCashes.push(cash);
    paths.push({
      cash,
      survived,
      deathDay: deathDay > FORECAST_DAYS ? FORECAST_DAYS : deathDay,
      activeEvents,
      cashHistory,
      eventsFired: firedEvents.length,
      peakDrawdown,
    });
  }

  // Sort for percentiles
  percentileCashes.sort((a, b) => a - b);
  const getPercentile = (pct: number) => percentileCashes[Math.floor((pct / 100) * TOTAL_PATHS)] || 0;

  // Event statistics
  const eventStats: Record<string, any> = {};
  for (const event of RISK_EVENTS) {
    const fired = eventFiredCounts[event.id] || 0;
    const insolvencyWithEvent = eventInsolvencyCounts[event.id] || 0;
    const firingsWithInsolvency = fired > 0 ? (insolvencyWithEvent / fired) * 100 : 0;
    eventStats[event.id] = {
      fired,
      firedPct: Math.round((fired / TOTAL_PATHS) * 100),
      insolvencyWithEvent: Math.round(insolvencyWithEvent),
      firingsWithInsolvencyPct: Math.round(firingsWithInsolvency),
      avgDeathDay: insolvencyWithEvent > 0 ? Math.round(deathDays.filter((d, i) => paths[i].activeEvents.includes(event.id)).reduce((a, b) => a + b, 0) / insolvencyWithEvent) : 0,
    };
  }

  const survivors = paths.filter(p => p.survived);
  const failed = paths.filter(p => !p.survived);
  const survivalRate = Math.round((survivors.length / TOTAL_PATHS) * 100);
  const avgFinalCash = percentileCashes.reduce((a, b) => a + b, 0) / TOTAL_PATHS;

  // Build oracle advice
  let oracleAdvice = "";
  if (survivalRate >= 90) {
    oracleAdvice = "EXCEPTIONAL RESILIENCE: 90%+ survival across all tested conditions. Cash reserves and margins are strong. Maintain current overhead discipline and continue building liquidity buffers.";
  } else if (survivalRate >= 75) {
    oracleAdvice = "SOLID FINANCIAL HEALTH: Business survives most stress scenarios. Focus on reducing any variable overhead, diversifying revenue, and building a 60-day cash reserve.";
  } else if (survivalRate >= 50) {
    oracleAdvice = "MODERATE RISK: 50-75% survival under combined shocks. PRIORITY ACTIONS: (1) Reduce fixed overhead commitments, (2) Accelerate inventory turnover to free working capital, (3) Build 90-day cash buffer, (4) Identify emergency credit lines.";
  } else if (survivalRate >= 25) {
    oracleAdvice = "HIGH RISK: Less than 50% survival under stress. URGENT ACTIONS REQUIRED: (1) Immediately reduce discretionary overhead, (2) Launch demand generation campaigns, (3) Renegotiate supplier payment terms, (4) Explore capital raise or investor injection.";
  } else {
    oracleAdvice = "CRITICAL RISK: Business is fragile. Without immediate structural changes, insolvency is likely under normal market conditions. Engage financial advisors immediately. Consider restructuring, merging, or pivoting revenue model.";
  }

  const summary = {
    survivalRate,
    totalPaths: TOTAL_PATHS,
    forecastDays: FORECAST_DAYS,
    cashBalance: cashBalance.toFixed(2),
    avgDailyRevenue: avgDailyRevenue.toFixed(2),
    monthlyOverhead: monthlyOverhead.toFixed(2),
    peakDrawdown: Math.max(...paths.map(p => p.peakDrawdown)),
    avgFinalCash: avgFinalCash.toFixed(2),
    p5Cash: getPercentile(5).toFixed(2),
    p25Cash: getPercentile(25).toFixed(2),
    p50Cash: getPercentile(50).toFixed(2),
    p75Cash: getPercentile(75).toFixed(2),
    p95Cash: getPercentile(95).toFixed(2),
    survivors: survivors.length,
    failed: failed.length,
    avgDeathDay: failed.length > 0 ? Math.round(deathDays.reduce((a, b) => a + b, 0) / failed.length) : FORECAST_DAYS,
    worstCaseDay: failed.length > 0 ? Math.min(...deathDays) : FORECAST_DAYS,
    mode,
    modeLabel: SCENARIO_DISPLAY_NAMES[mode] || mode,
    oracleAdvice,
  };

  return { paths, summary, eventStats, percentileResults: percentileCashes, daysToInsolvencyDist: deathDays };
}

function generateReportHtml(params: {
  scenario: string;
  summary: Record<string, any>;
  eventStats: Record<string, any>;
  paths: SimPath[];
  percentileResults: number[];
  daysToInsolvencyDist: number[];
}): string {
  const { scenario, summary, eventStats, paths } = params;
  const now = new Date().toISOString();

  // Sort paths by cash for percentile table
  const sortedPaths = [...paths].sort((a, b) => a.cash - b.cash);

  // Build path table rows
  const pathRows = sortedPaths.slice(0, 20).map((p, i) => {
    const outcome = p.survived ? "SURVIVED" : `INSOLVENT D${p.deathDay}`;
    const color = p.survived ? "#10b981" : "#ef4444";
    const events = p.activeEvents.length > 0 ? p.activeEvents.slice(0, 3).join(", ") : "None";
    return `<tr><td>SIM_${String(i + 1).padStart(3, "0")}</td><td>${summary.modeLabel}</td><td>${events}</td><td>${p.eventsFired}</td><td style="color:${color};">$${p.cash.toFixed(2)}</td><td style="color:${color};">${outcome}</td></tr>`;
  }).join("");

  // Build event stats table
  const eventRows = RISK_EVENTS.map(e => {
    const s = eventStats[e.id];
    const firedColor = s.fired > 0 ? "#10b981" : "#475569";
    const insolColor = s.insolvencyWithEvent > 0 ? "#ef4444" : "#10b981";
    return `<tr style="border-left:3px solid ${e.color}">
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${e.color}"></span> ${e.label}</td>
      <td style="color:${firedColor}">${s.firedPct}%</td>
      <td>${s.fired}</td>
      <td style="color:${insolColor}">${s.firingsWithInsolvencyPct}%</td>
      <td>${s.insolvencyWithEvent}</td>
      <td style="font-size:10px;color:#64748b;">${e.description}</td>
    </tr>`;
  }).join("");

  // Survival gauge color
  const survivalColor = summary.survivalRate >= 75 ? "#10b981" : summary.survivalRate >= 50 ? "#f59e0b" : "#ef4444";

  // Cash distribution buckets
  const buckets = [
    { label: "< $0 (Insolvent)", min: -Infinity, max: 0, color: "#ef4444" },
    { label: "$0 - $1K", min: 0, max: 1000, color: "#f97316" },
    { label: "$1K - $5K", min: 1000, max: 5000, color: "#f59e0b" },
    { label: "$5K - $15K", min: 5000, max: 15000, color: "#eab308" },
    { label: "$15K - $50K", min: 15000, max: 50000, color: "#84cc16" },
    { label: "> $50K", min: 50000, max: Infinity, color: "#10b981" },
  ];
  const bucketCounts = buckets.map(b => ({
    ...b,
    count: paths.filter(p => p.cash >= b.min && p.cash < b.max).length,
    pct: Math.round((paths.filter(p => p.cash >= b.min && p.cash < b.max).length / paths.length) * 100),
  }));

  const bucketRows = bucketCounts.map(b => `
    <div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #1e293b;">
      <div style="width:100px;font-size:11px;color:#94a3b8;">${b.label}</div>
      <div style="flex:1;height:20px;background:#1e293b;border-radius:4px;overflow:hidden;">
        <div style="width:${b.pct}%;height:100%;background:${b.color};border-radius:4px;transition:width 1s;"></div>
      </div>
      <div style="width:60px;text-align:right;font-size:11px;font-weight:700;color:${b.color};">${b.pct}%</div>
      <div style="width:50px;text-align:right;font-size:10px;color:#475569;">${b.count}</div>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nirvana Intelligence — Stress Test Report</title>
<style>
*{box-sizing:border-box;}
body{font-family:'Inter',system-ui,sans-serif;background:#020617;color:#f8fafc;padding:40px;line-height:1.6;}
.container{max-width:1100px;margin:0 auto;}
header{border-bottom:2px solid #8b5cf6;padding-bottom:20px;margin-bottom:40px;display:flex;justify-content:space-between;align-items:flex-start;}
.badge{background:#8b5cf620;color:#a78bfa;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:800;text-transform:uppercase;border:1px solid #8b5cf640;display:inline-block;}
h1{font-size:32px;font-weight:900;margin:10px 0 5px;}
h2{font-size:16px;text-transform:uppercase;letter-spacing:0.08em;color:#8b5cf6;border-left:4px solid #8b5cf6;padding-left:12px;margin:30px 0 15px;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;margin-bottom:30px;}
.card{background:#0f172a;border:1px solid #1e293b;padding:20px;border-radius:12px;}
.card h3{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px 0;}
.card p{font-size:22px;font-weight:900;margin:0;color:#e2e8f0;}
.card p.large{font-size:28px;}
.card .sub{font-size:9px;color:#475569;margin-top:4px;}
.survival-card{background:${survivalColor}15;border-color:${survivalColor}40!important;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:30px;}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;}
th{text-align:left;padding:10px 12px;background:#1e293b;font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;}
td{padding:10px 12px;border-bottom:1px solid #1e293b;color:#cbd5e1;}
tr:hover td{background:#1e293b50;}
.advice-box{background:#0f172a;border:2px solid #8b5cf6;border-radius:12px;padding:24px;margin:20px 0;}
.advice-box h3{color:#8b5cf6;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px 0;}
.advice-box p{font-size:14px;line-height:1.8;color:#e2e8f0;margin:0;}
.footer{text-align:center;font-size:10px;color:#475569;margin-top:60px;padding-top:20px;border-top:1px solid #1e293b;}
.risk-bar{display:flex;height:6px;border-radius:3px;overflow:hidden;margin-top:10px;}
.legend{display:flex;gap:20px;flex-wrap:wrap;margin-top:8px;}
.legend-item{display:flex;align-items:center;gap:6px;font-size:10px;color:#64748b;}
@media(max-width:700px){.two-col{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div class="container">
<header>
<div>
<div class="badge">Nirvana Intelligence v5.0</div>
<h1>STRESS TEST REPORT</h1>
<p style="color:#64748b;font-size:13px;">${summary.modeLabel} · ${summary.totalPaths.toLocaleString()} Monte Carlo Paths · ${summary.forecastDays}-Day Forecast</p>
</div>
<div style="text-align:right;">
<p style="font-size:11px;color:#475569;">Generated</p>
<p style="font-size:11px;color:#64748b;">${now}</p>
<p style="font-size:11px;color:#475569;margin-top:8px;">Starting Cash</p>
<p style="font-size:14px;font-weight:800;color:#e2e8f0;">$${Number(summary.cashBalance).toLocaleString()}</p>
</div>
</header>

<section class="grid">
<div class="card survival-card">
<h3>Survival Probability</h3>
<p class="large" style="color:${survivalColor};">${summary.survivalRate}%</p>
<p class="sub">${summary.survivors}/${summary.totalPaths} paths</p>
</div>
<div class="card">
<h3>5th Percentile Cash</h3>
<p style="color:${Number(summary.p5Cash) < 0 ? "#ef4444" : "#e2e8f0"};">$${Number(summary.p5Cash).toLocaleString()}</p>
<p class="sub">Worst realistic outcome</p>
</div>
<div class="card">
<h3>Median Cash (P50)</h3>
<p style="color:${Number(summary.p50Cash) < 0 ? "#ef4444" : "#e2e8f0"};">$${Number(summary.p50Cash).toLocaleString()}</p>
<p class="sub">50% of paths below this</p>
</div>
<div class="card">
<h3>Peak Drawdown</h3>
<p style="color:#ef4444;">-$${Number(summary.peakDrawdown).toLocaleString()}</p>
<p class="sub">Worst single-day drawdown</p>
</div>
<div class="card">
<h3>Avg Final Cash</h3>
<p style="color:${Number(summary.avgFinalCash) < 0 ? "#ef4444" : "#e2e8f0"};">$${Number(summary.avgFinalCash).toLocaleString()}</p>
<p class="sub">Across all paths</p>
</div>
<div class="card">
<h3>Worst-Case Day</h3>
<p style="color:#f59e0b;">Day ${summary.worstCaseDay < summary.forecastDays ? summary.worstCaseDay : "N/A"}</p>
<p class="sub">First insolvency in worst path</p>
</div>
<div class="card">
<h3>Avg Days to Insolvency</h3>
<p style="color:#ef4444;">${summary.avgDeathDay < summary.forecastDays ? "Day " + summary.avgDeathDay : "N/A"}</p>
<p class="sub">Of failed paths</p>
</div>
<div class="card">
<h3>Paths Failed</h3>
<p style="color:#ef4444;">${summary.failed}</p>
<p class="sub">${summary.totalPaths - summary.failed} survived</p>
</div>
</section>

<h2>Cash Distribution Across ${summary.totalPaths.toLocaleString()} Paths</h2>
<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px;">
<div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:8px;">
<span>P5&nbsp;&nbsp;&nbsp;P25&nbsp;&nbsp;&nbsp;P50&nbsp;&nbsp;&nbsp;P75&nbsp;&nbsp;&nbsp;P95</span>
<span>Lowest → Highest Cash</span>
</div>
<div style="display:flex;height:40px;gap:2px;">
<div style="flex:${Math.max(1, Math.round(Number(summary.p5Cash) / Number(summary.cashBalance) * 100))};background:#ef4444;border-radius:4px 0 0 4px;min-width:4px;"></div>
<div style="flex:${Math.max(1, Math.round((Number(summary.p25Cash) - Number(summary.p5Cash)) / Number(summary.cashBalance) * 100))};background:#f97316;min-width:4px;"></div>
<div style="flex:${Math.max(1, Math.round((Number(summary.p50Cash) - Number(summary.p25Cash)) / Number(summary.cashBalance) * 100))};background:#eab308;min-width:4px;"></div>
<div style="flex:${Math.max(1, Math.round((Number(summary.p75Cash) - Number(summary.p50Cash)) / Number(summary.cashBalance) * 100))};background:#84cc16;min-width:4px;"></div>
<div style="flex:${Math.max(1, Math.round((Number(summary.p95Cash) - Number(summary.p75Cash)) / Number(summary.cashBalance) * 100))};background:#10b981;border-radius:0 4px 4px 0;min-width:4px;"></div>
</div>
<div style="display:flex;justify-content:space-between;margin-top:8px;">
<span style="font-size:10px;color:#ef4444;">5th: $${Number(summary.p5Cash).toLocaleString()}</span>
<span style="font-size:10px;color:#eab308;">P25: $${Number(summary.p25Cash).toLocaleString()}</span>
<span style="font-size:10px;color:#cbd5e1;">P50: $${Number(summary.p50Cash).toLocaleString()}</span>
<span style="font-size:10px;color:#84cc16;">P75: $${Number(summary.p75Cash).toLocaleString()}</span>
<span style="font-size:10px;color:#10b981;">P95: $${Number(summary.p95Cash).toLocaleString()}</span>
</div>
</div>

<h2>Outcome Buckets</h2>
<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px 20px;">
${bucketRows}
</div>

<h2>Oracle Analysis</h2>
<div class="advice-box">
<h3>Strategic Assessment</h3>
<p>${summary.oracleAdvice}</p>
</div>
<div class="grid" style="margin-top:16px;">
<div class="card">
<h3>Avg Daily Revenue</h3>
<p>$${Number(summary.avgDailyRevenue).toLocaleString()}</p>
</div>
<div class="card">
<h3>Monthly Overhead</h3>
<p>$${Number(summary.monthlyOverhead).toLocaleString()}</p>
</div>
<div class="card">
<h3>Cash Buffer Days</h3>
<p>${Number(summary.avgDailyRevenue) > 0 ? Math.round(Number(summary.cashBalance) / Number(summary.avgDailyRevenue)) : "N/A"}</p>
<p class="sub">${Number(summary.cashBalance) > 0 ? (Number(summary.avgDailyRevenue) > 0 ? "days of revenue in cash" : "") : "NEGATIVE CASH"}</p>
</div>
<div class="card">
<h3>Overhead Ratio</h3>
<p>${Number(summary.avgDailyRevenue) > 0 ? Math.round((Number(summary.monthlyOverhead) / 30 / Number(summary.avgDailyRevenue)) * 100) : 0}%</p>
<p class="sub">Daily overhead as % of revenue</p>
</div>
</div>

<h2>Risk Event Analysis</h2>
<table>
<thead>
<tr><th>Event</th><th>Firing Rate</th><th>Times Fired</th><th>Insolvency Rate</th><th>Insolvencies</th><th>Description</th></tr>
</thead>
<tbody>${eventRows}</tbody>
</table>
<div style="margin-top:8px;font-size:10px;color:#475569;">
  Firing Rate = % of paths where event triggered · Insolvency Rate = % of those paths that went insolvent · Higher insolvency rate = more dangerous event
</div>

<h2>Sample Path Outcomes</h2>
<table>
<thead>
<tr><th>Path</th><th>Mode</th><th>Active Events</th><th>Event Count</th><th>Final Cash</th><th>Outcome</th></tr>
</thead>
<tbody>${pathRows}</tbody>
</table>

<div class="footer">
NIRVANA OS · LOGIC SIMULATION CORE [MONTE_CARLO v5] · ${summary.totalPaths.toLocaleString()} PATHS · ${summary.forecastDays}-DAY HORIZON · 12 RISK FACTORS
</div>
</div>
</body>
</html>`;
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const scenario = body.scenario || "Recession";
  const startTime = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream may be closed */ }
      };

      const sendProgress = (progress: number, message: string) => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        send({ progress, message, elapsed });
      };

      try {
        sendProgress(2, "Authenticating...");
        await new Promise(r => setTimeout(r, 50));

        sendProgress(5, "Fetching inventory...");
        const { data: inventory } = await supabaseAdmin
          .from("inventory_items")
          .select("*");

        sendProgress(10, "Fetching sales records...");
        const { data: sales } = await supabaseAdmin
          .from("sales")
          .select("*")
          .order("date", { ascending: false })
          .limit(1000);

        sendProgress(15, "Fetching ledger entries...");
        const { data: ledger } = await supabaseAdmin
          .from("ledger_entries")
          .select("*")
          .order("date", { ascending: false })
          .limit(1000);

        sendProgress(20, "Calculating cash position...");
        const opsBalance = await getOperationsComputedBalance();
        const cash = opsBalance || 0;

        const monthlyOverhead = ledger
          .filter((l: any) => l.category === "Overhead" && sf(l.amount) < 0)
          .reduce((s: number, l: any) => s + Math.abs(sf(l.amount)), 0);

        const effectiveOverhead = monthlyOverhead > 0 ? monthlyOverhead : 1500;

        const totalRevenue = (sales || []).reduce((s: number, sale: any) => s + sf(sale.total_with_tax), 0);
        const effectiveAvgDaily = (sales || []).length > 0
          ? totalRevenue / 30
          : effectiveOverhead * 0.5;

        const mode = SCENARIO_MODE_LABELS[scenario] || "base";
        const modeLabel = SCENARIO_DISPLAY_NAMES[mode] || scenario;

        sendProgress(22, `Loaded ${(sales || []).length} sales, ${(inventory || []).length} items. Cash: $${cash.toFixed(2)}. Mode: ${modeLabel}`);
        await new Promise(r => setTimeout(r, 80));

        sendProgress(25, `Launching Monte Carlo engine — ${modeLabel}, 1000 paths, 12 risk factors...`);

        const { paths, summary, eventStats, percentileResults, daysToInsolvencyDist } = runSimulation(
          {
            scenario,
            cashBalance: cash,
            avgDailyRevenue: effectiveAvgDaily,
            monthlyOverhead: effectiveOverhead,
            inventory: inventory || [],
            sales: sales || [],
            ledger: ledger || [],
          },
          (msg) => sendProgress(25 + Math.round(Math.random() * 65), msg)
        );

        sendProgress(90, "Generating report...");

        const html = generateReportHtml({
          scenario,
          summary,
          eventStats,
          paths,
          percentileResults,
          daysToInsolvencyDist,
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `nirvana_stress_${modeLabel.replace(/\s+/g, "_").toLowerCase()}_${timestamp}.html`;

        send({ progress: 100, message: "Report ready!", reportHtml: html, filename, complete: true });
      } catch (e: any) {
        send({ error: e.message || "Simulation crashed", complete: true });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
