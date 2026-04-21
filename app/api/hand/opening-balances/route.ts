import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const dbPath = path.join(process.cwd(), 'lib', 'db.json');
    const content = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(content);

    // Get balances from database
    const { data: balanceData } = await supabaseAdmin
      .from('shop_settings')
      .select('shop_id, opening_balance');

    const balances = {
      kipasa: 0,
      dubdub: 0,
      tradecenter: 0
    };

    if (balanceData) {
      balanceData.forEach(b => {
        balances[b.shop_id] = b.opening_balance || 0;
      });
    }

    return NextResponse.json({
      success: true,
      balances
    });
  } catch (error: any) {
    return NextResponse.json({
      success: true,
      balances: {
        kipasa: 0,
        dubdub: 0,
        tradecenter: 0
      }
    });
  }
}

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
