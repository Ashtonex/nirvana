"use server";

import { Database, InventoryItem, Sale, Shipment, FinancialEntry, Quotation, Employee, AuditEntry, OracleEmail } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ORACLE_RECIPIENT } from "@/lib/resend";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { createHash, randomUUID } from "crypto";
import { sendEmail } from "@/lib/email";
import { sendWhatsAppMessage } from "@/lib/twilio";

function getPublicBaseUrl() {
    const url =
        process.env.NIRVANA_PUBLIC_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        '';
    return url ? String(url).replace(/\/$/, '') : '';
}

export async function getDashboardData() {
    // Guard: if Supabase env is missing/misconfigured, never crash the whole app.
    // Return safe empty structures so pages can render and show UI.
    const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!hasSupabase) {
        console.error('[getDashboardData] Supabase env vars are missing.');
        return {
            inventory: [],
            sales: [],
            shops: [
                { id: 'kipasa', name: 'Kipasa', expenses: { rent: 0, salaries: 0, utilities: 0, misc: 0 } },
                { id: 'dubdub', name: 'Dubdub', expenses: { rent: 0, salaries: 0, utilities: 0, misc: 0 } },
                { id: 'tradecenter', name: 'Tradecenter', expenses: { rent: 0, salaries: 0, utilities: 0, misc: 0 } },
            ],
            quotations: [],
            employees: [],
            shipments: [],
            ledger: [],
            auditLog: [],
            transfers: [],
            emails: [],
            settings: {},
            globalExpenses: {},
        };
    }

    try {
        const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');
        const { data: allocations } = await supabaseAdmin.from('inventory_allocations').select('*');
        const { data: sales } = await supabaseAdmin.from('sales').select('*');
        const { data: shops } = await supabaseAdmin.from('shops').select('*');
        const { data: quotations } = await supabaseAdmin.from('quotations').select('*');
        const { data: employees } = await supabaseAdmin.from('employees').select('*');
        const { data: shipments } = await supabaseAdmin.from('shipments').select('*');
        const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
        const { data: ledger } = await supabaseAdmin.from('ledger_entries').select('*');
        const { data: auditLog } = await supabaseAdmin.from('audit_log').select('*');
        const { data: transfers } = await supabaseAdmin.from('transfers').select('*');
        const { data: emails } = await supabaseAdmin.from('oracle_emails').select('*');

        return {
            inventory: (inventory || []).map((i: any) => ({
                id: i.id,
                name: i.name || "Unknown Product",
                category: i.category || "General",
                quantity: Number(i.quantity || 0),
                landedCost: Number(i.landed_cost || 0),
                acquisitionPrice: Number(i.acquisition_price || 0),
                dateAdded: i.date_added || new Date().toISOString(),
                sku: i.sku || i.id,
                allocations: (allocations || []).filter((a: any) => a.item_id === i.id).map((a: any) => ({
                    shopId: a.shop_id,
                    quantity: Number(a.quantity || 0)
                }))
            })),
            sales: (sales || []).map((s: any) => ({
                id: s.id, shopId: s.shop_id, itemId: s.item_id, itemName: s.item_name || "Unknown Item",
                quantity: Number(s.quantity || 0), unitPrice: Number(s.unit_price || 0),
                totalWithTax: Number(s.total_with_tax || 0), totalBeforeTax: Number(s.total_before_tax || 0),
                tax: Number(s.tax || 0), date: s.date || new Date().toISOString(), employeeId: s.employee_id,
                paymentMethod: s.payment_method || 'cash',
                clientName: s.client_name || 'General Walk-in'
            })),
            shops: (shops || []).map((sh: any) => ({
                id: sh.id, name: sh.name || "Unnamed Shop",
                expenses: sh.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 }
            })),
            quotations: (quotations || []).map((q: any) => {
                const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                const items = Array.isArray(q.items) ? q.items : [];
                return {
                    id: q.id,
                    shopId: q.shop_id,
                    clientName: q.client_name || "Guest",
                    clientEmail: q.client_email || q.clientEmail || "",
                    clientPhone: q.client_phone || q.clientPhone || "",
                    items,
                    totalBeforeTax: Number(q.total_before_tax || 0),
                    tax: Number(q.tax || 0),
                    totalWithTax: Number(q.total_with_tax || 0),
                    status: q.status || 'pending',
                    date: q.date || new Date().toISOString(),
                    expiryDate: q.expiry_date || q.expiryDate || in7Days,
                    employeeId: q.employee_id || q.employeeId || "",
                };
            }),
            employees: (employees || []).map((e: any) => ({
                id: e.id,
                name: e.name || "New Recruit",
                surname: e.surname || "",
                email: e.email || "",
                mobile: e.mobile || "",
                role: e.role || "sales",
                shopId: e.shop_id,
                hireDate: e.hire_date || e.hireDate || new Date().toISOString(),
                active: Boolean(e.is_active ?? e.active ?? true),
                mobileVerified: Boolean(e.mobile_verified ?? false),
            })),
            shipments: (shipments || []).map((sh: any) => ({
                id: sh.id, supplier: sh.supplier || "Internal Transfer", shipmentNumber: sh.shipment_number || "---", date: sh.date || new Date().toISOString()
            })),
            ledger: (ledger || []).map((l: any) => ({
                id: l.id, type: l.type || 'expense', category: l.category || 'General', amount: Number(l.amount || 0),
                date: l.date || new Date().toISOString(), description: l.description || "", shopId: l.shop_id
            })),
            auditLog: (auditLog || []).map((a: any) => ({
                id: a.id, timestamp: a.timestamp || new Date().toISOString(), employeeId: a.employee_id || "SYSTEM", action: a.action, details: a.details, changes: a.changes
            })),
            transfers: (transfers || []).map((t: any) => ({
                id: t.id, itemId: t.item_id, itemName: t.item_name, fromShopId: t.from_shop_id, toShopId: t.to_shop_id, quantity: Number(t.quantity || 0), date: t.date || new Date().toISOString()
            })),
            oracleEmails: (emails || []).map((em: any) => ({
                id: em.id, timestamp: em.timestamp || new Date().toISOString(), to: em.recipient, subject: em.subject, body: em.body, type: em.type
            })),
            settings: {
                taxRate: Number(settings?.tax_rate || 0.155),
                taxThreshold: Number(settings?.tax_threshold || 100),
                taxMode: settings?.tax_mode || 'all',
                zombieDays: Number(settings?.zombie_days || 60),
                currencySymbol: settings?.currency_symbol || "$"
            },
            globalExpenses: settings?.global_expenses || {}
        };
    } catch (e: any) {
        console.error('[getDashboardData] Failed:', e?.message || e);
        return {
            inventory: [],
            sales: [],
            shops: [],
            quotations: [],
            employees: [],
            shipments: [],
            ledger: [],
            auditLog: [],
            transfers: [],
            emails: [],
            settings: {},
            globalExpenses: {},
        };
    }
}

