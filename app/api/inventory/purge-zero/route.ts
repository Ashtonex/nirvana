import { NextResponse } from "next/server";
import { requirePrivilegedActor } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requirePrivilegedActor();

    const { data: zeroItems, error: fetchError } = await supabaseAdmin
      .from("inventory_items")
      .select("id")
      .lte("quantity", 0);

    if (fetchError) throw new Error(fetchError.message);

    const itemIds = (zeroItems || []).map((item: { id: string }) => item.id).filter(Boolean);
    if (itemIds.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    const { error: allocError } = await supabaseAdmin
      .from("inventory_allocations")
      .delete()
      .in("item_id", itemIds);

    if (allocError) throw new Error(allocError.message);

    const { error: deleteError } = await supabaseAdmin
      .from("inventory_items")
      .delete()
      .in("id", itemIds);

    if (deleteError) throw new Error(deleteError.message);

    revalidatePath("/inventory");
    revalidatePath("/inventory/stocktake");
    revalidatePath("/admin/inventory-manager");

    return NextResponse.json({ success: true, deletedCount: itemIds.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
