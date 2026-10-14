import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { sendEmail } from '@/lib/email';
import { ORACLE_RECIPIENT } from '@/lib/resend';

type IdRow = { id?: string | null };
type QuantityRow = { quantity?: number | string | null };
type InventoryAlertRow = QuantityRow & { name?: string | null; reorder_level?: number | string | null };

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

    const saleId = crypto.randomUUID();
    const timestamp = date ? new Date(date).toISOString() : new Date().toISOString();
    const numericQuantity = Number(quantity || 1);
    const numericUnitPrice = Number(unitPrice || 0);
    const numericTotalWithTax = Number(totalWithTax);
    const numericTotalBeforeTax = Number.isFinite(Number(totalBeforeTax)) ? Number(totalBeforeTax) : numericTotalWithTax;
    const numericTax = Number.isFinite(Number(tax)) ? Number(tax) : Math.max(0, numericTotalWithTax - numericTotalBeforeTax);

    // 1. Z-Report Alignment: Check if an EOD report already exists for this date/shop
    const dateOnly = timestamp.split('T')[0];
    const { data: existingEOD } = await supabaseAdmin
      .from('audit_log')
      .select('id')
      .eq('shop_id', shopId)
      .eq('action', 'EOD_REPORT_SENT')
      .gte('timestamp', `${dateOnly}T00:00:00.000Z`)
      .lte('timestamp', `${dateOnly}T23:59:59.999Z`)
      .maybeSingle();

    if (existingEOD) {
      console.warn(`[add-sale] Warning: Adding sale to a day that already has a sent EOD report (${dateOnly})`);
    }

    // Duplicate-sale check (warn-only, mirrors app/actions.ts recordSale — never blocks a manual entry)
    const { data: identicalSales } = await supabaseAdmin
      .from('sales')
      .select('id')
      .eq('shop_id', shopId)
      .eq('client_name', clientName)
      .eq('item_name', itemName)
      .eq('quantity', numericQuantity)
      .eq('unit_price', numericUnitPrice)
      .gte('date', `${dateOnly}T00:00:00.000Z`)
      .lt('date', `${dateOnly}T23:59:59.999Z`);

    if (identicalSales && identicalSales.length >= 3) {
      console.warn(`[add-sale] Multiple identical sales detected for ${clientName}: ${identicalSales.length} times today. Recording anyway.`);
    }

    // Add to Supabase
    const { error: supabaseError } = await supabaseAdmin.from('sales').insert({
      id: saleId,
      shop_id: shopId,
      item_name: itemName,
      item_id: body.itemId || null, 
      quantity: numericQuantity,
      unit_price: numericUnitPrice,
      total_before_tax: numericTotalBeforeTax,
      tax: numericTax,
      total_with_tax: numericTotalWithTax,
      date: timestamp,
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
        const matchedItem = match as IdRow | null;
        if (matchedItem?.id) resolvedItemId = matchedItem.id;
      }

      // If still not found, create an ad-hoc inventory item and allocation so we can decrement to 0
      if (!resolvedItemId && itemName) {
        const adhocId = `adhoc_${crypto.randomUUID()}`;
        const timestamp = new Date().toISOString();
        await supabaseAdmin.from('inventory_items').insert({
          id: adhocId,
          shipment_id: 'MANUAL-SALE-ADHOC',
          name: itemName,
          category: 'Quick Sale',
          quantity: numericQuantity, // create with just enough stock
          acquisition_price: 0,
          landed_cost: 0,
          date_added: timestamp
        });
        await supabaseAdmin.from('inventory_allocations').insert({
          item_id: adhocId,
          shop_id: shopId,
          quantity: numericQuantity
        });
        resolvedItemId = adhocId;
      }

      if (resolvedItemId && !String(resolvedItemId).startsWith('service_')) {
        // --- IMPROVED SHOP ALLOCATION LOGIC ---
        // 1. Check if the shop has this item allocated
        const { data: currentAlloc } = await supabaseAdmin
          .from('inventory_allocations')
          .select('quantity')
          .eq('item_id', resolvedItemId)
          .eq('shop_id', shopId)
          .maybeSingle();

        if (currentAlloc) {
          // Normal decrement if allocation exists
          const allocation = currentAlloc as QuantityRow;
          const newAllocQty = Number(allocation.quantity || 0) - numericQuantity;
          await supabaseAdmin
            .from('inventory_allocations')
            .update({ quantity: newAllocQty })
            .eq('item_id', resolvedItemId)
            .eq('shop_id', shopId);
        } else {
          // LOOPHOLE FIX: If no allocation exists, create one starting at 0 then decrementing.
          // This allows the shop pulse to show -Qty, highlighting that stock was sold but not transferred.
          await supabaseAdmin
            .from('inventory_allocations')
            .insert({
              item_id: resolvedItemId,
              shop_id: shopId,
              quantity: -numericQuantity
            });
          console.log(`[add-sale] Auto-created missing allocation for ${resolvedItemId} at ${shopId}`);
        }

        // 2. Decrement global inventory item quantity directly
        const { data: currentItem } = await supabaseAdmin
          .from('inventory_items')
          .select('quantity, name, reorder_level')
          .eq('id', resolvedItemId)
          .maybeSingle();

        if (currentItem) {
          const item = currentItem as InventoryAlertRow;
          const newItemQty = Math.max(0, Number(item.quantity || 0) - numericQuantity);
          await supabaseAdmin
            .from('inventory_items')
            .update({ quantity: newItemQty })
            .eq('id', resolvedItemId);

          // Low-Stock Triggers
          const reorderLevel = Number(item.reorder_level || 5);
          if (newItemQty <= reorderLevel) {
            try {
              await sendEmail({
                to: ORACLE_RECIPIENT,
                subject: `[ALERT] Low Stock: ${item.name || itemName}`,
                html: `
                  <div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;">
                    <h2 style="color:#e11d48;">Inventory Alert</h2>
                    <p>Product <strong>${item.name || itemName}</strong> is running low.</p>
                    <p>Remaining: <span style="font-size:18px;font-weight:bold;color:#e11d48;">${newItemQty}</span> units</p>
                    <p>Shop: ${shopId}</p>
                    <hr/>
                    <p style="font-size:12px;color:#666;">Actioned via The Hand Manual Sale Entry</p>
                  </div>
                `
              });
            } catch (e) {
              console.error('[add-sale] Low stock email failed:', e);
            }
          }
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
        quantity: numericQuantity,
        unitPrice: numericUnitPrice,
        totalBeforeTax: numericTotalBeforeTax,
        tax: numericTax,
        totalWithTax: numericTotalWithTax,
        date: timestamp,
        employeeId,
        clientName,
        paymentMethod: 'cash'
      });

      await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    } catch (e) {
      console.error('Local JSON backup failed:', e);
      // Don't fail if local backup fails
    }

    // 3. Real-time Matrix Refresh & Intelligence Update
    try {
      revalidatePath('/');
      revalidatePath('/inventory');
      revalidatePath('/intelligence');
      revalidatePath('/finance/oracle');
      revalidatePath('/admin/hand');
      revalidatePath(`/shops/${shopId}`);
    } catch (e) {
      console.error('[add-sale] Revalidation failed:', e);
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