export async function updateGlobalExpenses(expenses: Database['globalExpenses']) {
    await supabase.from('oracle_settings').update({ global_expenses: expenses }).eq('id', 1);
    await supabase.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toISOString(),
        employee_id: 'ADMIN', action: 'EXPENSES_UPDATED', details: `Updated global expenses`
    });
    revalidatePath("/"); revalidatePath("/finance");
}

export async function updateShopExpenses(shopId: string, expenses: { rent: number; salaries: number; utilities: number; misc: number }) {
    await supabase.from('shops').update({ expenses }).eq('id', shopId);
    await supabase.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toISOString(),
        employee_id: 'ADMIN', action: 'SHOP_EXPENSES_UPDATED', details: `Shop: ${shopId}`
    });
    revalidatePath("/"); revalidatePath("/inventory");
}

export async function processShipment(shipmentData: any) {
    const shipmentId = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    const totalLogistics = shipmentData.shippingCost + shipmentData.dutyCost + shipmentData.miscCost;
    const totalQty = shipmentData.items.reduce((sum: number, i: any) => sum + i.quantity, 0);
    const feePerPiece = shipmentData.manifestPieces > 0 ? totalLogistics / shipmentData.manifestPieces : totalLogistics / totalQty;

    await supabase.from('shipments').insert({
        id: shipmentId, date: timestamp, supplier: shipmentData.supplier, shipment_number: shipmentData.shipmentNumber,
        purchase_price: shipmentData.purchasePrice, shipping_cost: shipmentData.shippingCost, duty_cost: shipmentData.dutyCost,
        misc_cost: shipmentData.miscCost, manifest_pieces: shipmentData.manifestPieces, total_quantity: totalQty
    });

    const { data: shops } = await supabase.from('shops').select('*');
    const totalShopExpenses = (shops || []).reduce(
        (sum: number, shop: any) =>
            sum +
            Object.values(shop.expenses || {}).reduce(
                (a: number, b: any) => a + Number(b),
                0
            ),
        0
    );

    for (const itemData of shipmentData.items) {
        const itemId = Math.random().toString(36).substring(2, 9);
        const unitAcquisitionPrice = itemData.quantity > 0 ? itemData.acquisitionPrice / itemData.quantity : 0;
        const landedCost = unitAcquisitionPrice + feePerPiece;

        await supabase.from('inventory_items').insert({
            id: itemId, shipment_id: shipmentId, name: itemData.name, category: itemData.category,
            quantity: itemData.quantity, acquisition_price: unitAcquisitionPrice, landed_cost: landedCost, date_added: timestamp
        });

        if (totalShopExpenses > 0 && shops) {
            let allocatedSum = 0;
            const allocations = shops
                .map((shop: any, idx: number) => {
                    const shopTotal = Object.values(shop.expenses || {}).reduce(
                        (a: number, b: any) => a + Number(b),
                        0
                    );
                    let allocatedQty =
                        idx === shops.length - 1
                            ? itemData.quantity - allocatedSum
                            : Math.floor(itemData.quantity * (shopTotal / totalShopExpenses));
                    allocatedSum += allocatedQty;
                    return { item_id: itemId, shop_id: shop.id, quantity: allocatedQty };
                })
                .filter((a: { item_id: string; shop_id: string; quantity: number }) => a.quantity > 0);
            if (allocations.length > 0) await supabase.from('inventory_allocations').insert(allocations);
        }
    }

    await supabase.from('ledger_entries').insert([{
        id: Math.random().toString(36).substring(2, 9), type: 'asset', category: 'Inventory Acquisition',
        amount: shipmentData.purchasePrice, date: timestamp, description: `Source: ${shipmentData.supplier}`
    }, {
        id: Math.random().toString(36).substring(2, 9), type: 'expense', category: 'Shipping & Logistics',
        amount: totalLogistics, date: timestamp, description: `Shipment Fees`
    }]);

    revalidatePath("/"); revalidatePath("/inventory");
}

export async function recordSale(sale: any) {
    const { data: settings } = await supabase.from('oracle_settings').select('*').single();
    if (!settings) throw new Error("Settings not found");

    let tax = 0;
    const taxRate = Number(settings.tax_rate) || 0.155;
    if (settings.tax_mode === 'all') {
        tax = sale.totalBeforeTax * taxRate;
    } else if (settings.tax_mode === 'above_threshold') {
        if ((sale.totalBeforeTax / sale.quantity) >= Number(settings.tax_threshold)) {
            tax = sale.totalBeforeTax * taxRate;
        }
    }

    const totalWithTax = sale.totalBeforeTax + tax;
    const saleId = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();

    await supabaseAdmin.from('sales').insert({
        id: saleId, shop_id: sale.shopId, item_id: sale.itemId, item_name: sale.itemName,
        quantity: sale.quantity, unit_price: sale.unitPrice, total_before_tax: sale.totalBeforeTax,
        tax, total_with_tax: totalWithTax, date: timestamp, employee_id: sale.employeeId, client_name: sale.clientName,
        payment_method: sale.paymentMethod || 'cash'
    });

    const isService = sale.itemId?.startsWith('service_');

    if (!isService) {
        const { data: alloc } = await supabaseAdmin.from('inventory_allocations').select('quantity').eq('item_id', sale.itemId).eq('shop_id', sale.shopId).single();
        if (alloc) await supabaseAdmin.from('inventory_allocations').update({ quantity: alloc.quantity - sale.quantity }).eq('item_id', sale.itemId).eq('shop_id', sale.shopId);

        const { data: item } = await supabaseAdmin.from('inventory_items').select('quantity, name').eq('id', sale.itemId).single();
        if (item) {
            const newQty = item.quantity - sale.quantity;
            await supabaseAdmin.from('inventory_items').update({ quantity: newQty }).eq('id', sale.itemId);
            if (newQty <= 0) {
                try {
                    await sendEmail({
                        to: ORACLE_RECIPIENT,
                        subject: `[ALERT] Stock Depleted: ${item.name}`,
                        html: `<p>Product 0 units.</p>`
                    });
                } catch (e) {
                    // Do not fail the sale flow if email fails
                    console.error('[Email] Stock depleted alert failed:', (e as any)?.message || e);
                }
            }
        }
    }

    await supabaseAdmin.from('audit_log').insert({ id: Math.random().toString(36).substring(2, 9), timestamp, employee_id: sale.employeeId, action: 'SALE_RECORDED', details: sale.itemName });

    revalidatePath(`/shops/${sale.shopId}`); revalidatePath("/inventory");
    revalidatePath("/");
}

