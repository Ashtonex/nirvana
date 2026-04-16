import { supabaseAdmin } from "@/lib/supabase";

function toLocalDateString(date: Date | string | null | undefined): string {
    if (!date) return '';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('en-CA');
    } catch {
        return '';
    }
}

function getLocalDateStr(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMonthDateRange(year: number, month: number): { start: string; end: string } {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return {
        start: start.toISOString(),
        end: end.toISOString()
    };
}

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
    const { data, error } = await supabaseAdmin.rpc('get_best_selling_items', { 
        days_back_int: daysBack, 
        top_n: 10 
    });

    if (error || !data) {
        console.error('[getBestSellers] RPC Error:', error);
        return [];
    }

    return (data as any[]).map(item => ({
        itemId: item.item_id,
        itemName: item.item_name,
        totalQuantity: Number(item.total_quantity),
        totalRevenue: Number(item.total_revenue),
        grossMargin: Number(item.gross_margin)
    }));
}

// 2. PERFORMANCE TRENDS
export async function getPerformanceTrends() {
    const { data, error } = await supabaseAdmin.rpc('get_financial_trends', { 
        days_back_int: 30 
    });

    if (error || !data) {
        console.error('[getPerformanceTrends] RPC Error:', error);
        return { currentPeriodRevenue: 0, previousPeriodRevenue: 0, growth: 0 };
    }

    return {
        currentPeriodRevenue: Number(data.currentPeriodRevenue),
        previousPeriodRevenue: Number(data.previousPeriodRevenue),
        growth: Number(data.growth)
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
        const daysToZero = dailyVelocity > 0 ? item.quantity / dailyVelocity : (item.quantity === 0 ? 0 : Infinity);

        // Notify if quantity is 0 OR if running low based on velocity
        if (item.quantity === 0 || (daysToZero < 14 && dailyVelocity > 0)) {
            const targetStock = dailyVelocity > 0 ? dailyVelocity * 30 : 5; // Default to 5 if no velocity
            const needed = Math.max(1, Math.ceil(targetStock - item.quantity));

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

    return suggestions.sort((a, b) => a.daysToZero - b.daysToZero);
}

export async function getPremiumStockValue() {
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('landed_cost, quantity');
    const totalCost = (inventory || []).reduce((sum: number, item: any) => sum + (Number(item.landed_cost || 0) * Number(item.quantity || 0)), 0);
    return totalCost * 1.65;
}

export async function getBreakEvenStockValue() {
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('landed_cost, quantity');
    const totalCost = (inventory || []).reduce((sum: number, item: any) => sum + (Number(item.landed_cost || 0) * Number(item.quantity || 0)), 0);
    return totalCost * 1.35;
}

export async function getLeanStockValue() {
    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('landed_cost, quantity');
    const totalCost = (inventory || []).reduce((sum: number, item: any) => sum + (Number(item.landed_cost || 0) * Number(item.quantity || 0)), 0);
    return totalCost * 1.25;
}

// Helper to normalize shop identifiers to match chart expectations
function normalizeShopKey(shopId: string, shopName: string): string {
    const id = String(shopId || '').toLowerCase();
    const name = String(shopName || '').toLowerCase();
    
    // Check for common shop names
    if (id.includes('kipasa') || name.includes('kipasa')) return 'kipasa';
    if (id.includes('dub') || name.includes('dub')) return 'dubdub';
    if (id.includes('trade') || id.includes('tc') || name.includes('trade') || name.includes('tc')) return 'tradecenter';
    
    // Return the lowercase ID
    return id;
}

// Known shop keys we track
const KNOWN_SHOP_KEYS = ['kipasa', 'dubdub', 'tradecenter'];

export async function getSalesVsOverheadsData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const currentDay = now.getDate();
    
    const { start: monthStart, end: monthEnd } = getMonthDateRange(year, month);

    const { data: shops } = await supabaseAdmin.from('shops').select('id, name, expenses');
    const { data: ledger } = await supabaseAdmin.from('ledger_entries').select('shop_id, type, amount, date')
        .eq('type', 'expense')
        .gte('date', monthStart)
        .lte('date', monthEnd);
    const { data: sales } = await supabaseAdmin.from('sales').select('shop_id, total_with_tax, date')
        .gte('date', monthStart)
        .lte('date', monthEnd);

    console.log('[getSalesVsOverheadsData] Month:', `${year}-${month}, days: ${daysInMonth}, currentDay: ${currentDay}`);
    console.log('[getSalesVsOverheadsData] Date range:', monthStart, 'to', monthEnd);
    console.log('[getSalesVsOverheadsData] Sales count:', sales?.length || 0);
    console.log('[getSalesVsOverheadsData] Sample sales:', (sales || []).slice(0, 3).map((s: any) => ({ date: s.date, shop_id: s.shop_id, total: s.total_with_tax })));
    
    const shopList = shops || [];
    const ledgerExpenses = (ledger || []).filter((l: any) => l.type === 'expense');

    const shopKeyMap: Record<string, { id: string; name: string; expenses: any }> = {};
    shopList.forEach((s: any) => {
        const key = normalizeShopKey(s.id, s.name);
        shopKeyMap[key] = s;
    });

    const shopExpensesByKey: Record<string, number> = {};
    KNOWN_SHOP_KEYS.forEach(key => {
        const shop = shopKeyMap[key];
        if (shop) {
            const exp = shop.expenses || {};
            shopExpensesByKey[key] = Object.values(exp).reduce((a: number, b: any) => a + Number(b || 0), 0);
        }
    });
    
    const shopStructuredTotal = Object.values(shopExpensesByKey).reduce((sum, val) => sum + val, 0);
    const ledgerExpenseTotal = ledgerExpenses.reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
    const globalMonthlyOverhead = Math.min(shopStructuredTotal > 0 ? shopStructuredTotal + ledgerExpenseTotal : ledgerExpenseTotal, 4900);

    const datasets: Record<string, any[]> = {
        global: [],
        kipasa: [],
        dubdub: [],
        tradecenter: []
    };

    let runningTotal = 0;
    const shopRunningTotals: Record<string, number> = {
        kipasa: 0,
        dubdub: 0,
        tradecenter: 0
    };

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = getLocalDateStr(year, month, day);

        const dailyGlobalOverhead = daysInMonth > 0 ? globalMonthlyOverhead / daysInMonth : 0;
        const cumulativeGlobalOverhead = Math.round(dailyGlobalOverhead * day * 100) / 100;

        const daySales = (sales || []).filter((s: any) => {
            if (!s.date) return false;
            const saleDate = toLocalDateString(s.date);
            return saleDate === dateStr;
        });
        
        const globalDayRevenue = daySales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
        
        if (day <= currentDay) {
            runningTotal += globalDayRevenue;
        }

        const cumulativeGlobalSales = day > currentDay ? null : Math.round(runningTotal * 100) / 100;
        const profitVal = cumulativeGlobalSales !== null
            ? Math.round((cumulativeGlobalSales - cumulativeGlobalOverhead) * 100) / 100
            : null;

        datasets.global.push({
            day,
            overhead: cumulativeGlobalOverhead,
            sales: cumulativeGlobalSales,
            profit: profitVal
        });

        KNOWN_SHOP_KEYS.forEach((shopKey) => {
            const shopMonthlyOverhead = shopExpensesByKey[shopKey] || 0;
            const dailyShopOverhead = daysInMonth > 0 ? shopMonthlyOverhead / daysInMonth : 0;
            const cumulativeShopOverhead = Math.round(dailyShopOverhead * day * 100) / 100;

            const shopDaySales = (sales || []).filter((s: any) => {
                if (!s.date) return false;
                const saleDate = toLocalDateString(s.date);
                const saleShopKey = normalizeShopKey(s.shop_id, '');
                return saleShopKey === shopKey && saleDate === dateStr;
            });
            
            const shopDayRevenue = shopDaySales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
            
            if (day <= currentDay) {
                shopRunningTotals[shopKey] += shopDayRevenue;
            }

            const cumulativeShopSales = day > currentDay ? null : Math.round(shopRunningTotals[shopKey] * 100) / 100;
            const shopProfitVal = cumulativeShopSales !== null
                ? Math.round((cumulativeShopSales - cumulativeShopOverhead) * 100) / 100
                : null;

            datasets[shopKey].push({
                day,
                overhead: cumulativeShopOverhead,
                sales: cumulativeShopSales,
                profit: shopProfitVal
            });
        });
    }

    console.log('[getSalesVsOverheadsData] Final running total:', runningTotal);
    console.log('[getSalesVsOverheadsData] Final global dataset:', datasets.global.filter(d => d.sales !== null).slice(-5));

    return datasets;
}

