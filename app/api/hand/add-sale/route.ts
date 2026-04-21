import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const body = await request.json();
    const {
      shopId,
      clientName,
      itemName,
      quantity,
      unitPrice,
      totalBeforeTax,
      tax,
      totalWithTax,
      date,
      employeeId,
    } = body;

    if (!shopId || !clientName || !itemName || totalWithTax <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid sale data' }, { status: 400 });
    }

    const saleId = Math.random().toString(36).substring(2, 9);

    // Add to Supabase
    const { error: supabaseError } = await supabaseAdmin.from('sales').insert({
      id: saleId,
      shop_id: shopId,
      item_name: itemName,
      item_id: null, // Allow null item_id for manual recovery sales
      quantity,
      unit_price: unitPrice,
      total_before_tax: totalWithTax / 1.155, // Extract net from gross for ledger accuracy
      tax: totalWithTax - (totalWithTax / 1.155), // Compute tax portion from final figure
      total_with_tax: totalWithTax,
      date,
      employee_id: employeeId,
      client_name: clientName,
      payment_method: 'cash'
    });

    if (supabaseError) {
      throw new Error(`Supabase: ${supabaseError.message}`);
    }

    // Add to local JSON
    try {
      const dbPath = path.join(process.cwd(), 'lib', 'db.json');
      const content = await fs.readFile(dbPath, 'utf-8');
      const db = JSON.parse(content);
      
      if (!db.sales) db.sales = [];
      db.sales.push({
        id: saleId,
        shopId,
        itemName,
        quantity,
        unitPrice,
        totalBeforeTax,
        tax,
        totalWithTax,
        date,
        employeeId,
        clientName,
        paymentMethod: 'cash'
      });

      await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    } catch (e) {
      console.error('Local JSON backup failed:', e);
      // Don't fail if local backup fails
    }

    return NextResponse.json({
      success: true,
      message: `Sale added successfully (ID: ${saleId})`,
      saleId
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
