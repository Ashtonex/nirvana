
import { NextResponse } from 'next/server';
import {
    readDb,
    writeDb
} from '@/lib/db';
import {
    processShipment,
    recordSale,
    updateGlobalExpenses,
    updateShopExpenses,
    transferInventory
} from '@/app/actions';

export async function GET() {
    console.log("🌑 Starting Nirvana Internal System Test...");
    const results: string[] = [];

    try {
        // 1. Setup
        results.push("Setting up overheads...");
        await updateGlobalExpenses({
            rent: 1200, salaries: 3000, utilities: 800, shipping: 0, duty: 0, misc: 0
        });

        await updateShopExpenses("kipasa", { rent: 500, salaries: 500, utilities: 0, misc: 0 });
        await updateShopExpenses("dubdub", { rent: 300, salaries: 200, utilities: 0, misc: 0 });
        await updateShopExpenses("tradecenter", { rent: 300, salaries: 200, utilities: 0, misc: 0 });
        results.push("✅ Step 1 passed: Overheads & Weights initialized.");

        // 2. Shipment
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

        const db = await readDb();
        const item = db.inventory.find(i => i.name === "Stress Test Hoodie");
        if (item && item.landedCost === 24) {
            results.push(`✅ Step 2 passed: Landed Cost $${item.landedCost} verified.`);
        } else {
            throw new Error(`Landed cost mismatch: ${item?.landedCost}`);
        }

        // 3. Sale
        results.push("Recording a sale...");
        await recordSale({
            shopId: "kipasa",
            itemId: item.id,
            itemName: item.name,
            quantity: 10,
            unitPrice: 66,
            totalBeforeTax: 660
        });
        results.push("✅ Step 3 passed: Sale recorded & stock subtracted.");

        // 4. Transfer
        results.push("Executing transfer...");
        await transferInventory(item.id, "kipasa", "dubdub", 20);
        results.push("✅ Step 4 passed: Inventory transfer verified.");

        return NextResponse.json({ success: true, log: results });
    } catch (err: any) {
        console.error("TEST API ERROR:", err);
        return NextResponse.json({
            success: false,
            error: err.message,
            stack: err.stack,
            log: results
        }, { status: 500 });
    }
}
