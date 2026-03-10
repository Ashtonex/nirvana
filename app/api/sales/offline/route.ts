import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

export async function POST(request: Request) {
    if (!supabaseAdmin) {
        console.error('Offline sync failed: Supabase admin not configured');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    try {
        const sale = await request.json();

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
            item_id: sale.itemId,
            item_name: sale.itemName,
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

        const isService = sale.itemId?.startsWith('service_');

        if (!isService) {
            try {
                await supabaseAdmin.rpc('decrement_allocation', { 
                    item_id: sale.itemId, 
                    shop_id: sale.shopId, 
                    qty: sale.quantity 
                });
            } catch (e) {
                console.error('Failed to decrement allocation:', e);
            }

            try {
                await supabaseAdmin.rpc('decrement_inventory', { 
                    item_id: sale.itemId, 
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
