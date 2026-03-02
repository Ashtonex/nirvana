"use server";

import { readDb, writeDb, Database, InventoryItem, Sale, Shipment, FinancialEntry, Quotation, Employee, AuditEntry, OracleEmail } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { resend, ORACLE_RECIPIENT } from "@/lib/resend";
import { supabase, supabaseAdmin } from "@/lib/supabase";

export async function getDashboardData() {
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
            tax: Number(s.tax || 0), date: s.date || new Date().toISOString(), employeeId: s.employee_id
        })),
        shops: (shops || []).map((sh: any) => ({
            id: sh.id, name: sh.name || "Unnamed Shop",
            expenses: sh.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 }
        })),
        quotations: (quotations || []).map((q: any) => ({
            id: q.id, shopId: q.shop_id, clientName: q.client_name || "Guest",
            totalWithTax: Number(q.total_with_tax || 0), status: q.status || 'pending',
            date: q.date || new Date().toISOString()
        })),
        employees: (employees || []).map((e: any) => ({
            id: e.id, name: e.name || "New Recruit", role: e.role || "sales", shopId: e.shop_id, active: Boolean(e.active)
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
}

export async function updateGlobalExpenses(expenses: Database['globalExpenses']) {
    await supabase.from('oracle_settings').update({ global_expenses: expenses }).eq('id', 1);
    await supabase.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toISOString(),
        employee_id: 'ADMIN', action: 'EXPENSES_UPDATED', details: `Updated global expenses`
    });
    const db = await readDb(); db.globalExpenses = expenses; await writeDb(db);
    revalidatePath("/"); revalidatePath("/finance");
}

export async function updateShopExpenses(shopId: string, expenses: { rent: number; salaries: number; utilities: number; misc: number }) {
    await supabase.from('shops').update({ expenses }).eq('id', shopId);
    await supabase.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9), timestamp: new Date().toISOString(),
        employee_id: 'ADMIN', action: 'SHOP_EXPENSES_UPDATED', details: `Shop: ${shopId}`
    });
    const db = await readDb(); const shop = db.shops.find(s => s.id === shopId);
    if (shop) { shop.expenses = expenses; await writeDb(db); }
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
    const totalShopExpenses = (shops || []).reduce((sum, shop) => sum + Object.values(shop.expenses || {}).reduce((a: number, b: any) => a + Number(b), 0), 0);

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
            const allocations = shops.map((shop, idx) => {
                const shopTotal = Object.values(shop.expenses || {}).reduce((a: number, b: any) => a + Number(b), 0);
                let allocatedQty = idx === shops.length - 1 ? itemData.quantity - allocatedSum : Math.floor(itemData.quantity * (shopTotal / totalShopExpenses));
                allocatedSum += allocatedQty;
                return { item_id: itemId, shop_id: shop.id, quantity: allocatedQty };
            }).filter(a => a.quantity > 0);
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

    await supabase.from('sales').insert({
        id: saleId, shop_id: sale.shopId, item_id: sale.itemId, item_name: sale.itemName,
        quantity: sale.quantity, unit_price: sale.unitPrice, total_before_tax: sale.totalBeforeTax,
        tax, total_with_tax: totalWithTax, date: timestamp, employee_id: sale.employeeId, client_name: sale.clientName
    });

    const { data: alloc } = await supabase.from('inventory_allocations').select('quantity').eq('item_id', sale.itemId).eq('shop_id', sale.shopId).single();
    if (alloc) await supabase.from('inventory_allocations').update({ quantity: Math.max(0, alloc.quantity - sale.quantity) }).eq('item_id', sale.itemId).eq('shop_id', sale.shopId);

    const { data: item } = await supabase.from('inventory_items').select('quantity, name').eq('id', sale.itemId).single();
    if (item) {
        const newQty = Math.max(0, item.quantity - sale.quantity);
        await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', sale.itemId);
        if (newQty <= 0) {
            try { await resend.emails.send({ from: "Oracle Alerts <alerts@nirvana-intel.com>", to: ORACLE_RECIPIENT, subject: `[ALERT] Stock Depleted: ${item.name}`, html: `<p>Product 0 units.</p>` }); } catch (e) { }
        }
    }

    await supabase.from('audit_log').insert({ id: Math.random().toString(36).substring(2, 9), timestamp, employee_id: sale.employeeId, action: 'SALE_RECORDED', details: sale.itemName });

    revalidatePath(`/shops/${sale.shopId}`); revalidatePath("/inventory");
}

