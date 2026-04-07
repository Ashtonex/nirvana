"use server";

import { Database, InventoryItem, Sale, Shipment, FinancialEntry, Quotation, Employee, AuditEntry, OracleEmail } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ORACLE_RECIPIENT } from "@/lib/resend";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { createHash, randomUUID } from "crypto";
import { sendEmail } from "@/lib/email";
import { sendWhatsAppMessage } from "@/lib/twilio";
import { cookies } from "next/headers";
import { computePosAuditReport } from "@/lib/posAudit";
import { createOperationsLedgerEntry } from "@/lib/operations";

function getPublicBaseUrl() {
    const url =
        process.env.NIRVANA_PUBLIC_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        '';
    return url ? String(url).replace(/\/$/, '') : '';
}

type ActorCtx =
    | { kind: "owner"; id: string; name: string; role: "owner" }
    | { kind: "staff"; id: string; name: string; role: string; shopId: string };

function isManagerRole(role: string | null | undefined) {
    const r = String(role || "").toLowerCase();
    return r === "owner" || r === "admin" || r === "manager" || r === "lead_manager" || r === "lead manager";
}

async function getActorFromCookies(): Promise<ActorCtx | null> {
    const cookieStore = await cookies();

    // Owner cookie is a simple privileged session in this app.
    const ownerToken = cookieStore.get("nirvana_owner")?.value;
    if (ownerToken) {
        return { kind: "owner", id: "owner-1", name: "Owner", role: "owner" };
    }

    const staffToken = cookieStore.get("nirvana_staff")?.value;

    // Supabase Auth (owner/admin accounts) - allow privileged actions even without the custom owner cookie.
    if (!staffToken) {
        const accessToken = cookieStore.get("sb-access-token")?.value;
        if (accessToken) {
            try {
                const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
                if (!error && data?.user?.id) {
                    const { data: emp } = await supabaseAdmin
                        .from("employees")
                        .select("id,name,surname,shop_id,role")
                        .eq("id", data.user.id)
                        .maybeSingle();

                    const role = String((emp as any)?.role || "");
                    if (isManagerRole(role)) {
                        const name = emp?.name ? `${emp.name || ""} ${emp.surname || ""}`.trim() : (data.user.email || "Admin");
                        const isOwnerLike = String(role).toLowerCase() === "owner" || String(role).toLowerCase() === "admin";
                        return isOwnerLike
                            ? { kind: "owner", id: data.user.id, name, role: "owner" }
                            : { kind: "staff", id: data.user.id, name, role, shopId: String((emp as any)?.shop_id || "") };
                    }
                }
            } catch { }
        }

        return null;
    }

    const tokenHash = createHash("sha256").update(staffToken).digest("hex");
    const { data: session } = await supabaseAdmin
        .from("staff_sessions")
        .select("employee_id, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

    if (!session) return null;
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;

    const { data: staff } = await supabaseAdmin
        .from("employees")
        .select("id,name,surname,shop_id,role,is_active,active")
        .eq("id", session.employee_id)
        .maybeSingle();

    if (!staff?.id) return null;
    const active = Boolean((staff as any).is_active ?? (staff as any).active ?? true);
    if (!active) return null;

    const name = `${staff.name || "Staff"} ${staff.surname || ""}`.trim();
    return { kind: "staff", id: staff.id, name, role: String(staff.role || "sales"), shopId: String(staff.shop_id || "") };
}

async function requireManagerOrOwner() {
    const actor = await getActorFromCookies();
    if (!actor) throw new Error("Unauthorized");
    if (actor.kind === "owner") return actor;
    if (!isManagerRole(actor.role)) throw new Error("Forbidden");
    return actor;
}

function getLaybyPaidAmountFromLedger(ledgerEntries: any[], laybyId: string): number {
    if (!laybyId) return 0;
    const needle = `lay-by #${String(laybyId).toLowerCase()}`;
    return (ledgerEntries || [])
        .filter((l: any) => {
            const category = String(l?.category || '');
            // Count Pending deposits + each Payment installment. DO NOT count 'Lay-by Completed' (it's the remaining balance already paid via Lay-by Payment)
            if (category !== 'Lay-by Pending' && category !== 'Lay-by Payment') return false;
            const description = String(l?.description || '').toLowerCase();
            return description.includes(needle);
        })
        .reduce((sum: number, l: any) => sum + Number(l?.amount || 0), 0);
}

export async function getDashboardData(daysLimit = 60) {
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
        const dateThreshold = new Date(Date.now() - daysLimit * 24 * 60 * 60 * 1000).toISOString();

        const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*').limit(10000);
        const { data: allocations } = await supabaseAdmin.from('inventory_allocations').select('*').limit(10000);
        const { data: sales } = await supabaseAdmin.from('sales').select('*').gte('date', dateThreshold).limit(20000);
        const { data: shops } = await supabaseAdmin.from('shops').select('*').limit(1000);
        const { data: quotations } = await supabaseAdmin.from('quotations').select('*').limit(10000);
        const { data: employees } = await supabaseAdmin.from('employees').select('*').limit(1000);
        const { data: shipments } = await supabaseAdmin.from('shipments').select('*').limit(5000);
        const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
        const { data: ledger } = await supabaseAdmin.from('ledger_entries').select('*').gte('date', dateThreshold).limit(20000);
        const { data: auditLog } = await supabaseAdmin.from('audit_log').select('*').limit(5000);
        const { data: transfers } = await supabaseAdmin.from('transfers').select('*').limit(5000);
        const { data: emails } = await supabaseAdmin.from('oracle_emails').select('*').limit(1000);

        const ledgerRows = ledger || [];

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
                const paidFromColumn = q.paid_amount;
                const paidAmount =
                    paidFromColumn === undefined || paidFromColumn === null
                        ? getLaybyPaidAmountFromLedger(ledgerRows, q.id)
                        : Number(paidFromColumn || 0);
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
                    paidAmount,
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
            ledger: (ledgerRows || []).map((l: any) => ({
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
    const saleId = Math.random().toString(36).substring(2, 9);
    
    // Support backlog sales with custom date
    const timestamp = sale.date ? new Date(sale.date).toISOString() : new Date().toISOString();

    await supabaseAdmin.from('sales').insert({
        id: saleId, shop_id: sale.shopId, item_id: sale.itemId, item_name: sale.itemName,
        quantity: sale.quantity, unit_price: sale.unitPrice, total_before_tax: subtotalAfterDiscount,
        tax, total_with_tax: totalWithTax, date: timestamp, employee_id: sale.employeeId, client_name: sale.clientName,
        payment_method: sale.paymentMethod || 'cash',
        discount_applied: discount
    });

    const isService = sale.itemId?.startsWith('service_');

    if (!isService) {
        // Use atomic DB functions to prevent race conditions from concurrent sales
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

        // Check if stock is depleted after the sale
        const { data: item } = await supabaseAdmin
            .from('inventory_items')
            .select('quantity, name')
            .eq('id', sale.itemId)
            .single();
            
        if (item && Number(item.quantity) <= 0) {
            try {
                await sendEmail({
                    to: ORACLE_RECIPIENT,
                    subject: `[ALERT] Stock Depleted: ${item.name}`,
                    html: `<p>Product has 0 units remaining.</p>`
                });
            } catch (e) {
                console.error('[Email] Stock depleted alert failed:', (e as any)?.message || e);
            }
        }
    }

    await supabaseAdmin.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9),
        timestamp,
        employee_id: sale.employeeId,
        action: 'SALE_RECORDED',
        details: `${sale.shopId}: ${sale.itemName} x${sale.quantity} ($${Number(totalWithTax).toFixed(2)})`
    });

    revalidatePath(`/shops/${sale.shopId}`);
    revalidatePath("/inventory");
    revalidatePath("/");
    revalidatePath("/intelligence");
    revalidatePath("/finance/oracle");
}

export async function recordUntrackedSale(sale: any) {
    const timestamp = sale.date ? new Date(sale.date).toISOString() : new Date().toISOString();
    const desiredQty = Math.max(1, Number(sale.quantity || 1));

    // Check if product exists by name in database
    const { data: existingItems } = await supabaseAdmin.from('inventory_items')
        .select('id, name')
        .ilike('name', String(sale.itemName || '').trim());

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
            // Create with enough stock to cover this sale, then the sale decrements back to 0.
            quantity: desiredQty,
            acquisition_price: 0,
            landed_cost: 0,
            date_added: timestamp
        });

        await supabaseAdmin.from('inventory_allocations').insert({
            item_id: itemId,
            shop_id: sale.shopId,
            quantity: desiredQty
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
        // Update the main inventory item
        const { error } = await supabaseAdmin.from('inventory_items').update(updates).eq('id', itemId);
        
        if (error) {
            console.error('[updateInventoryItem] Database error:', error);
            return { success: false, error: error.message };
        }

        // If quantity is being updated, also update all allocations for this item
        if (updates.quantity !== undefined) {
            const newQuantity = updates.quantity;
            
            // Get all allocations for this item
            const { data: allocations } = await supabaseAdmin
                .from('inventory_allocations')
                .select('*')
                .eq('item_id', itemId);
            
            if (allocations && allocations.length > 0) {
                // If setting quantity to 0, set all allocations to 0
                if (newQuantity === 0) {
                    for (const allocation of allocations) {
                        await supabaseAdmin
                            .from('inventory_allocations')
                            .update({ quantity: 0 })
                            .eq('item_id', itemId)
                            .eq('shop_id', allocation.shop_id);
                    }
                } else {
                    // Otherwise, distribute the new quantity proportionally
                    const totalAllocated = allocations.reduce((sum: number, a: any) => sum + (a.quantity || 0), 0);
                    
                    if (totalAllocated > 0) {
                        for (const allocation of allocations) {
                            const proportion = allocation.quantity / totalAllocated;
                            const newAllocationQty = Math.round(newQuantity * proportion);
                            
                            await supabaseAdmin
                                .from('inventory_allocations')
                                .update({ quantity: newAllocationQty })
                                .eq('item_id', itemId)
                                .eq('shop_id', allocation.shop_id);
                        }
                    }
                }
            }
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
        // First, get the item details before attempting to delete
        const { data: item } = await supabaseAdmin.from('inventory_items').select('name').eq('id', itemId).single();
        
        if (!item) {
            return { success: false, error: 'Item not found' };
        }

        // Check if there are any sales records for this item
        const { data: sales } = await supabaseAdmin.from('sales').select('id').eq('item_id', itemId).limit(1);
        
        if (sales && sales.length > 0) {
            return { 
                success: false, 
                error: `Cannot delete "${item.name}" because it has sales records. Items with transaction history cannot be deleted to maintain audit trails. Consider archiving or setting quantity to 0 instead.`
            };
        }

        // Delete associated allocations first
        await supabaseAdmin.from('inventory_allocations').delete().eq('item_id', itemId);

        // Now delete the inventory item
        const { error } = await supabaseAdmin.from('inventory_items').delete().eq('id', itemId);
        
        if (error) {
            console.error('[deleteInventoryItem] Database error:', error);
            return { success: false, error: error.message };
        }

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
        
        return { success: true, message: `${item.name} has been permanently deleted from inventory` };
    } catch (err: any) {
        console.error('[deleteInventoryItem] Error:', err);
        return { success: false, error: err.message };
    }
}

export async function recordStocktake(stocktakeData: any) {
    const actor = await requireManagerOrOwner();
    const timestamp = new Date().toISOString();
    const shopId = String(stocktakeData?.shopId || "").trim();
    if (!shopId) throw new Error("Missing shopId");

    if (actor.kind === "staff" && actor.shopId && actor.shopId !== shopId) {
        throw new Error("Forbidden");
    }

    const items = Array.isArray(stocktakeData?.items) ? stocktakeData.items : [];

    for (const record of items) {
        const itemId = String(record?.itemId || "").trim();
        if (!itemId) continue;

        const physicalQuantity = Math.max(0, Number(record?.physicalQuantity || 0));

        const { data: item } = await supabaseAdmin
            .from('inventory_items')
            .select('id,name,quantity,landed_cost')
            .eq('id', itemId)
            .maybeSingle();

        const { data: alloc } = await supabaseAdmin
            .from('inventory_allocations')
            .select('item_id,shop_id,quantity')
            .eq('item_id', itemId)
            .eq('shop_id', shopId)
            .maybeSingle();

        if (!item || !alloc) continue;

        const systemQty = Number(alloc.quantity || 0);
        const diff = physicalQuantity - systemQty;
        if (diff === 0) continue;

        await supabaseAdmin
            .from('inventory_allocations')
            .update({ quantity: physicalQuantity })
            .eq('item_id', itemId)
            .eq('shop_id', shopId);

        const globalQty = Number(item.quantity || 0);
        const nextGlobal = (globalQty - systemQty) + physicalQuantity;
        await supabaseAdmin.from('inventory_items').update({ quantity: nextGlobal }).eq('id', itemId);

        const landed = Number((item as any).landed_cost || 0);
        const adjustmentValue = Math.abs(diff) * landed;
        if (Number.isFinite(adjustmentValue) && adjustmentValue > 0) {
            await supabaseAdmin.from('ledger_entries').insert({
                id: Math.random().toString(36).substring(2, 9),
                shop_id: shopId,
                type: diff < 0 ? 'expense' : 'income',
                category: 'Stock Adjustment',
                amount: adjustmentValue,
                date: timestamp,
                description: `${diff < 0 ? 'Shrinkage' : 'Surplus'}: ${item.name || itemId} ${systemQty} -> ${physicalQuantity} (delta ${diff})`
            });
        }

        await supabaseAdmin.from('audit_log').insert({
            id: Math.random().toString(36).substring(2, 9),
            timestamp,
            employee_id: actor.id,
            action: 'STOCKTAKE_ADJUSTMENT',
            details: `${shopId}: ${item.name || itemId} ${systemQty} -> ${physicalQuantity} (delta ${diff}) by ${actor.name}`
        });
    }

    revalidatePath("/inventory");
    revalidatePath(`/shops/${shopId}`);
    revalidatePath("/admin/audit");
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
    const name = String(productData?.name || '').trim();
    const category = String(productData?.category || 'General').trim() || 'General';
    const landedCost = Number(productData?.landedCost || 0);
    const shopId = String(productData?.shopId || '').trim();
    const initialStock = Math.max(0, Number(productData?.initialStock || 0));

    if (!name) throw new Error("Missing product name");
    if (!shopId) throw new Error("Missing shopId");

    const timestamp = new Date().toISOString();

    // If the product already exists (case-insensitive exact match), do not create duplicates.
    const { data: existingMatches } = await supabaseAdmin
        .from('inventory_items')
        .select('id, quantity, name, category, landed_cost')
        .ilike('name', name)
        .limit(5);

    const existingList = existingMatches || [];
    const existing = existingList.find((i: any) => String(i.name || '').toLowerCase() === name.toLowerCase()) || existingList[0];

    const id = existing?.id || Math.random().toString(36).substring(2, 9);
    const createdNew = !existing?.id;

    if (createdNew) {
        await supabaseAdmin.from('inventory_items').insert({
            id,
            shipment_id: 'POS-AD-HOC',
            name,
            category,
            quantity: initialStock,
            acquisition_price: landedCost,
            landed_cost: landedCost,
            date_added: timestamp
        });
    } else if (initialStock > 0) {
        await supabaseAdmin
            .from('inventory_items')
            .update({ quantity: Number(existing.quantity || 0) + initialStock })
            .eq('id', id);
    }

    // Ensure shop allocation exists and is incremented when adding stock from POS.
    const { data: alloc } = await supabaseAdmin
        .from('inventory_allocations')
        .select('quantity')
        .eq('item_id', id)
        .eq('shop_id', shopId)
        .maybeSingle();

    if (!alloc) {
        await supabaseAdmin.from('inventory_allocations').insert({
            item_id: id,
            shop_id: shopId,
            quantity: initialStock
        });
    } else if (initialStock > 0) {
        await supabaseAdmin
            .from('inventory_allocations')
            .update({ quantity: Number(alloc.quantity || 0) + initialStock })
            .eq('item_id', id)
            .eq('shop_id', shopId);
    }

    const totalCost = initialStock * landedCost;
    if (totalCost > 0) {
        await supabaseAdmin.from('ledger_entries').insert([{
            id: Math.random().toString(36).substring(2, 9),
            type: 'asset',
            category: 'Inventory Acquisition',
            amount: totalCost,
            date: timestamp,
            description: `Ad-Hoc POS Addition: ${name}`
        }]);
    }
    revalidatePath("/inventory");
    revalidatePath("/");
    revalidatePath(`/shops/${shopId}`);

    return {
        id,
        name: existing?.name || name,
        category: existing?.category || category,
        landedCost: Number(existing?.landed_cost || landedCost),
        createdNew,
        addedStock: initialStock,
    };
}

export async function openCashRegister(shopId: string, expectedAmount: number, actualAmount: number) {
    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);
    const actor = await getActorFromCookies().catch(() => null);

    // Log the actual opening amount as an asset
    await supabaseAdmin.from('ledger_entries').insert([{
        id,
        shop_id: shopId,
        type: 'asset',
        category: 'Cash Drawer Opening',
        amount: actualAmount,
        date: timestamp,
        description: `Register Opened - Expected: $${expectedAmount.toFixed(2)} | Actual: $${actualAmount.toFixed(2)}`,
        employee_id: actor?.id || "SYSTEM"
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
            description: `Register ${discrepancy < 0 ? 'Short' : 'Over'} by $${Math.abs(discrepancy).toFixed(2)}`,
            employee_id: actor?.id || "SYSTEM"
        }]);
    }

    // Audit trail (best-effort)
    try {
        await supabaseAdmin.from("audit_log").insert({
            id: Math.random().toString(36).substring(2, 9),
            timestamp,
            employee_id: actor?.id || "SYSTEM",
            action: "CASH_DRAWER_OPENED",
            details: `${shopId}: opening $${Number(actualAmount).toFixed(2)} (expected $${Number(expectedAmount).toFixed(2)}) by ${actor?.name || "SYSTEM"}`
        });
    } catch { }

    revalidatePath(`/shops/${shopId}`);
}

