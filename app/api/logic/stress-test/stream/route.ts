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
  tags: string[];
  correlated?: string[];
}

const RISK_EVENTS: RiskEvent[] = [
  {
    id: "zwg_devaluation",
    label: "ZWG Devaluation",
    type: "overhead",
    probability: 0.35,
    revImpact: [0, 0],
    ohImpact: [0.20, 0.80],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 45,
    durationDays: [60, 180],
    description: "Reserve Bank devalues ZWG against USD. All import-linked costs rise instantly — perfumes sourced from Dubai/SA/China become dramatically more expensive.",
    color: "#ef4444",
    tags: ["currency", "imports", "cost-of-goods"],
    correlated: ["customs_duty_hike", "fuel_price_spike"],
  },
  {
    id: "fuel_price_spike",
    label: "Fuel Price Surge",
    type: "overhead",
    probability: 0.40,
    revImpact: [-0.15, 0],
    ohImpact: [0.25, 0.70],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 30,
    durationDays: [30, 120],
    description: "Fuel prices surge due to ZERA adjustments, Beira pipeline disruptions, or USD shortage. Affects logistics (FAW deliveries), power backup (generator diesel), and consumer transport to store.",
    color: "#f97316",
    tags: ["fuel", "logistics", "utility"],
    correlated: ["zesa_power_cut", "faw_breakdown"],
  },
  {
    id: "zesa_power_cut",
    label: "ZESA Load Shedding",
    type: "overhead",
    probability: 0.55,
    revImpact: [-0.20, -0.05],
    ohImpact: [0.10, 0.35],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 15,
    durationDays: [14, 60],
    description: "Daily power cuts averaging 6-18 hours. Generator running costs spike. Security systems strain. Customers may not visit. Refrigeration for perishives fails.",
    color: "#eab308",
    tags: ["power", "overhead", "customer-traffic"],
    correlated: ["fuel_price_spike", "staff_crisis"],
  },
  {
    id: "customs_duty_hike",
    label: "Customs Duty Increase",
    type: "overhead",
    probability: 0.25,
    revImpact: [0, 0],
    ohImpact: [0.15, 0.50],
    oneTimePct: [0.05, 0.20],
    dayMin: 20, dayMax: 90,
    durationDays: [30, 180],
    description: "ZIMRA raises import duties on perfumes/cosmetics (typically 40-60%+ duty). Stock already in pipeline taxed retroactively. Profit margins compress overnight.",
    color: "#dc2626",
    tags: ["imports", "regulatory", "cost-of-goods"],
    correlated: ["zwg_devaluation", "si_regulation"],
  },
  {
    id: "inflation_surge",
    label: "Hyperinflation Spike",
    type: "mixed",
    probability: 0.20,
    revImpact: [-0.10, 0.20],
    ohImpact: [0.30, 0.90],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 30,
    durationDays: [30, 90],
    description: "Monthly inflation surges 15-80%. Revenue may appear higher in ZWG but real USD value erodes. Overhead quoted in ZWG rises faster than sales. Nominal revenue up, real margins crushed.",
    color: "#f59e0b",
    tags: ["currency", "inflation", "margin"],
    correlated: ["zwg_devaluation", "bank_instability"],
  },
  {
    id: "bank_instability",
    label: "Bank / FinTech Crisis",
    type: "one_time",
    probability: 0.22,
    revImpact: [-0.25, -0.05],
    ohImpact: [0, 0],
    oneTimePct: [0.10, 0.35],
    dayMin: 5, dayMax: 30,
    durationDays: [14, 90],
    description: "Ecocash/OneMoney outage, bank account freeze, or ATM cash shortage. Customers cannot pay digitally. One-time cash scramble to meet obligations. May last days to weeks.",
    color: "#7c3aed",
    tags: ["payments", "banking", "one-time"],
    correlated: ["inflation_surge", "regulatory_shock"],
  },
  {
    id: "port_congestion",
    label: "Port Congestion (Beira/Durban)",
    type: "overhead",
    probability: 0.30,
    revImpact: [0, 0],
    ohImpact: [0.10, 0.30],
    oneTimePct: [0.03, 0.15],
    dayMin: 30, dayMax: 120,
    durationDays: [45, 180],
    description: "Beira or Durban port congestion delays stock arrival by 2-6 months. Storage fees accumulate at port. Working capital tied up. May need emergency air freight at 5x cost.",
    color: "#06b6d4",
    tags: ["supply-chain", "logistics", "working-capital"],
    correlated: ["customs_duty_hike", "fuel_price_spike"],
  },
  {
    id: "tourism_slump",
    label: "Tourism Slump",
    type: "revenue",
    probability: 0.25,
    revImpact: [-0.30, -0.10],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 30, dayMax: 90,
    durationDays: [30, 120],
    description: "Tourism slowdown — Kariba water levels, Victoria Falls flooding, or international travel advisory. Premium perfume sales (souvenir/perfume market) drop significantly.",
    color: "#0ea5e9",
    tags: ["revenue", "seasonal", "tourism"],
  },
  {
    id: "tourism_surge",
    label: "Tourism Surge",
    type: "revenue",
    probability: 0.20,
    revImpact: [0.30, 0.90],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 60, dayMax: 120,
    durationDays: [30, 90],
    description: "Tourism boom — dollarised visitors flood Mutare. Perfume sales surge. Peak season demand exceeds supply. Stock management becomes critical.",
    color: "#10b981",
    tags: ["revenue", "seasonal", "tourism"],
  },
  {
    id: "informal_competition",
    label: "Informal Trader Surge",
    type: "revenue",
    probability: 0.35,
    revImpact: [-0.35, -0.08],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 30,
    durationDays: [21, 120],
    description: "Street vendors and informal traders undercut prices by 15-40%. Formal business loses price-sensitive customers. Regulatory inaction on informal markets intensifies pressure.",
    color: "#a855f7",
    tags: ["competition", "revenue", "margin"],
  },
  {
    id: "faw_breakdown",
    label: "FAW Logistics Disruption",
    type: "mixed",
    probability: 0.28,
    revImpact: [-0.15, -0.03],
    ohImpact: [0.05, 0.20],
    oneTimePct: [0.02, 0.10],
    dayMin: 5, dayMax: 45,
    durationDays: [7, 60],
    description: "FAW delivery vehicles break down or fuel shortage prevents deliveries. Rural Mutare customers cannot be reached. Stock sits at warehouse. Emergency transport costs spike.",
    color: "#f43f5e",
    tags: ["logistics", "fuel", "rural"],
    correlated: ["fuel_price_spike", "port_congestion"],
  },
  {
    id: "drought_consumer_squeeze",
    label: "Drought / El Niño",
    type: "revenue",
    probability: 0.22,
    revImpact: [-0.40, -0.15],
    ohImpact: [0.10, 0.30],
    oneTimePct: [0, 0],
    dayMin: 30, dayMax: 90,
    durationDays: [60, 180],
    description: "El Niño drought devastates rural agriculture. Consumer disposable income collapses in Mutare's hinterland. Non-essential purchases (perfumes) plummet. Food takes priority.",
    color: "#84cc16",
    tags: ["agriculture", "revenue", "rural"],
    correlated: ["inflation_surge", "informal_competition"],
  },
  {
    id: "staff_crisis",
    label: "Staff / Labour Crisis",
    type: "overhead",
    probability: 0.25,
    revImpact: [0, 0],
    ohImpact: [0.20, 0.60],
    oneTimePct: [0.02, 0.08],
    dayMin: 7, dayMax: 60,
    durationDays: [14, 90],
    description: "Mass resignations, sick leave wave, or labour dispute. Emergency hiring at 2-3x rates. NSSA/NEC compliance costs spike. Temporary staff quality impacts customer experience.",
    color: "#ec4899",
    tags: ["staff", "overhead", "one-time"],
  },
  {
    id: "rent_municpal_hike",
    label: "Rent / Municipal Rate Hike",
    type: "overhead",
    probability: 0.30,
    revImpact: [0, 0],
    ohImpact: [0.15, 0.45],
    oneTimePct: [0, 0],
    dayMin: 1, dayMax: 60,
    durationDays: [30, 180],
    description: "Mutare Municipality hikes commercial rates, landlord demands ZWG-indexed rent increase, or BMC lease renegotiation. Fixed overhead commitment rises significantly.",
    color: "#8b5cf6",
    tags: ["overhead", "property", "municipal"],
  },
  {
    id: "counterfeit_influx",
    label: "Counterfeit Product Surge",
    type: "revenue",
    probability: 0.30,
    revImpact: [-0.25, -0.05],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 15, dayMax: 60,
    durationDays: [30, 120],
    description: "Fake perfumes flood the Mutare market. Customers cannot distinguish. Reputation risk for genuine products. Price undercutting from counterfeits destroys margin.",
    color: "#64748b",
    tags: ["competition", "revenue", "reputation"],
  },
  {
    id: "online_disruption",
    label: "Online / Mobile Commerce Shift",
    type: "revenue",
    probability: 0.25,
    revImpact: [-0.20, -0.05],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 30, dayMax: 90,
    durationDays: [30, 180],
    description: "WhatsApp-based sellers and online marketplaces capture price-sensitive customers. Shop footfall drops. Digital adoption accelerates faster than expected.",
    color: "#14b8a6",
    tags: ["technology", "revenue", "competition"],
  },
  {
    id: "si_regulation",
    label: "Statutory Instrument / Policy Change",
    type: "one_time",
    probability: 0.18,
    revImpact: [-0.15, 0.05],
    ohImpact: [0.05, 0.30],
    oneTimePct: [0.05, 0.25],
    dayMin: 15, dayMax: 90,
    durationDays: [1, 1],
    description: "Government introduces new Statutory Instrument — price controls, import restrictions, mandatory USD pricing, or forex surrender requirements. Sudden regulatory shift overnight.",
    color: "#b91c1c",
    tags: ["regulatory", "policy", "one-time"],
    correlated: ["customs_duty_hike", "zwg_devaluation"],
  },
  {
    id: "wholesale_shortage",
    label: "Wholesale Stock Shortage",
    type: "overhead",
    probability: 0.30,
    revImpact: [0, 0],
    ohImpact: [0.20, 0.50],
    oneTimePct: [0, 0],
    dayMin: 10, dayMax: 60,
    durationDays: [21, 90],
    description: "Harare/Durban wholesaler runs out of key stock lines. Must source from alternate distributors at premium. Parfums de Marley or similar lines unavailable. Stock diversity suffers.",
    color: "#a16207",
    tags: ["supply-chain", "cost-of-goods", "overhead"],
    correlated: ["port_congestion", "faw_breakdown"],
  },
  {
    id: "harare_competition",
    label: "Harare Chain Expansion",
    type: "revenue",
    probability: 0.20,
    revImpact: [-0.30, -0.08],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 30, dayMax: 120,
    durationDays: [45, 180],
    description: "National chain opens in Mutare or expands existing footprint. Wholesale prices undercut. Brand loyalty tested. Marketing spend must increase to defend market share.",
    color: "#0d9488",
    tags: ["competition", "revenue", "marketing"],
    correlated: ["informal_competition", "counterfeit_influx"],
  },
  {
    id: "usd_shortage",
    label: "USD Liquidity Crunch",
    type: "mixed",
    probability: 0.28,
    revImpact: [-0.15, 0.10],
    ohImpact: [0.10, 0.40],
    oneTimePct: [0.03, 0.15],
    dayMin: 1, dayMax: 30,
    durationDays: [21, 90],
    description: "USD becomes scarce on the parallel market. Suppliers demand USD upfront. Customer USD availability drops. Business must source USD at premium rates. Dual pricing becomes chaotic.",
    color: "#c2410c",
    tags: ["currency", "usd", "liquidity", "mixed"],
    correlated: ["zwg_devaluation", "bank_instability"],
  },
  {
    id: "seasonal_boom",
    label: "Christmas / Seasonal Boom",
    type: "revenue",
    probability: 0.35,
    revImpact: [0.50, 1.20],
    ohImpact: [0, 0],
    oneTimePct: [0, 0],
    dayMin: 60, dayMax: 90,
    durationDays: [30, 60],
    description: "December festive season surge. Diaspora inflows. School fees paid. Christmas bonuses fuel spending. Perfume sales 50-120% above average. Best cash generation period of the year.",
    color: "#16a34a",
    tags: ["seasonal", "revenue", "boom"],
  },
];

