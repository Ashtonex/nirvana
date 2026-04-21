import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
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
      overwrite
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
      item_id: `manual_${saleId}`,
      quantity,
      unit_price: unitPrice,
      total_before_tax: totalBeforeTax,
      tax,
      total_with_tax: totalWithTax,
      date,
      employee_id: employeeId,
      client_name: clientName,
      payment_method: 'manual_recovery'
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
        paymentMethod: 'manual_recovery'
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