export async function getCashDrawerOpening(shopId: string, dateYYYYMMDD: string) {
    const actor = await requireManagerOrOwner();
    const shop = String(shopId || "").trim();
    const day = String(dateYYYYMMDD || "").trim();
    if (!shop) throw new Error("Missing shopId");
    if (!day) throw new Error("Missing date");

    const since = `${day}T00:00:00.000Z`;
    const until = `${day}T23:59:59.999Z`;

    if (actor.kind === "staff" && actor.shopId && actor.shopId !== shop) {
        throw new Error("Forbidden");
    }

    const { data } = await supabaseAdmin
        .from("ledger_entries")
        .select("id, amount, date, description, category, shop_id")
        .eq("shop_id", shop)
        .eq("category", "Cash Drawer Opening")
        .gte("date", since)
        .lte("date", until)
        .order("date", { ascending: true })
        .limit(1);

    const entry = (data || [])[0] || null;
    return { entry };
}

export async function updateCashDrawerOpening(input: {
    shopId: string;
    dateYYYYMMDD: string;
    newAmount: number;
    reason?: string;
}) {
    const actor = await requireManagerOrOwner();
    const shopId = String(input?.shopId || "").trim();
    const day = String(input?.dateYYYYMMDD || "").trim();
    const newAmount = Number(input?.newAmount);
    const reason = String(input?.reason || "").trim();

    if (!shopId) throw new Error("Missing shopId");
    if (!day) throw new Error("Missing date");
    if (!Number.isFinite(newAmount) || newAmount < 0) throw new Error("Invalid amount");

    if (actor.kind === "staff" && actor.shopId && actor.shopId !== shopId) {
        throw new Error("Forbidden");
    }

    const since = `${day}T00:00:00.000Z`;
    const until = `${day}T23:59:59.999Z`;

    const { data: existing } = await supabaseAdmin
        .from("ledger_entries")
        .select("id, amount, date, description")
        .eq("shop_id", shopId)
        .eq("category", "Cash Drawer Opening")
        .gte("date", since)
        .lte("date", until)
        .order("date", { ascending: true })
        .limit(1);

    const row = (existing || [])[0] || null;
    const timestamp = new Date().toISOString();

    if (!row) {
        const id = Math.random().toString(36).substring(2, 9);
        await supabaseAdmin.from("ledger_entries").insert({
            id,
            shop_id: shopId,
            type: "asset",
            category: "Cash Drawer Opening",
            amount: newAmount,
            date: `${day}T00:00:00.000Z`,
            description: `Opening set by ${actor.name}${reason ? ` | Reason: ${reason}` : ""}`
        });

        await supabaseAdmin.from("audit_log").insert({
            id: Math.random().toString(36).substring(2, 9),
            timestamp,
            employee_id: actor.id,
            action: "CASH_DRAWER_OPENING_SET",
            details: `${shopId}: opening set to $${newAmount.toFixed(2)} for ${day} by ${actor.name}${reason ? ` (reason: ${reason})` : ""}`
        });

        revalidatePath(`/shops/${shopId}`);
        revalidatePath("/admin/audit");
        return { success: true, created: true };
    }

    const oldAmount = Number(row.amount || 0);
    const descBase = String(row.description || "").trim();
    const patchNote = `| corrected $${oldAmount.toFixed(2)} -> $${newAmount.toFixed(2)} by ${actor.name} (${actor.id}) @ ${timestamp}${reason ? ` | ${reason}` : ""}`;
    const nextDesc = descBase ? `${descBase} ${patchNote}` : patchNote;

    await supabaseAdmin
        .from("ledger_entries")
        .update({ amount: newAmount, description: nextDesc })
        .eq("id", row.id);

    await supabaseAdmin.from("audit_log").insert({
        id: Math.random().toString(36).substring(2, 9),
        timestamp,
        employee_id: actor.id,
        action: "CASH_DRAWER_OPENING_CORRECTED",
        details: `${shopId}: opening corrected $${oldAmount.toFixed(2)} -> $${newAmount.toFixed(2)} for ${day} by ${actor.name}${reason ? ` (reason: ${reason})` : ""}`
    });

    revalidatePath(`/shops/${shopId}`);
    revalidatePath("/admin/audit");
    return { success: true, created: false, oldAmount, newAmount };
}

