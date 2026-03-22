import { NextRequest, NextResponse } from "next/server";
import { computePosAuditReport } from "@/lib/posAudit";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shopId } = body;

    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    // Use current date for the audit
    const today = format(new Date(), "yyyy-MM-dd");

    const report = await computePosAuditReport({
      shopId,
      dateYYYYMMDD: today,
    });

    return NextResponse.json({
      shopId: report.shopId,
      date: report.date,
      variance: report.variance.amount,
      sales: report.totals.salesWithTax,
      expenses: report.totals.posExpenses,
      tax: report.totals.tax,
      flags: report.flags,
    });
  } catch (error: any) {
    console.error("Audit run error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
