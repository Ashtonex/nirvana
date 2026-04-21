import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { itemId, quantity } = await request.json();

    if (!itemId || quantity === undefined) {
      return NextResponse.json({ success: false, message: 'Missing itemId or quantity' }, { status: 400 });
    }

    // Update database
    const { error } = await supabaseAdmin
      .from('inventory_items')
      .update({ quantity })
      .eq('id', itemId);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Stock updated: item ${itemId} → ${quantity} units`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