export async function getPosAuditReport(input: { shopId: string; dateYYYYMMDD: string }) {
    const actor = await requireManagerOrOwner();
    const shopId = String(input?.shopId || "").trim();
    const day = String(input?.dateYYYYMMDD || "").trim();

    if (!shopId) throw new Error("Missing shopId");
    if (!day) throw new Error("Missing date");

    if (actor.kind === "staff" && actor.shopId && actor.shopId !== shopId) {
        throw new Error("Forbidden");
    }

    return computePosAuditReport({ shopId, dateYYYYMMDD: day });
}

export async function recordPosExpense(
    shopId: string, 
    amount: number, 
    description: string, 
    employeeId: string,
    options?: {
        toInvest?: boolean;
        toOperations?: boolean;
        date?: string;
    }
) {
    const timestamp = options?.date ? new Date(options.date).toISOString() : new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);
    const descLower = String(description || "").toLowerCase();

    // Auto-detect perfume expenses
    const isPerfumeExpense = descLower.includes("perfume") || descLower.includes("parfum");
    
    // Auto-detect overhead expenses (rent, utilities, etc.)
    const overheadKeywords = ["rent", "utilities", "utility", "electric", "electricity", "water", "internet", "wifi", "rates", "rates", "municipal", "insurance", "security", "cleaning", "maintenance", "repair", "overhead", "salary", "wages", "staff", "payroll"];
    const isOverheadExpense = overheadKeywords.some(kw => descLower.includes(kw));

    // Auto-detect tithe expenses
    const titheKeywords = ["tithe", "tithes", "offering", "church", "donation", "charity", "10%", "ten percent"];
    const isTitheExpense = titheKeywords.some(kw => descLower.includes(kw));

    // Auto-detect groceries expenses
    const groceriesKeywords = ["groceries", "grocery", "food", "supermarket", "provisions", "sundries", "rice", "sugar", "cooking oil", "flour", "bread", "milk", "eggs", "meat", "vegetables", "fruits", "snacks", "drinks", "beverages"];
    const isGroceriesExpense = groceriesKeywords.some(kw => descLower.includes(kw));

    // Log expense to ledger
    const ledgerEntry = await supabaseAdmin.from('ledger_entries').insert([{
        id,
        shop_id: shopId,
        type: 'expense',
        category: isPerfumeExpense ? 'Perfume' : isOverheadExpense ? 'Overhead' : isTitheExpense ? 'Tithe' : isGroceriesExpense ? 'Groceries' : 'POS Expense',
        amount: amount,
        date: timestamp,
        description: description,
        employee_id: employeeId
    }]);

    // Auto-create Invest deposit for perfume expenses (both deduct from drawer AND post to invest)
    // Perfume purchases are tracked as both an expense AND an investment
    if (isPerfumeExpense || options?.toInvest) {
        await supabaseAdmin.from('invest_deposits').insert({
            shop_id: shopId,
            amount: amount,
            deposited_by: employeeId,
        });
    }

    // Auto-create Operations entry for overhead expenses OR if manually toggled
    // IMPORTANT: EOD deposits (from Post to Ops) should NOT affect drift - only overhead balances may cause drift
    if (options?.toOperations || isOverheadExpense) {
        const opsKind = isOverheadExpense ? "overhead_payment" : "eod_deposit";
        
        // Insert to ledger
        await supabaseAdmin.from('operations_ledger').insert({
            amount: amount,
            kind: opsKind,
            shop_id: shopId,
            title: description,
            notes: `Auto-routed from POS expense: ${isOverheadExpense ? 'Overhead' : 'Manual'}`,
            employee_id: employeeId,
            effective_date: new Date().toISOString().split('T')[0],
        });
        
        // ALSO update the actual balance in operations_state
        // This ensures posting from POS doesn't create fake drift
        if (!isOverheadExpense) {
            // EOD deposit - update actual balance
            const { data: currentState } = await supabaseAdmin
                .from('operations_state')
                .select('actual_balance')
                .eq('id', 1)
                .maybeSingle();
            
            const newBalance = Number(currentState?.actual_balance || 0) + amount;
            await supabaseAdmin
                .from('operations_state')
                .upsert({ 
                    id: 1, 
                    actual_balance: newBalance, 
                    updated_at: new Date().toISOString() 
                });
        }
    }

    // Log to audit trail with full details
    await supabaseAdmin.from('audit_log').insert([{
        id: Math.random().toString(36).substring(2, 9),
        action: 'record_pos_expense',
        shop_id: shopId,
        employee_id: employeeId,
        details: { 
            amount, 
            description, 
            toInvest: isPerfumeExpense || options?.toInvest, 
            toOperations: options?.toOperations || isOverheadExpense,
            isPerfume: isPerfumeExpense,
            isOverhead: isOverheadExpense,
            kind: isOverheadExpense ? "overhead_payment" : "eod_deposit"
        },
        timestamp
    }]);

    revalidatePath(`/shops/${shopId}`);
    revalidatePath('/');
    revalidatePath('/intelligence');
    revalidatePath('/operations');
    revalidatePath('/invest');
    revalidatePath('/finance/oracle');
    revalidatePath('/admin/pos-audit');
}

export async function recordTitheWithdrawal(
    shopId: string,
    amount: number,
    description: string,
    employeeId: string
) {
    const timestamp = new Date().toISOString();
    const id = Math.random().toString(36).substring(2, 9);

    await supabaseAdmin.from('ledger_entries').insert([{
        id,
        shop_id: shopId,
        type: 'transfer', // Using transfer since it's just moving money out of a virtual pile
        category: 'Tithe Withdrawal',
        amount: amount,
        date: timestamp,
        description: description || "Tithe Withdrawal",
        employee_id: employeeId
    }]);

    await supabaseAdmin.from('audit_log').insert([{
        id: Math.random().toString(36).substring(2, 9),
        action: 'record_tithe_withdrawal',
        shop_id: shopId,
        employee_id: employeeId,
        details: { amount, description },
        timestamp
    }]);

    revalidatePath(`/shops/${shopId}`);
    revalidatePath('/');
    revalidatePath('/finance/oracle');
}


