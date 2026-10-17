export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase';
import ShopStocktakeClient from '@/components/pos/ShopStocktakeClient';

export default async function ShopStocktakePage({
    params
}: {
    params: { shopId: string } | Promise<{ shopId: string }>;
}) {
    const resolvedParams = await Promise.resolve(params);
    const shopId = String(resolvedParams.shopId || '').trim();

    if (!shopId) notFound();

    // Fetch Shop
    const { data: shop } = await supabaseAdmin
        .from('shops')
        .select('id, name')
        .eq('id', shopId)
        .maybeSingle();

    if (!shop) {
        // Fallback for known shop identifiers if not in table
        const knownShops: Record<string, string> = {
            kipasa: 'Kipasa',
            tradecenter: 'Trade Center',
            dubdub: 'Dub Dub',
            tshirts: 'Nirvana Tees'
        };
        if (!knownShops[shopId.toLowerCase()]) {
            notFound();
        }
    }

    const shopObject = shop || {
        id: shopId,
        name: shopId === 'tradecenter' ? 'Trade Center' : shopId.charAt(0).toUpperCase() + shopId.slice(1)
    };

    // Fetch Inventory and Allocations (bypassing 1,000-row limit)
    const [inventoryRows, allocationRows, employeeRows] = await Promise.all([
        fetchAllRows((c) => c.from('inventory_items').select('*').order('name', { ascending: true })),
        fetchAllRows((c) => c.from('inventory_allocations').select('*').eq('shop_id', shopId)),
        supabaseAdmin.from('employees').select('id, name, surname, role, shop_id, active, is_active').order('name', { ascending: true })
    ]);

    // Map shop allocation lookup
    const allocationMap = new Map<string, number>();
    for (const alloc of (allocationRows || [])) {
        allocationMap.set(alloc.item_id, Number(alloc.quantity || 0));
    }

    // Map all inventory items scoped with this shop's counts and prices
    const shopItems = (inventoryRows || []).map((item: any) => {
        const systemQty = allocationMap.get(item.id) || 0;
        const landedCost = Number(item.landed_cost || item.acquisition_price || 0);
        // Default standard Nirvana pricing formula (40% margin + 15.5% VAT)
        const defaultSellingPrice = Math.round(((landedCost || 10) * 1.4) * 1.155 * 100) / 100;

        return {
            id: item.id,
            name: item.name || "Unknown Product",
            category: item.category || "General",
            sku: item.sku || item.id,
            landedCost,
            sellingPrice: defaultSellingPrice,
            systemQuantity: systemQty,
            dateAdded: item.date_added || new Date().toISOString()
        };
    });

    // Filter employees: prefer those matching this shop or active staff
    const rawEmployees = employeeRows.data || [];
    const shopStaff = rawEmployees.filter(
        (e: any) => (e.is_active ?? e.active ?? true) && (!e.shop_id || e.shop_id === shopId || e.role === 'owner' || e.role === 'admin' || e.role?.includes('manager'))
    );

    return (
        <ShopStocktakeClient
            shop={shopObject}
            employees={shopStaff.length > 0 ? shopStaff : rawEmployees}
            initialInventory={shopItems}
        />
    );
}
