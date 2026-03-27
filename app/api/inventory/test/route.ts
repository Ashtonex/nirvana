import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get all shops
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    
    // Get all allocations
    const { data: allocations } = await supabaseAdmin.from('inventory_allocations').select('*');
    
    // Get first 5 items with their allocations
    const { data: items } = await supabaseAdmin.from('inventory_items').select('*').limit(5);
    
    const itemsWithAllocs = items?.map(item => {
      const itemAllocs = allocations?.filter(a => a.item_id === item.id) || [];
      return {
        id: item.id,
        name: item.name,
        masterQty: item.quantity,
        allocations: itemAllocs
      };
    });

    return NextResponse.json({
      shops: shops?.map(s => ({ id: s.id, name: s.name })),
      totalAllocations: allocations?.length || 0,
      sampleItems: itemsWithAllocs,
      allAllocations: allocations?.slice(0, 20) // First 20 allocations
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
