import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
    try {
        const sale = await request.json();
        
        // Check if discount is provided, calculate properly
        const discount = sale.discount || 0;
        const subtotalAfterDiscount = Math.max(0, sale.totalBeforeTax - discount);
        
        // Get tax settings
        const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
        const taxRate = Number(settings?.tax_rate || 0.155);
        
        let tax = 0;
        if (settings?.tax_mode === 'all') {
            tax = subtotalAfterDiscount * taxRate;
        } else if (settings?.tax_mode === 'above_threshold') {
            if ((subtotalAfterDiscount / sale.quantity) >= Number(settings.tax_threshold)) {
                tax = subtotalAfterDiscount * taxRate;
            }
        }
        
        const totalWithTax = subtotalAfterDiscount + tax;
        const saleId = sale.id || Math.random().toString(36).substring(2, 9);
        const timestamp = sale.date || new Date().toISOString();

        // Insert the sale
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

        // Update inventory atomically (if not a service)
        if (!sale.itemId?.startsWith('service_')) {
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

        // Revalidate paths
        revalidatePath('/');
        revalidatePath('/inventory');
        revalidatePath(`/shops/${sale.shopId}`);

        return NextResponse.json({ success: true, id: saleId });
    } catch (error) {
        console.error('Offline sync error:', error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