export async function recordUntrackedSale(sale: any) {
    const timestamp = new Date().toISOString();

    // Check if product exists by name in database
    const { data: existingItems } = await supabaseAdmin.from('inventory_items')
        .select('id, name')
        .ilike('name', sale.itemName);

    let itemId = "UNTRACKED";
    let actualItemName = sale.itemName;

    if (existingItems && existingItems.length > 0) {
        // Exact or close match found
        const matchedItem = existingItems.find((i: any) => i.name.toLowerCase() === sale.itemName.toLowerCase()) || existingItems[0];
        itemId = matchedItem.id;
        actualItemName = matchedItem.name;
    } else {
        // It genuinely doesn't exist. Create it on the fly.
        itemId = `adhoc_${Math.random().toString(36).substring(2, 9)}`;

        await supabaseAdmin.from('inventory_items').insert({
            id: itemId,
            shipment_id: 'QUICK-SALE-AUTO',
            name: sale.itemName,
            category: 'Quick Sale',
            quantity: 0,
            acquisition_price: 0,
            landed_cost: 0,
            date_added: timestamp
        });

        await supabaseAdmin.from('inventory_allocations').insert({
            item_id: itemId,
            shop_id: sale.shopId,
            quantity: 0
        });
    }

    // Delegate to standard recordSale logic
    return recordSale({
        ...sale,
        itemId,
        itemName: actualItemName
    });
}

export async function registerInventoryItem(item: { name: string, category: string, quantity: number, acquisitionPrice: number, landedCost: number }, shopIds?: string[]) {
    const id = Math.random().toString(36).substring(2, 9);
    const date_added = new Date().toISOString();
    await supabaseAdmin.from('inventory_items').insert({
        id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        acquisition_price: item.acquisitionPrice,
        landed_cost: item.landedCost,
        date_added
    });

    // Create allocations for selected shops
    if (shopIds && shopIds.length > 0) {
        const quantityPerShop = Math.floor(item.quantity / shopIds.length);
        const remainder = item.quantity % shopIds.length;

        for (let i = 0; i < shopIds.length; i++) {
            const shopId = shopIds[i];
            const qty = quantityPerShop + (i < remainder ? 1 : 0);
            if (qty > 0) {
                await supabaseAdmin.from('inventory_allocations').insert({
                    item_id: id,
                    shop_id: shopId,
                    quantity: qty
                });
            }
        }
    }

    const totalCost = item.quantity * item.landedCost;
    if (totalCost > 0) {
        await supabaseAdmin.from('ledger_entries').insert([{
            id: Math.random().toString(36).substring(2, 9),
            type: 'asset',
            category: 'Inventory Acquisition',
            amount: totalCost,
            date: date_added,
            description: `Ad-Hoc Master Addition: ${item.name}`
        }]);
    }

    revalidatePath("/inventory");
    revalidatePath("/");
    // Revalidate all shop pages
    if (shopIds) {
        for (const shopId of shopIds) {
            revalidatePath(`/shops/${shopId}`);
        }
    }
    return { id };
}

export async function registerBulkInventoryItems(
    items: Array<{ name: string; category: string; quantity: number; price: number }>,
    shopIds: string[],
    landedCostMethod: 'flat' | 'auto',
    globalExpenses: Record<string, number>
) {
    const timestamp = new Date().toISOString();

    const totalMonthlyExpenses = Object.values(globalExpenses).reduce((a: number, b: any) => a + Number(b), 0) as number;
    const hasExpenses = totalMonthlyExpenses > 0;

    const results = [];

    for (const item of items) {
        const id = Math.random().toString(36).substring(2, 9);

        let landedCost: number;
        if (!hasExpenses) {
            landedCost = item.price * (0.47 + Math.random() * 0.06);
        } else if (landedCostMethod === 'flat') {
            landedCost = item.price;
        } else {
            const overheadPerPiece = totalMonthlyExpenses / 1000;
            landedCost = item.price + overheadPerPiece;
        }

        await supabaseAdmin.from('inventory_items').insert({
            id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            acquisition_price: item.price * item.quantity,
            landed_cost: landedCost,
            date_added: timestamp
        });

        const quantityPerShop = Math.floor(item.quantity / shopIds.length);
        const remainder = item.quantity % shopIds.length;

        for (let i = 0; i < shopIds.length; i++) {
            const shopId = shopIds[i];
            const qty = quantityPerShop + (i < remainder ? 1 : 0);
            if (qty > 0) {
                await supabaseAdmin.from('inventory_allocations').insert({
                    item_id: id,
                    shop_id: shopId,
                    quantity: qty
                });
            }
        }

        results.push({ id, name: item.name, quantity: item.quantity });
    }

    revalidatePath("/inventory");
    return { success: true, itemsAdded: results.length };
}

export async function updateInventoryItem(itemId: string, updates: any) {
    try {
        const { error } = await supabaseAdmin.from('inventory_items').update(updates).eq('id', itemId);
        
        if (error) {
            console.error('[updateInventoryItem] Database error:', error);
            return { success: false, error: error.message };
        }

        // Revalidate all relevant paths
        revalidatePath("/inventory");
        revalidatePath("/");
        revalidatePath("/inventory/InventoryMaster");
        
        // Also revalidate all shop pages in case allocations are affected
        const { data: shops } = await supabaseAdmin.from('shops').select('id');
        if (shops) {
            for (const shop of shops) {
                revalidatePath(`/shops/${shop.id}`);
            }
        }
        
        return { success: true, message: `Item updated successfully` };
    } catch (err: any) {
        console.error('[updateInventoryItem] Error:', err);
        return { success: false, error: err.message };
    }
}