export async function getOracleMasterPulse(daysLimit = 60) {
    const dateThreshold = new Date(Date.now() - daysLimit * 24 * 60 * 60 * 1000).toISOString();

    const { data: settings } = await supabaseAdmin.from('oracle_settings').select('*').single();
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*, inventory_allocations(*)');
    const { data: sales } = await supabaseAdmin.from('sales').select('*').gte('date', dateThreshold);
    const { data: shops } = await supabaseAdmin.from('shops').select('*');
    const { data: ledger } = await supabaseAdmin.from('ledger_entries').select('*').gte('date', dateThreshold);
    const { data: investDeposits } = await supabaseAdmin.from('invest_deposits').select('*').gte('created_at', dateThreshold);
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

    const calculateShopOverheadTarget = (shopId: string) => {
        const shopExpenses = shops?.find((s: any) => s.id === shopId)?.expenses || {};
        return Object.values(shopExpenses).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
    };

    const calculateShopExpenses = (shopId: string) => {
        const structuredExpenses = Object.values(
            shops?.find((s: any) => s.id === shopId)?.expenses || {}
        ).reduce((acc: number, val: any) => acc + Number(val || 0), 0);
        
        const ledgerExpenses = (ledger || [])
            .filter((l: any) => l.shop_id === shopId && l.type === 'expense')
            .reduce((acc: number, l: any) => acc + Number(l.amount || 0), 0);
        
        return structuredExpenses + ledgerExpenses;
    };

    const calculateShopInvestDeposits = (shopId: string) => {
        return (investDeposits || [])
            .filter((d: any) => d.shop_id === shopId)
            .reduce((acc: number, d: any) => acc + Number(d.amount || 0), 0);
    };

    return {
        totalUnits: inventory.reduce((sum: number, i: any) => sum + i.quantity, 0),
        categoryBreakdown,
        finances: { revenue: totalRevenue, tax: totalTax, grossProfit, netIncome: grossProfit, monthlyBurn: 0 },
        shopPerformance: (shops || []).map((s: any) => {
            const shopRevenue = (sales || [])
                .filter((sa: any) => sa.shop_id === s.id)
                .reduce((acc: number, sa: any) => acc + Number(sa.total_with_tax), 0);
            
            const overheadTarget = calculateShopOverheadTarget(s.id);
            const perfumeDeposits = calculateShopInvestDeposits(s.id);
            const coverageAmount = shopRevenue + perfumeDeposits;
            const progress = overheadTarget > 0 ? (coverageAmount / overheadTarget) * 100 : 100;
            
            return {
                id: s.id,
                name: s.name,
                revenue: shopRevenue,
                expenses: overheadTarget,
                deposits: perfumeDeposits,
                progress
            };
        }),
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
    await requireManagerOrOwner();

    const { data: fromAlloc, error: fromError } = await supabaseAdmin
        .from('inventory_allocations')
        .select('quantity')
        .eq('item_id', itemId)
        .eq('shop_id', fromShopId)
        .maybeSingle();

    if (fromError) throw new Error(fromError.message);
    if (!fromAlloc || Number(fromAlloc.quantity || 0) < quantity) throw new Error("Insufficient stock");

    const newFromQty = Number(fromAlloc.quantity || 0) - quantity;
    const updFrom = await supabaseAdmin
        .from('inventory_allocations')
        .update({ quantity: newFromQty })
        .eq('item_id', itemId)
        .eq('shop_id', fromShopId);

    if (updFrom.error) throw new Error(updFrom.error.message);

    const { data: toAlloc, error: toError } = await supabaseAdmin
        .from('inventory_allocations')
        .select('quantity')
        .eq('item_id', itemId)
        .eq('shop_id', toShopId)
        .maybeSingle();

    if (toError) throw new Error(toError.message);

    if (toAlloc) {
        const updTo = await supabaseAdmin
            .from('inventory_allocations')
            .update({ quantity: Number(toAlloc.quantity || 0) + quantity })
            .eq('item_id', itemId)
            .eq('shop_id', toShopId);
        if (updTo.error) throw new Error(updTo.error.message);
    } else {
        const insTo = await supabaseAdmin
            .from('inventory_allocations')
            .insert({ item_id: itemId, shop_id: toShopId, quantity });
        if (insTo.error) throw new Error(insTo.error.message);
    }

    revalidatePath("/transfers");
}

export async function postDrawerToOperations(input: { shopId: string; amount: number; notes?: string; kind?: string }) {
    const actor = await requireManagerOrOwner();
    const shopId = String(input?.shopId || "").trim();
    const amount = Number(input?.amount);
    const notes = input?.notes ? String(input.notes) : "";
    const kind = input?.kind || "eod_deposit";

    if (!shopId) throw new Error("Missing shopId");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");

    if (actor.kind === "staff" && actor.shopId && actor.shopId !== shopId) {
        throw new Error("Forbidden");
    }

    const timestamp = new Date().toISOString();
    const dayStamp = timestamp.split("T")[0];

    const drawerLedgerId = Math.random().toString(36).substring(2, 9);
    await supabaseAdmin.from("ledger_entries").insert([{
        id: drawerLedgerId,
        shop_id: shopId,
        type: "transfer",
        category: "Operations Transfer",
        amount,
        date: timestamp,
        description: `Posted to Operations (${kind === "overhead_contribution" ? "Overhead" : "EOD"})${notes ? ` | ${notes}` : ""}`,
        employee_id: actor.id
    }]);

    await createOperationsLedgerEntry({
        amount,
        kind,
        shopId,
        title: `Drawer → Operations (${shopId})`,
        notes: notes || null,
        effectiveDate: dayStamp,
        employeeId: actor.kind === "staff" ? actor.id : null,
        metadata: {
            source: "pos",
            drawerLedgerId
        }
    });

    // Revalidate the key surfaces
    revalidatePath(`/shops/${shopId}`);
    revalidatePath("/operations");
    revalidatePath("/logic");
    revalidatePath("/intelligence");

    return { success: true, drawerLedgerId };
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
    approvedBy?: string
) {
    const actor = await requireManagerOrOwner();
    const approverId = actor.id || approvedBy || "owner";

    const { data: request } = await supabaseAdmin
        .from('stock_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (!request) throw new Error('Request not found');

    await supabaseAdmin.from('stock_requests').update({
        status,
        approved_by: approverId,
        updated_at: new Date().toISOString()
    }).eq('id', requestId);

    if (status === 'approved') {
        await supabaseAdmin.from('transfers').insert({
            item_id: request.item_id,
            from_shop_id: request.from_shop_id,
            to_shop_id: request.to_shop_id,
            quantity: request.quantity,
            status: 'pending',
            requested_by: request.requested_by,
            approved_by: approverId,
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
    console.log('[recordLayby] Starting with:', JSON.stringify({ shopId: layby.shopId, itemCount: layby.items?.length, deposit: layby.deposit }));

    try {
        const id = Math.random().toString(36).substring(2, 9);
        const date = new Date().toISOString();

        if (!layby.items || layby.items.length === 0) {
            return { error: "Lay-by requires at least one item" };
        }

        for (const item of layby.items) {
            if (!item.itemId || String(item.itemId).startsWith('service_') || String(item.itemId).startsWith('adhoc')) continue;
            const itemIdStr = String(item.itemId);
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(itemIdStr)) continue;
            const qty = Math.max(1, Number(item.quantity || 0));
            const { data: alloc, error: allocErr } = await supabaseAdmin
                .from('inventory_allocations')
                .select('quantity')
                .eq('item_id', item.itemId)
                .eq('shop_id', layby.shopId)
                .maybeSingle();

            if (allocErr) {
                console.error('[recordLayby] Stock check failed:', allocErr);
                return { error: `Stock check failed: ${allocErr.message}` };
            }

            if (!alloc || Number(alloc.quantity || 0) < qty) {
                return { error: `Insufficient stock for lay-by: ${item.itemName || item.itemId}` };
            }
        }

        console.log('[recordLayby] Stock check passed, creating quotation...');

        const base: any = {
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
        };

        const working: any = { ...base };
        let inserted = false;
        for (let attempt = 0; attempt < 6; attempt++) {
            const res = await supabaseAdmin.from('quotations').insert(working);
            if (!res.error) {
                inserted = true;
                console.log('[recordLayby] Quotation created successfully:', id);
                break;
            }

            const msg = res.error.message || '';
            const m1 = msg.match(/Could not find the '([^']+)' column/i);
            const m2 = msg.match(/column "([^"]+)" of relation "quotations" does not exist/i);
            const missing = (m1 && m1[1]) || (m2 && m2[1]);
            if (missing && Object.prototype.hasOwnProperty.call(working, missing)) {
                console.log(`[recordLayby] Dropping missing column: ${missing}, retrying...`);
                delete working[missing];
                continue;
            }
            console.error('[recordLayby] Quotation insert failed:', res.error);
            return { error: res.error.message };
        }
        if (!inserted) return { error: 'Failed to create lay-by record' };

        console.log('[recordLayby] Decrementing inventory...');

        for (const item of layby.items) {
            if (!item.itemId || String(item.itemId).startsWith('service_') || String(item.itemId).startsWith('adhoc')) continue;

            const itemIdStr = String(item.itemId);
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(itemIdStr)) continue;

            const qty = Math.max(1, Number(item.quantity || 0));

            const decAlloc = await supabaseAdmin.rpc('decrement_allocation', {
                item_id: item.itemId,
                shop_id: layby.shopId,
                qty
            });
            if (decAlloc.error) {
                console.error('[recordLayby] decrement_allocation RPC failed:', decAlloc.error);
                return { error: `Failed to reserve stock: ${decAlloc.error.message}` };
            }

            const decInv = await supabaseAdmin.rpc('decrement_inventory', {
                item_id: item.itemId,
                qty
            });
            if (decInv.error) {
                console.error('[recordLayby] decrement_inventory RPC failed:', decInv.error);
                return { error: `Failed to update inventory: ${decInv.error.message}` };
            }
        }

        console.log('[recordLayby] Recording ledger entry...');
        const ledgerRes = await supabaseAdmin.from('ledger_entries').insert({
            id: Math.random().toString(36).substring(2, 9),
            shop_id: layby.shopId,
            type: 'income',
            category: 'Lay-by Deposit',
            amount: layby.deposit,
            date,
            description: `Deposit for Lay-by #${id} - ${layby.clientName} (Balance: $${(layby.totalWithTax - layby.deposit).toFixed(2)})`
        });

        if (ledgerRes.error) {
            console.error('[recordLayby] Ledger insert failed:', ledgerRes.error);
            return { error: `Failed to record deposit: ${ledgerRes.error.message}` };
        }

        // --- NEW: Record Deposit as a Sale for Day 1 Revenue ---
        const saleId = Math.random().toString(36).substring(2, 9);
        await supabaseAdmin.from('sales').insert({
            id: saleId,
            shop_id: layby.shopId,
            item_id: `layby_dep_${id}`,
            item_name: `[LAYBY DEPOSIT] #${id}`,
            quantity: 1,
            unit_price: layby.deposit,
            total_before_tax: layby.deposit / 1.155, // Reverse calculate tax if mode is all
            tax: layby.deposit - (layby.deposit / 1.155),
            total_with_tax: layby.deposit,
            date,
            employee_id: layby.employeeId,
            client_name: layby.clientName,
            payment_method: 'cash',
            discount_applied: 0
        });

        console.log('[recordLayby] Success! ID:', id);
        return { id, date };
    } catch (e: any) {
        console.error('[recordLayby] CRITICAL ERROR:', e?.message || e);
        return { error: e?.message || 'Unknown error' };
    }
}

export async function updateLaybyPayment(laybyId: string, amount: number, shopId: string, employeeId: string) {
    const { data: layby } = await supabaseAdmin.from('quotations')
        .select('*')
        .eq('id', laybyId)
        .single();

    if (!layby || layby.status !== 'layby') throw new Error('Lay-by not found');

    const date = new Date().toISOString();

    // 1. Record each payment installment as income (counted in daily sales)
    await supabaseAdmin.from('ledger_entries').insert({
        id: Math.random().toString(36).substring(2, 9),
        shop_id: shopId,
        type: 'income',
        category: 'Lay-by Payment',
        amount: amount,
        date,
        description: `Payment for Lay-by #${laybyId} - ${layby.client_name}`
    });

    // --- NEW: Record Installment as a Sale for Daily Revenue ---
    const instSaleId = Math.random().toString(36).substring(2, 9);
    await supabaseAdmin.from('sales').insert({
        id: instSaleId,
        shop_id: shopId,
        item_id: `layby_pmt_${laybyId}`,
        item_name: `[LAYBY PAYMENT] #${laybyId}`,
        quantity: 1,
        unit_price: amount,
        total_before_tax: amount / 1.155,
        tax: amount - (amount / 1.155),
        total_with_tax: amount,
        date,
        employee_id: employeeId,
        client_name: layby.client_name,
        payment_method: 'cash',
        discount_applied: 0
    });

    // 2. Compute paid amount
    let newPaidAmount = Number(layby.paid_amount || 0) + amount;
    let isFullyPaid = newPaidAmount >= Number(layby.total_with_tax);

    // 3. Update the lay-by record
    const updateWorking: any = {
        paid_amount: newPaidAmount,
        status: isFullyPaid ? 'converted' : 'layby'
    };

    for (let attempt = 0; attempt < 4; attempt++) {
        const res = await supabaseAdmin.from('quotations').update(updateWorking).eq('id', laybyId);
        if (!res.error) break;

        const msg = res.error.message || '';
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" of relation "quotations" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]);
        if (missing && Object.prototype.hasOwnProperty.call(updateWorking, missing)) {
            delete updateWorking[missing];
            continue;
        }
        throw new Error(res.error.message);
    }

    // 4. On final completion: record the products as a sale for the REMAINING balance only
    if (isFullyPaid) {
        const totalWithTax = Number(layby.total_with_tax || 0);
        const previousPayments = Number(layby.paid_amount || 0); // Note: 'amount' was just added to newPaidAmount above
        const finalPayment = totalWithTax - previousPayments;

        // Record remaining balance as completed sale income (already recorded above as a payment sale if it was an installment)
        // Wait, if it was an installment that pushed it to 'isFullyPaid', we ALREADY recorded the 'amount' as a sale above.
        // So we don't need to record it again.
        
        // However, we WANT the items to show up in the sales list for the final day.
        // We will record the items with prices that sum up to the TOTAL with tax, 
        // but we need to subtract the 'Deposit' and 'Previous Payments' from the day's revenue total?
        // No, let's keep it simple: 
        // We already recorded the CASH received as sales (Deposit, Payment).
        // On completion, we'll record the ITEMS with a price of $0? No, that's not good for reporting.
        
        // ACTUALLY, the user said: "when the layby is settled the rest of the money is again included settlements day sales"
        // If we record the ITEMS on the settlement day, we should set their price to the TOTAL - DEPOSIT - PREV_PAYMENTS.
        
        const items = (layby.items as any[]);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const saleId = Math.random().toString(36).substring(2, 9);
            
            // Pro-rate the final payment across items
            // This ensures the Day 10 Sales Total = Final Payment Amount
            const itemOriginalTotal = item.total || (item.unitPrice * item.quantity);
            const proportion = itemOriginalTotal / totalWithTax;
            const itemContributionToFinalPayment = finalPayment * proportion;

            await supabaseAdmin.from('sales').insert({
                id: saleId,
                shop_id: shopId,
                item_id: item.itemId,
                item_name: item.itemName,
                quantity: item.quantity,
                unit_price: itemContributionToFinalPayment / item.quantity,
                total_before_tax: itemContributionToFinalPayment / 1.155,
                tax: itemContributionToFinalPayment - (itemContributionToFinalPayment / 1.155),
                total_with_tax: itemContributionToFinalPayment,
                date,
                employee_id: employeeId,
                client_name: layby.client_name,
                payment_method: 'cash',
                discount_applied: 0
            });
        }
    }

    revalidatePath(`/shops/${shopId}`);
    return { success: true, fullyPaid: isFullyPaid };
}

