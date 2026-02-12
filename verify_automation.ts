import { writeDb, readDb } from './lib/db';
import { getReorderSuggestions, getDeadStock } from './lib/analytics';

async function runAutomationCheck() {
    console.log("🤖 Testing Automation Logic...");
    const db = await readDb();

    // 1. Inject Test Data for Reordering
    // Item A: High velocity (10/day), Low Stock (5). Should reorder.
    console.log("   Injecting mock data for 'High Velocity / Low Stock' item...");
    const testItemId = "TEST_ITEM_A";
    const testItem = {
        id: testItemId,
        name: "TEST_FAST_SELLER",
        quantity: 5, // Low stock
        landedCost: 50,
        overheadContribution: 0,
        dateAdded: new Date().toISOString(),
        allocations: [],
        shipmentId: "TEST",
        category: "TEST",
        acquisitionPrice: 40
    };

    db.inventory.push(testItem);

    // Mock Sales for this item: 300 sold in last 30 days (10/day)
    const now = new Date();
    for (let i = 0; i < 30; i++) {
        db.sales.push({
            id: "TEST_SALE_" + i,
            itemId: testItemId,
            quantity: 10,
            totalWithTax: 100, // dummy
            date: now.toISOString(),
            shopId: "TEST",
            itemName: "TEST_FAST_SELLER",
            unitPrice: 10,
            totalBeforeTax: 90,
            tax: 10,
            employeeId: "TEST"
        });
    }

    // Write modified DB (will trigger backup, safe)
    await writeDb(db);

    // TEST REORDER
    console.log("   Running getReorderSuggestions()...");
    const suggestions = await getReorderSuggestions();
    const suggestion = suggestions.find(s => s.itemId === testItemId);

    if (suggestion) {
        console.log(`   ✅ SUCCESS: Found ${suggestion.itemName}`);
        console.log(`      Daily Velocity: ${suggestion.dailyVelocity}`);
        console.log(`      Days to Zero: ${suggestion.daysToZero}`);
        console.log(`      Suggested Reorder: ${suggestion.suggestedReorder}`);
    } else {
        console.error("   ❌ FAILED: Did not suggest reorder for fast seller.");
    }

    // CLEANUP
    console.log("   Cleaning up test data...");
    const cleanDb = await readDb();
    cleanDb.inventory = cleanDb.inventory.filter(i => i.id !== testItemId);
    cleanDb.sales = cleanDb.sales.filter(s => !s.id.startsWith("TEST_SALE_"));
    await writeDb(cleanDb);

    console.log("✅ Automation Verification Complete.");
}

runAutomationCheck().catch(console.error);