export async function registerInventoryItem(item: { name: string, category: string, quantity: number, acquisitionPrice: number, landedCost: number }) {
    const id = Math.random().toString(36).substring(2, 9);
    const date_added = new Date().toISOString();
    await supabaseAdmin.from('inventory_items').insert({ id, ...item, date_added });
    revalidatePath("/inventory");
    return { id };
}

export async function updateInventoryItem(itemId: string, updates: any) {
    await supabaseAdmin.from('inventory_items').update(updates).eq('id', itemId);
    revalidatePath("/inventory");
}

export async function deleteInventoryItem(itemId: string) {
    await supabaseAdmin.from('inventory_items').delete().eq('id', itemId);
    revalidatePath("/inventory");
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
    const totalSold = (sales || []).filter(s => new Date(s.date) >= thirtyDaysAgo).reduce((acc, s) => acc + s.quantity, 0);
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
}

export async function addNewProductFromPos(productData: any) {
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    await supabase.from('inventory_items').insert({
        id, shipment_id: 'POS-AD-HOC', name: productData.name, category: productData.category,
        quantity: productData.initialStock || 0, acquisition_price: productData.landedCost, landed_cost: productData.landedCost, date_added: timestamp
    });
    await supabase.from('inventory_allocations').insert({ item_id: id, shop_id: productData.shopId, quantity: productData.initialStock || 0 });
    revalidatePath("/inventory"); revalidatePath(`/shops/${productData.shopId}`);
    return { id };
}

export async function getOracleMasterPulse() {
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*, inventory_allocations(*)');
    const { data: sales } = await supabaseAdmin.from('sales').select('*');
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    if (!inventory || !sales || !shops || !settings) return null;
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_with_tax), 0);
    const totalTax = sales.reduce((sum, s) => sum + Number(s.tax), 0);
    const grossProfit = sales.reduce((sum, s) => sum + Number(s.total_before_tax), 0) - sales.reduce((sum, s) => {
        const item = inventory.find(i => i.id === s.item_id);
        return sum + (item ? Number(item.landed_cost) * s.quantity : 0);
    }, 0);
    return {
        totalUnits: inventory.reduce((sum, i) => sum + i.quantity, 0),
        finances: { revenue: totalRevenue, tax: totalTax, grossProfit, netIncome: grossProfit, monthlyBurn: 0 },
        shopPerformance: shops.map(s => ({ id: s.id, name: s.name, revenue: sales.filter(sa => sa.shop_id === s.id).reduce((acc, sa) => acc + Number(sa.total_with_tax), 0), progress: 100 })),
        deadCapital: 0, zombieCount: 0, recentEmails: []
    };
}

export async function getZombieStockReport() {
    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('zombie_days').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');
    if (!inventory) return [];
    return inventory.filter(i => {
        const days = Math.floor((new Date().getTime() - new Date(i.date_added).getTime()) / (1000 * 3600 * 24));
        return days > (settings?.zombie_days || 60);
    }).map(i => ({ ...i, daysInStock: Math.floor((new Date().getTime() - new Date(i.date_added).getTime()) / (1000 * 3600 * 24)), deadCapital: Number(i.landed_cost) * i.quantity }));
}

export async function addEmployee(employee: any) {
    const id = Math.random().toString(36).substring(2, 9);
    await supabase.from('employees').insert({ id, name: employee.name, role: employee.role, shop_id: employee.shopId, active: true });
    revalidatePath("/employees");
}

export async function updateEmployee(id: string, updates: any) {
    const { shopId, ...rest } = updates;
    const supabaseUpdates = { ...rest, ...(shopId ? { shop_id: shopId } : {}) };
    await supabase.from('employees').update(supabaseUpdates).eq('id', id);
    revalidatePath("/employees");
}

export async function deleteEmployee(id: string) {
    await supabase.from('employees').delete().eq('id', id);
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
    await supabase.from('quotations').insert({ id, shop_id: quotation.shopId, items: quotation.items, total_before_tax: quotation.totalBeforeTax, tax: quotation.tax, total_with_tax: quotation.totalWithTax, client_name: quotation.clientName, employee_id: quotation.employeeId, date, status: 'pending' });
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

    await resend.emails.send({
        from: 'Oracle Reports <alerts@nirvana-intel.com>',
        to: ORACLE_RECIPIENT,
        subject: `[${type.toUpperCase()}] ${label} — ${new Date().toLocaleDateString()}`,
        text: body,
    });

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
