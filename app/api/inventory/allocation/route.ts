import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

type Actor = {
  id: string;
  name: string;
  kind: "owner" | "staff";
  role: string;
  shopId: string;
};

function isManagerRole(role: string): boolean {
  const r = String(role || "").toLowerCase();
  return r === "manager" || r === "owner" || r === "admin";
}

async function getActorFromCookies(): Promise<Actor | null> {
  const cookieStore = await cookies();

  const ownerToken = cookieStore.get("nirvana_owner")?.value;
  if (ownerToken) {
    return { kind: "owner", id: "owner-1", name: "Owner", role: "owner", shopId: "" };
  }

  const staffToken = cookieStore.get("nirvana_staff")?.value;
  if (!staffToken) return null;

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

  if (!staff?.id) return null;
  const name = `${staff.name || "Staff"} ${staff.surname || ""}`.trim();
  return { kind: "staff", id: staff.id, name, role: String(staff.role || "sales"), shopId: String(staff.shop_id || "") };
}

async function requireManagerOrOwner(): Promise<Actor> {
  const actor = await getActorFromCookies();
  if (!actor) throw new Error("Unauthorized");
  if (actor.kind === "owner") return actor;
  if (!isManagerRole(actor.role)) throw new Error("Forbidden: Manager or Owner role required");
  return actor;
}

// POST: Update allocation for a specific item and shop
export async function POST(req: Request) {
  try {
    const actor = await requireManagerOrOwner();
    const body = await req.json();
    const { itemId, shopId, quantity } = body;

    console.log("[UPDATE ALLOCATION] Request:", { itemId, shopId, quantity });

    if (!itemId || !shopId || quantity === undefined) {
      return NextResponse.json({ error: "Missing itemId, shopId, or quantity" }, { status: 400 });
    }

    const qty = parseInt(quantity) || 0;

    // Check if allocation exists
    const { data: existing } = await supabaseAdmin
      .from("inventory_allocations")
      .select("id, item_id, shop_id, quantity")
      .eq("item_id", itemId)
      .eq("shop_id", shopId)
      .maybeSingle();

    console.log("[UPDATE ALLOCATION] Existing allocation:", existing);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("inventory_allocations")
        .update({ quantity: qty })
        .eq("id", existing.id);

      if (error) {
        console.error("[UPDATE ALLOCATION] Update error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      console.log("[UPDATE ALLOCATION] Updated successfully");
    } else {
      const { error } = await supabaseAdmin
        .from("inventory_allocations")
        .insert({
          item_id: itemId,
          shop_id: shopId,
          quantity: qty,
        });

      if (error) {
        console.error("[UPDATE ALLOCATION] Insert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      console.log("[UPDATE ALLOCATION] Inserted successfully");
    }

    // Verify the allocation
    const { data: verify } = await supabaseAdmin
      .from("inventory_allocations")
      .select("*")
      .eq("item_id", itemId)
      .eq("shop_id", shopId)
      .single();
    console.log("[UPDATE ALLOCATION] Verified:", verify);

    // Log the action
    await supabaseAdmin.from("audit_log").insert({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      employee_id: actor.id,
      action: "STOCK_ALLOCATION_UPDATED",
      details: `Item ${itemId} at shop ${shopId} set to ${qty} by ${actor.name}`,
    });

    revalidatePath("/inventory");
    revalidatePath("/admin/inventory-manager");
    revalidatePath("/transfers");
    revalidatePath("/inventory/stocktake");
    revalidatePath("/api/dashboard/data");

    return NextResponse.json({ success: true, itemId, shopId, quantity: qty, verified: verify });
  } catch (e: any) {
    console.error("[UPDATE ALLOCATION]", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
