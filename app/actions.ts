"use server";

import { readDb, writeDb, Database, InventoryItem, Sale, Shipment, FinancialEntry, Quotation, Employee } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getDashboardData() {
    return await readDb();
}

export async function updateGlobalExpenses(expenses: Database['globalExpenses']) {
    const db = await readDb();
    db.globalExpenses = expenses;
    await writeDb(db);
    revalidatePath("/");
}

export async function updateShopExpenses(shopId: string, expenses: { rent: number; salaries: number; utilities: number; misc: number }) {
    const db = await readDb();
    const shop = db.shops.find(s => s.id === shopId);
    if (shop) {
        shop.expenses = expenses;
        await writeDb(db);
        revalidatePath("/");
    }
}

export async function processShipment(shipmentData: {
    supplier: string;
    shipmentNumber: string;
    purchasePrice: number;
    shippingCost: number;
    dutyCost: number;
    miscCost: number;
    manifestPieces: number; // Added this
    items: {
        name: string;
        category: string;
        quantity: number;
        acquisitionPrice: number; // This is now TOTAL CLASS PRICE
    }[];
}) {
    const db = await readDb();
    const shipmentId = Math.random().toString(36).substring(2, 9);

    // Calculate totals
    const totalClassPurchase = shipmentData.purchasePrice;
    const totalLogistics = shipmentData.shippingCost + shipmentData.dutyCost + shipmentData.miscCost;
    const totalQty = shipmentData.items.reduce((sum, i) => sum + i.quantity, 0);

    // Unit Logistics Fee (Shared across all pieces in shipment)
    // Use manifestPieces if provided, otherwise fallback to totalQty
    const logisticsBasis = shipmentData.manifestPieces > 0 ? shipmentData.manifestPieces : totalQty;
    const feePerPiece = logisticsBasis > 0 ? totalLogistics / logisticsBasis : 0;

    // Calculate Global Overhead per piece (monthly overheads / new shipment total qty)
    const totalGlobalOverhead = Object.values(db.globalExpenses).reduce((a, b) => a + Number(b), 0);
    const overheadPerPiece = totalQty > 0 ? totalGlobalOverhead / totalQty : 0;

    const newItems: InventoryItem[] = [];

    for (const itemData of shipmentData.items) {
        const unitAcquisitionPrice = itemData.quantity > 0 ? itemData.acquisitionPrice / itemData.quantity : 0;

        const newItem: InventoryItem = {
            id: Math.random().toString(36).substring(2, 9),
            shipmentId,
            name: itemData.name,
            category: itemData.category,
            quantity: itemData.quantity,
            acquisitionPrice: unitAcquisitionPrice,
            landedCost: unitAcquisitionPrice + feePerPiece,
            overheadContribution: 0, // We will calculate this dynamically in the POS or per-shop later
            dateAdded: new Date().toISOString(),
            allocations: []
        };

        // Rationalization Logic: Allocate based on current shop overhead weights
        const totalShopExpenses = db.shops.reduce((sum, shop) => {
            return sum + Object.values(shop.expenses).reduce((a, b) => a + Number(b), 0);
        }, 0);

        if (totalShopExpenses > 0) {
            db.shops.forEach(shop => {
                const shopTotal = Object.values(shop.expenses).reduce((a, b) => a + Number(b), 0);
                const ratio = shopTotal / totalShopExpenses;
                const allocatedQty = Math.floor(newItem.quantity * ratio);

                if (allocatedQty > 0) {
                    newItem.allocations.push({
                        shopId: shop.id,
                        quantity: allocatedQty
                    });
                }
            });

            // Remainder to the largest shop or first shop
            const totalAllocated = newItem.allocations.reduce((sum, a) => sum + a.quantity, 0);
            const remainder = newItem.quantity - totalAllocated;
            if (remainder > 0 && newItem.allocations.length > 0) {
                newItem.allocations[0].quantity += remainder;
            }
        }

        newItems.push(newItem);
    }

    // Update DB
    db.inventory.push(...newItems);
    db.shipments.push({
        id: shipmentId,
        date: new Date().toISOString(),
        supplier: shipmentData.supplier,
        shipmentNumber: shipmentData.shipmentNumber,
        purchasePrice: totalClassPurchase,
        shippingCost: shipmentData.shippingCost,
        dutyCost: shipmentData.dutyCost,
        miscCost: shipmentData.miscCost,
        manifestPieces: shipmentData.manifestPieces,
        items: newItems.map(i => i.id),
        totalQuantity: totalQty
    });

    // Record Asset Acquisition in Ledger
    db.ledger.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'asset',
        category: 'Inventory Acquisition',
        amount: totalClassPurchase,
        date: new Date().toISOString(),
        description: `Source: ${shipmentData.supplier} - ${totalQty} units`
    });

    // Record Shipment Expenses
    if (totalLogistics > 0) {
        db.ledger.push({
            id: Math.random().toString(36).substring(2, 9),
            type: 'expense',
            category: 'Shipping & Logistics',
            amount: totalLogistics,
            date: new Date().toISOString(),
            description: `Shipment Fees for ${shipmentData.supplier}`
        });
    }

    // Audit Logging (Fort Knox)
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: 'SYSTEM', // Shipments are usually global/manager level
        action: 'SHIPMENT_PROCESSED',
        details: `Supplier: ${shipmentData.supplier}, Ref: ${shipmentData.shipmentNumber}, Total Qty: ${totalQty}`
    });

    await writeDb(db);
    revalidatePath("/");
    revalidatePath("/inventory");
    revalidatePath("/finance");
}