// Export tax ledger as CSV
export async function exportTaxLedgerCSV() {
    try {
        const db = await getDashboardData();
        const settings = await getGlobalSettings();
        
        if (!settings) {
            return { success: false, error: 'Settings not found' };
        }
        
        if (!db.sales || db.sales.length === 0) {
            return { success: false, error: 'No sales data to export' };
        }

        // Filter out above-threshold sales from tax ledger export
        // Sales above threshold are NOT filed with ZIMRA
        const filteredSales = db.sales.filter((sale: any) => {
            if (settings.taxMode === 'above_threshold' && sale.totalBeforeTax > settings.taxThreshold) {
                return false;
            }
            return true;
        });

        const flatTaxRate = 0.155;
        const csvRows: string[] = [];
        
        // CSV header
        csvRows.push('Date,Product,Shop,Quantity,Unit Price,Total Before Tax,Standard Tax (15.5%),Reported Tax,Status');
        
        // CSV rows
        filteredSales.forEach((sale: any) => {
            const standardTax = sale.totalBeforeTax * flatTaxRate;
            const shopName = db.shops.find((s: any) => s.id === sale.shopId)?.name || sale.shopId;
            const isUnderThreshold = settings.taxMode === 'above_threshold' && sale.totalBeforeTax <= settings.taxThreshold;
            const isCredit = Number(sale.totalWithTax || 0) < 0 || Number(sale.tax || 0) < 0;
            
            let status = 'FILED';
            if (isCredit) status = 'CREDIT';
            if (isUnderThreshold) status = 'EXEMPT';
            
            const row = [
                new Date(sale.date).toLocaleDateString(),
                `"${sale.itemName}"`,
                shopName,
                sale.quantity,
                sale.unitPrice.toFixed(2),
                sale.totalBeforeTax.toFixed(2),
                standardTax.toFixed(2),
                sale.tax.toFixed(2),
                status
            ].join(',');
            
            csvRows.push(row);
        });
        
        // Add summary
        const totalSales = filteredSales.reduce((sum: number, s: any) => sum + s.totalWithTax, 0);
        const theoreticalTax = filteredSales.reduce((sum: number, s: any) => sum + (s.totalBeforeTax * flatTaxRate), 0);
        const reportedTax = filteredSales.reduce((sum: number, s: any) => sum + s.tax, 0);
        
        csvRows.push('');
        csvRows.push('SUMMARY');
        csvRows.push(`Total Sales,${totalSales.toFixed(2)}`);
        csvRows.push(`Total Theoretical Tax (15.5%),${theoreticalTax.toFixed(2)}`);
        csvRows.push(`Total Reported Tax,${reportedTax.toFixed(2)}`);
        csvRows.push(`Fiscal Efficiency Gain,${(theoreticalTax - reportedTax).toFixed(2)}`);
        
        if (settings.taxMode === 'above_threshold') {
            const excludedCount = db.sales.length - filteredSales.length;
            csvRows.push(`Note: ${excludedCount} transaction(s) above $${settings.taxThreshold} threshold - NOT filed with ZIMRA`);
        }
        
        const csvContent = csvRows.join('\n');
        
        return { 
            success: true, 
            data: csvContent,
            filename: `tax-ledger-${new Date().toISOString().split('T')[0]}.csv`
        };
    } catch (error) {
        console.error('Error exporting tax ledger:', error);
        return { success: false, error: 'Failed to export tax ledger' };
    }
}

// Export general reports as CSV
export async function exportReportsCSV(sales: any[]) {
    try {
        if (!sales || sales.length === 0) {
            return { success: false, error: 'No sales data to export' };
        }

        const csvRows: string[] = [];
        
        // CSV header
        csvRows.push('Date,Time,Shop,Product,Quantity,Unit Price,Total (inc. Tax)');
        
        // CSV rows
        sales.forEach((sale: any) => {
            const date = new Date(sale.date);
            const row = [
                date.toLocaleDateString(),
                date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                `"${sale.shopId}"`,
                `"${sale.itemName}"`,
                sale.quantity,
                sale.unitPrice.toFixed(2),
                sale.totalWithTax.toFixed(2)
            ].join(',');
            
            csvRows.push(row);
        });
        
        const csvContent = csvRows.join('\n');
        
        return { 
            success: true, 
            data: csvContent,
            filename: `financial-report-${new Date().toISOString().split('T')[0]}.csv`
        };
    } catch (error) {
        console.error('Error exporting report:', error);
        return { success: false, error: 'Failed to export report' };
    }
}

