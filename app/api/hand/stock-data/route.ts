import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

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

    // Filter by status if needed
    let items = data || [];

    if (status === 'low') {
      items = items.filter(i => (i.quantity || 0) < (i.reorder_level || 5));
    } else if (status === 'dead') {
      items = items.filter(i => {
        const daysInStock = Math.floor((new Date().getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysInStock > 60 && (i.quantity || 0) > 0;
      });
    }

    return NextResponse.json({
      success: true,
      items: items.map(i => ({
        id: i.id,
        name: i.name,
        category: i.category,
        quantity: i.quantity || 0,
        shop: i.shop_id,
        reorderLevel: i.reorder_level || 5,
        lastSold: i.last_sold || 'Never',
        price: i.landed_cost || 0
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { itemId, quantity, shop } = await request.json();

    const { error } = await supabaseAdmin
      .from('inventory_items')
      .update({ quantity })
      .eq('id', itemId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Stock updated: ${itemId} → ${quantity} units`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
