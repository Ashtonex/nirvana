import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

type Actor =
  | { role: "staff"; id: string; name: string; shop_id: string; employee_role: string }
  | { role: "owner"; id: string; name: string };

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || "";
}

async function getStaffFromCookie(): Promise<Actor | null> {
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
    .select("id,name,surname,shop_id,role")
    .eq("id", session.employee_id)
    .maybeSingle();

  if (!staff?.shop_id) return null;
  const name = `${staff.name} ${staff.surname || ""}`.trim();
  return {
    role: "staff",
    id: staff.id,
    name,
    shop_id: staff.shop_id,
    employee_role: String(staff.role || "sales"),
  };
}

async function getOwnerFromBearer(req: Request): Promise<Actor | null> {
  // Check for custom owner cookie first
  const ownerCookie = (await cookies()).get("nirvana_owner");
  if (ownerCookie?.value) {
    return { role: "owner", id: "owner-1", name: "Admin" };
  }

  // Check for Bearer token (Supabase)
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const user = data.user;
  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("name,surname,role")
    .eq("id", user.id)
    .maybeSingle();

  if (emp?.role !== "owner") return null;
  const name = emp?.name ? `${emp.name} ${emp.surname || ""}`.trim() : (user.email || "Owner");
  return { role: "owner", id: user.id, name };
}

async function getActor(req: Request): Promise<Actor | null> {
  const staff = await getStaffFromCookie();
  if (staff) return staff;
  const owner = await getOwnerFromBearer(req);
  if (owner) return owner;
  return null;
}

async function resolveItemForUntrackedSale(shopId: string, itemName: string, quantity: number) {
  const name = String(itemName || '').trim() || 'Ad-hoc Item';
  const qty = Math.max(1, Number(quantity || 1));

  const { data: candidates } = await supabaseAdmin
    .from("inventory_items")
    .select("id,name")
    .ilike("name", name)
    .limit(5);

  const list = candidates || [];
  const exact = list.find((c: any) => String(c.name || '').toLowerCase() === name.toLowerCase()) || list[0];
  if (exact?.id) return { itemId: exact.id, itemName: exact.name || name };

  const itemId = `adhoc_${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = new Date().toISOString();

  await supabaseAdmin.from("inventory_items").insert({
    id: itemId,
    shipment_id: "POS-UNTRACKED",
    name,
    category: "Quick Sale",
    quantity: qty,
    acquisition_price: 0,
    landed_cost: 0,
    date_added: timestamp,
  });

  await supabaseAdmin.from("inventory_allocations").insert({
    item_id: itemId,
    shop_id: shopId,
    quantity: qty,
  });

  return { itemId, itemName: name };
}

export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || Math.random().toString(36).substring(2, 9)).trim();
  const shop_id = String(body?.shop_id || "").trim();
  const item_name = String(body?.item_name || "UNTRACKED ITEM").trim();
  const quantity = Math.max(1, Number(body?.quantity || 1));
  const unit_price = Number(body?.unit_price || 0);
  const total_before_tax = Number(body?.total_before_tax || 0);
  const total_with_tax = Number(body?.total_with_tax || 0);
  const tax = Number(body?.tax || 0);
  const date = String(body?.date || new Date().toISOString()).trim();
  const employee_id = String(body?.employee_id || actor.id).trim();
  const client_name = String(body?.client_name || "Walk-in").trim();
  const payment_method = String(body?.payment_method || "cash").trim();

  // Validate required fields
  if (!shop_id) return NextResponse.json({ error: "Missing shop_id" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }

  // Staff can only record sales for their own shop
  if (actor.role === "staff" && shop_id !== actor.shop_id) {
    return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
  }

  const resolved = await resolveItemForUntrackedSale(shop_id, item_name, quantity);

  const working: any = {
    id,
    shop_id,
    item_id: resolved.itemId,
    item_name: resolved.itemName,
    quantity,
    unit_price,
    total_before_tax,
    tax,
    total_with_tax,
    date,
    employee_id,
    client_name,
    payment_method,
  };

  // Try to insert, removing unsupported fields as needed
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await supabaseAdmin.from("sales").insert(working);
    if (!res.error) {
      // Best-effort inventory decrement (ad-hoc items are created with qty then decremented to 0)
      try {
        if (!String(working.item_id || '').startsWith("service_")) {
          await supabaseAdmin.rpc("decrement_allocation", { item_id: working.item_id, shop_id, qty: quantity });
          await supabaseAdmin.rpc("decrement_inventory", { item_id: working.item_id, qty: quantity });
        }
      } catch {}

      // Success - log audit entry
      try {
        await supabaseAdmin.from("audit_log").insert({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: date,
          employee_id: actor.id,
          action: "UNTRACKED_SALE_RECORDED",
          details: `Untracked sale: ${item_name} x${quantity} by ${actor.name} in ${shop_id}`,
        });
      } catch {}
      return NextResponse.json({ success: true, saleId: id });
    }

    const msg = res.error.message || "";
    const m1 = msg.match(/Could not find the '([^']+)' column/i);
    const m2 = msg.match(/column "([^"]+)" of relation "sales" does not exist/i);
    const missing = (m1 && m1[1]) || (m2 && m2[1]);
    if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
      delete working[missing];
      continue;
    }
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Failed to record sale after retry" }, { status: 500 });
}
