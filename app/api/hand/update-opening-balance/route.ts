import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { shop, amount } = await request.json();

    if (!shop || amount === undefined) {
      return NextResponse.json({ success: false, message: 'Missing shop or amount' }, { status: 400 });
    }

    // Update database
    const { error: dbError } = await supabaseAdmin
      .from('shop_settings')
      .upsert({ shop_id: shop, opening_balance: amount });

    if (dbError && !dbError.message.includes('relation')) {
      console.error('DB error:', dbError);
    }

    // Update local JSON
    const dbPath = path.join(process.cwd(), 'lib', 'db.json');
    const content = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(content);
    db.shopSettings = db.shopSettings || {};
    db.shopSettings[shop] = { openingBalance: amount };
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));

    return NextResponse.json({
      success: true,
      message: `${shop} opening balance set to $${amount.toFixed(2)}`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
