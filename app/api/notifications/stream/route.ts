import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cookies } from "next/headers";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Actor = {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
  shop_id?: string;
};

async function getActor(): Promise<Actor | null> {
  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;

  if (!staffToken && !ownerToken) {
    return null;
  }

  // Owner - sees all notifications
  if (ownerToken) {
    return { id: "owner", name: "Owner", role: "owner" };
  }

  // Staff - get role and shop
  if (staffToken) {
    const tokenHash = createHash("sha256").update(staffToken).digest("hex");
    const { data: session } = await supabaseAdmin
      .from("staff_sessions")
      .select("employee_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!session) return null;
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

    const { data: staff } = await supabaseAdmin
      .from("employees")
      .select("id,name,surname,shop_id,role")
      .eq("id", session.employee_id)
      .maybeSingle();

    if (!staff) return null;

    const name = `${staff.name} ${staff.surname || ""}`.trim();
    const role = (staff.role as string)?.toLowerCase() === "manager" ? "manager" : "staff";
    
    return { id: staff.id, name, role, shop_id: staff.shop_id };
  }

  return null;
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let isClosed = false;

  const actor = await getActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only owner and manager get real-time notifications
  if (actor.role === "staff") {
    return NextResponse.json({ error: "Not authorized for notifications" }, { status: 403 });
  }

  // Max connection time: 4 minutes (to avoid Vercel 5min timeout)
  const MAX_CONNECTION_MS = 4 * 60 * 1000;
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let lastSaleId: string | null = null;
      let lastLedgerId: string | null = null;
      let lastStaffLogId: string | null = null;
      let lastChatMessageId: string | null = null;
      let lastStockRequestId: string | null = null;

      const close = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {}
        }
      };

      const sendEvent = (data: object) => {
        if (!isClosed) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            close();
          }
        }
      };

      const fetchNewEvents = async () => {
        // Check connection time limit
        if (Date.now() - startTime > MAX_CONNECTION_MS) {
          sendEvent({ type: "close", message: "Connection expired" });
          close();
          return;
        }

        if (isClosed) return;

        try {
          const events: any[] = [];

          // Get latest sale
          const { data: latestSale } = await supabaseAdmin
            .from("sales")
            .select("id, shop_id, item_name, total_with_tax, date, payment_method")
            .order("date", { ascending: false })
            .limit(1)
            .single();

          if (latestSale && latestSale.id !== lastSaleId) {
            lastSaleId = latestSale.id;
            // Owner sees all, manager sees only their shop
            if (actor.role === "owner" || latestSale.shop_id === actor.shop_id) {
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
          }

          // Get latest ledger entry
          const { data: latestLedger } = await supabaseAdmin
            .from("operations_ledger")
            .select("id, kind, amount, title, shop_id, created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestLedger && latestLedger.id !== lastLedgerId) {
            lastLedgerId = latestLedger.id;
            if (actor.role === "owner" || latestLedger.shop_id === actor.shop_id) {
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
          }

          // Get latest staff log (only owner sees these)
          if (actor.role === "owner") {
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
          }

          // Get latest chat message
          const { data: latestChatMessage } = await supabaseAdmin
            .from("chat_messages")
            .select("id, content, message, sender_id, created_at, message_type, metadata, shop_id")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestChatMessage && latestChatMessage.id !== lastChatMessageId) {
            lastChatMessageId = latestChatMessage.id;
            
            // Check if it's a stock request
            const isStockRequest = (latestChatMessage as any).message_type === 'stock_request' || 
              ((latestChatMessage as any).message?.startsWith?.('@') && (latestChatMessage as any).message?.includes?.('need'));
            
            if (isStockRequest) {
              const metadata = (latestChatMessage as any).metadata || {};
              events.push({
                type: "stock_request",
                id: latestChatMessage.id,
                title: "Stock Request",
                message: `Need ${metadata.quantity || '?'} × ${metadata.itemName || (latestChatMessage.message || 'items')}`,
                shop: metadata.shop || (latestChatMessage as any).shop_id,
                quantity: metadata.quantity,
                itemName: metadata.itemName,
                timestamp: latestChatMessage.created_at,
              });
            }
          }

          // Get latest stock request
          const { data: latestStockRequest } = await supabaseAdmin
            .from("stock_requests")
            .select("id, item_name, quantity, source_shop_id, target_shop_id, status, created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestStockRequest && latestStockRequest.id !== lastStockRequestId) {
            lastStockRequestId = latestStockRequest.id;
            // Owner sees all, manager sees requests to their shop
            if (actor.role === "owner" || latestStockRequest.target_shop_id === actor.shop_id) {
              events.push({
                type: "stock_request",
                id: latestStockRequest.id,
                title: "Stock Request",
                message: `${latestStockRequest.item_name} (${latestStockRequest.quantity} units) from ${latestStockRequest.source_shop_id}`,
                shop: latestStockRequest.target_shop_id,
                quantity: latestStockRequest.quantity,
                itemName: latestStockRequest.item_name,
                status: latestStockRequest.status,
                timestamp: latestStockRequest.created_at,
              });
            }
          }

          if (events.length > 0) {
            events.forEach(event => sendEvent(event));
          }

          // Send heartbeat
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

      // Also set a hard timeout
      setTimeout(() => {
        clearInterval(interval);
        sendEvent({ type: "close", message: "Session expired" });
        close();
      }, MAX_CONNECTION_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        close();
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