export async function deleteInventoryItem(itemId: string) {
    try {
        // First, get the item details before deleting
        const { data: item } = await supabaseAdmin.from('inventory_items').select('name').eq('id', itemId).single();
        
        // Delete the inventory item
        const { error } = await supabaseAdmin.from('inventory_items').delete().eq('id', itemId);
        
        if (error) {
            console.error('[deleteInventoryItem] Database error:', error);
            return { success: false, error: error.message };
        }

        // Delete associated allocations
        await supabaseAdmin.from('inventory_allocations').delete().eq('item_id', itemId);

        // Revalidate all relevant paths
        revalidatePath("/inventory");
        revalidatePath("/");
        revalidatePath("/inventory/InventoryMaster");
        
        // Also revalidate all shop pages
        const { data: shops } = await supabaseAdmin.from('shops').select('id');
        if (shops) {
            for (const shop of shops) {
                revalidatePath(`/shops/${shop.id}`);
            }
        }
        
        return { success: true, message: `${item?.name || 'Item'} has been permanently deleted from inventory` };
    } catch (err: any) {
        console.error('[deleteInventoryItem] Error:', err);
        return { success: false, error: err.message };
    }
}

export async function recordStocktake(stocktakeData: any) {
    const timestamp = new Date().toISOString();
    for (const record of stocktakeData.items) {
        const { data: item } = await supabase.from('inventory_items').select('*').eq('id', record.itemId).single();
        const { data: alloc } = await supabase.from('inventory_allocations').select('*').eq('item_id', record.itemId).eq('shop_id', stocktakeData.shopId).single();
        if (!item || !alloc) continue;
        const diff = record.physicalQuantity - alloc.quantity;
        if (diff !== 0) {
            await supabase.from('inventory_allocations').update({ quantity: record.physicalQuantity }).eq('item_id', record.itemId).eq('shop_id', stocktakeData.shopId);
            await supabase.from('inventory_items').update({ quantity: (item.quantity - alloc.quantity) + record.physicalQuantity }).eq('id', record.itemId);
        }
    }
    revalidatePath("/inventory"); revalidatePath(`/shops/${stocktakeData.shopId}`);
}

export async function getShipments() {
    const { data } = await supabaseAdmin.from('shipments').select('*').order('date', { ascending: false });
    return data || [];
}

export async function getInventoryHistory() {
    const { data } = await supabaseAdmin.from('inventory_items').select('*, inventory_allocations(*)').order('date_added', { ascending: false });
    return data || [];
}

export async function getFinancials() {
    const { data: ledger } = await supabaseAdmin.from('ledger_entries').select('*').order('date', { ascending: false });
    const { data: sales } = await supabaseAdmin.from('sales').select('*').order('date', { ascending: false });
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    return { ledger: ledger || [], sales: sales || [], globalExpenses: settings?.global_expenses || {}, shops: shops || [] };
}

export async function getInventoryInsights(itemId: string) {
    const { data: item } = await supabaseAdmin.from('inventory_items').select('*').eq('id', itemId).single();
    const { data: sales } = await supabaseAdmin.from('sales').select('*').eq('item_id', itemId);
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    if (!item) return null;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const totalSold = (sales || [])
        .filter((s: any) => new Date(s.date) >= thirtyDaysAgo)
        .reduce((acc: number, s: any) => acc + s.quantity, 0);
    const velocity = totalSold / 30;
    return { dailyVelocity: velocity, daysToZero: velocity > 0 ? Math.floor(item.quantity / velocity) : Infinity, totalSold30d: totalSold };
}

export async function getGlobalSettings() {
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    if (!settings) return null;
    return {
        taxRate: Number(settings.tax_rate), taxThreshold: Number(settings.tax_threshold),
        taxMode: settings.tax_mode as any, zombieDays: Number(settings.zombie_days), currencySymbol: settings.currency_symbol || "$"
    };
}

export async function updateGlobalSettings(settings: any) {
    const updates: any = {};
    if (settings.taxRate !== undefined) updates.tax_rate = settings.taxRate;
    if (settings.taxThreshold !== undefined) updates.tax_threshold = settings.taxThreshold;
    if (settings.taxMode !== undefined) updates.tax_mode = settings.taxMode;
    if (settings.zombieDays !== undefined) updates.zombie_days = settings.zombieDays;
    if (settings.currencySymbol !== undefined) updates.currency_symbol = settings.currencySymbol;
    await supabaseAdmin.from('oracle_settings').update(updates).eq('id', 1);
    revalidatePath("/admin/settings");
}

export async function finalizeQuotation(quoteId: string) {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', quoteId).single();
    if (!quote || quote.status !== 'pending') return;
    for (const item of (quote.items as any[])) {
        await recordSale({
            shopId: quote.shop_id, itemId: item.itemId, itemName: item.itemName,
            quantity: item.quantity, unitPrice: item.unitPrice, totalBeforeTax: item.unitPrice * item.quantity,
            employeeId: quote.employee_id, clientName: quote.client_name
        });
    }
    await supabase.from('quotations').update({ status: 'converted' }).eq('id', quoteId);
    revalidatePath(`/shops/${quote.shop_id}`);
    revalidatePath("/inventory");
    revalidatePath("/");
}

export async function addNewProductFromPos(productData: any) {
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    await supabaseAdmin.from('inventory_items').insert({
        id, shipment_id: 'POS-AD-HOC', name: productData.name, category: productData.category,
        quantity: productData.initialStock || 0, acquisition_price: productData.landedCost, landed_cost: productData.landedCost, date_added: timestamp
    });
    await supabaseAdmin.from('inventory_allocations').insert({ item_id: id, shop_id: productData.shopId, quantity: productData.initialStock || 0 });

    const totalCost = (productData.initialStock || 0) * productData.landedCost;
    if (totalCost > 0) {
        await supabaseAdmin.from('ledger_entries').insert([{
            id: Math.random().toString(36).substring(2, 9),
            type: 'asset',
            category: 'Inventory Acquisition',
            amount: totalCost,
            date: timestamp,
            description: `Ad-Hoc POS Addition: ${productData.name}`
        }]);
    }
    revalidatePath("/inventory");
    revalidatePath("/");
    revalidatePath(`/shops/${productData.shopId}`);
    return { id };
}

