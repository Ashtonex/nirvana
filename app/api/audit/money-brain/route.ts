import { NextResponse } from "next/server";
import { runMoneyAudit } from "@/lib/money-audit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get("daysBack") || "30", 10);

    const result = await runMoneyAudit(daysBack);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('[Money Audit API] Error:', error);
    return NextResponse.json({ error: error.message || "Audit failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST to run audit" }, { status: 405 });
}
