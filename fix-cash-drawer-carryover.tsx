// FIX FOR CASH DRAWER CARRY-OVER CALCULATION
// Replace the problematic carry-over logic in app/shops/[shopId]/POS.tsx

// ========================================
// PROBLEM IDENTIFIED:
// ========================================
// The current logic finds the "very last opening before today" which could be
// days or weeks ago, causing it to include thousands of sales/expenses
// instead of just yesterday's data

// ========================================
// CORRECTED CARRY-OVER LOGIC:
// ========================================

// Replace lines 346-368 in POS.tsx with this:

// 2. What was yesterday's exact closing?
// Yesterday's Opening + Yesterday's Cash Sales - Yesterday's POS Expenses
let expectedOpeningCash = 0;
let carryOverSales = 0;
let carryOverExpenses = 0;
let carryOverBaseline = 0;

// Get yesterday's date in the same format as todayStr
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toLocaleDateString('en-CA'); // YYYY-MM-DD

// Find yesterday's opening (not "very last opening")
const yesterdayOpening = ledger.find((l: any) => 
    l.category === 'Cash Drawer Opening' && 
    l.shopId === shopId && 
    String(l.date || "").includes(yesterdayStr)
);

if (yesterdayOpening) {
    carryOverBaseline = Number(yesterdayOpening.amount);

    // Only look at yesterday's sales (not all sales since last opening)
    const yesterdaySales = (db.sales || []).filter((s: any) => 
        s.shopId === shopId && 
        s.paymentMethod === 'cash' && 
        String(s.date).includes(yesterdayStr)
    );
    carryOverSales = yesterdaySales.reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

    // Only look at yesterday's expenses (not all expenses since last opening)
    const yesterdayExpenses = ledger.filter((l: any) =>
        (CASH_OUT_CATEGORIES.has(String(l.category || "")) || isGroceriesExpense(l) || isTitheExpense(l)) &&
        l.shopId === shopId &&
        String(l.date).includes(yesterdayStr)
    );
    carryOverExpenses = yesterdayExpenses.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

    expectedOpeningCash = carryOverBaseline + carryOverSales - carryOverExpenses;
} else {
    // If no yesterday opening, try to find the most recent opening and calculate from there
    const pastOpenings = ledger.filter((l: any) => 
        l.category === 'Cash Drawer Opening' && 
        l.shopId === shopId && 
        !String(l.date).startsWith(todayStr)
    );
    
    if (pastOpenings.length > 0) {
        const lastOpening = pastOpenings.sort((a: any, b: any) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0];
        
        const lastOpenDate = new Date(lastOpening.date);
        const lastOpenDateStr = lastOpenDate.toLocaleDateString('en-CA');
        
        carryOverBaseline = Number(lastOpening.amount);

        // Only include sales/expenses from that specific day
        const lastDaySales = (db.sales || []).filter((s: any) => 
            s.shopId === shopId && 
            s.paymentMethod === 'cash' && 
            String(s.date).includes(lastOpenDateStr)
        );
        carryOverSales = lastDaySales.reduce((sum: number, s: any) => sum + Number(s.totalWithTax || 0), 0);

        const lastDayExpenses = ledger.filter((l: any) =>
            (CASH_OUT_CATEGORIES.has(String(l.category || "")) || isGroceriesExpense(l) || isTitheExpense(l)) &&
            l.shopId === shopId &&
            String(l.date).includes(lastOpenDateStr)
        );
        carryOverExpenses = lastDayExpenses.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

        expectedOpeningCash = carryOverBaseline + carryOverSales - carryOverExpenses;
    }
}

// ========================================
// WHAT THIS FIX DOES:
// ========================================

// 1. **Primary Logic**: Look for yesterday's opening first (most common case)
// 2. **Fallback**: If no yesterday opening, find most recent opening and only use that day's data
// 3. **No More "Thousands of Sales"**: Limits calculation to single day's data
// 4. **Accurate Variance**: Shows realistic daily carry-over amounts

// ========================================
// EXPECTED RESULTS:
// ========================================

// Before fix: "Starting from $500 + $12,500 sales - $8,200 expenses = $4,800"
// After fix:  "Starting from $500 + $450 sales - $120 expenses = $830"

// ========================================
// IMPLEMENTATION:
// ========================================

// 1. Open app/shops/[shopId]/POS.tsx
// 2. Find lines 346-368 (the carry-over calculation)
// 3. Replace with the corrected logic above
// 4. Test the cash drawer variance calculation
// 5. Verify it shows realistic daily amounts
