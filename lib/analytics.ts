import { readDb, Database, Sale, InventoryItem } from "./db";

export interface SalesMetric {
    itemId: string;
    itemName: string;
    totalQuantity: number;
    totalRevenue: number;
    grossMargin: number;
}

export interface TrendMetric {
    period: string; // "This Week", "Last Week"
    revenue: number;
    growth: number; // Percentage
}

/**
 * INTELLIGENCE ENGINE: "The Brain"
 * Processes raw JSON data into actionable business insights.
 */

// 1. BEST SELLERS Logic
export async function getBestSellers(daysBytes = 30): Promise<SalesMetric[]> {
    const db = await readDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBytes);

    const salesMap = new Map<string, SalesMetric>();

    // Aggregate Sales
    db.sales.forEach(sale => {
        if (new Date(sale.date) >= cutoffDate) {
            const existing = salesMap.get(sale.itemId) || {
                itemId: sale.itemId,
                itemName: sale.itemName,
                totalQuantity: 0,
                totalRevenue: 0,
                grossMargin: 0
            };

            existing.totalQuantity += sale.quantity;
            existing.totalRevenue += sale.totalWithTax;

            // Calculate Margin (Simple: Sale Price - (Landed Cost * Qty))
            // Note: In a real app, we'd look up the exact cost at time of sale, 
            // but here we look up current cost which is a close approximation for MVP.
            const item = db.inventory.find(i => i.id === sale.itemId);
            if (item) {
                const cost = item.landedCost * sale.quantity;
                existing.grossMargin += (sale.totalBeforeTax - cost);
            }

            salesMap.set(sale.itemId, existing);
        }
    });

    return Array.from(salesMap.values())
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10); // Top 10
}

// 2. PERFORMANCE TRENDS
export async function getPerformanceTrends() {
    const db = await readDb();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    let currentPeriodRevenue = 0;
    let previousPeriodRevenue = 0;

    db.sales.forEach(sale => {
        const saleDate = new Date(sale.date);
        if (saleDate >= thirtyDaysAgo) {
            currentPeriodRevenue += sale.totalWithTax;
        } else if (saleDate >= sixtyDaysAgo && saleDate < thirtyDaysAgo) {
            previousPeriodRevenue += sale.totalWithTax;
        }
    });


    const growth = previousPeriodRevenue > 0
        ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
        : 100;

    return {
        currentPeriodRevenue,
        previousPeriodRevenue,
        growth
    };
}

// 3. SMART REORDERING
export interface ReorderSuggestion {
    itemId: string;
    itemName: string;
    currentStock: number;
    dailyVelocity: number;
    daysToZero: number;
    suggestedReorder: number; // To reach 30 days coverage
}

export async function getReorderSuggestions(): Promise<ReorderSuggestion[]> {
    const db = await readDb();
    const suggestions: ReorderSuggestion[] = [];

    for (const item of db.inventory) {
        // Calculate Velocity (Last 30 Days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSales = db.sales.filter(s =>
            s.itemId === item.id &&
            new Date(s.date) >= thirtyDaysAgo
        );

        const totalSold = recentSales.reduce((sum, s) => sum + s.quantity, 0);
        const dailyVelocity = totalSold / 30;

        // Days until stockout
        const daysToZero = dailyVelocity > 0 ? item.quantity / dailyVelocity : Infinity;

        // Logic: specific threshold (e.g. 14 days)
        if (daysToZero < 14 && dailyVelocity > 0) {
            const targetStock = dailyVelocity * 30; // Aim for 30 days buffer
            const needed = Math.ceil(targetStock - item.quantity);

            if (needed > 0) {
                suggestions.push({
                    itemId: item.id,
                    itemName: item.name,
                    currentStock: item.quantity,
                    dailyVelocity,
                    daysToZero,
                    suggestedReorder: needed
                });
            }
        }
    }

    return suggestions.sort((a, b) => a.daysToZero - b.daysToZero); // Critical first
}

// 4. ZOMBIE/DEAD STOCK HUNTER
export interface DeadStockItem {
    itemId: string;
    itemName: string;
    quantity: number;
    value: number; // tied up capital
    daysInStock: number;
}

export async function getDeadStock(): Promise<DeadStockItem[]> {
    const db = await readDb();
    const deadItems: DeadStockItem[] = [];
    const now = new Date().getTime();

    for (const item of db.inventory) {
        // Check if sold in last 60 days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const hasRecentSale = db.sales.some(s =>
            s.itemId === item.id &&
            new Date(s.date) >= sixtyDaysAgo
        );

        const daysInStock = Math.floor((now - new Date(item.dateAdded).getTime()) / (1000 * 3600 * 24));

        if (!hasRecentSale && daysInStock > 60) {
            deadItems.push({
                itemId: item.id,
                itemName: item.name,
                quantity: item.quantity,
                value: item.landedCost * item.quantity,
                daysInStock
            });
        }
    }


    return deadItems.sort((a, b) => b.value - a.value); // Most expensive mistakes first
}