export async function openCashRegister(shopId: string, expectedAmount: number, actualAmount: number) {
    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);

    // Log the actual opening amount as an asset
    await supabaseAdmin.from('ledger_entries').insert([{
        id,
        shop_id: shopId,
        type: 'asset',
        category: 'Cash Drawer Opening',
        amount: actualAmount,
        date: timestamp,
        description: `Register Opened - Expected: $${expectedAmount.toFixed(2)} | Actual: $${actualAmount.toFixed(2)}`
    }]);

    // If there's a discrepancy, log it as an adjustment
    const discrepancy = actualAmount - expectedAmount;
    if (Math.abs(discrepancy) > 0.01) {
        await supabaseAdmin.from('ledger_entries').insert([{
            id: Math.random().toString(36).substring(2, 9),
            shop_id: shopId,
            type: discrepancy < 0 ? 'expense' : 'income',
            category: 'Cash Drawer Adjustment',
            amount: Math.abs(discrepancy),
            date: timestamp,
            description: `Register ${discrepancy < 0 ? 'Short' : 'Over'} by $${Math.abs(discrepancy).toFixed(2)}`
        }]);
    }

    revalidatePath(`/shops/${shopId}`);
}

export async function recordPosExpense(shopId: string, amount: number, description: string, employeeId: string) {
    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);

    // Log expense to ledger
    await supabaseAdmin.from('ledger_entries').insert([{
        id,
        shop_id: shopId,
        type: 'expense',
        category: 'POS Expense',
        amount: amount,
        date: timestamp,
        description: description
    }]);

    // Optional: Log to audit trail
    await supabaseAdmin.from('audit_log').insert([{
        id: Math.random().toString(36).substring(2, 9),
        action: 'record_pos_expense',
        shop_id: shopId,
        employee_id: employeeId,
        details: { amount, description },
        timestamp
    }]);

    revalidatePath(`/shops/${shopId}`);
    revalidatePath('/');
}

export async function getOracleMasterPulse() {
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*, inventory_allocations(*)');
    const { data: sales } = await supabaseAdmin.from('sales').select('*');
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    if (!inventory || !sales || !shops || !settings) return null;

    const totalRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax), 0);
    const totalTax = sales.reduce((sum: number, s: any) => sum + Number(s.tax), 0);
    const grossProfit =
        sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax), 0) -
        sales.reduce((sum: number, s: any) => {
            const item = inventory.find((i: any) => i.id === s.item_id);
            return sum + (item ? Number(item.landed_cost) * s.quantity : 0);
        }, 0);

    const categoryBreakdown = (inventory || []).reduce((acc: Record<string, number>, item: any) => {
        const category = item.category || "Uncategorized";
        acc[category] = (acc[category] || 0) + Number(item.quantity || 0);
        return acc;
    }, {});

    return {
        totalUnits: inventory.reduce((sum: number, i: any) => sum + i.quantity, 0),
        categoryBreakdown,
        finances: { revenue: totalRevenue, tax: totalTax, grossProfit, netIncome: grossProfit, monthlyBurn: 0 },
        shopPerformance: (shops || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            revenue: (sales || [])
                .filter((sa: any) => sa.shop_id === s.id)
                .reduce((acc: number, sa: any) => acc + Number(sa.total_with_tax), 0),
            expenses: Object.values(s.expenses || {}).reduce(
                (acc: number, val: any) => acc + Number(val || 0),
                0
            ),
            progress: 100
        })),
        deadCapital: 0,
        zombieCount: 0,
        recentEmails: []
    };
}

export async function getZombieStockReport() {
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('zombie_days').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');
    if (!inventory) return [];
    return inventory.filter((i: any) => {
        const days = Math.floor((new Date().getTime() - new Date(i.date_added).getTime()) / (1000 * 3600 * 24));
        return days > (settings?.zombie_days || 60);
    }).map((i: any) => ({ ...i, daysInStock: Math.floor((new Date().getTime() - new Date(i.date_added).getTime()) / (1000 * 3600 * 24)), deadCapital: Number(i.landed_cost) * i.quantity }));
}

export async function addEmployee(employee: any) {
    const id = Math.random().toString(36).substring(2, 9);
    await supabase.from('employees').insert({ id, name: employee.name, role: employee.role, shop_id: employee.shopId, active: true });
    revalidatePath("/employees");
}

const SHOP_DOMAINS: Record<string, string> = {
    kipasa: "kipasa.com",
    dubdub: "dubdub.com",
    tradecenter: "tc.com"
};

