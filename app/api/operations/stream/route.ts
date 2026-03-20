import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventName: string, data: any) => {
        const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const fetchUpdates = async () => {
        try {
          const cookieStore = await cookies();
          const ownerToken = cookieStore.get("nirvana_owner")?.value;
          const staffToken = cookieStore.get("nirvana_staff")?.value;
          
          if (!ownerToken && !staffToken) {
            sendEvent("error", { message: "Unauthorized" });
            return;
          }

          const now = new Date();
          const today = now.toISOString().split("T")[0];
          const recentThreshold = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

          const [{ data: ledger }, { data: shops }, { data: staffLogs }, { data: auditLogs }, { data: employees }] = await Promise.all([
            supabaseAdmin
              .from("operations_ledger")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
            supabaseAdmin.from("shops").select("id, name").order("name"),
            supabaseAdmin
              .from("staff_logs")
              .select("*")
              .gte("created_at", recentThreshold)
              .order("created_at", { ascending: false }),
            supabaseAdmin
              .from("pos_audit_logs")
              .select("*")
              .gte("created_at", `${today}T00:00:00`)
              .order("created_at", { ascending: false })
              .limit(50),
            supabaseAdmin.from("employees").select("id, name, shop_id, role").order("name"),
          ]);

          const activeEmployeeIds = new Set(
            (staffLogs || [])
              .filter((log: any) => {
                const logTime = new Date(log.created_at).getTime();
                const isRecent = (now.getTime() - logTime) < 15 * 60 * 1000;
                return (log.action === "login" || log.action === "shift_start") && isRecent;
              })
              .map((log: any) => log.employee_id)
          );

          const onlineEmployees = (employees || []).map((emp: any) => ({
            ...emp,
            isOnline: activeEmployeeIds.has(emp.id),
          }));

          const auditPassed = (auditLogs || []).filter((a: any) => a.status === "passed").length;
          const auditFailed = (auditLogs || []).filter((a: any) => a.status === "failed").length;
          const varianceByShop: Record<string, number> = {};
          (auditLogs || []).forEach((a: any) => {
            if (a.status === "failed") {
              varianceByShop[a.shop_id] = (varianceByShop[a.shop_id] || 0) + Math.abs(Number(a.variance || 0));
            }
          });

          sendEvent("update", {
            timestamp: now.toISOString(),
            ledger: ledger || [],
            shops: shops || [],
            staffLogs: staffLogs || [],
            auditLogs: auditLogs || [],
            employees: onlineEmployees,
            stats: {
              auditPassed,
              auditFailed,
              varianceByShop,
              activeShops: new Set((staffLogs || []).map((l: any) => l.shop_id)).size,
            },
          });
        } catch (e) {
          console.error("SSE update error:", e);
          sendEvent("error", { message: "Failed to fetch updates" });
        }
      };

      fetchUpdates();

      const interval = setInterval(fetchUpdates, 8000);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch (e) {
          clearInterval(interval);
          clearInterval(keepAlive);
        }
      }, 30000);

      return () => {
        clearInterval(interval);
        clearInterval(keepAlive);
      };
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
