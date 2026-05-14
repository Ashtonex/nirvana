import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import type { AnalyticsKind } from "@/lib/analytics-results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOBS: Record<AnalyticsKind, any> = {
  demand_forecast: {},
  expense_anomaly: {},
  inventory_velocity: {},
  capital_allocation: {},
};

async function runJob(kind: AnalyticsKind, baseUrl: string, incomingHeaders: Headers) {
  try {
    const bridgeUrl = `${baseUrl}/api/py/analytics/run?kind=${kind}`;
    
    // Forward the cookie to bypass Vercel Deployment Protection on previews
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    const cookie = incomingHeaders.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    
    // Also forward Vercel protection bypass header if present
    const bypass = incomingHeaders.get("x-vercel-protection-bypass");
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;

    const res = await fetch(bridgeUrl, { 
      method: "POST",
      headers
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      // If it's still 401, provide a cleaner error
      if (res.status === 401) {
        throw new Error("Authentication failed at Python bridge. If on Vercel, ensure Deployment Protection allows internal API calls or pass a bypass token.");
      }
      throw new Error(`Python bridge failed (${res.status}): ${errorText.slice(0, 200)}...`);
    }

    const data = await res.json();
    // The Python bridge returns { success, results: [{ kind, ok, summary, payload, error }] }
    const result = data.results?.find((r: any) => r.kind === kind) || { ok: false, error: "No result for kind" };

    return {
      kind,
      ok: result.ok,
      summary: result.summary || "Snapshot generated",
      error: result.error,
      payload: result.payload,
    };
  } catch (error: any) {
    return {
      kind,
      ok: false,
      error: error?.message || String(error),
    };
  }
}

export async function POST(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const body = await req.json().catch(() => ({}));
  const requested = String(body?.kind || "all");
  const kinds: AnalyticsKind[] =
    requested === "all"
      ? (Object.keys(JOBS) as AnalyticsKind[])
      : requested in JOBS
        ? [requested as AnalyticsKind]
        : [];

  if (kinds.length === 0) {
    return NextResponse.json({ error: "Invalid analytics kind" }, { status: 400 });
  }

  const results = [];
  for (const kind of kinds) {
    results.push(await runJob(kind, baseUrl, req.headers));
  }

  return NextResponse.json({
    success: results.every((result) => result.ok),
    results,
  });
}