type ScenarioMode = "base" | "zwg_crisis" | "fuel_power" | "black_swan_2" | "black_swan_3" | "full_monte";

const SCENARIOS: Record<ScenarioMode, { label: string; description: string; events: string[] }> = {
  base: {
    label: "Normal Operations",
    description: "No shocks. Pure Mutare baseline — revenue from local + tourism, overhead in ZWG, stock from SA/Dubai/China.",
    events: [],
  },
  zwg_crisis: {
    label: "ZWG / USD Crisis",
    description: "Full 2019/2020-style currency crisis. ZWG devalues 40-80%, inflation surges, customs duties spike. All import-linked costs explode overnight.",
    events: ["zwg_devaluation", "inflation_surge", "customs_duty_hike", "usd_shortage"],
  },
  fuel_power: {
    label: "Fuel & Power Crisis",
    description: "Combined fuel + ZESA load-shedding shock. Deliveries halted, generator costs spike, foot traffic drops. Mutare worst-case infrastructure scenario.",
    events: ["fuel_price_spike", "zesa_power_cut", "faw_breakdown"],
  },
  black_swan_2: {
    label: "Black Swan (2 Events)",
    description: "Any two Mutare shocks fire simultaneously — e.g. port congestion + customs duty hike. Tests dual infrastructure/financial resilience.",
    events: ["*2"],
  },
  black_swan_3: {
    label: "Black Swan (3 Events)",
    description: "Three correlated shocks fire together — e.g. ZWG devaluation + customs duty + USD shortage. Worst-case multi-factor survival.",
    events: ["*3"],
  },
  full_monte: {
    label: "Full Monte — Mutare",
    description: "All 21 risk events fire with independent probability. Every path is unique. Most realistic test for Mutare's multi-currency, import-dependent economy.",
    events: ["*all"],
  },
};