export async function getRevenueExpenseProfitTrajectoryData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const currentDay = now.getDate();
    
    const { start: monthStart, end: monthEnd } = getMonthDateRange(year, month);

    const { data: shops } = await supabaseAdmin.from('shops').select('id, name, expenses');
    const { data: ledger } = await supabaseAdmin
        .from('ledger_entries')
        .select('shop_id, type, amount, date')
        .eq('type', 'expense')
        .gte('date', monthStart)
        .lte('date', monthEnd);
    const { data: sales } = await supabaseAdmin
        .from('sales')
        .select('shop_id, total_with_tax, date')
        .gte('date', monthStart)
        .lte('date', monthEnd);

    console.log('[getRevenueExpenseProfitTrajectoryData] Sales count:', sales?.length || 0);
    console.log('[getRevenueExpenseProfitTrajectoryData] Sample:', (sales || []).slice(0, 3));
    
    const shopList = shops || [];
    const ledgerExpenses = (ledger || []).filter((l: any) => l.type === 'expense');
    const salesRows = sales || [];

    const shopKeyMap: Record<string, { id: string; name: string; expenses: any }> = {};
    shopList.forEach((s: any) => {
        const key = normalizeShopKey(s.id, s.name);
        shopKeyMap[key] = s;
    });

    const datasets: Record<string, any[]> = { 
        global: [],
        kipasa: [],
        dubdub: [],
        tradecenter: []
    };

    const shopExpensesByKey: Record<string, number> = {};
    KNOWN_SHOP_KEYS.forEach(key => {
        const shop = shopKeyMap[key];
        if (shop) {
            shopExpensesByKey[key] = Object.values(shop.expenses || {}).reduce((a: number, b: any) => a + Number(b || 0), 0);
        }
    });

    const rawGlobalFixed = Object.values(shopExpensesByKey).reduce((sum: number, val) => sum + val, 0);
    const globalFixedMonthly = Math.min(rawGlobalFixed, 4900);
    const dailyGlobalFixed = daysInMonth > 0 ? globalFixedMonthly / daysInMonth : 0;

    let runningRevenue = 0;
    let runningVariableExp = 0;
    const shopRunningRevenue: Record<string, number> = { kipasa: 0, dubdub: 0, tradecenter: 0 };
    const shopRunningVarExp: Record<string, number> = { kipasa: 0, dubdub: 0, tradecenter: 0 };

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = getLocalDateStr(year, month, day);

        const dayRevenue = salesRows
            .filter((s: any) => {
                if (!s.date) return false;
                return toLocalDateString(s.date) === dateStr;
            })
            .reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
        
        const dayVariableExp = ledgerExpenses
            .filter((l: any) => {
                if (!l.date) return false;
                return toLocalDateString(l.date) === dateStr;
            })
            .reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);

        if (day <= currentDay) {
            runningRevenue += dayRevenue;
            runningVariableExp += dayVariableExp;
        }

        const cumulativeGlobalFixed = Math.round((dailyGlobalFixed * day) * 100) / 100;
        const cumulativeGlobalVar = Math.round(runningVariableExp * 100) / 100;
        const cumulativeGlobalExpenses = Math.round((cumulativeGlobalFixed + cumulativeGlobalVar) * 100) / 100;
        const cumulativeRevenue = day > currentDay ? null : Math.round(runningRevenue * 100) / 100;
        const globalProfit = cumulativeRevenue !== null
            ? Math.round((cumulativeRevenue - cumulativeGlobalExpenses) * 100) / 100
            : null;

        datasets.global.push({
            day,
            date: dateStr,
            revenue: cumulativeRevenue,
            expenses: cumulativeGlobalExpenses,
            profit: globalProfit,
            fixedOverhead: cumulativeGlobalFixed,
            variableExpenses: cumulativeGlobalVar,
        });

        KNOWN_SHOP_KEYS.forEach((shopKey) => {
            const shopMonthlyOverhead = shopExpensesByKey[shopKey] || 0;
            const dailyShopFixed = daysInMonth > 0 ? shopMonthlyOverhead / daysInMonth : 0;
            const cumulativeShopFixed = Math.round((dailyShopFixed * day) * 100) / 100;

            const shopDayRevenue = salesRows
                .filter((s: any) => {
                    if (!s.date) return false;
                    return normalizeShopKey(s.shop_id, '') === shopKey && toLocalDateString(s.date) === dateStr;
                })
                .reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

            const shopDayVarExp = ledgerExpenses
                .filter((l: any) => {
                    if (!l.date) return false;
                    return normalizeShopKey(l.shop_id, '') === shopKey && toLocalDateString(l.date) === dateStr;
                })
                .reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);

            if (day <= currentDay) {
                shopRunningRevenue[shopKey] += shopDayRevenue;
                shopRunningVarExp[shopKey] += shopDayVarExp;
            }

            const cumulativeShopRevenue = day > currentDay ? null : Math.round(shopRunningRevenue[shopKey] * 100) / 100;
            const cumulativeShopVar = Math.round(shopRunningVarExp[shopKey] * 100) / 100;
            const cumulativeShopExpenses = Math.round((cumulativeShopFixed + cumulativeShopVar) * 100) / 100;
            const shopProfit = cumulativeShopRevenue !== null
                ? Math.round((cumulativeShopRevenue - cumulativeShopExpenses) * 100) / 100
                : null;

            datasets[shopKey].push({
                day,
                date: dateStr,
                revenue: cumulativeShopRevenue,
                expenses: cumulativeShopExpenses,
                profit: shopProfit,
                fixedOverhead: cumulativeShopFixed,
                variableExpenses: cumulativeShopVar,
            });
        });
    }

    return datasets;
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

