import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const bridgeUrl = `${baseUrl}/api/py/analytics/run?kind=all`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const bypass = req.headers.get("x-vercel-protection-bypass");
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  const res = await fetch(bridgeUrl, { method: "POST", headers });
  const body = await res.json().catch(async () => ({ error: await res.text().catch(() => "Unknown error") }));

  return NextResponse.json(
    {
      success: res.ok && body?.success !== false,
      generatedAt: new Date().toISOString(),
      results: body?.results || [],
      error: body?.error,
    },
    { status: res.ok ? 200 : 502 }
  );
}
