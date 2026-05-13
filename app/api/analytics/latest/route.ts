import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { ANALYTICS_KINDS, getLatestAnalyticsResults } from "@/lib/analytics-results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const kinds = kind ? [kind] : ANALYTICS_KINDS;
  const results = await getLatestAnalyticsResults(kinds);

  return NextResponse.json({
    success: true,
    results,
  });
}