export async function recordStocktake(stocktakeData: {
    shopId: string;
    employeeId: string;
    items: {
        itemId: string;
        physicalQuantity: number;
    }[];
}) {
    const db = await readDb();
    let totalShrinkageValue = 0;

    for (const record of stocktakeData.items) {
        const item = db.inventory.find(i => i.id === record.itemId);
        if (!item) continue;

        const allocation = item.allocations.find(a => a.shopId === stocktakeData.shopId);
        if (!allocation) continue;

        const systemQty = allocation.quantity;
        const diff = record.physicalQuantity - systemQty;

        if (diff !== 0) {
            // Record Shrinkage in Ledger if negative
            if (diff < 0) {
                const lossValue = Math.abs(diff) * item.landedCost;
                totalShrinkageValue += lossValue;

                db.ledger.push({
                    id: Math.random().toString(36).substring(2, 9),
                    type: 'expense',
                    category: 'Inventory Shrinkage',
                    amount: lossValue,
                    date: new Date().toISOString(),
                    description: `Shrinkage: ${item.name} (${Math.abs(diff)} units lost at ${stocktakeData.shopId})`
                });
            }

            // Sync System to Physical
            allocation.quantity = record.physicalQuantity;

            // Adjust global inventory count
            const diffGlobal = record.physicalQuantity - systemQty;
            item.quantity += diffGlobal;

            // Audit the adjustment
            db.auditLog.push({
                id: Math.random().toString(36).substring(2, 9),
                timestamp: new Date().toISOString(),
                employeeId: stocktakeData.employeeId,
                action: 'STOCK_ADJUSTMENT',
                details: `Item: ${item.name}, Shop: ${stocktakeData.shopId}, System: ${systemQty}, Physical: ${record.physicalQuantity}, Diff: ${diff}`
            });
        }
    }

    await writeDb(db);
    revalidatePath(`/shops/${stocktakeData.shopId}`);
    revalidatePath("/inventory");
    revalidatePath("/finance");

    return { totalShrinkageValue };
}

export async function getShipments() {
    const db = await readDb();
    return db.shipments;
}

export async function getInventoryHistory() {
    const db = await readDb();
    // Return inventory sorted by date
    return [...db.inventory].sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
}

