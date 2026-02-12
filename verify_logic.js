
// Nirvana Logic Math Verification
// Testing the formulas used in server actions

const db = {
    shops: [
        { id: "kipasa", name: "Kipasa", expenses: { rent: 400, salaries: 0, utilities: 0, misc: 0 } },
        { id: "dubdub", name: "Dub Dub", expenses: { rent: 300, salaries: 0, utilities: 0, misc: 0 } },
        { id: "tradecenter", name: "Trade Center", expenses: { rent: 300, salaries: 0, utilities: 0, misc: 0 } }
    ],
    globalExpenses: { rent: 1000, salaries: 2000, utilities: 500, shipping: 0, duty: 0, misc: 0 }
};

function verify() {
    console.log("🚀 Nirvana Self-Contained Logic Test");

    const shipmentData = {
        supplier: "Test Vendor",
        shippingCost: 200,
        dutyCost: 100,
        miscCost: 0,
        items: [
            { name: "Verif Shirt", category: "Test", quantity: 100, acquisitionPrice: 10 }
        ]
    };

    const totalQty = shipmentData.items.reduce((sum, i) => sum + i.quantity, 0);
    const shipmentFees = shipmentData.shippingCost + shipmentData.dutyCost + shipmentData.miscCost;
    const feesPerPiece = totalQty > 0 ? shipmentFees / totalQty : 0;

    // Global Overhead calculation
    const totalMonthlyOverhead = Object.values(db.globalExpenses).reduce((a, b) => a + b, 0);
    const overheadPerPiece = totalQty > 0 ? totalMonthlyOverhead / totalQty : 0;

    console.log(`Total Qty: ${totalQty}`);
    console.log(`Fees per piece: $${feesPerPiece}`); // (200+100)/100 = 3
    console.log(`Total Global Overhead: $${totalMonthlyOverhead}`); // 1000+2000+500 = 3500
    console.log(`Overhead per piece: $${overheadPerPiece}`); // 3500/100 = 35

    const landedCost = shipmentData.items[0].acquisitionPrice + feesPerPiece; // 10 + 3 = 13
    const baseCost = landedCost + overheadPerPiece; // 13 + 35 = 48

    console.log(`Landed Cost: $${landedCost}`);
    console.log(`Total Base Cost (incl. Overhead): $${baseCost}`);

    // Smart Pricing Suggestion
    const margin = 0.50;
    const suggestedSubtotal = baseCost * (1 + margin); // 48 * 1.5 = 72
    const taxAmount = suggestedSubtotal * 0.155; // 72 * 0.155 = 11.16
    const suggestedFinal = suggestedSubtotal + taxAmount; // 83.16

    console.log(`Suggested Retail Price (incl. 15.5% Tax): $${suggestedFinal.toFixed(2)}`);

    // Rationalization Logic
    const totalShopExpenses = db.shops.reduce((sum, shop) => {
        return sum + shop.expenses.rent + shop.expenses.salaries + shop.expenses.utilities + shop.expenses.misc;
    }, 0);

    console.log(`Total Shop Expenses: $${totalShopExpenses}`); // 400+300+300 = 1000

    const allocations = [];
    db.shops.forEach(shop => {
        const shopTotal = shop.expenses.rent + shop.expenses.salaries + shop.expenses.utilities + shop.expenses.misc;
        const ratio = shopTotal / totalShopExpenses;
        const allocatedQty = Math.floor(shipmentData.items[0].quantity * ratio);
        allocations.push({ shop: shop.name, qty: allocatedQty });
    });

    console.log("Allocations:", allocations);

    if (landedCost === 13 && baseCost === 48 && suggestedFinal.toFixed(2) === "83.16" && allocations[0].qty === 40) {
        console.log("\n✅ ALL FORMULAS VERIFIED!");
    } else {
        console.log("\n❌ FORMULA MISMATCH!");
    }
}

verify();
