import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: shops } = await supabaseAdmin
      .from("shops")
      .select("id, name");

    const { data: allocations } = await supabaseAdmin
      .from("inventory_allocations")
      .select("id, item_id, shop_id, quantity");

    const { data: items } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name")
      .limit(5);

    return NextResponse.json({
      shops: shops || [],
      allocations: allocations || [],
      sampleItems: items || [],
      debug: {
        shopIds: shops?.map((s: any) => s.id) || [],
        allocationShopIds: [...new Set((allocations || []).map((a: any) => a.shop_id))],
        sample: allocations?.slice(0, 5) || []
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