export async function registerNewEmployee(employee: {
    name: string;
    surname: string;
    personalEmail: string;
    mobile: string;
    role: string;
    shopId: string;
    hireDate: string;
}) {
    try {
        const safe = (s: string) => (s || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/[^a-z0-9._-]/g, "");

        const workEmail = `${safe(employee.name)}.${safe(employee.surname)}@${SHOP_DOMAINS[employee.shopId] || "nirvana.com"}`;
        const tempPassword = `${safe(employee.name)}.${safe(employee.surname)}123`;
        const passwordHash = createHash("sha256").update(tempPassword).digest("hex");

        // Owners authenticate via Supabase Auth.
        // Staff authenticate via custom session (work email -> one-time code).
        let userId: string;
        if (employee.role === 'owner') {
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: workEmail,
                password: tempPassword,
                email_confirm: true,
                user_metadata: {
                    name: employee.name,
                    surname: employee.surname,
                    shop_id: employee.shopId,
                    role: employee.role
                }
            });

            if (authError) {
                console.error('[registerNewEmployee] createUser failed:', authError);
                return { success: false, error: authError.message };
            }

            const createdId = authData.user?.id;
            if (!createdId) {
                return { success: false, error: 'Failed to create owner user' };
            }
            userId = createdId;
        } else {
            userId = randomUUID();
        }

        const insertWithColumnFallback = async (row: Record<string, any>) => {
            // Try inserting; if PostgREST schema cache complains about missing columns,
            // remove those keys and retry.
            const working: Record<string, any> = { ...row };
            for (let attempt = 0; attempt < 8; attempt++) {
                const res = await supabaseAdmin.from('employees').insert(working);
                if (!res.error) return;

                const msg = res.error.message || '';
                const m1 = msg.match(/Could not find the '([^']+)' column/i);
                const m2 = msg.match(/column "([^"]+)" of relation "employees" does not exist/i);
                const missing = (m1 && m1[1]) || (m2 && m2[1]);
                if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
                    delete working[missing];
                    continue;
                }

                throw new Error(res.error.message);
            }

            throw new Error('Failed to insert employee row after retries');
        };

        // Insert employee profile (support both legacy schemas and newer ones)
        await insertWithColumnFallback({
            id: userId,
            name: employee.name,
            surname: employee.surname,
            email: workEmail,
            personal_email: employee.personalEmail,
            mobile: employee.mobile,
            password_hash: passwordHash,
            shop_id: employee.shopId,
            role: employee.role,
            // some schemas use active, some use is_active
            is_active: true,
            active: true,
            hire_date: employee.hireDate,
        });

        const shopName = employee.shopId === 'kipasa' ? 'Kipasa' : employee.shopId === 'dubdub' ? 'Dubdub' : 'Trade Center';

        try {
            const isOwner = employee.role === 'owner';
            const loginUrl = isOwner
                ? 'https://nirvana-flectere.vercel.app/login'
                : 'https://nirvana-flectere.vercel.app/staff-login';

            const loginInstructions = isOwner
                ? `<p>Login with your work email and the temporary password.</p>`
                : `<p>Login is passwordless: enter your work email and we'll send a one-time code to this personal email.</p>`;

            await sendEmail({
                to: employee.personalEmail,
                subject: `Welcome to Nirvana - Your Work Login`,
                html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #8b5cf6;">Welcome to Nirvana!</h1>
                    <p>Hi ${employee.name},</p>
                    <p>Your employee account has been created.</p>
                    ${loginInstructions}
                    
                    <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Work Email (Login):</strong> ${workEmail}</p>
                            <p><strong>Default Password:</strong> ${tempPassword}</p>
                            <p style="color:#64748b;font-size:12px;margin-top:8px;">(Owners use this to sign in. Staff may not need it unless instructed.)</p>
                            <p><strong>Shop:</strong> ${shopName}</p>
                            <p><strong>Role:</strong> ${employee.role}</p>
                    </div>
                        
                        <p>Please login at: <a href="${loginUrl}">${loginUrl}</a></p>
                        
                        <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
                            If you did not expect this email, please contact your administrator.
                        </p>
                    </div>
                `
            });
            console.log('[registerNewEmployee] SendGrid sent onboarding email');
        } catch (emailError) {
            console.error('[registerNewEmployee] SendGrid failed:', (emailError as any)?.message || emailError);
        }

        revalidatePath("/employees");
        return { success: true, email: workEmail };
    } catch (e: any) {
        console.error('[registerNewEmployee] Failed:', e?.message || e);
        return { success: false, error: e?.message || 'Unknown error' };
    }
}

export async function updateEmployee(id: string, updates: any) {
    const { shopId, ...rest } = updates;
    const supabaseUpdates = { ...rest, ...(shopId ? { shop_id: shopId } : {}) };
    await supabase.from('employees').update(supabaseUpdates).eq('id', id);
    revalidatePath("/employees");
}

export async function deleteEmployee(id: string) {
    // Use admin client to bypass RLS and clean up related records.
    const { data: emp } = await supabaseAdmin.from('employees').select('*').eq('id', id).maybeSingle();

    // Remove staff auth artifacts (if tables exist)
    try { await supabaseAdmin.from('staff_sessions').delete().eq('employee_id', id); } catch { }
    try { await supabaseAdmin.from('staff_login_codes').delete().eq('employee_id', id); } catch { }
    try { await supabaseAdmin.from('staff_chat_messages').delete().eq('sender_employee_id', id); } catch { }

    // If this user was an owner created in Supabase Auth, remove auth user too.
    // (No-op for staff-only accounts.)
    if (emp?.role === 'owner') {
        try {
            await supabaseAdmin.auth.admin.deleteUser(id);
        } catch (e) {
            console.error('[deleteEmployee] auth deleteUser failed:', (e as any)?.message || e);
        }
    }

    const del = await supabaseAdmin.from('employees').delete().eq('id', id);
    if (del.error) {
        const msg = del.error.message || '';
        const looksLikeFkViolation =
            (del.error as any).code === '23503' ||
            /foreign key constraint|violates foreign key/i.test(msg);

        // If the employee row is referenced by historical records (sales/audit/etc),
        // fall back to a soft deactivate so they can no longer log in.
        if (looksLikeFkViolation) {
            const working: Record<string, any> = { is_active: false, active: false };
            for (let attempt = 0; attempt < 4; attempt++) {
                const res = await supabaseAdmin
                    .from('employees')
                    .update(working)
                    .eq('id', id);

                if (!res.error) break;

                const msg2 = res.error.message || '';
                const m1 = msg2.match(/Could not find the '([^']+)' column/i);
                const m2 = msg2.match(/column "([^"]+)" of relation "employees" does not exist/i);
                const missing = (m1 && m1[1]) || (m2 && m2[1]);
                if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
                    delete working[missing];
                    continue;
                }

                throw new Error(res.error.message);
            }
        } else {
            throw new Error(del.error.message);
        }
    }

    revalidatePath("/employees");
}

export async function transferInventory(itemId: string, fromShopId: string, toShopId: string, quantity: number) {
    const { data: fromAlloc } = await supabase.from('inventory_allocations').select('quantity').eq('item_id', itemId).eq('shop_id', fromShopId).single();
    if (!fromAlloc || fromAlloc.quantity < quantity) throw new Error("Stock error");
    await supabase.from('inventory_allocations').update({ quantity: fromAlloc.quantity - quantity }).eq('item_id', itemId).eq('shop_id', fromShopId);
    const { data: toAlloc } = await supabase.from('inventory_allocations').select('quantity').eq('item_id', itemId).eq('shop_id', toShopId).single();
    if (toAlloc) await supabase.from('inventory_allocations').update({ quantity: toAlloc.quantity + quantity }).eq('item_id', itemId).eq('shop_id', toShopId);
    else await supabase.from('inventory_allocations').insert({ item_id: itemId, shop_id: toShopId, quantity });
    revalidatePath("/transfers");
}

export async function recordQuotation(quotation: any) {
    const id = Math.random().toString(36).substring(2, 9);
    const date = new Date().toISOString();
    const base: any = {
        id,
        shop_id: quotation.shopId,
        items: quotation.items,
        total_before_tax: quotation.totalBeforeTax,
        tax: quotation.tax,
        total_with_tax: quotation.totalWithTax,
        client_name: quotation.clientName,
        client_email: quotation.clientEmail,
        client_phone: quotation.clientPhone,
        employee_id: quotation.employeeId,
        date,
        status: 'pending',
    };

    // Insert with column fallback (in case client_email/client_phone not in schema yet)
    const working: any = { ...base };
    let inserted = false;
    for (let attempt = 0; attempt < 6; attempt++) {
        const res = await supabase.from('quotations').insert(working);
        if (!res.error) {
            inserted = true;
            break;
        }

        const msg = res.error.message || '';
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" of relation "quotations" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]);
        if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
            delete working[missing];
            continue;
        }
        throw new Error(res.error.message);
    }

    if (!inserted) {
        throw new Error('Failed to create quotation');
    }

    // Best-effort notifications (do not block quote creation)
    const baseUrl = getPublicBaseUrl();
    const quotePath = `/quotations/${id}`;
    const quoteUrl = baseUrl ? `${baseUrl}${quotePath}` : quotePath;
    const total = Number(quotation.totalWithTax || 0);
    const clientName = String(quotation.clientName || 'Customer');
    const shopId = String(quotation.shopId || '');

    const lines = Array.isArray(quotation.items) ? quotation.items : [];
    const topLines = lines.slice(0, 10).map((i: any) => {
        const name = String(i.itemName || i.name || 'Item');
        const qty = Number(i.quantity || 0);
        const t = Number(i.total || 0);
        return `- ${name} x${qty} ($${t.toFixed(2)})`;
    });
    const more = lines.length > 10 ? `\n(+${lines.length - 10} more items)` : '';

    const msg = [
        `Hi ${clientName}, your Nirvana quote is ready.`,
        shopId ? `Shop: ${shopId}` : null,
        `Quote ID: ${id}`,
        `Total: $${total.toFixed(2)}`,
        topLines.length ? `Items:\n${topLines.join('\n')}${more}` : null,
        `View: ${quoteUrl}`,
    ].filter(Boolean).join('\n');

    const emailTo = String(quotation.clientEmail || '').trim();
    if (emailTo) {
        try {
            await sendEmail({
                to: emailTo,
                subject: `Your quote #${id} is ready`,
                html: `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.5;color:#0f172a;">
  <h2 style="margin:0 0 12px 0;">Quote ready</h2>
  <p style="margin:0 0 12px 0;">Hi ${String(clientName).replace(/</g, '&lt;').replace(/>/g, '&gt;')}, your quote is ready.</p>
  <p style="margin:0 0 12px 0;"><strong>Quote ID:</strong> ${id}<br/>
  <strong>Total:</strong> $${total.toFixed(2)}</p>
  <p style="margin:0 0 12px 0;"><a href="${quoteUrl}">View your quote</a></p>
  <pre style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:10px;">${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</div>`,
            });
        } catch (e) {
            console.error('[Email] Quote send failed:', (e as any)?.message || e);
        }
    }

    const phone = String(quotation.clientPhone || '').trim();
    if (phone) {
        try {
            await sendWhatsAppMessage(phone, msg);
        } catch (e) {
            console.error('[WhatsApp] Quote send failed:', (e as any)?.message || e);
        }
    }

    revalidatePath(`/shops/${quotation.shopId}`);
    return { id, date };
}