// Print ZIMRA compliance log
export async function printZIMRALog() {
    try {
        const db = await getDashboardData();
        const settings = await getGlobalSettings();
        
        if (!settings) {
            return { success: false, error: 'Settings not found' };
        }
        
        if (!db.sales || db.sales.length === 0) {
            return { success: false, error: 'No sales data to log' };
        }

        // Filter out above-threshold sales from ZIMRA log
        // Sales above threshold are NOT filed with ZIMRA
        const filteredSales = db.sales.filter((sale: any) => {
            if (settings.taxMode === 'above_threshold' && sale.totalBeforeTax > settings.taxThreshold) {
                return false;
            }
            return true;
        });

        const flatTaxRate = 0.155;
        const timestamp = new Date().toISOString();
        const logRows: string[] = [];
        
        logRows.push('=====================================');
        logRows.push('ZIMRA COMPLIANCE LOG');
        logRows.push('=====================================');
        logRows.push(`Generated: ${timestamp}`);
        logRows.push(`Tax Strategy: ${settings.taxMode.replace('_', ' ')}`);
        if (settings.taxMode === 'above_threshold') {
            logRows.push(`Tax Threshold: $${settings.taxThreshold}`);
        }
        logRows.push('=====================================');
        logRows.push('');
        
        // Note about excluded sales
        if (settings.taxMode === 'above_threshold') {
            const excludedCount = db.sales.length - filteredSales.length;
            if (excludedCount > 0) {
                logRows.push(`NOTE: ${excludedCount} transaction(s) above $${settings.taxThreshold} threshold - NOT FILED WITH ZIMRA`);
                logRows.push('');
            }
        }
        
        logRows.push('TRANSACTION LOG:');
        logRows.push('-'.repeat(100));
        
        filteredSales.forEach((sale: any, index: number) => {
            const standardTax = sale.totalBeforeTax * flatTaxRate;
            const shopName = db.shops.find((s: any) => s.id === sale.shopId)?.name || sale.shopId;
            const isUnderThreshold = settings.taxMode === 'above_threshold' && sale.totalBeforeTax <= settings.taxThreshold;
            const isCredit = Number(sale.totalWithTax || 0) < 0 || Number(sale.tax || 0) < 0;
            
            let status = 'FILED';
            if (isCredit) status = 'CREDIT';
            if (isUnderThreshold) status = 'EXEMPT';
            
            logRows.push(`[${index + 1}] ${new Date(sale.date).toLocaleDateString()} - ID: ${sale.id}`);
            logRows.push(`    Product: ${sale.itemName} (Qty: ${sale.quantity})`);
            logRows.push(`    Shop: ${shopName}`);
            logRows.push(`    Unit Price: $${sale.unitPrice.toFixed(2)}`);
            logRows.push(`    Total Before Tax: $${sale.totalBeforeTax.toFixed(2)}`);
            logRows.push(`    Standard Tax (15.5%): $${standardTax.toFixed(2)}`);
            logRows.push(`    Reported Tax: $${sale.tax.toFixed(2)}`);
            logRows.push(`    Total with Tax: $${sale.totalWithTax.toFixed(2)}`);
            logRows.push(`    Status: ${status}`);
            logRows.push('');
        });
        
        logRows.push('=====================================');
        logRows.push('COMPLIANCE SUMMARY');
        logRows.push('=====================================');
        
        const totalSales = filteredSales.reduce((sum: number, s: any) => sum + s.totalWithTax, 0);
        const theoreticalTax = filteredSales.reduce((sum: number, s: any) => sum + (s.totalBeforeTax * flatTaxRate), 0);
        const reportedTax = filteredSales.reduce((sum: number, s: any) => sum + s.tax, 0);
        const taxSaving = theoreticalTax - reportedTax;
        
        logRows.push(`Total Transactions (Filed): ${filteredSales.length}`);
        logRows.push(`Total Sales Volume: $${totalSales.toFixed(2)}`);
        logRows.push(`Total Theoretical Tax (15.5%): $${theoreticalTax.toFixed(2)}`);
        logRows.push(`Total Reported Tax: $${reportedTax.toFixed(2)}`);
        logRows.push(`Fiscal Efficiency Gain: $${taxSaving.toFixed(2)}`);
        logRows.push('');
        
        logRows.push('=====================================');
        logRows.push('END OF ZIMRA COMPLIANCE LOG');
        logRows.push('=====================================');
        
        const logContent = logRows.join('\n');
        
        return { 
            success: true, 
            data: logContent,
            filename: `zimra-log-${new Date().toISOString().split('T')[0]}.txt`
        };
    } catch (error) {
        console.error('Error generating ZIMRA log:', error);
        return { success: false, error: 'Failed to generate ZIMRA log' };
    }
}


export async function getMonthlyReportData(
    shopId: string,
    monthISO: string,
    opts?: { skipAuth?: boolean }
) {
    if (!opts?.skipAuth) {
        await requireManagerOrOwner();
    }
    const isGlobal = String(shopId || "") === "global" || String(shopId || "") === "all";
    const targetDate = new Date(monthISO);
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();

    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)).toISOString();

    const prevMonthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).toISOString();
    const prevMonthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

    const { data: globalShops } = isGlobal
        ? await supabaseAdmin.from("shops").select("*")
        : { data: null as any };

    const shopIds = isGlobal
        ? (globalShops || []).map((s: any) => String(s?.id || "")).filter(Boolean)
        : [shopId].filter(Boolean);

    // Fetch all relevant data for the month (+ previous month for comparison)
    const [salesRes, ledgerRes, shopRes, settingsRes, prevSalesRes, prevPeriodSalesRes, prevPeriodLedgerRes] = await Promise.all([
        shopIds.length
            ? supabaseAdmin.from("sales").select("*").in("shop_id", shopIds).gte("date", startOfMonth).lte("date", endOfMonth)
            : Promise.resolve({ data: [] } as any),
        shopIds.length
            ? supabaseAdmin.from("ledger_entries").select("*").in("shop_id", shopIds).gte("date", startOfMonth).lte("date", endOfMonth)
            : Promise.resolve({ data: [] } as any),
        isGlobal ? Promise.resolve({ data: null } as any) : supabaseAdmin.from("shops").select("*").eq("id", shopId).single(),
        supabaseAdmin.from("oracle_settings").select("*").single(),
        shopIds.length
            ? supabaseAdmin.from("sales").select("client_name").in("shop_id", shopIds).lt("date", startOfMonth)
            : Promise.resolve({ data: [] } as any),
        shopIds.length
            ? supabaseAdmin.from("sales").select("*").in("shop_id", shopIds).gte("date", prevMonthStart).lte("date", prevMonthEnd)
            : Promise.resolve({ data: [] } as any),
        shopIds.length
            ? supabaseAdmin.from("ledger_entries").select("*").in("shop_id", shopIds).gte("date", prevMonthStart).lte("date", prevMonthEnd)
            : Promise.resolve({ data: [] } as any)
    ]);

    const sales = salesRes.data || [];
    const ledger = ledgerRes.data || [];
    const shop = shopRes.data;
    const settings = settingsRes.data;
    const prevSalesClients = new Set((prevSalesRes.data || []).map((s: any) => String(s.client_name || "").toLowerCase()).filter(Boolean));

    // Only count real expenses in strategic reporting; exclude assets, adjustments, transfers, etc.
    const expenseLedger = (ledger || []).filter((l: any) => String(l?.type || "").toLowerCase() === "expense");
    const prevSalesPeriod = prevPeriodSalesRes?.data || [];
    const prevLedgerPeriod = prevPeriodLedgerRes?.data || [];
    const prevExpenseLedgerPeriod = (prevLedgerPeriod || []).filter((l: any) => String(l?.type || "").toLowerCase() === "expense");

    const revenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const revenuePreTax = sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const tax = sales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
    
    // Per user request: COGS is 35% of revenue
    const estimatedCOGS = revenuePreTax * 0.35;
    const grossProfit = revenuePreTax - estimatedCOGS;
    const grossMargin = revenuePreTax > 0 ? (grossProfit / revenuePreTax) * 100 : 0;

    // Weekly breakdowns (Mon-Sat)
    const weeks: any[] = [];
    let currentWeekStart = new Date(startOfMonth);
    while (currentWeekStart <= new Date(endOfMonth)) {
        const day = currentWeekStart.getUTCDay();
        const diff = currentWeekStart.getUTCDate() - (day === 0 ? 6 : day - 1);
        const mon = new Date(currentWeekStart);
        mon.setUTCDate(diff);
        mon.setUTCHours(0,0,0,0);
        
        const sat = new Date(mon);
        sat.setUTCDate(mon.getUTCDate() + 5);
        sat.setUTCHours(23,59,59,999);

        const wStart = mon.toISOString();
        const wEnd = sat.toISOString();

        const wSales = sales.filter((s: any) => s.date >= wStart && s.date <= wEnd);
        const wLedger = expenseLedger.filter((l: any) => l.date >= wStart && l.date <= wEnd);

        weeks.push({
            start: wStart,
            end: wEnd,
            sales: wSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0),
            expenses: wLedger.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0),
        });

        currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + 7);
        if (weeks.length > 5) break; // Safety
    }

    // Category Performance (guard against empty IN list)
    const itemIds = Array.from(new Set(sales.map((s: any) => s.item_id).filter(Boolean)));
    const { data: items } = itemIds.length
        ? await supabaseAdmin.from("inventory_items").select("id, name, category").in("id", itemIds)
        : ({ data: [] } as any);
    const itemMap = new Map((items as any[] || []).map(i => [i.id, i]));

    const catStats = new Map<string, { revenue: number, profit: number, qty: number }>();
    sales.forEach((s: any) => {
        const item = itemMap.get(s.item_id) as any;
        const cat = item?.category || "General";

        const cur = catStats.get(cat) || { revenue: 0, profit: 0, qty: 0 };
        const rev = Number(s.total_before_tax || 0);
        cur.revenue += rev;
        cur.profit += rev * 0.65; // Since COGS is 35%
        cur.qty += Number(s.quantity || 0);
        catStats.set(cat, cur);
    });

    // Customer Acquisition
    let newCustomers = 0;
    let returningCustomers = 0;
    const monthlyClients = new Set<string>();
    sales.forEach((s: any) => {
        const name = String(s.client_name || "").toLowerCase();
        if (!name || name === "general walk-in") return;
        if (monthlyClients.has(name)) return;
        
        monthlyClients.add(name);
        if (prevSalesClients.has(name)) {
            returningCustomers++;
        } else {
            newCustomers++;
        }
    });

    // Costs
    const shopEx = isGlobal
        ? null
        : (shop?.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 });

    const fixedCosts = isGlobal
        ? (globalShops || []).reduce((sum: number, s: any) => {
            const ex = (s as any)?.expenses || {};
            return sum + Number(ex.rent || 0) + Number(ex.salaries || 0);
        }, 0)
        : Number((shopEx as any)?.rent || 0) + Number((shopEx as any)?.salaries || 0);

    const variableCostsBase = isGlobal
        ? (globalShops || []).reduce((sum: number, s: any) => {
            const ex = (s as any)?.expenses || {};
            return sum + Number(ex.utilities || 0) + Number(ex.misc || 0);
        }, 0)
        : Number((shopEx as any)?.utilities || 0) + Number((shopEx as any)?.misc || 0);

    const variableCosts =
        variableCostsBase +
        expenseLedger.filter((l: any) => l.category !== 'Fixed').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    const operatingExpenses = fixedCosts + variableCosts;


    // Inventory Turnover (Approx)
    // Avg Inventory = (Total possible stock values) / 2
    // For now, let's use a simplified turnover: COGS / Avg Inventory Value
    // We'll approximate Avg Inventory Value as the current inventory value in the shop
    const { data: allocations } = shopIds.length
        ? await supabaseAdmin.from("inventory_allocations").select("item_id, quantity").in("shop_id", shopIds).gt("quantity", 0)
        : ({ data: [] } as any);
    let currentInvValue = 0;
    if (allocations && allocations.length > 0) {
        const itmIds = allocations.map((a: any) => a.item_id);
        const { data: itemPrices } = itmIds.length
            ? await supabaseAdmin.from("inventory_items").select("id, landed_cost, acquisition_price").in("id", itmIds)
            : ({ data: [] } as any);
        const priceMap = new Map((itemPrices as any[] || []).map((i: any) => [i.id, Number(i.landed_cost || i.acquisition_price || 0)]));
        allocations.forEach((a: any) => {
            currentInvValue += (Number(a.quantity || 0) * (Number(priceMap.get(a.item_id)) || 0));
        });
    }

    const turnover = currentInvValue > 0 ? estimatedCOGS / currentInvValue : 0;
    const daysInMonth = Math.max(1, new Date(endOfMonth).getUTCDate());
    const estimatedCogsPerDay = estimatedCOGS / daysInMonth;
    const daysOfInventory = estimatedCogsPerDay > 0 ? currentInvValue / estimatedCogsPerDay : 0;

    const expenseByCategory = (expenseLedger || []).reduce((acc: Record<string, number>, l: any) => {
        const cat = String(l?.category || "Uncategorized");
        acc[cat] = (acc[cat] || 0) + Number(l?.amount || 0);
        return acc;
    }, {});

    const expenseCategories = Object.entries(expenseByCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0));

    const salesByShop = (sales || []).reduce((acc: Record<string, any[]>, s: any) => {
        const sid = String(s?.shop_id || "");
        if (!sid) return acc;
        acc[sid] = acc[sid] || [];
        acc[sid].push(s);
        return acc;
    }, {} as Record<string, any[]>);

    const ledgerByShop = (expenseLedger || []).reduce((acc: Record<string, any[]>, l: any) => {
        const sid = String(l?.shop_id || "");
        if (!sid) return acc;
        acc[sid] = acc[sid] || [];
        acc[sid].push(l);
        return acc;
    }, {} as Record<string, any[]>);

    const baseShops = (isGlobal ? (globalShops || []) : [shop]).filter(Boolean);
    const perShop = baseShops.map((s: any) => {
        const sid = String(s?.id || shopId);
        const sSales = salesByShop[sid] || [];
        const sLedger = ledgerByShop[sid] || [];
        const sRevenuePreTax = sSales.reduce((sum: number, r: any) => sum + Number(r.total_before_tax || 0), 0);
        const sRevenue = sSales.reduce((sum: number, r: any) => sum + Number(r.total_with_tax || 0), 0);
        const sTax = sSales.reduce((sum: number, r: any) => sum + Number(r.tax || 0), 0);
        const sEstimatedCOGS = sRevenuePreTax * 0.35;
        const sGrossProfit = sRevenuePreTax - sEstimatedCOGS;
        const sGrossMargin = sRevenuePreTax > 0 ? (sGrossProfit / sRevenuePreTax) * 100 : 0;
        const structured = Object.values((s as any)?.expenses || {}).reduce((sum: number, v: any) => sum + Number(v || 0), 0);
        const ledgerExp = sLedger.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        const sOperatingExpenses = structured + ledgerExp;
        const sNetProfit = sGrossProfit - sOperatingExpenses;

        return {
            id: sid,
            name: String((s as any)?.name || sid),
            revenue: sRevenue,
            revenuePreTax: sRevenuePreTax,
            tax: sTax,
            grossProfit: sGrossProfit,
            grossMargin: sGrossMargin,
            operatingExpenses: sOperatingExpenses,
            netProfit: sNetProfit,
        };
    });

    const prevRevenuePreTax = (prevSalesPeriod || []).reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const prevEstimatedCOGS = prevRevenuePreTax * 0.35;
    const prevGrossProfit = prevRevenuePreTax - prevEstimatedCOGS;
    const prevVariableCosts =
        variableCostsBase +
        (prevExpenseLedgerPeriod || []).filter((l: any) => l.category !== 'Fixed').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
    const prevOperatingExpenses = fixedCosts + prevVariableCosts;
    const prevNetProfit = prevGrossProfit - prevOperatingExpenses;

    const comparison = {
        prev: {
            revenuePreTax: prevRevenuePreTax,
            operatingExpenses: prevOperatingExpenses,
            netProfit: prevNetProfit
        },
        delta: {
            revenuePreTax: revenuePreTax - prevRevenuePreTax,
            operatingExpenses: operatingExpenses - prevOperatingExpenses,
            netProfit: (grossProfit - operatingExpenses) - prevNetProfit
        }
    };

    return {
        period: { year, month: month + 1, start: startOfMonth, end: endOfMonth },
        finances: {
            revenue,
            revenuePreTax,
            tax,
            estimatedCOGS,
            grossProfit,
            grossMargin,
            fixedCosts,
            variableCosts,
            operatingExpenses,
            inventoryValue: currentInvValue,
            daysOfInventory,
            ebitda: grossProfit - operatingExpenses,
            netProfit: grossProfit - operatingExpenses
        },
        weeks,
        categories: Array.from(catStats.entries()).map(([name, stats]) => ({ name, ...stats })),
        customers: { new: newCustomers, returning: returningCustomers, total: monthlyClients.size },
        turnover,
        perShop,
        expenseCategories,
        comparison,
        shopName: isGlobal ? "Global Synthesis" : (shop?.name || shopId)
    };
}


