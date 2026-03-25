import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let isClosed = false;

  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;

  if (!staffToken && !ownerToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let lastSaleId: string | null = null;
      let lastLedgerId: string | null = null;
      let lastStaffLogId: string | null = null;
      let lastChatMessageId: string | null = null;

      const sendEvent = (data: object) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            isClosed = true;
          }
        }
      };

      const fetchNewEvents = async () => {
        try {
          const events: any[] = [];

          const { data: latestSale } = await supabaseAdmin
            .from("sales")
            .select("id, shop_id, item_name, total_with_tax, date, payment_method")
            .order("date", { ascending: false })
            .limit(1)
            .single();

          if (latestSale && latestSale.id !== lastSaleId) {
            lastSaleId = latestSale.id;
            events.push({
              type: "sale",
              id: latestSale.id,
              title: "New Sale",
              message: `${latestSale.item_name} sold`,
              amount: Number(latestSale.total_with_tax || 0),
              shop: latestSale.shop_id,
              timestamp: latestSale.date,
            });
          }

          const { data: latestLedger } = await supabaseAdmin
            .from("operations_ledger")
            .select("id, kind, amount, title, shop_id, created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestLedger && latestLedger.id !== lastLedgerId) {
            lastLedgerId = latestLedger.id;
            const isDeposit = Number(latestLedger.amount) >= 0;
            events.push({
              type: isDeposit ? "deposit" : "expense",
              id: latestLedger.id,
              title: isDeposit ? "Deposit Received" : "Expense Recorded",
              message: latestLedger.title || latestLedger.kind,
              amount: Number(latestLedger.amount || 0),
              shop: latestLedger.shop_id,
              timestamp: latestLedger.created_at,
            });
          }

          const { data: latestStaffLog } = await supabaseAdmin
            .from("staff_logs")
            .select("id, employee_name, shop_id, action, created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestStaffLog && latestStaffLog.id !== lastStaffLogId) {
            lastStaffLogId = latestStaffLog.id;
            events.push({
              type: latestStaffLog.action === "logout" ? "staff_logout" : "staff_login",
              id: latestStaffLog.id,
              title: latestStaffLog.action === "logout" ? "Staff Logged Out" : "Staff Logged In",
              message: `${latestStaffLog.employee_name} ${latestStaffLog.action === "logout" ? "ended" : "started"} shift`,
              shop: latestStaffLog.shop_id,
              timestamp: latestStaffLog.created_at,
            });
          }

          // Check for new chat messages
          const { data: latestChatMessage } = await supabaseAdmin
            .from("chat_messages")
            .select("id, content, message, sender_id, created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestChatMessage && latestChatMessage.id !== lastChatMessageId) {
            lastChatMessageId = latestChatMessage.id;
            events.push({
              type: "chat",
              id: latestChatMessage.id,
              title: "New Message",
              message: latestChatMessage.message || latestChatMessage.content || "New chat message",
              sender: latestChatMessage.sender_id,
              timestamp: latestChatMessage.created_at,
            });
          }

          if (events.length > 0) {
            events.forEach(event => sendEvent(event));
          }

          sendEvent({
            type: "heartbeat",
            timestamp: new Date().toISOString(),
          });

        } catch (e) {
          console.error("[NOTIFICATIONS] Fetch error:", e);
        }
      };

      await fetchNewEvents();

      const interval = setInterval(async () => {
        if (isClosed) {
          clearInterval(interval);
          return;
        }
        await fetchNewEvents();
      }, 8000);

      req.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