// 5. SALES HISTORY (Visuals)
export interface DailySalesMetric {
    date: string;
    revenue: number;
    profit: number;
}

export async function getSalesHistory(days = 30): Promise<DailySalesMetric[]> {
    const db = await readDb();
    const history: DailySalesMetric[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

        const daySales = db.sales.filter(s => s.date.startsWith(dateStr));
        const revenue = daySales.reduce((sum, s) => sum + s.totalWithTax, 0);

        // Approx profit (Revenue - Cost)
        // Note: Cost lookup is simplified here
        let cost = 0;
        daySales.forEach(s => {
            const item = db.inventory.find(i => i.id === s.itemId);
            if (item) {
                cost += (item.landedCost * s.quantity);
            }
        });

        history.push({
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue,
            profit: revenue - cost // Simplified metric
        });
    }

    return history;
}

// 6. GAMIFIED LEADERBOARD
export interface StaffMetric {
    id: string;
    name: string;
    role: string;
    shopId: string;
    revenue: number;
    salesCount: number;
    quoteCount: number;
    conversionRate: number;
    points: number;
}

export async function getStaffLeaderboard(): Promise<StaffMetric[]> {
    const db = await readDb();
    const stats = db.employees.map(emp => {
        const sales = db.sales.filter(s => s.employeeId === emp.id);
        const quotes = db.quotations.filter(q => q.employeeId === emp.id);

        const revenue = sales.reduce((acc, s) => acc + s.totalWithTax, 0);
        const conversionRate = quotes.length > 0
            ? (quotes.filter(q => q.status === 'converted').length / quotes.length) * 100
            : 0;

        return {
            id: emp.id,
            name: emp.name,
            role: emp.role,
            shopId: emp.shopId,
            revenue,
            salesCount: sales.length,
            quoteCount: quotes.length,
            conversionRate,
            points: (sales.length * 10) + (quotes.length * 2) // Gaming logic
        };
    });

    return stats.sort((a, b) => b.points - a.points);
}

// 7. PREDICTIVE ANALYTICS (The Forecaster)
export interface Forecast {
    trend: 'up' | 'down' | 'flat';
    slope: number; // Daily growth ($)
    projectedNext30: number; // Predicted total for NEXT 30 days
    confidence: number; // R-squared (0-1)
    nextMonthPoints: { day: number; value: number }[];
}

export async function getRevenueForecast(): Promise<Forecast> {
    const history = await getSalesHistory(30);
    // history is ordered recent -> old (descending date) in getSalesHistory implementation? 
    // Wait, getSalesHistory loop: `for (let i = days - 1; i >= 0; i--)` pushes to array.
    // So `i=29` (30 days ago) is pushed first? No.
    // Loop: i=29...0.
    // date = now - i.
    // So i=29 is 29 days ago. i=0 is today.
    // So array is [Oldest ... Newest]. Correct for charting.

    const n = history.length;
    if (n < 2) return { trend: 'flat', slope: 0, projectedNext30: 0, confidence: 0, nextMonthPoints: [] };

    // Linear Regression: y = mx + c
    // x = day index (0 to 29)
    // y = revenue
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    history.forEach((point, i) => {
        const x = i;
        const y = point.revenue;
        sumX += x;
        sumY += y;
        sumXY += (x * y);
        sumXX += (x * x);
    });

    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const c = (sumY - m * sumX) / n;

    // Project next 30 days (indices 30 to 59)
    let projectedNext30 = 0;
    const nextMonthPoints = [];

    for (let i = 0; i < 30; i++) {
        const x = n + i;
        const y = m * x + c;
        // Don't predict negative revenue
        const val = Math.max(0, y);
        projectedNext30 += val;
        nextMonthPoints.push({ day: i + 1, value: val });
    }

    // Calculate R-squared (Confidence)
    const yMean = sumY / n;
    let ssTot = 0, ssRes = 0;
    history.forEach((point, i) => {
        const y = point.revenue;
        const yPred = m * i + c;
        ssTot += Math.pow(y - yMean, 2);
        ssRes += Math.pow(y - yPred, 2);
    });

    // Avoid division by zero
    const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

    return {
        trend: m > 0 ? 'up' : m < 0 ? 'down' : 'flat',
        slope: m,
        projectedNext30,
        confidence: r2,
        nextMonthPoints
    };
}
