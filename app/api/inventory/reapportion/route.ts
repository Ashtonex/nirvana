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

export async function POST(req: Request) {
  console.log("[REAPPORTION] Request received");
  
  try {
    const actor = await requireManagerOrOwner();
    console.log("[REAPPORTION] Actor authenticated:", actor);
    
    const body = await req.json();
    console.log("[REAPPORTION] Body:", body);
    
    const { itemId, allocations } = body;

    if (!itemId || !allocations || !Array.isArray(allocations)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    const { data: item } = await supabaseAdmin
      .from("inventory_items")
      .select("quantity, name")
      .eq("id", itemId)
      .single();

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const requestedTotal = allocations.reduce((sum: number, a: any) => sum + (parseInt(a.quantity) || 0), 0);
    if (requestedTotal > item.quantity) {
      return NextResponse.json(
        { error: `Total allocations (${requestedTotal}) exceed master stock (${item.quantity})` },
        { status: 400 }
      );
    }

    for (const alloc of allocations) {
      const shopId = alloc.shopId;
      const quantity = parseInt(alloc.quantity) || 0;

      console.log(`[REAPPORTION] Processing allocation for shop ${shopId}, qty: ${quantity}`);

      const { data: existing } = await supabaseAdmin
        .from("inventory_allocations")
        .select("id")
        .eq("item_id", itemId)
        .eq("shop_id", shopId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabaseAdmin
          .from("inventory_allocations")
          .update({ quantity })
          .eq("id", existing.id);

        if (error) {
          console.error(`Failed to update allocation for shop ${shopId}:`, error);
        }
      } else {
        const { error } = await supabaseAdmin
          .from("inventory_allocations")
          .insert({
            item_id: itemId,
            shop_id: shopId,
            quantity,
          });

        if (error) {
          console.error(`Failed to insert allocation for shop ${shopId}:`, error);
        }
      }
    }

    await supabaseAdmin.from("audit_log").insert({
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      employee_id: actor.id,
      action: "STOCKS_REAPPORTIONED",
      details: `${item.name} reapportioned across ${allocations.length} shops by ${actor.name}`,
    });

    // Force cache invalidation
    revalidatePath("/inventory");
    revalidatePath("/admin/inventory-manager");
    revalidatePath("/transfers");

    return NextResponse.json({ success: true, message: `Stock reapportioned for ${item.name}` });
  } catch (e: any) {
    console.error("[REAPPORTION] Error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
