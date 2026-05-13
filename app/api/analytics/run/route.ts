import { NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import type { AnalyticsKind } from "@/lib/analytics-results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const JOBS: Record<AnalyticsKind, { module: string; summary: (payload: any) => string }> = {
  demand_forecast: {
    module: "analytics.nirvana_analytics.demand_forecast",
    summary: (payload) => `${payload?.forecasts?.length || 0} shop forecasts generated`,
  },
  expense_anomaly: {
    module: "analytics.nirvana_analytics.expense_anomaly",
    summary: (payload) => `${payload?.anomalies?.length || 0} expense anomalies flagged`,
  },
  inventory_velocity: {
    module: "analytics.nirvana_analytics.inventory_velocity",
    summary: (payload) => `${payload?.priority_items?.length || 0} priority inventory items identified`,
  },
  capital_allocation: {
    module: "analytics.nirvana_analytics.capital_allocation",
    summary: (payload) => `$${Number(payload?.total_capital || 0).toFixed(2)} capital optimized`,
  },
};

function getPythonPath() {
  const winPath = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
  return process.platform === "win32" ? winPath : path.join(process.cwd(), ".venv", "bin", "python");
}

function parseJsonOutput(stdout: string) {
  const trimmed = stdout.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Analytics script did not return JSON.");
  }
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

async function saveSnapshot(kind: AnalyticsKind, payload: any, summary: string) {
  const { data, error } = await supabaseAdmin
    .from("analytics_results")
    .insert({
      kind,
      status: payload?.status === "success" ? "success" : "warning",
      generated_at: payload?.generated_at || new Date().toISOString(),
      summary,
      payload,
    })
    .select("id, kind, status, generated_at, summary")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not save analytics snapshot. Apply analytics_results migration first. ${error.message}`);
  }
  return data;
}

async function runJob(kind: AnalyticsKind) {
  const job = JOBS[kind];
  const pythonPath = getPythonPath();

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonPath,
      ["-m", job.module],
      {
        cwd: process.cwd(),
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 8,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: "1",
          MPLCONFIGDIR: path.join(process.cwd(), ".mplconfig"),
        },
      }
    );

    const payload = parseJsonOutput(stdout);
    const summary = job.summary(payload);
    const saved = await saveSnapshot(kind, payload, summary);

    return {
      kind,
      ok: true,
      summary,
      saved,
      warning: stderr?.trim() || null,
      payload,
    };
  } catch (error: any) {
    return {
      kind,
      ok: false,
      error: error?.message || String(error),
      stderr: error?.stderr || null,
      stdout: error?.stdout || null,
    };
  }
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requested = String(body?.kind || "all");
  const kinds: AnalyticsKind[] =
    requested === "all"
      ? Object.keys(JOBS) as AnalyticsKind[]
      : requested in JOBS
        ? [requested as AnalyticsKind]
        : [];

  if (kinds.length === 0) {
    return NextResponse.json({ error: "Invalid analytics kind" }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const results = [];
  for (const kind of kinds) {
    results.push(await runJob(kind));
  }

  return NextResponse.json({
    success: results.every((result) => result.ok),
    startedAt,
    finishedAt: new Date().toISOString(),
    results,
  });
}
