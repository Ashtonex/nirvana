import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get raw allocations directly - no mapping
    const { data: allocations, error: allocError } = await supabaseAdmin
      .from('inventory_allocations')
      .select('*');
    
    if (allocError) {
      return NextResponse.json({ error: allocError.message }, { status: 500 });
    }

    // Get shops
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    
    // Get inventory
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');

    // Count allocations per shop
    const allocsByShop: Record<string, number> = {};
    const allocsByItem: Record<string, number> = {};
    
    allocations?.forEach((a: any) => {
      allocsByShop[a.shop_id] = (allocsByShop[a.shop_id] || 0) + 1;
      allocsByItem[a.item_id] = (allocsByItem[a.item_id] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalAllocations: allocations?.length || 0,
      shops: shops?.map((s: any) => ({ id: s.id, name: s.name })),
      allocsByShop,
      allocsByItem,
      // First 10 raw allocations
      sampleRawAllocations: allocations?.slice(0, 10),
      // First 3 items with their allocations
      sampleItems: inventory?.slice(0, 3).map((item: any) => {
        const itemAllocs = allocations?.filter((a: any) => a.item_id === item.id);
        return {
          itemId: item.id,
          itemName: item.name,
          allocations: itemAllocs
        };
      })
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
