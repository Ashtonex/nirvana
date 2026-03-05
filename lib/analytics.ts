import { supabaseAdmin } from "@/lib/supabase";

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

export interface ReorderSuggestion {
    itemId: string;
    itemName: string;
    currentStock: number;
    dailyVelocity: number;
    daysToZero: number;
    suggestedReorder: number; // To reach 30 days coverage
}

/**
 * INTELLIGENCE ENGINE: "The Brain"
 * Processes raw JSON data into actionable business insights.
 */

// 1. BEST SELLERS Logic
export async function getBestSellers(daysBack = 30): Promise<SalesMetric[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const { data: sales } = await supabaseAdmin
        .from('sales')
        .select('*')
        .gte('date', cutoffDate.toISOString());
    
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('id, name, landed_cost');

    const invMap = new Map((inventory || []).map((i: any) => [i.id, i]));
    const salesMap = new Map<string, SalesMetric>();

    (sales || []).forEach((sale: any) => {
        const existing = salesMap.get(sale.item_id) || {
            itemId: sale.item_id,
            itemName: sale.item_name,
            totalQuantity: 0,
            totalRevenue: 0,
            grossMargin: 0
        };

        existing.totalQuantity += sale.quantity;
        existing.totalRevenue += sale.total_with_tax;

        const item = invMap.get(sale.item_id) as any;
        if (item) {
            const cost = (item.landed_cost || 0) * sale.quantity;
            existing.grossMargin += (sale.total_before_tax - cost);
        }

        salesMap.set(sale.item_id, existing);
    });

    return Array.from(salesMap.values())
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);
}

// 2. PERFORMANCE TRENDS
export async function getPerformanceTrends() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const { data: sales } = await supabaseAdmin.from('sales').select('total_with_tax, date');

    let currentPeriodRevenue = 0;
    let previousPeriodRevenue = 0;

    (sales || []).forEach((sale: any) => {
        const saleDate = new Date(sale.date);
        if (saleDate >= thirtyDaysAgo) {
            currentPeriodRevenue += sale.total_with_tax;
        } else if (saleDate >= sixtyDaysAgo && saleDate < thirtyDaysAgo) {
            previousPeriodRevenue += sale.total_with_tax;
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
export async function getReorderSuggestions(): Promise<ReorderSuggestion[]> {
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');
    const { data: sales } = await supabaseAdmin.from('sales').select('item_id, quantity, date');

    const suggestions: ReorderSuggestion[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const item of (inventory || [])) {
        const recentSales = (sales || []).filter((s: any) =>
            s.item_id === item.id &&
            new Date(s.date) >= thirtyDaysAgo
        );

        const totalSold = recentSales.reduce((sum: number, s: any) => sum + s.quantity, 0);
        const dailyVelocity = totalSold / 30;
        const daysToZero = dailyVelocity > 0 ? item.quantity / dailyVelocity : Infinity;

        if (daysToZero < 14 && dailyVelocity > 0) {
            const targetStock = dailyVelocity * 30;
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

    return suggestions.sort((a, b) => a.daysToZero - b.daysToZero);
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
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('*');
    const { data: sales } = await supabaseAdmin.from('sales').select('item_id, date');

    const deadItems: DeadStockItem[] = [];
    const now = new Date().getTime();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    for (const item of (inventory || [])) {
        const hasRecentSale = (sales || []).some((s: any) =>
            s.item_id === item.id &&
            new Date(s.date) >= sixtyDaysAgo
        );

        const daysInStock = Math.floor((now - new Date(item.date_added).getTime()) / (1000 * 3600 * 24));

        if (!hasRecentSale && daysInStock > 60) {
            deadItems.push({
                itemId: item.id,
                itemName: item.name,
                quantity: item.quantity,
                value: item.landed_cost * item.quantity,
                daysInStock
            });
        }
    }

    return deadItems.sort((a, b) => b.value - a.value);
}

// 5. SALES HISTORY (Visuals)
export interface DailySalesMetric {
    date: string;
    revenue: number;
    profit: number;
}

export async function getSalesHistory(days = 30): Promise<DailySalesMetric[]> {
    const { data: sales } = await supabaseAdmin.from('sales').select('date, total_with_tax, total_before_tax, item_id, quantity');
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('id, landed_cost');

    const invMap = new Map((inventory || []).map((i: any) => [i.id, i.landed_cost]));
    const history: DailySalesMetric[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];

        const daySales = (sales || []).filter((s: any) => {
            const saleDate = new Date(s.date).toISOString().split('T')[0];
            return saleDate === dateStr;
        });
        const revenue = daySales.reduce((sum: number, s: any) => sum + s.total_with_tax, 0);

        let cost = 0;
        daySales.forEach((s: any) => {
            const itemCost = invMap.get(s.item_id) as any;
            if (itemCost) {
                cost += ((itemCost || 0) * s.quantity);
            }
        });

        history.push({
            date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue,
            profit: revenue - cost
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
    const { data: employees } = await supabaseAdmin.from('employees').select('*');
    const { data: sales } = await supabaseAdmin.from('sales').select('employee_id, total_with_tax');
    const { data: quotations } = await supabaseAdmin.from('quotations').select('employee_id, status');

    const stats = (employees || []).map((emp: any) => {
        const empSales = (sales || []).filter((s: any) => s.employee_id === emp.id);
        const empQuotes = (quotations || []).filter((q: any) => q.employee_id === emp.id);

        const revenue = empSales.reduce((acc: number, s: any) => acc + (s.total_with_tax || 0), 0);
        const conversionRate = empQuotes.length > 0
            ? (empQuotes.filter((q: any) => q.status === 'converted').length / empQuotes.length) * 100
            : 0;

        return {
            id: emp.id,
            name: emp.name,
            role: emp.role,
            shopId: emp.shop_id,
            revenue,
            salesCount: empSales.length,
            quoteCount: empQuotes.length,
            conversionRate,
            points: (empSales.length * 10) + (empQuotes.length * 2)
        };
    });

    return stats.sort((a: any, b: any) => b.points - a.points);
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
