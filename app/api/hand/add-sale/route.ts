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

    // Try to decrement inventory/allocation for this sale so stock reflects the manual entry.
    try {
      // Resolve item id by exact name match (case-insensitive) if none provided
      let resolvedItemId: string | null = null;
      if (body.itemId) resolvedItemId = String(body.itemId);
      if (!resolvedItemId && itemName) {
        const { data: match } = await supabaseAdmin
          .from('inventory_items')
          .select('id')
          .ilike('name', itemName)
          .limit(1)
          .maybeSingle();
        if (match && (match as any).id) resolvedItemId = (match as any).id;
      }

      // If still not found, create an ad-hoc inventory item and allocation so we can decrement to 0
      if (!resolvedItemId && itemName) {
        const adhocId = `adhoc_${Math.random().toString(36).substring(2, 9)}`;
        const timestamp = new Date().toISOString();
        await supabaseAdmin.from('inventory_items').insert({
          id: adhocId,
          shipment_id: 'MANUAL-SALE-ADHOC',
          name: itemName,
          category: 'Quick Sale',
          quantity: quantity, // create with just enough stock
          acquisition_price: 0,
          landed_cost: 0,
          date_added: timestamp
        });
        await supabaseAdmin.from('inventory_allocations').insert({
          item_id: adhocId,
          shop_id: shopId,
          quantity: quantity
        });
        resolvedItemId = adhocId;
      }

      if (resolvedItemId && !String(resolvedItemId).startsWith('service_')) {
        try {
          await supabaseAdmin.rpc('decrement_allocation', { item_id: resolvedItemId, shop_id: shopId, qty: quantity });
        } catch (e) {
          console.error('[add-sale] decrement_allocation failed:', e);
        }

        try {
          await supabaseAdmin.rpc('decrement_inventory', { item_id: resolvedItemId, qty: quantity });
        } catch (e) {
          console.error('[add-sale] decrement_inventory failed:', e);
        }
      }
    } catch (e) {
      console.error('[add-sale] inventory decrement attempt failed:', e);
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
