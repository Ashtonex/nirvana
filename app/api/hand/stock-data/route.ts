import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

type InventoryRow = {
  id: string;
  name: string | null;
  category: string | null;
  quantity: number | null;
  reorder_level: number | null;
  shop_id: string | null;
  last_sold: string | null;
  landed_cost: number | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop') || 'all';
    const category = searchParams.get('category') || 'all';
    const status = searchParams.get('status') || 'all';

    let query = supabaseAdmin.from('inventory_items').select('*');

    if (shop !== 'all') {
      query = query.eq('shop_id', shop);
    }

    if (category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Fetch allocations for items to compute per-shop and total allocated quantities
    const itemIds = (data || []).map((i: any) => i.id).filter(Boolean);
    const { data: allocationsData } = itemIds.length > 0
      ? await supabaseAdmin.from('inventory_allocations').select('item_id,shop_id,quantity').in('item_id', itemIds)
      : { data: [] };

    const allocations = (allocationsData || []).reduce((acc: any, a: any) => {
      const id = a.item_id;
      if (!acc[id]) acc[id] = { total: 0, byShop: {} };
      const q = Number(a.quantity || 0);
      acc[id].total += q;
      acc[id].byShop[a.shop_id] = (acc[id].byShop[a.shop_id] || 0) + q;
      return acc;
    }, {} as Record<string, { total: number; byShop: Record<string, number> }>);

    // Filter by status if needed
    let items: InventoryRow[] = (data || []) as InventoryRow[];

    if (status === 'low') {
      items = items.filter((i: InventoryRow) => Number(i.quantity || 0) < Number(i.reorder_level || 5));
    } else if (status === 'dead') {
      items = items.filter((i: InventoryRow) => {
        const createdAt = i.created_at ? new Date(i.created_at).getTime() : Date.now();
        const daysInStock = Math.floor((new Date().getTime() - createdAt) / (1000 * 60 * 60 * 24));
        return daysInStock > 60 && Number(i.quantity || 0) > 0;
      });
    }

    return NextResponse.json({
      success: true,
      items: items.map((i: InventoryRow) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        quantity: i.quantity || 0,
        shop: i.shop_id,
        reorderLevel: i.reorder_level || 5,
        lastSold: i.last_sold || 'Never',
        price: i.landed_cost || 0,
        allocated: allocations[i.id]?.total || 0,
        allocations: allocations[i.id]?.byShop || {}
      }))
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { itemId, quantity } = await request.json();

    const { error } = await supabaseAdmin
      .from('inventory_items')
      .update({ quantity })
      .eq('id', itemId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Stock updated: ${itemId} → ${quantity} units`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