export interface TodaySaleMetric {
    id: string;
    itemName: string;
    quantity: number;
    totalWithTax: number;
    clientName: string;
    time: string;
}

export async function getSalesHistory(days = 30): Promise<DailySalesMetric[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: sales } = await supabaseAdmin
        .from('sales')
        .select('date, total_with_tax, total_before_tax, item_id, quantity')
        .gte('date', cutoff)
        .order('date', { ascending: false })
        .limit(10000);

    const { data: inventory } = await supabaseAdmin.from('inventory_items').select('id, landed_cost');

    const invMap = new Map((inventory || []).map((i: any) => [i.id, i.landed_cost]));
    const history: DailySalesMetric[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = getLocalDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());

        const daySales = (sales || []).filter((s: any) => {
            if (!s.date) return false;
            return toLocalDateString(s.date) === dateStr;
        });

        const revenue = daySales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

        let cost = 0;
        daySales.forEach((s: any) => {
            const itemCost = invMap.get(s.item_id) as any;
            if (itemCost) {
                cost += (Number(itemCost || 0) * Number(s.quantity || 0));
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


// 5b. TODAY'S SALES (For Real-time Recent Activity)
export async function getTodaysSales(): Promise<TodaySaleMetric[]> {
    // Use a rolling 24-hour window to avoid missing sales at timezone boundaries
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: sales } = await supabaseAdmin
        .from('sales')
        .select('id, item_name, quantity, total_with_tax, client_name, date')
        .gte('date', last24h)
        .order('date', { ascending: false });

    return (sales || []).map((s: any) => ({
        id: s.id,
        itemName: s.item_name,
        quantity: s.quantity,
        totalWithTax: s.total_with_tax,
        clientName: s.client_name,
        time: new Date(s.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }));
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: employees } = await supabaseAdmin.from('employees').select('*');
    const { data: sales } = await supabaseAdmin.from('sales').select('employee_id, total_with_tax, date').gte('date', thirtyDaysAgo);
    const { data: quotations } = await supabaseAdmin.from('quotations').select('employee_id, status, date').gte('date', thirtyDaysAgo);

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
