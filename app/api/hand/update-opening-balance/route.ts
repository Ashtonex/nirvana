import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { shop, amount, date, isPast } = await request.json();

    if (!shop || amount === undefined) {
      return NextResponse.json({ success: false, message: 'Missing shop or amount' }, { status: 400 });
    }

    if (isPast && date) {
      // Logic for injecting a past opening balance into the ledger
      const timestamp = new Date(date).toISOString();
      const dateOnly = timestamp.split('T')[0];
      const id = `hand-opening-${shop}-${dateOnly}`;
      const payload = {
        id,
        shop_id: shop,
        amount: Number(amount),
        date: timestamp,
        category: 'Cash Drawer Opening',
        type: 'asset',
        description: `Manual Override via The Hand (Past Correction)`
      };

      const { error: updateError } = await supabaseAdmin
        .from('ledger_entries')
        .update(payload)
        .eq('id', id);

      if (updateError) throw updateError;

      const { data: existing } = await supabaseAdmin
        .from('ledger_entries')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabaseAdmin.from('ledger_entries').insert(payload);
        if (insertError) throw insertError;
      }


      return NextResponse.json({
        success: true,
        message: `Past opening for ${shop} on ${dateOnly} corrected to $${Number(amount).toFixed(2)}`
      });
    }

    // Standard logic for setting the "Global/Next" opening balance
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
