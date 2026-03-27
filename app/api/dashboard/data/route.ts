import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    // Use POST body or query to force fresh data
    const timestamp = Date.now();
    
    // Fetch with fresh flag - query directly without caching
    const { data: inventory, error: invError } = await supabaseAdmin
      .from('inventory_items')
      .select('*')
      .limit(10000);
      
    const { data: allocations, error: allocError } = await supabaseAdmin
      .from('inventory_allocations')
      .select('*')
      .limit(10000);
      
    const { data: shops, error: shopsError } = await supabaseAdmin
      .from('shops')
      .select('*')
      .limit(10000);

    console.log('[API /dashboard/data] Timestamp:', timestamp);
    console.log('[API /dashboard/data] Shops:', shops?.map((s: any) => ({ id: s.id, name: s.name })));
    console.log('[API /dashboard/data] Total allocations fetched:', allocations?.length);

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
      meta: {
        fetchedAt: timestamp,
        totalAllocations: allocations?.length,
        totalInventory: inventory?.length,
        totalShops: shops?.length
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (e: any) {
    console.error('[API Dashboard Data] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