export async function getFinancials() {
    const db = await readDb();
    return {
        ledger: db.ledger,
        sales: db.sales,
        globalExpenses: db.globalExpenses,
        shops: db.shops
    };
}

/**
 * @deprecated This function is deprecated. Use `processShipment` instead.
 */
export async function _addInventoryDeprecated(item: Omit<InventoryItem, "id" | "dateAdded" | "allocations">) {
    const db = await readDb();
    const newItem: InventoryItem = {
        ...item,
        id: Math.random().toString(36).substring(2, 9),
        dateAdded: new Date().toISOString(),
        allocations: []
    };

    // Rationalization Logic: Allocate based on total expenses
    const totalShopExpenses = db.shops.reduce((sum, shop) => {
        return sum + shop.expenses.rent + shop.expenses.salaries + shop.expenses.utilities + shop.expenses.misc;
    }, 0);

    if (totalShopExpenses > 0) {
        db.shops.forEach(shop => {
            const shopTotal = shop.expenses.rent + shop.expenses.salaries + shop.expenses.utilities + shop.expenses.misc;
            const ratio = shopTotal / totalShopExpenses;
            const allocatedQty = Math.floor(newItem.quantity * ratio);

            if (allocatedQty > 0) {
                newItem.allocations.push({
                    shopId: shop.id,
                    quantity: allocatedQty
                });
            }
        });

        // Adjust for rounding errors (give remainder to the largest shop or first shop)
        const totalAllocated = newItem.allocations.reduce((sum, a) => sum + a.quantity, 0);
        const remainder = newItem.quantity - totalAllocated;
        if (remainder > 0 && newItem.allocations.length > 0) {
            newItem.allocations[0].quantity += remainder;
        }
    }

    db.inventory.push(newItem);
    await writeDb(db);
    revalidatePath("/");
}

export async function recordSale(sale: Omit<Sale, "id" | "date" | "tax" | "totalWithTax">) {
    const db = await readDb();
    const taxRate = 0.155;
    const tax = sale.totalBeforeTax * taxRate;
    const totalWithTax = sale.totalBeforeTax + tax;

    const newSale: Sale = {
        ...sale,
        id: Math.random().toString(36).substring(2, 9),
        date: new Date().toISOString(),
        tax,
        totalWithTax
    };

    db.sales.push(newSale);

    // Audit Logging (Fort Knox)
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: sale.employeeId,
        action: 'SALE_RECORDED',
        details: `Item: ${sale.itemName}, Qty: ${sale.quantity}, Total: $${totalWithTax.toFixed(2)}`
    });

    // Update inventory
    const inventoryItem = db.inventory.find(i => i.id === sale.itemId);
    if (inventoryItem) {
        const allocation = inventoryItem.allocations.find(a => a.shopId === sale.shopId);
        if (allocation) {
            allocation.quantity -= sale.quantity;
        }
        inventoryItem.quantity -= sale.quantity;
    }

    await writeDb(db);
    revalidatePath(`/shops/${sale.shopId}`);
}

export async function transferInventory(itemId: string, fromShopId: string, toShopId: string, quantity: number) {
    const db = await readDb();
    const item = db.inventory.find(i => i.id === itemId);

    if (!item) throw new Error("Item not found");

    const fromAlloc = item.allocations.find(a => a.shopId === fromShopId);
    if (!fromAlloc || fromAlloc.quantity < quantity) throw new Error("Insufficient stock in source shop");

    // Subtract from source
    fromAlloc.quantity -= quantity;

    // Add to destination
    let toAlloc = item.allocations.find(a => a.shopId === toShopId);
    if (toAlloc) {
        toAlloc.quantity += quantity;
    } else {
        item.allocations.push({ shopId: toShopId, quantity });
    }

    // Record transfer
    db.transfers.push({
        id: Math.random().toString(36).substring(2, 9),
        itemId,
        itemName: item.name,
        fromShopId,
        toShopId,
        quantity,
        date: new Date().toISOString()
    });

    // Audit Logging
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: 'SYSTEM', // Transfer origin
        action: 'INV_TRANSFER',
        details: `Moved ${quantity} units of ${item.name} from ${fromShopId} to ${toShopId}`
    });

    await writeDb(db);
    revalidatePath("/transfers");
    revalidatePath(`/shops/${fromShopId}`);
    revalidatePath(`/shops/${toShopId}`);
}

