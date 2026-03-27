import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get shops
    const { data: shops, error: shopsErr } = await supabaseAdmin
      .from("shops")
      .select("id, name");

    // Get ALL allocations with count info
    const { data: allocations, error: allocErr, count: allocCount } = await supabaseAdmin
      .from("inventory_allocations")
      .select("id, item_id, shop_id, quantity", { count: "exact" })
      .limit(10000);

    // Get inventory items count
    const { data: items, error: itemsErr, count: itemsCount } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, quantity", { count: "exact" })
      .limit(10000);

    // Check if RLS is potentially blocking -- try with range too
    const { data: allocRange, error: allocRangeErr } = await supabaseAdmin
      .from("inventory_allocations")
      .select("shop_id, quantity")
      .range(0, 1999);

    // Group allocations by shop_id
    const byShop: Record<string, { count: number; totalQty: number }> = {};
    for (const a of allocations || []) {
      const sid = a.shop_id;
      if (!byShop[sid]) byShop[sid] = { count: 0, totalQty: 0 };
      byShop[sid].count++;
      byShop[sid].totalQty += Number(a.quantity || 0);
    }

    // Find items missing allocations
    const allocatedItemIds = new Set((allocations || []).map((a: any) => a.item_id));
    const itemsMissingAllocs = (items || []).filter((i: any) => !allocatedItemIds.has(i.id));

    return NextResponse.json({
      shops: shops || [],
      errors: {
        shops: shopsErr?.message,
        allocations: allocErr?.message,
        items: itemsErr?.message,
        allocRange: allocRangeErr?.message,
      },
      counts: {
        shops: shops?.length ?? 0,
        allocationsReturned: (allocations || []).length,
        allocationsTotal: allocCount,
        allocRangeReturned: (allocRange || []).length,
        itemsReturned: (items || []).length,
        itemsTotal: itemsCount,
        itemsMissingAllocs: itemsMissingAllocs.length,
      },
      allocationsByShop: byShop,
      shopIds: (shops || []).map((s: any) => ({ id: s.id, name: s.name })),
      uniqueAllocShopIds: [...new Set((allocations || []).map((a: any) => a.shop_id))],
      sampleAllocations: (allocations || []).slice(0, 10),
      itemsMissingAllocsSample: itemsMissingAllocs.slice(0, 5).map((i: any) => ({ id: i.id, name: i.name, quantity: i.quantity })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
