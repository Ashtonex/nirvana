import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const ownerToken = cookieStore.get("nirvana_owner")?.value;
    
    if (!ownerToken) {
      const staffToken = cookieStore.get("nirvana_staff")?.value;
      if (!staffToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { data: shops } = await supabaseAdmin
      .from("shops")
      .select("id, name")
      .order("name");

    if (!shops || shops.length === 0) {
      return NextResponse.json({ shopStatuses: [] });
    }

    const today = new Date().toISOString().split("T")[0];
    const statuses = await Promise.all(
      shops.map(async (shop: { id: string; name: string }) => {
        try {
          const { data: auditLogs } = await supabaseAdmin
            .from("pos_audit_logs")
            .select("id, status, variance")
            .eq("shop_id", shop.id)
            .gte("created_at", `${today}T00:00:00`)
            .order("created_at", { ascending: false })
            .limit(5);

          const { data: sales } = await supabaseAdmin
            .from("sales")
            .select("id, total")
            .eq("shop_id", shop.id)
            .gte("created_at", `${today}T00:00:00`);

          const { data: expenses } = await supabaseAdmin
            .from("pos_expenses")
            .select("id, amount")
            .eq("shop_id", shop.id)
            .gte("created_at", `${today}T00:00:00`);

          const failedAudits = (auditLogs || []).filter(
            (log: any) => log.status === "failed"
          );
          const highVariance = (auditLogs || []).filter(
            (log: any) => Math.abs(Number(log.variance || 0)) > 5
          );

          const issues: string[] = [];
          if (failedAudits.length > 0) {
            issues.push(`${failedAudits.length} failed audit(s)`);
          }
          if (highVariance.length > 0) {
            issues.push(`${highVariance.length} high variance(s)`);
          }

          const todayRevenue = (sales || []).reduce(
            (sum: number, s: any) => sum + Number(s.total || 0),
            0
          );
          const todayExpenses = (expenses || []).reduce(
            (sum: number, e: any) => sum + Math.abs(Number(e.amount || 0)),
            0
          );

          return {
            id: shop.id,
            name: shop.name,
            status:
              failedAudits.length > 0
                ? "ALERT"
                : issues.length > 0
                ? "WARNING"
                : "CLEAR",
            issues,
            todayRevenue,
            todayExpenses,
            todaySalesCount: (sales || []).length,
            todayExpensesCount: (expenses || []).length,
            lastAuditAt: auditLogs?.[0]?.created_at || null,
          };
        } catch (e) {
          return {
            id: shop.id,
            name: shop.name,
            status: "ERROR",
            issues: ["Failed to fetch shop data"],
            todayRevenue: 0,
            todayExpenses: 0,
            todaySalesCount: 0,
            todayExpensesCount: 0,
            lastAuditAt: null,
          };
        }
      })
    );

    return NextResponse.json({ shopStatuses: statuses });
  } catch (e) {
    console.error("Realtime audit error:", e);
    return NextResponse.json(
      { error: "Failed to fetch realtime audit" },
      { status: 500 }
    );
  }
}