export async function recordQuotation(quotation: Omit<Quotation, "id" | "date" | "expiryDate" | "status">) {
    const db = await readDb();
    const newQuotation: Quotation = {
        ...quotation,
        id: Math.random().toString(36).substring(2, 9),
        date: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days expiry
        status: 'pending'
    };

    db.quotations.push(newQuotation);
    await writeDb(db);
    revalidatePath(`/shops/${quotation.shopId}`);
    return newQuotation;
}

export async function deleteQuotation(quoteId: string, shopId: string) {
    const db = await readDb();
    db.quotations = db.quotations.filter(q => q.id !== quoteId);
    await writeDb(db);
    revalidatePath(`/shops/${shopId}`);
}

export async function addEmployee(employee: Omit<Employee, "id" | "active">) {
    const db = await readDb();
    const newEmployee: Employee = {
        ...employee,
        id: Math.random().toString(36).substring(2, 9),
        active: true
    };
    db.employees.push(newEmployee);

    // Audit Logging
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: 'ADMIN',
        action: 'EMPLOYEE_ADDED',
        details: `Name: ${newEmployee.name}, Role: ${newEmployee.role}, Shop: ${newEmployee.shopId}`
    });

    await writeDb(db);
    revalidatePath("/employees");
    revalidatePath(`/shops/${employee.shopId}`);
    return newEmployee;
}

export async function updateEmployee(id: string, updates: Partial<Employee>) {
    const db = await readDb();
    const employee = db.employees.find(e => e.id === id);
    if (!employee) throw new Error("Employee not found");

    const oldShopId = employee.shopId;
    Object.assign(employee, updates);

    // Audit Logging
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: 'ADMIN',
        action: 'EMPLOYEE_UPDATED',
        details: `ID: ${id}, Updates: ${JSON.stringify(updates)}`
    });

    await writeDb(db);
    revalidatePath("/employees");
    revalidatePath(`/shops/${oldShopId}`);
    if (updates.shopId) revalidatePath(`/shops/${updates.shopId}`);
}

export async function deleteEmployee(id: string) {
    const db = await readDb();
    const employee = db.employees.find(e => e.id === id);
    if (!employee) throw new Error("Employee not found");

    const oldShopId = employee.shopId;
    db.employees = db.employees.filter(e => e.id !== id);

    // Audit Logging
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: 'ADMIN',
        action: 'EMPLOYEE_DELETED',
        details: `ID: ${id}, Name: ${employee.name}`
    });

    await writeDb(db);
    revalidatePath("/employees");
    revalidatePath(`/shops/${oldShopId}`);
}