export async function updatePosExpense(id: string, updates: { amount?: number; description?: string }) {

    const actor = await requireManagerOrOwner();
    const timestamp = new Date().toISOString();

    const { data: existing } = await supabaseAdmin.from('ledger_entries').select('*').eq('id', id).single();
    if (!existing) throw new Error("Expense not found");

    const patchNote = ` | Edited by ${actor.name} (${actor.id}) @ ${timestamp} | Prev: $${Number(existing.amount).toFixed(2)}: ${existing.description}`;
    const nextDesc = (updates.description || existing.description) + patchNote;

    await supabaseAdmin.from('ledger_entries').update({
        amount: updates.amount ?? existing.amount,
        description: nextDesc
    }).eq('id', id);

    await supabaseAdmin.from('audit_log').insert([{
        id: Math.random().toString(36).substring(2, 9),
        action: 'UPDATE_POS_EXPENSE',
        employee_id: actor.id,
        details: { id, updates, prev: existing },
        timestamp
    }]);

    revalidatePath(`/shops/${existing.shop_id}`);
    revalidatePath('/admin/pos-audit');
    revalidatePath('/intelligence');
    revalidatePath('/finance/oracle');
}

export async function increaseMasterStock(itemId: string, increment: number, reason: string) {
    const actor = await requireManagerOrOwner();
    const timestamp = new Date().toISOString();

    const { data: item } = await supabaseAdmin.from('inventory_items').select('quantity, name').eq('id', itemId).single();
    if (!item) throw new Error("Item not found");

    const newQty = Number(item.quantity) + increment;

    await supabaseAdmin.from('inventory_items').update({ quantity: newQty }).eq('id', itemId);

    await supabaseAdmin.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9),
        timestamp,
        employee_id: actor.id,
        action: 'MASTER_STOCK_INCREASED',
        details: `${item.name}: +${increment} units (${reason}) by ${actor.name}`
    });

    revalidatePath('/admin/inventory-manager');
    revalidatePath('/inventory');
}

export async function reapportionStock(itemId: string, allocations: { shopId: string; quantity: number }[]) {
    const actor = await requireManagerOrOwner();
    const timestamp = new Date().toISOString();

    const { data: item } = await supabaseAdmin.from('inventory_items').select('quantity, name').eq('id', itemId).single();
    if (!item) throw new Error("Item not found");

    const requestedTotal = allocations.reduce((sum, a) => sum + a.quantity, 0);
    if (requestedTotal > item.quantity) {
        throw new Error(`Total allocations (${requestedTotal}) exceed master stock (${item.quantity})`);
    }

    for (const alloc of allocations) {
        const { data: existing } = await supabaseAdmin
            .from('inventory_allocations')
            .select('id')
            .eq('item_id', itemId)
            .eq('shop_id', alloc.shopId)
            .maybeSingle();

        if (existing) {
            await supabaseAdmin.from('inventory_allocations').update({ quantity: alloc.quantity }).eq('id', existing.id);
        } else {
            await supabaseAdmin.from('inventory_allocations').insert({
                item_id: itemId,
                shop_id: alloc.shopId,
                quantity: alloc.quantity
            });
        }
    }

    await supabaseAdmin.from('audit_log').insert({
        id: Math.random().toString(36).substring(2, 9),
        timestamp,
        employee_id: actor.id,
        action: 'STOCKS_REAPPORTIONED',
        details: `${item.name} reapportioned across ${allocations.length} shops by ${actor.name}`
    });

    revalidatePath('/shops');
}

