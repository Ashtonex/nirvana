import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { runOracleValidation } from "@/lib/oracleValidation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePrivilegedActor();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId") || undefined;

    const result = await runOracleValidation(shopId);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("Oracle validation error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
