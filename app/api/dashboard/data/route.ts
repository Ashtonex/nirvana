import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const { data: inventory, error: invError } = await supabaseAdmin.from('inventory_items').select('*');
    const { data: allocations, error: allocError } = await supabaseAdmin.from('inventory_allocations').select('*');
    const { data: shops, error: shopsError } = await supabaseAdmin.from('shops').select('*');

    console.log('[API /dashboard/data] Shops from DB:', shops?.map((s: any) => ({ id: s.id, name: s.name })));
    console.log('[API /dashboard/data] All allocations:', allocations);
    
    // Check first item's allocations specifically
    if (inventory && inventory.length > 0) {
      const firstItem = inventory[0];
      const firstItemAllocs = allocations?.filter((a: any) => a.item_id === firstItem.id);
      console.log('[API /dashboard/data] First item:', firstItem.name, firstItem.id);
      console.log('[API /dashboard/data] First item allocations:', firstItemAllocs);
    }
    
    if (invError) console.error('[API] Inventory error:', invError);
    if (allocError) console.error('[API] Allocations error:', allocError);
    if (shopsError) console.error('[API] Shops error:', shopsError);

    const mappedInventory = (inventory || []).map((i: any) => ({
      id: i.id,
      name: i.name || "Unknown Product",
      category: i.category || "General",
      quantity: Number(i.quantity || 0),
      landedCost: Number(i.landed_cost || 0),
      acquisitionPrice: Number(i.acquisition_price || 0),
      dateAdded: i.date_added || new Date().toISOString(),
      sku: i.sku || i.id,
      allocations: (allocations || [])
        .filter((a: any) => a.item_id === i.id)
        .map((a: any) => ({
          shopId: a.shop_id,
          quantity: Number(a.quantity || 0)
        }))
    }));

    const mappedShops = (shops || []).map((sh: any) => ({
      id: sh.id,
      name: sh.name || "Unnamed Shop",
      expenses: sh.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 }
    }));

    return NextResponse.json({
      inventory: mappedInventory,
      shops: mappedShops,
      debug: {
        shopsRaw: shops,
        allocationsCount: (allocations || []).length,
        inventoryCount: (inventory || []).length,
        sampleAllocations: allocations?.slice(0, 5)
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (e: any) {
    console.error('[API Dashboard Data] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