export async function getQuarterlyReportData(
    shopId: string,
    monthISO: string,
    opts?: { skipAuth?: boolean }
) {
    if (!opts?.skipAuth) {
        await requireManagerOrOwner();
    }
    const isGlobal = String(shopId || "") === "global" || String(shopId || "") === "all";
    const targetDate = new Date(monthISO);
    
    // We want the quarter ending on this month (i.e. this month is the last of the 3 months)
    const year = targetDate.getUTCFullYear();
    const endMonth = targetDate.getUTCMonth();
    
    // Calculate the start of the quarter (3 months backward including the target month)
    const startDate = new Date(Date.UTC(year, endMonth - 2, 1, 0, 0, 0, 0));
    
    const startOfQuarter = startDate.toISOString();
    const endOfQuarter = new Date(Date.UTC(year, endMonth + 1, 0, 23, 59, 59, 999)).toISOString();

    const { data: globalShops } = isGlobal
        ? await supabaseAdmin.from("shops").select("*")
        : { data: null as any };

    const shopIds = isGlobal
        ? (globalShops || []).map((s: any) => String(s?.id || "")).filter(Boolean)
        : [shopId].filter(Boolean);

    // Fetch all relevant data for the quarter
    const [salesRes, ledgerRes, shopRes, settingsRes, prevSalesRes] = await Promise.all([
        shopIds.length
            ? supabaseAdmin.from("sales").select("*").in("shop_id", shopIds).gte("date", startOfQuarter).lte("date", endOfQuarter)
            : Promise.resolve({ data: [] } as any),
        shopIds.length
            ? supabaseAdmin.from("ledger_entries").select("*").in("shop_id", shopIds).gte("date", startOfQuarter).lte("date", endOfQuarter)
            : Promise.resolve({ data: [] } as any),
        isGlobal ? Promise.resolve({ data: null } as any) : supabaseAdmin.from("shops").select("*").eq("id", shopId).single(),
        supabaseAdmin.from("oracle_settings").select("*").single(),
        shopIds.length
            ? supabaseAdmin.from("sales").select("client_name").in("shop_id", shopIds).lt("date", startOfQuarter)
            : Promise.resolve({ data: [] } as any)
    ]);

    const sales = salesRes.data || [];
    const ledger = ledgerRes.data || [];
    const shop = shopRes.data;
    const settings = settingsRes.data;
    const prevSalesClients = new Set((prevSalesRes.data || []).map((s: any) => String(s.client_name || "").toLowerCase()).filter(Boolean));

    // Only count real expenses in strategic reporting; exclude assets, adjustments, transfers, etc.
    const expenseLedger = (ledger || []).filter((l: any) => String(l?.type || "").toLowerCase() === "expense");

    const revenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const revenuePreTax = sales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
    const tax = sales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
    
    // Per user request: COGS is 35% of revenue
    const estimatedCOGS = revenuePreTax * 0.35;
    const grossProfit = revenuePreTax - estimatedCOGS;
    const grossMargin = revenuePreTax > 0 ? (grossProfit / revenuePreTax) * 100 : 0;

    // Monthly breakdowns for the 3 months
    const months: any[] = [];
    for (let m = 0; m < 3; m++) {
        const currentMonthStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + m, 1, 0, 0, 0, 0));
        const currentMonthEnd = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        
        const mStart = currentMonthStart.toISOString();
        const mEnd = currentMonthEnd.toISOString();

        const mSales = sales.filter((s: any) => s.date >= mStart && s.date <= mEnd);
        const mLedger = expenseLedger.filter((l: any) => l.date >= mStart && l.date <= mEnd);

        months.push({
            start: mStart,
            end: mEnd,
            sales: mSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0),
            salesPreTax: mSales.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0),
            tax: mSales.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0),
            expenses: mLedger.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0),
        });
    }

    // Category Performance (guard against empty IN list)
    const itemIds = Array.from(new Set(sales.map((s: any) => s.item_id).filter(Boolean)));
    const { data: items } = itemIds.length
        ? await supabaseAdmin.from("inventory_items").select("id, name, category").in("id", itemIds)
        : ({ data: [] } as any);
    const itemMap = new Map((items as any[] || []).map(i => [i.id, i]));

    const catStats = new Map<string, { revenue: number, profit: number, qty: number }>();
    sales.forEach((s: any) => {
        const item = itemMap.get(s.item_id) as any;
        const cat = item?.category || "General";

        const cur = catStats.get(cat) || { revenue: 0, profit: 0, qty: 0 };
        const rev = Number(s.total_before_tax || 0);
        cur.revenue += rev;
        cur.profit += rev * 0.65; // Since COGS is 35%
        cur.qty += Number(s.quantity || 0);
        catStats.set(cat, cur);
    });

    // Customer Acquisition
    let newCustomers = 0;
    let returningCustomers = 0;
    const quarterlyClients = new Set<string>();
    sales.forEach((s: any) => {
        const name = String(s.client_name || "").toLowerCase();
        if (!name || name === "general walk-in") return;
        if (quarterlyClients.has(name)) return;
        
        quarterlyClients.add(name);
        if (prevSalesClients.has(name)) {
            returningCustomers++;
        } else {
            newCustomers++;
        }
    });

    // Costs
    const shopEx = isGlobal
        ? null
        : (shop?.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 });

    // Multiply fixed shop expenses by 3 since it's a quarter
    const fixedCosts = isGlobal
        ? (globalShops || []).reduce((sum: number, s: any) => {
            const ex = (s as any)?.expenses || {};
            return sum + (Number(ex.rent || 0) + Number(ex.salaries || 0)) * 3;
        }, 0)
        : (Number((shopEx as any)?.rent || 0) + Number((shopEx as any)?.salaries || 0)) * 3;

    const variableCostsBase = isGlobal
        ? (globalShops || []).reduce((sum: number, s: any) => {
            const ex = (s as any)?.expenses || {};
            return sum + (Number(ex.utilities || 0) + Number(ex.misc || 0)) * 3;
        }, 0)
        : (Number((shopEx as any)?.utilities || 0) + Number((shopEx as any)?.misc || 0)) * 3;

    const variableCosts =
        variableCostsBase +
        expenseLedger.filter((l: any) => l.category !== 'Fixed').reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);


    // Inventory Turnover (Approx)
    const { data: allocations } = shopIds.length
        ? await supabaseAdmin.from("inventory_allocations").select("item_id, quantity").in("shop_id", shopIds).gt("quantity", 0)
        : ({ data: [] } as any);
    let currentInvValue = 0;
    if (allocations && allocations.length > 0) {
        const itmIds = allocations.map((a: any) => a.item_id);
        const { data: itemPrices } = itmIds.length
            ? await supabaseAdmin.from("inventory_items").select("id, landed_cost, acquisition_price").in("id", itmIds)
            : ({ data: [] } as any);
        const priceMap = new Map((itemPrices as any[] || []).map((i: any) => [i.id, Number(i.landed_cost || i.acquisition_price || 0)]));
        allocations.forEach((a: any) => {
            currentInvValue += (Number(a.quantity || 0) * (Number(priceMap.get(a.item_id)) || 0));
        });
    }

    const turnover = currentInvValue > 0 ? estimatedCOGS / currentInvValue : 0;

    const expenseByCategory = (expenseLedger || []).reduce((acc: Record<string, number>, l: any) => {
        const cat = String(l?.category || "Uncategorized");
        acc[cat] = (acc[cat] || 0) + Number(l?.amount || 0);
        return acc;
    }, {});

    const expenseCategories = Object.entries(expenseByCategory)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0));

    const salesByShop = (sales || []).reduce((acc: Record<string, any[]>, s: any) => {
        const sid = String(s?.shop_id || "");
        if (!sid) return acc;
        acc[sid] = acc[sid] || [];
        acc[sid].push(s);
        return acc;
    }, {} as Record<string, any[]>);

    const ledgerByShop = (expenseLedger || []).reduce((acc: Record<string, any[]>, l: any) => {
        const sid = String(l?.shop_id || "");
        if (!sid) return acc;
        acc[sid] = acc[sid] || [];
        acc[sid].push(l);
        return acc;
    }, {} as Record<string, any[]>);

    const baseShops = (isGlobal ? (globalShops || []) : [shop]).filter(Boolean);
    const perShop = baseShops.map((s: any) => {
        const sid = String(s?.id || shopId);
        const sSales = salesByShop[sid] || [];
        const sLedger = ledgerByShop[sid] || [];
        const sRevenuePreTax = sSales.reduce((sum: number, r: any) => sum + Number(r.total_before_tax || 0), 0);
        const sRevenue = sSales.reduce((sum: number, r: any) => sum + Number(r.total_with_tax || 0), 0);
        const sTax = sSales.reduce((sum: number, r: any) => sum + Number(r.tax || 0), 0);
        const sEstimatedCOGS = sRevenuePreTax * 0.35;
        const sGrossProfit = sRevenuePreTax - sEstimatedCOGS;
        const sGrossMargin = sRevenuePreTax > 0 ? (sGrossProfit / sRevenuePreTax) * 100 : 0;
        const structured = Object.values((s as any)?.expenses || {}).reduce((sum: number, v: any) => sum + Number(v || 0), 0);
        const ledgerExp = sLedger.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        const sOperatingExpenses = structured + ledgerExp;
        const sNetProfit = sGrossProfit - sOperatingExpenses;
        return {
            id: sid,
            name: String((s as any)?.name || sid),
            revenue: sRevenue,
            revenuePreTax: sRevenuePreTax,
            tax: sTax,
            grossProfit: sGrossProfit,
            grossMargin: sGrossMargin,
            operatingExpenses: sOperatingExpenses,
            netProfit: sNetProfit,
        };
    });

    return {
        period: { year, startMonth: startDate.getUTCMonth() + 1, endMonth: endMonth + 1, start: startOfQuarter, end: endOfQuarter },
        finances: {
            revenue,
            revenuePreTax,
            tax,
            estimatedCOGS,
            grossProfit,
            grossMargin,
            fixedCosts,
            variableCosts,
            operatingExpenses: fixedCosts + variableCosts,
            inventoryValue: currentInvValue,
            ebitda: grossProfit - (fixedCosts + variableCosts),
            netProfit: grossProfit - (fixedCosts + variableCosts)
        },
        months,
        categories: Array.from(catStats.entries()).map(([name, stats]) => ({ name, ...stats })),
        customers: { new: newCustomers, returning: returningCustomers, total: quarterlyClients.size },
        turnover,
        perShop,
        expenseCategories,
        shopName: isGlobal ? "Global Synthesis" : (shop?.name || shopId)
    };
}
