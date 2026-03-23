import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsComputedBalance } from "@/lib/operations";
import { requirePrivilegedActor } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

function safeFloat(v: any, def = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : def;
}

function generateReportHtml(scenario: string, summary: Record<string, any>): string {
  const now = new Date().toISOString();
  const rows = summary.paths.slice(0, 10).map((p: any, i: number) => {
    const outcome = p.cash >= 0 ? "SURVIVED" : "INSOLVENT";
    const color = p.cash >= 0 ? "#10b981" : "#ef4444";
    return `<tr><td>SIM_${String(i).padStart(3, "0")}</td><td>${scenario}</td><td style="color:${color};">$${p.cash.toFixed(2)}</td><td style="color:${color};">${outcome}</td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nirvana Stress Test: ${scenario}</title>
<style>
body{font-family:'Inter',system-ui,sans-serif;background:#020617;color:#f8fafc;padding:40px;line-height:1.6;}
.container{max-width:900px;margin:0 auto;}
header{border-bottom:2px solid #8b5cf6;padding-bottom:20px;margin-bottom:40px;}
.badge{background:#8b5cf620;color:#a78bfa;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:800;text-transform:uppercase;border:1px solid #8b5cf640;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:40px;}
.card{background:#0f172a;border:1px solid #1e293b;padding:20px;border-radius:12px;}
.card h3{font-size:10px;color:#64748b;text-transform:uppercase;margin:0 0 10px 0;}
.card p{font-size:24px;font-weight:900;margin:0;color:#e2e8f0;}
.trend-up{color:#10b981;}
.trend-down{color:#ef4444;}
section{margin-bottom:40px;}
h2{font-size:18px;text-transform:uppercase;letter-spacing:0.1em;color:#8b5cf6;border-left:4px solid #8b5cf6;padding-left:15px;}
table{width:100%;border-collapse:collapse;margin-top:20px;}
th{text-align:left;padding:12px;background:#1e293b;font-size:12px;text-transform:uppercase;color:#94a3b8;}
td{padding:12px;border-bottom:1px solid #1e293b;font-size:14px;color:#cbd5e1;}
.footer{text-align:center;font-size:10px;color:#475569;margin-top:80px;}
</style>
</head>
<body>
<div class="container">
<header>
<div class="badge">Nirvana Intelligence v4.0 Simulation</div>
<h1 style="font-size:32px;font-weight:900;margin:10px 0;">STRESS TEST: ${scenario}</h1>
<p style="color:#64748b;">Generated on ${now}</p>
</header>

<section class="grid">
<div class="card"><h3>Survival Probability</h3><p class="trend-up">${summary.survivalRate}%</p></div>
<div class="card"><h3>Peak Drawdown</h3><p class="trend-down">-$${Math.abs(summary.peakDrawdown).toFixed(2)}</p></div>
<div class="card"><h3>Final Avg Liquidity</h3><p>$${summary.avgFinalCash.toFixed(2)}</p></div>
<div class="card"><h3>Days to Insolvency</h3><p style="color:#f59e0b;">${summary.worstCaseDay}</p></div>
<div class="card"><h3>Paths Simulated</h3><p>${summary.totalPaths.toLocaleString()}</p></div>
<div class="card"><h3>Forecast Horizon</h3><p>180 Days</p></div>
</section>

<section>
<h2>Cash Flow Projection</h2>
<table>
<thead><tr><th>Path ID</th><th>Scenario</th><th>Final Cash</th><th>Outcome</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>

<section>
<h2>Oracle Strategy</h2>
<p style="font-style:italic;color:#94a3b8;">${summary.oracleAdvice}</p>
</section>

<div class="footer">NIRVANA OS · LOGIC SIMULATION CORE [MONTE_CARLO]</div>
</div>
</body>
</html>`;
}

async function runMonteCarlo(params: {
  scenario: string;
  cashBalance: number;
  sales: any[];
  ledger: any[];
}) {
  const { scenario, cashBalance, sales, ledger } = params;
  const TOTAL_PATHS = 1000;
  const FORECAST_DAYS = 180;

  const monthlyOverhead = ledger
    .filter((l: any) => l.category === "Overhead" && safeFloat(l.amount) < 0)
    .reduce((s: number, l: any) => s + Math.abs(safeFloat(l.amount)), 0);

  const effectiveOverhead = monthlyOverhead > 0 ? monthlyOverhead : 1500;

  const totalRevenue = sales.reduce((s: number, sale: any) => s + safeFloat(sale.total_with_tax), 0);
  const avgDailyRevenue = sales.length > 0 ? totalRevenue / 30 : 200;

  const scenarioConfig: Record<string, { revMin: number; revMax: number; ohMin: number; ohMax: number }> = {
    Recession: { revMin: 0.4, revMax: 0.8, ohMin: 1.0, ohMax: 1.3 },
    Liquidation: { revMin: 1.1, revMax: 1.5, ohMin: 1.0, ohMax: 1.0 },
    Hypergrowth: { revMin: 2.0, revMax: 3.5, ohMin: 1.5, ohMax: 2.0 },
  };

  const cfg = scenarioConfig[scenario] || scenarioConfig.Recession;

  const paths: { cash: number }[] = [];
  let survivalCount = 0;
  let worstCaseDay = FORECAST_DAYS;
  const allCash: number[] = [];

  const REPORT_EVERY = 100;

  for (let i = 0; i < TOTAL_PATHS; i++) {
    let cash = cashBalance;
    let revMult = cfg.revMin + Math.random() * (cfg.revMax - cfg.revMin);
    let ohMult = cfg.ohMin + Math.random() * (cfg.ohMax - cfg.ohMin);
    let insolvent = false;

    for (let day = 1; day <= FORECAST_DAYS; day++) {
      const dailyRev = avgDailyRevenue * revMult * (0.8 + Math.random() * 0.4);
      const dailyOh = (effectiveOverhead / 30) * ohMult;
      cash += dailyRev - dailyOh;

      if (cash < 0) {
        insolvent = true;
        worstCaseDay = Math.min(worstCaseDay, day);
        break;
      }
    }

    if (!insolvent) survivalCount++;
    paths.push({ cash });
    allCash.push(cash);
  }

  const survivalRate = Math.round((survivalCount / TOTAL_PATHS) * 100);
  const peakDrawdown = Math.min(0, ...allCash);
  const avgFinalCash = allCash.reduce((a, b) => a + b, 0) / allCash.length;

  return {
    survivalRate,
    peakDrawdown,
    avgFinalCash,
    worstCaseDay,
    totalPaths: TOTAL_PATHS,
    paths,
    oracleAdvice: survivalRate > 80
      ? "FINANCIAL HEALTH: Sufficient. Maintain overhead discipline and monitor cash runway."
      : survivalRate > 50
      ? "CAUTION: Moderate risk detected. Consider reducing fixed overhead and accelerating inventory turnover."
      : "CRITICAL: High insolvency probability. Urgent action required: cut overhead, boost revenue, or raise capital.",
  };
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
        sendProgress(2, "Authenticating request...");
        await new Promise(r => setTimeout(r, 50));

        sendProgress(5, "Fetching inventory from database...");
        const { data: inventory } = await supabaseAdmin
          .from("inventory_items")
          .select("*");

        sendProgress(10, "Fetching sales records...");
        const { data: sales } = await supabaseAdmin
          .from("sales")
          .select("*")
          .order("date", { ascending: false })
          .limit(500);

        sendProgress(15, "Fetching ledger entries...");
        const { data: ledger } = await supabaseAdmin
          .from("ledger_entries")
          .select("*")
          .order("date", { ascending: false })
          .limit(500);

        sendProgress(20, "Calculating cash position...");
        const cashBalance = await getOperationsComputedBalance();

        sendProgress(22, `Loaded ${sales?.length || 0} sales, ${inventory?.length || 0} items, ${ledger?.length || 0} ledger entries. Cash balance: $${(cashBalance || 0).toFixed(2)}`);
        await new Promise(r => setTimeout(r, 100));

        sendProgress(25, `Starting Monte Carlo engine — ${scenario} scenario, 1000 paths...`);

        const summary = await runMonteCarlo({
          scenario,
          cashBalance: cashBalance || 0,
          sales: sales || [],
          ledger: ledger || [],
        });

        sendProgress(90, "Generating HTML report...");

        const html = generateReportHtml(scenario, summary);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `nirvana_stress_test_${scenario.toLowerCase()}_${timestamp}.html`;

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
