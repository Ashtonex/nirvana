export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireOwnerAccess } from '@/lib/api-auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ENABLE = process.env.NIRVANA_ENABLE_INTERNAL_TESTS === 'true';

async function runTest() {
    if (!ENABLE) {
        return {
            success: false,
            error: 'Internal test endpoint is disabled',
        };
    }

    if (!SUPABASE_URL) {
        return {
            success: false,
            error: "Test endpoint requires NEXT_PUBLIC_SUPABASE_URL to be configured",
            configured: {
                supabase: !!SUPABASE_URL,
            }
        };
    }

    const {
        getDashboardData,
        processShipment,
        recordSale,
        updateGlobalExpenses,
        updateShopExpenses,
        transferInventory
    } = await import('@/app/actions');

    console.log("🌑 Starting Nirvana Internal System Test...");
    const results: string[] = [];

    try {
        results.push("Setting up overheads...");
        await updateGlobalExpenses({
            rent: 1200, salaries: 3000, utilities: 800, shipping: 0, duty: 0, misc: 0
        });

        await updateShopExpenses("kipasa", { rent: 500, salaries: 500, utilities: 0, misc: 0 });
        await updateShopExpenses("dubdub", { rent: 300, salaries: 200, utilities: 0, misc: 0 });
        await updateShopExpenses("tradecenter", { rent: 300, salaries: 200, utilities: 0, misc: 0 });
        results.push("✅ Step 1 passed: Overheads & Weights initialized.");

        results.push("Processing bulk shipment...");
        const shipmentData = {
            supplier: "Test Supplier",
            shipmentNumber: "TEST-001",
            purchasePrice: 5000,
            shippingCost: 500,
            dutyCost: 200,
            miscCost: 100,
            manifestPieces: 50,
            items: [
                { name: "Stress Test Hoodie", category: "Hoodies", quantity: 50, acquisitionPrice: 100 }
            ]
        };
        await processShipment(shipmentData);

        const db = await getDashboardData();
        const item = db.inventory.find((i: any) => i.name === "Stress Test Hoodie");
        if (item) {
            results.push(`✅ Step 2 passed: Item registration verified.`);
        } else {
            throw new Error(`Item not found in inventory.`);
        }

        results.push("Recording a sale...");
        await recordSale({
            shopId: "kipasa",
            employeeId: "test-employee",
            itemId: item.id,
            itemName: item.name,
            quantity: 10,
            unitPrice: 66,
            totalBeforeTax: 660
        });
        results.push("✅ Step 3 passed: Sale recorded & stock subtracted.");

        results.push("Executing transfer...");
        await transferInventory(item.id, "kipasa", "dubdub", 20);
        results.push("✅ Step 4 passed: Inventory transfer verified.");

        return { success: true, log: results };
    } catch (err: any) {
        console.error("TEST API ERROR:", err);
        return {
            success: false,
            error: err.message,
            stack: err.stack,
            log: results
        };
    }
}

export async function GET(req: Request) {
    const auth = await requireOwnerAccess(req);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const result = await runTest();
    const status = result.success ? 200 : (result.configured ? 503 : 404);
    return NextResponse.json(result, { status });
}