export async function getInventoryInsights(itemId: string) {
    const db = await readDb();
    const item = db.inventory.find(i => i.id === itemId);
    if (!item) return null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const relevantSales = db.sales.filter(s =>
        s.itemId === itemId &&
        new Date(s.date) >= thirtyDaysAgo
    );

    const totalSold = relevantSales.reduce((acc, s) => acc + s.quantity, 0);
    const dailyVelocity = totalSold / 30;
    const daysToZero = dailyVelocity > 0 ? Math.floor(item.quantity / dailyVelocity) : Infinity;

    // Aging & Bleed logic
    const daysInStock = Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 3600 * 24));

    // Calculate overhead bleed for the SPECIFIC shop(s) it is in (simplified to global weight)
    const totalGlobalOverhead = Object.values(db.globalExpenses).reduce((a, b) => a + Number(b), 0);
    const totalInventoryCount = db.inventory.reduce((sum, i) => sum + i.quantity, 0);
    const dailyBleedPerPiece = totalInventoryCount > 0 ? (totalGlobalOverhead / 30) / totalInventoryCount : 0;
    const cumulativeBleed = dailyBleedPerPiece * daysInStock;

    return {
        dailyVelocity,
        daysToZero,
        daysInStock,
        cumulativeBleed,
        realBreakEven: (item.landedCost + cumulativeBleed) * 1.155, // Incl tax
        totalSold30d: totalSold,
        status: daysToZero < 7 ? "critical" : daysToZero < 14 ? "warning" : "healthy"
    };
}

export async function getZombieStockReport() {
    const db = await readDb();
    const reports = db.inventory.map(item => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSales = db.sales.filter(s => s.itemId === item.id && new Date(s.date) >= thirtyDaysAgo);
        const hasSoldRecently = recentSales.length > 0;
        const daysInStock = Math.floor((new Date().getTime() - new Date(item.dateAdded).getTime()) / (1000 * 3600 * 24));

        // Bleed Logic
        const totalGlobalOverhead = Object.values(db.globalExpenses).reduce((a, b) => a + Number(b), 0);
        const totalInventoryCount = db.inventory.reduce((sum, i) => sum + i.quantity, 0);
        const dailyBleedPerPiece = totalInventoryCount > 0 ? (totalGlobalOverhead / 30) / totalInventoryCount : 0;
        const cumulativeBleed = dailyBleedPerPiece * daysInStock;

        return {
            ...item,
            daysInStock,
            hasSoldRecently,
            cumulativeBleed,
            deadCapital: item.landedCost * item.quantity,
            totalBleed: cumulativeBleed * item.quantity,
            isZombie: daysInStock > 60 && !hasSoldRecently
        };
    });

    return reports.filter(r => r.isZombie).sort((a, b) => b.totalBleed - a.totalBleed);
}



export async function finalizeQuotation(quoteId: string) {
    const db = await readDb();
    const quote = db.quotations.find(q => q.id === quoteId);
    if (!quote) throw new Error("Quotation not found");
    if (quote.status !== 'pending') throw new Error("Quotation already processed");

    // Convert items to sales
    for (const item of quote.items) {
        // We use recordSale logic here manually to avoid multiple DB reads/writes
        const newSale: Sale = {
            id: Math.random().toString(36).substring(2, 9),
            shopId: quote.shopId,
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalBeforeTax: (item.unitPrice * item.quantity),
            date: new Date().toISOString(),
            tax: (item.unitPrice * item.quantity) * 0.155,
            totalWithTax: item.total,
            employeeId: quote.employeeId
        };
        db.sales.push(newSale);

        // Update inventory
        const inventoryItem = db.inventory.find(i => i.id === item.itemId);
        if (inventoryItem) {
            const allocation = inventoryItem.allocations.find(a => a.shopId === quote.shopId);
            if (allocation) {
                allocation.quantity -= item.quantity;
            }
            inventoryItem.quantity -= item.quantity;
        }
    }

    quote.status = 'converted';

    // Audit Logging
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: quote.employeeId,
        action: 'QUOTE_CONVERTED',
        details: `Quote ID: ${quoteId}, Total: $${quote.totalWithTax.toFixed(2)}`
    });

    await writeDb(db);
    revalidatePath(`/shops/${quote.shopId}`);
    revalidatePath("/finance");
}

export async function exportDatabase() {
    const db = await readDb();

    // Audit Logging
    db.auditLog.push({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        employeeId: 'ADMIN',
        action: 'SYSTEM_EXPORT',
        details: `Full database snapshot exported.`
    });

    await writeDb(db);
    return JSON.stringify(db, null, 2);
}