const SCENARIO_MODE_LABELS: Record<string, string> = {
  "Normal Operations": "base",
  "ZWG / USD Crisis": "zwg_crisis",
  "Fuel & Power Crisis": "fuel_power",
  "Black Swan (2 Events)": "black_swan_2",
  "Black Swan (3 Events)": "black_swan_3",
  "Full Monte Carlo": "full_monte",
  "Full Monte — Mutare": "full_monte",
};

const SCENARIO_DISPLAY_NAMES: Record<string, string> = {
  base: "Normal Operations",
  zwg_crisis: "ZWG / USD Crisis",
  fuel_power: "Fuel & Power Crisis",
  black_swan_2: "Black Swan (2 Events)",
  black_swan_3: "Black Swan (3 Events)",
  full_monte: "Full Monte — Mutare",
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
      } else if (mode === "zwg_crisis") {
        fires = ["zwg_devaluation", "inflation_surge", "customs_duty_hike", "usd_shortage"].includes(event.id);
      } else if (mode === "fuel_power") {
        fires = ["fuel_price_spike", "zesa_power_cut", "faw_breakdown"].includes(event.id);
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
    oracleAdvice = "EXCEPTIONAL RESILIENCE (Mutare): 90%+ survival across all ZWG/Mutare conditions tested. Your import hedge, ZWG cash buffers, and overhead ratios are strong. Maintain USD stash for customs duty surges. Continue building 90-day ZWG operating reserve to handle ZESA/generator costs.";
  } else if (survivalRate >= 75) {
    oracleAdvice = "SOLID MUTARE POSITION: Survives most combined shocks. PRIORITY ACTIONS: (1) Keep 60-day ZWG operating reserve, (2) Maintain at least 1 container's worth of USD stock buffer, (3) Diversify sourcing (SA + Dubai + China) to reduce port risk, (4) Monitor ZERA/ZESA announcements for early warning.";
  } else if (survivalRate >= 50) {
    oracleAdvice = "MODERATE MUTARE RISK: 50-75% survival under combined ZWG/fuel/power shocks. URGENT: (1) Reduce ZWG-denominated overhead where possible — lock USD rents if you can, (2) Build USD reserve for customs duty emergencies, (3) Renegotiate supplier payment terms for Net-30, (4) Reduce working capital tied in slow-moving stock, (5) Identify emergency USD credit lines NOW before crisis hits.";
  } else if (survivalRate >= 25) {
    oracleAdvice = "HIGH RISK — MUTARE: Less than 50% survival under realistic Mutare conditions. IMMEDIATE ACTIONS: (1) Cut all discretionary ZWG overhead immediately, (2) Shift to cash-and-carry supplier model to reduce customs exposure, (3) Launch diaspora/whatsapp sales channel to diversify revenue, (4) Explore listing on Victoria Falls Stock Exchange for capital raise, (5) Engage business advisor NOW.";
  } else {
    oracleAdvice = "CRITICAL — MUTARE BUSINESS FRAGILITY: Business is unlikely to survive a realistic ZWG devaluation + fuel crisis scenario without structural changes. Engage financial restructuring advisors immediately. Consider: (1) Reducing import dependency — increase SA-sourced goods (Beira route faster), (2) Shifting pricing to 100% USD where possible, (3) Consolidating to single location to cut overhead, (4) Exploring JV with established distributor, (5) Investigating government SME support schemes. Business model pivoting may be required.";
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
