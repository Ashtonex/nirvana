import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

async function resolveSaleItem(
    client: SupabaseClient<any>,
    sale: any
): Promise<{ itemId: string; itemName: string }> {
    type InventoryItemLite = { id: string; name: string | null };
    const rawId = String(sale?.itemId || '').trim();
    const rawName = String(sale?.itemName || '').trim();
    const qty = Math.max(1, Number(sale?.quantity || 1));

    const looksUntracked = !rawId || rawId === 'UNTRACKED' || rawId.startsWith('QUICK_');

    if (!looksUntracked) {
        // Verify the item exists; if not, fall back to name resolution.
        const { data: byId } = await client.from('inventory_items').select('id,name').eq('id', rawId).maybeSingle();
        const byIdRow = byId as InventoryItemLite | null;
        if (byIdRow?.id) return { itemId: byIdRow.id, itemName: byIdRow.name || rawName || byIdRow.id };
    }

    if (rawName) {
        const { data: candidates } = await client
            .from('inventory_items')
            .select('id,name')
            .ilike('name', rawName)
            .limit(5);

        const list = (candidates || []) as InventoryItemLite[];
        const exact = list.find((c: any) => String(c.name || '').toLowerCase() === rawName.toLowerCase()) || list[0];
        if (exact?.id) return { itemId: exact.id, itemName: exact.name || rawName };
    }

    // Create an ad-hoc item so inventory decrement and analytics remain consistent.
    const itemId = `adhoc_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Some builds type Supabase as schema-less (tables become `never`), so we cast to keep server sync unblocked.
    await (client as any).from('inventory_items').insert({
        id: itemId,
        shipment_id: 'OFFLINE-SYNC-ADHOC',
        name: rawName || 'Ad-hoc Item',
        category: 'Quick Sale',
        // Create with enough stock to cover this synced sale, then decrement back to 0.
        quantity: qty,
        acquisition_price: 0,
        landed_cost: 0,
        date_added: timestamp
    } as any);

    await (client as any).from('inventory_allocations').insert({
        item_id: itemId,
        shop_id: String(sale?.shopId || '').trim(),
        quantity: qty
    } as any);

    return { itemId, itemName: rawName || 'Ad-hoc Item' };
}

export async function POST(request: Request) {
    if (!supabaseAdmin) {
        console.error('Offline sync failed: Supabase admin not configured');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    try {
        const sale = await request.json();
        const resolved = await resolveSaleItem(supabaseAdmin, sale);

        const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
        if (!settings) throw new Error("Settings not found");

        const discount = sale.discount || 0;
        const subtotalBeforeDiscount = sale.totalBeforeTax;
        const subtotalAfterDiscount = Math.max(0, subtotalBeforeDiscount - discount);
        
        let tax = 0;
        const taxRate = Number(settings.tax_rate) || 0.155;
        if (settings.tax_mode === 'all') {
            tax = subtotalAfterDiscount * taxRate;
        } else if (settings.tax_mode === 'above_threshold') {
            if ((subtotalAfterDiscount / sale.quantity) >= Number(settings.tax_threshold)) {
                tax = subtotalAfterDiscount * taxRate;
            }
        }

        const totalWithTax = subtotalAfterDiscount + tax;
        const saleId = sale.id || Math.random().toString(36).substring(2, 9);
        const timestamp = sale.date || new Date().toISOString();

        await supabaseAdmin.from('sales').insert({
            id: saleId,
            shop_id: sale.shopId,
            item_id: resolved.itemId,
            item_name: resolved.itemName,
            quantity: sale.quantity,
            unit_price: sale.unitPrice,
            total_before_tax: subtotalAfterDiscount,
            tax,
            total_with_tax: totalWithTax,
            date: timestamp,
            employee_id: sale.employeeId,
            client_name: sale.clientName,
            payment_method: sale.paymentMethod || 'cash',
            discount_applied: discount
        });

        const isService = resolved.itemId?.startsWith('service_');

        if (!isService) {
            try {
                await supabaseAdmin.rpc('decrement_allocation', { 
                    item_id: resolved.itemId, 
                    shop_id: sale.shopId, 
                    qty: sale.quantity 
                });
            } catch (e) {
                console.error('Failed to decrement allocation:', e);
            }

            try {
                await supabaseAdmin.rpc('decrement_inventory', { 
                    item_id: resolved.itemId, 
                    qty: sale.quantity 
                });
            } catch (e) {
                console.error('Failed to decrement inventory:', e);
            }
        }

        return NextResponse.json({ success: true, id: saleId });
    } catch (error) {
        console.error('Offline sale sync failed:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
