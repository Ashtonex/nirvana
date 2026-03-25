import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

type Actor =
  | { role: "staff"; id: string; name: string; shop_id: string }
  | { role: "owner"; id: string; name: string };

async function getStaffFromCookie() {
  const token = (await cookies()).get("nirvana_staff")?.value;
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: session } = await supabaseAdmin
    .from("staff_sessions")
    .select("employee_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: staff } = await supabaseAdmin
    .from("employees")
    .select("id,name,surname,shop_id")
    .eq("id", session.employee_id)
    .maybeSingle();

  if (!staff?.shop_id) return null;
  const name = `${staff.name} ${staff.surname || ""}`.trim();
  return { role: "staff" as const, id: staff.id, name, shop_id: staff.shop_id };
}

async function getOwnerFromBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const user = data.user;
  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("name,surname")
    .eq("id", user.id)
    .maybeSingle();

  const name = emp?.name
    ? `${emp.name} ${emp.surname || ""}`.trim()
    : (user.email || "Owner");

  return { role: "owner" as const, id: user.id, name };
}

async function getActor(req: Request): Promise<Actor | null> {
  const staff = await getStaffFromCookie();
  if (staff) return staff;
  const owner = await getOwnerFromBearer(req);
  if (owner) return owner;
  return null;
}

export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemName = String(body?.itemName || "").trim();
  const fromShopId = String(body?.fromShopId || "").trim();
  let toShopId = String(body?.toShopId || "").trim();
  const quantity = Math.max(1, Number(body?.quantity || 1));

  if (!itemName) return NextResponse.json({ error: "Missing itemName" }, { status: 400 });
  if (!fromShopId) return NextResponse.json({ error: "Missing fromShopId" }, { status: 400 });
  if (!toShopId) return NextResponse.json({ error: "Missing toShopId" }, { status: 400 });

  // Staff can only request stock to their own shop.
  if (actor.role === "staff") {
    toShopId = actor.shop_id;
  }

  const { data: inventory } = await supabaseAdmin
    .from("inventory_items")
    .select("id,name")
    .ilike("name", `%${itemName}%`)
    .limit(1);

  const item = inventory?.[0];

  const { error } = await supabaseAdmin.from("stock_requests").insert({
    item_id: item?.id || itemName,
    item_name: item?.name || itemName,
    from_shop_id: fromShopId,
    to_shop_id: toShopId,
    quantity,
    requested_by: actor.name,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also broadcast to Universal room so all stores + owners see it.
  // Best-effort: don't fail the request if chat insert fails.
  try {
    const id = Math.random().toString(36).slice(2, 10);
    const createdAt = new Date().toISOString();
    const requestedFrom = actor.role === "staff" ? ` (from ${actor.shop_id})` : "";
    const msg = [
      "[STOCK REQUEST]",
      `Item: ${item?.name || itemName}`,
      `Qty: ${quantity}`,
      `From: ${fromShopId}`,
      `To: ${toShopId}`,
      `Requested by: ${actor.name}${requestedFrom}`,
    ].join("\n");

    await supabaseAdmin.from("staff_chat_messages").insert({
      id,
      shop_id: "universal",
      sender_employee_id: actor.id,
      sender_name: actor.name,
      message: msg,
      created_at: createdAt,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ success: true });
}

export async function GET(req: Request) {
  const actor = await getActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: requests, error } = await supabaseAdmin
      .from("stock_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ requests: requests || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