export async function deleteQuotation(quoteId: string, shopId: string) {
    await supabase.from('quotations').delete().eq('id', quoteId);
    revalidatePath(`/shops/${shopId}`);
}

export async function triggerAutomatedReports(type: 'daily' | 'weekly') {
    const pulse = await getOracleMasterPulse();
    if (!pulse) return;

    const { finances, totalUnits, shopPerformance } = pulse;
    const label = type === 'daily' ? 'Daily Intelligence Brief' : 'Weekly Executive Summary';
    const period = type === 'daily' ? 'today' : 'this week';
    const shopRows = shopPerformance.map((s: any) => `${s.name}: $${s.revenue.toFixed(2)}`).join('\n');

    const body = `${label.toUpperCase()}
Generated: ${new Date().toLocaleString()}

FINANCIAL OVERVIEW (${period})
Revenue:      $${finances.revenue.toFixed(2)}
Gross Profit: $${finances.grossProfit.toFixed(2)}
Tax Collected:$${finances.tax.toFixed(2)}

INVENTORY
Total Units in Stock: ${totalUnits}

SHOP PERFORMANCE
${shopRows}

---
Oracle Master Intelligence — Automated Report`;

    try {
        await sendEmail({
            to: ORACLE_RECIPIENT,
            subject: `[${type.toUpperCase()}] ${label} — ${new Date().toLocaleDateString()}`,
            html: `<pre style="white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
        });
    } catch (e) {
        console.error('[Email] Oracle report send failed:', (e as any)?.message || e);
    }

    await supabase.from('oracle_emails').insert({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        recipient: ORACLE_RECIPIENT,
        subject: `[${type.toUpperCase()}] ${label}`,
        body,
        type: `automated_${type}`,
    });
}

export async function exportDatabase(): Promise<string> {
    const [
        { data: inventory },
        { data: allocations },
        { data: sales },
        { data: shops },
        { data: shipments },
        { data: employees },
        { data: ledger },
        { data: auditLog },
        { data: quotations },
        { data: transfers },
        { data: settings },
    ] = await Promise.all([
        supabaseAdmin.from('inventory_items').select('*'),
        supabaseAdmin.from('inventory_allocations').select('*'),
        supabaseAdmin.from('sales').select('*'),
        supabaseAdmin.from('shops').select('*'),
        supabaseAdmin.from('shipments').select('*'),
        supabaseAdmin.from('employees').select('*'),
        supabaseAdmin.from('ledger_entries').select('*'),
        supabaseAdmin.from('audit_log').select('*'),
        supabaseAdmin.from('quotations').select('*'),
        supabaseAdmin.from('transfers').select('*'),
        supabaseAdmin.from('oracle_settings').select('*').single(),
    ]);

    const snapshot = {
        exportedAt: new Date().toISOString(),
        inventory: inventory || [],
        allocations: allocations || [],
        sales: sales || [],
        shops: shops || [],
        shipments: shipments || [],
        employees: employees || [],
        ledger: ledger || [],
        auditLog: auditLog || [],
        quotations: quotations || [],
        transfers: transfers || [],
        settings: settings || {},
    };

    return JSON.stringify(snapshot, null, 2);
}

export async function getStockRequests() {
    const { data } = await supabaseAdmin
        .from('stock_requests')
        .select('*')
        .order('created_at', { ascending: false });
    return data || [];
}

export async function createStockRequest(request: {
    itemName: string;
    fromShopId: string;
    toShopId: string;
    quantity: number;
    requestedBy: string;
}) {
    const { data: inventory } = await supabaseAdmin
        .from('inventory_items')
        .select('*')
        .ilike('name', `%${request.itemName}%`)
        .limit(1);

    const item = inventory?.[0];

    await supabaseAdmin.from('stock_requests').insert({
        item_id: item?.id || request.itemName,
        item_name: request.itemName,
        from_shop_id: request.fromShopId,
        to_shop_id: request.toShopId,
        quantity: request.quantity,
        requested_by: request.requestedBy,
        status: 'pending'
    });

    revalidatePath('/transfers');
    return { success: true };
}

export async function updateStockRequestStatus(
    requestId: string,
    status: 'approved' | 'rejected' | 'completed',
    approvedBy: string
) {
    const { data: request } = await supabaseAdmin
        .from('stock_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (!request) throw new Error('Request not found');

    await supabaseAdmin.from('stock_requests').update({
        status,
        approved_by: approvedBy,
        updated_at: new Date().toISOString()
    }).eq('id', requestId);

    if (status === 'approved') {
        await supabaseAdmin.from('transfers').insert({
            item_id: request.item_id,
            from_shop_id: request.from_shop_id,
            to_shop_id: request.to_shop_id,
            quantity: request.quantity,
            status: 'pending',
            requested_by: request.requested_by
        });
    }

    revalidatePath('/transfers');
    return { success: true };
}

export async function recordLayby(layby: {
    shopId: string;
    items: any[];
    totalBeforeTax: number;
    tax: number;
    totalWithTax: number;
    deposit: number;
    clientName: string;
    clientPhone: string;
    employeeId: string;
}) {
    const id = Math.random().toString(36).substring(2, 9);
    const date = new Date().toISOString();

    // 1. Create the Lay-by record in quotations table
    await supabaseAdmin.from('quotations').insert({
        id,
        shop_id: layby.shopId,
        items: layby.items,
        total_before_tax: layby.totalBeforeTax,
        tax: layby.tax,
        total_with_tax: layby.totalWithTax,
        paid_amount: layby.deposit,
        client_name: layby.clientName,
        client_phone: layby.clientPhone,
        employee_id: layby.employeeId,
        date,
        status: 'layby'
    });

    // 2. Record the deposit in the ledger (Cash inflow)
    await supabaseAdmin.from('ledger_entries').insert({
        id: Math.random().toString(36).substring(2, 9),
        shop_id: layby.shopId,
        type: 'income',
        category: 'Lay-by Deposit',
        amount: layby.deposit,
        date,
        description: `Deposit for Lay-by #${id} - ${layby.clientName}`
    });

    // 3. Reserve Inventory (Reduce stock immediately)
    for (const item of layby.items) {
        if (item.itemId?.startsWith('service_')) continue;

        // Reduce Shop Allocation
        const { data: alloc } = await supabaseAdmin.from('inventory_allocations')
            .select('quantity')
            .eq('item_id', item.itemId)
            .eq('shop_id', layby.shopId)
            .single();

        if (alloc) {
            await supabaseAdmin.from('inventory_allocations')
                .update({ quantity: alloc.quantity - item.quantity })
                .eq('item_id', item.itemId)
                .eq('shop_id', layby.shopId);
        }

        // Reduce Global Stock
        const { data: invItem } = await supabaseAdmin.from('inventory_items')
            .select('quantity')
            .eq('id', item.itemId)
            .single();

        if (invItem) {
            await supabaseAdmin.from('inventory_items')
                .update({ quantity: invItem.quantity - item.quantity })
                .eq('id', item.itemId);
        }
    }

    revalidatePath(`/shops/${layby.shopId}`);
    revalidatePath('/inventory');
    return { id, date };
}

export async function updateLaybyPayment(laybyId: string, amount: number, shopId: string, employeeId: string) {
    const { data: layby } = await supabaseAdmin.from('quotations')
        .select('*')
        .eq('id', laybyId)
        .single();

    if (!layby || layby.status !== 'layby') throw new Error('Lay-by not found');

    const date = new Date().toISOString();
    const newPaidAmount = Number(layby.paid_amount || 0) + amount;
    const isFullyPaid = newPaidAmount >= Number(layby.total_with_tax);

    // 1. Update the Lay-by record
    await supabaseAdmin.from('quotations').update({
        paid_amount: newPaidAmount,
        status: isFullyPaid ? 'converted' : 'layby'
    }).eq('id', laybyId);

    // 2. Record payment in ledger
    await supabaseAdmin.from('ledger_entries').insert({
        id: Math.random().toString(36).substring(2, 9),
        shop_id: shopId,
        type: 'income',
        category: isFullyPaid ? 'Lay-by Final Payment' : 'Lay-by installment',
        amount: amount,
        date,
        description: `Payment for Lay-by #${laybyId} - ${layby.client_name}`
    });

    // 3. If fully paid, record as a Sale for reporting
    if (isFullyPaid) {
        // Record each item as a sale, but SKIP inventory reduction because it was reserved at start
        for (const item of (layby.items as any[])) {
            const saleId = Math.random().toString(36).substring(2, 9);
            await supabaseAdmin.from('sales').insert({
                id: saleId,
                shop_id: shopId,
                item_id: item.itemId,
                item_name: item.itemName,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                total_before_tax: (item.unitPrice * item.quantity),
                tax: (item.total - (item.unitPrice * item.quantity)),
                total_with_tax: item.total,
                date,
                employee_id: employeeId,
                client_name: layby.client_name,
                payment_method: 'cash' // Assuming cash for lay-by payments
            });
        }
    }

    revalidatePath(`/shops/${shopId}`);
    return { success: true, fullyPaid: isFullyPaid };
}
