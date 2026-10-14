import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Unauthenticated, no DB access — exists purely so clients can verify they
// can actually reach the server, since navigator.onLine only reflects the
// local network interface's link state, not real connectivity.
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
