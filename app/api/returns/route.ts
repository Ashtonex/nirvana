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

function canIssueReturn(actor: Actor) {
  if (actor.role === "owner") return true;
  // Best default: managers only.
  return String(actor.employee_role).toLowerCase() === "manager";
}

export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canIssueReturn(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const saleId = String(body?.saleId || "").trim();
  const quantity = Math.max(1, Number(body?.quantity || 0));
  const reason = String(body?.reason || "").trim();
  const notes = String(body?.notes || "").trim();
  const restock = body?.restock !== false;

  if (!saleId) return NextResponse.json({ error: "Missing saleId" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Missing reason" }, { status: 400 });

  const { data: sale, error: saleErr } = await supabaseAdmin
    .from("sales")
    .select("id,shop_id,item_id,item_name,quantity,unit_price,total_before_tax,tax,total_with_tax,date,employee_id,client_name")
    .eq("id", saleId)
    .maybeSingle();

  if (saleErr) return NextResponse.json({ error: saleErr.message }, { status: 500 });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  // Staff can only issue returns for their own shop.
  if (actor.role === "staff" && sale.shop_id !== actor.shop_id) {
    return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
  }

  const saleQty = Number(sale.quantity || 0);
  if (saleQty <= 0) return NextResponse.json({ error: "Invalid sale quantity" }, { status: 400 });
  if (quantity > saleQty) return NextResponse.json({ error: "Return quantity exceeds sale" }, { status: 400 });

  const perUnitBeforeTax = Number(sale.total_before_tax || 0) / saleQty;
  const perUnitTax = Number(sale.tax || 0) / saleQty;
  const perUnitWithTax = Number(sale.total_with_tax || 0) / saleQty;

  const totalBeforeTax = -Math.abs(perUnitBeforeTax * quantity);
  const tax = -Math.abs(perUnitTax * quantity);
  const totalWithTax = -Math.abs(perUnitWithTax * quantity);

  const id = Math.random().toString(36).substring(2, 9);
  const timestamp = new Date().toISOString();

  // Prefer inserting into sales with richer columns if schema supports them.
  const base: any = {
    id,
    shop_id: sale.shop_id,
    item_id: sale.item_id,
    item_name: `RETURN: ${sale.item_name}`,
    quantity,
    unit_price: Number(sale.unit_price || 0),
    total_before_tax: totalBeforeTax,
    tax,
    total_with_tax: totalWithTax,
    date: timestamp,
    employee_id: actor.role === "owner" ? (sale.employee_id || actor.id) : actor.id,
    client_name: `CREDIT NOTE (${reason})${notes ? ` — ${notes}` : ""}`,
    // Optional columns (if you add them later)
    transaction_type: "refund",
    original_sale_id: sale.id,
    reason_code: reason,
    notes,
    restock,
  };

  const working: any = { ...base };
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await supabaseAdmin.from("sales").insert(working);
    if (!res.error) break;

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

  // Restock is best-effort.
  if (restock) {
    try {
      const { data: alloc } = await supabaseAdmin
        .from("inventory_allocations")
        .select("quantity")
        .eq("item_id", sale.item_id)
        .eq("shop_id", sale.shop_id)
        .maybeSingle();

      if (alloc) {
        await supabaseAdmin
          .from("inventory_allocations")
          .update({ quantity: Number(alloc.quantity || 0) + quantity })
          .eq("item_id", sale.item_id)
          .eq("shop_id", sale.shop_id);
      } else {
        await supabaseAdmin.from("inventory_allocations").insert({
          item_id: sale.item_id,
          shop_id: sale.shop_id,
          quantity,
        });
      }

      const { data: item } = await supabaseAdmin
        .from("inventory_items")
        .select("quantity")
        .eq("id", sale.item_id)
        .maybeSingle();
      if (item) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ quantity: Number(item.quantity || 0) + quantity })
          .eq("id", sale.item_id);
      }
    } catch (e: any) {
      console.error("[return] restock failed:", e?.message || e);
    }
  }

  try {
    await supabaseAdmin.from("audit_log").insert({
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      employee_id: actor.id,
      action: "RETURN_RECORDED",
      details: `Sale ${sale.id} -> Return ${id} (${quantity}) ${reason}`,
    });
  } catch {}

  return NextResponse.json({ success: true, returnId: id });
}
