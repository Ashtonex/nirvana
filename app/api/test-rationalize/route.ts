import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("operations_state")
    .upsert({ id: 1, actual_balance: -1 }, { onConflict: "id" });
    
  return NextResponse.json({ data, error: error?.message || null });
}
