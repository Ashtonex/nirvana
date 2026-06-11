import { supabaseAdmin } from "@/lib/supabase";

async function fetchAll<T>(
  table: string,
  select: string,
  filterFn?: (query: any) => any
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    let query = supabaseAdmin
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1);
    if (filterFn) query = filterFn(query);
    const { data, error } = await query;
    if (error || !data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < batchSize) break;
    from += batchSize;
  }
  return allData;
}

function toLocalDateString(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-CA");
}

export interface CashFlowDay {
  day: number;
  date: string;
  revenue: number | null;
  expenses: number;
  profit: number | null;
  netCash: number;
}

export async function getCashFlowProjection(): Promise<{
  daily: CashFlowDay[];
  totalRevenue: number;
  totalExpenses: number;
  netProjected: number;
  runway: number;
}> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentDay = now.getDate();

  const monthStart = new Date(year, month - 1, 1).toISOString();
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

  const { data: shops } = await supabaseAdmin.from("shops").select("id, name, expenses");
  const ledger = await fetchAll<any>("ledger_entries", "shop_id, type, amount, date", (q) =>
    q.eq("type", "expense").gte("date", monthStart).lte("date", monthEnd)
  );
  const sales = await fetchAll<any>("sales", "shop_id, total_with_tax, date", (q) =>
    q.gte("date", monthStart).lte("date", monthEnd).is("deleted_at", null)
  );

  const monthlyFixed = Object.values(shops || []).reduce(
    (sum: number, s: any) => sum + Object.values(s.expenses || {}).reduce((a: number, b: any) => a + Number(b || 0), 0),
    0
  );
  const dailyFixed = daysInMonth > 0 ? monthlyFixed / daysInMonth : 0;

  const daily: CashFlowDay[] = [];
  let runningRevenue = 0;
  let runningExpenses = 0;
  let totalExpenses = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const dayRev = (sales || [])
      .filter((s: any) => s.date && toLocalDateString(s.date) === dateStr)
      .reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

    const dayExp = (ledger || [])
      .filter((l: any) => l.date && toLocalDateString(l.date) === dateStr)
      .reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);

    if (day <= currentDay) {
      runningRevenue += dayRev;
      runningExpenses += dayExp;
      totalExpenses += dayExp;
    }

    const cumFixed = dailyFixed * day;
    const cumExpenses = Math.round((runningExpenses + cumFixed) * 100) / 100;
    const cumRevenue = day > currentDay ? null : Math.round(runningRevenue * 100) / 100;
    const profit = cumRevenue !== null ? cumRevenue - cumExpenses : null;
    const netCash = day > currentDay
      ? Math.round((runningRevenue - (runningExpenses + cumFixed)) * 100) / 100
      : Math.round((runningRevenue - cumExpenses) * 100) / 100;

    daily.push({ day, date: dateStr, revenue: cumRevenue, expenses: cumExpenses, profit, netCash });
  }

  const projectedMonthlyExpenses = totalExpenses + monthlyFixed;
  const avgDailyRevenue = runningRevenue / currentDay;
  const projectedMonthlyRevenue = avgDailyRevenue * daysInMonth;
  const netProjected = Math.round((projectedMonthlyRevenue - projectedMonthlyExpenses) * 100) / 100;

  // Runway: months of cash based on current burn rate
  const avgDailyExpense = projectedMonthlyExpenses / daysInMonth;
  const currentCash = runningRevenue - runningExpenses - monthlyFixed;
  const runway = avgDailyExpense > 0 ? currentCash / avgDailyExpense : 999;

  return {
    daily,
    totalRevenue: Math.round(runningRevenue * 100) / 100,
    totalExpenses: Math.round(projectedMonthlyExpenses * 100) / 100,
    netProjected,
    runway,
  };
}

export interface PaymentMethodSummary {
  method: string;
  total: number;
  count: number;
  percentage: number;
}

export async function getPaymentMethodAnalysis(days = 90): Promise<PaymentMethodSummary[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sales = await fetchAll<any>("sales", "payment_method, total_with_tax", (q) =>
    q.gte("date", cutoff).is("deleted_at", null)
  );

  const groups: Record<string, { total: number; count: number }> = {};
  (sales || []).forEach((s: any) => {
    const method = s.payment_method || "cash";
    if (!groups[method]) groups[method] = { total: 0, count: 0 };
    groups[method].total += Number(s.total_with_tax || 0);
    groups[method].count += 1;
  });

  const grandTotal = Object.values(groups).reduce((s, g) => s + g.total, 0);
  return Object.entries(groups)
    .map(([method, data]) => ({
      method: method.charAt(0).toUpperCase() + method.slice(1),
      total: Math.round(data.total * 100) / 100,
      count: data.count,
      percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface CategorySummary {
  category: string;
  totalValue: number;
  totalCost: number;
  itemCount: number;
  unitCount: number;
}

export async function getInventoryCategoryBreakdown(): Promise<CategorySummary[]> {
  const inventory = await fetchAll<any>("inventory_items", "category, landed_cost, quantity");
  const groups: Record<string, CategorySummary> = {};
  (inventory || []).forEach((i: any) => {
    const cat = i.category || "Uncategorized";
    if (!groups[cat]) groups[cat] = { category: cat, totalValue: 0, totalCost: 0, itemCount: 0, unitCount: 0 };
    groups[cat].totalCost += Number(i.landed_cost || 0) * Number(i.quantity || 0);
    groups[cat].itemCount += 1;
    groups[cat].unitCount += Number(i.quantity || 0);
  });
  Object.values(groups).forEach((g) => {
    g.totalValue = Math.round(g.totalCost * 1.35 * 100) / 100;
    g.totalCost = Math.round(g.totalCost * 100) / 100;
  });
  return Object.values(groups).sort((a, b) => b.totalCost - a.totalCost);
}

export interface ShopComparison {
  shopId: string;
  shopName: string;
  revenue: number;
  salesCount: number;
  averageTicket: number;
  topItem: string;
  topItemQty: number;
}

export async function getShopComparison(days = 60): Promise<ShopComparison[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: shops } = await supabaseAdmin.from("shops").select("id, name");
  const sales = await fetchAll<any>("sales", "shop_id, total_with_tax, item_name, quantity", (q) =>
    q.gte("date", cutoff).is("deleted_at", null)
  );

  const shopSales: Record<string, { revenue: number; salesCount: number; items: Record<string, number> }> = {};
  (shops || []).forEach((s: any) => {
    shopSales[s.id] = { revenue: 0, salesCount: 0, items: {} };
  });

  (sales || []).forEach((s: any) => {
    if (!shopSales[s.shop_id]) return;
    shopSales[s.shop_id].revenue += Number(s.total_with_tax || 0);
    shopSales[s.shop_id].salesCount += 1;
    const name = s.item_name || "Unknown";
    shopSales[s.shop_id].items[name] = (shopSales[s.shop_id].items[name] || 0) + Number(s.quantity || 0);
  });

  return (shops || []).map((s: any) => {
    const data = shopSales[s.id] || { revenue: 0, salesCount: 0, items: {} };
    const topEntries = Object.entries(data.items).sort(([, a], [, b]) => b - a);
    return {
      shopId: s.id,
      shopName: s.name || s.id,
      revenue: Math.round(data.revenue * 100) / 100,
      salesCount: data.salesCount,
      averageTicket: data.salesCount > 0 ? Math.round((data.revenue / data.salesCount) * 100) / 100 : 0,
      topItem: topEntries[0]?.[0] || "—",
      topItemQty: (topEntries[0]?.[1] as number) || 0,
    };
  });
}

export interface InventoryTurnover {
  overall: number;
  byCategory: { category: string; turnover: number; daysToTurn: number }[];
}

export async function getInventoryTurnover(): Promise<InventoryTurnover> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const inventory = await fetchAll<any>("inventory_items", "id, category, landed_cost, quantity");
  const sales = await fetchAll<any>("sales", "item_id, quantity, total_with_tax", (q) =>
    q.gte("date", thirtyDaysAgo).is("deleted_at", null)
  );

  const salesByItem: Record<string, { qty: number; rev: number }> = {};
  (sales || []).forEach((s: any) => {
    if (!salesByItem[s.item_id]) salesByItem[s.item_id] = { qty: 0, rev: 0 };
    salesByItem[s.item_id].qty += Number(s.quantity || 0);
    salesByItem[s.item_id].rev += Number(s.total_with_tax || 0);
  });

  const catData: Record<string, { cost: number; soldQty: number; soldCost: number; totalQty: number }> = {};
  let totalCost = 0;
  let totalSoldCost = 0;

  (inventory || []).forEach((i: any) => {
    const cat = i.category || "Uncategorized";
    if (!catData[cat]) catData[cat] = { cost: 0, soldQty: 0, soldCost: 0, totalQty: 0 };
    const itemCost = Number(i.landed_cost || 0) * Number(i.quantity || 0);
    catData[cat].cost += itemCost;
    catData[cat].totalQty += Number(i.quantity || 0);
    totalCost += itemCost;

    const sold = salesByItem[i.id];
    if (sold) {
      catData[cat].soldQty += sold.qty;
      catData[cat].soldCost += Number(i.landed_cost || 0) * sold.qty;
      totalSoldCost += Number(i.landed_cost || 0) * sold.qty;
    }
  });

  const avgInventory = totalCost;
  const annualizedSold = totalSoldCost * 12;
  const overall = avgInventory > 0 ? annualizedSold / avgInventory : 0;

  const byCategory = Object.entries(catData).map(([category, d]) => {
    const catAvgInv = d.cost;
    const catAnnualized = d.soldCost * 12;
    const turnover = catAvgInv > 0 ? catAnnualized / catAvgInv : 0;
    return { category, turnover: Math.round(turnover * 100) / 100, daysToTurn: turnover > 0 ? Math.round(365 / turnover) : 999 };
  });

  return { overall: Math.round(overall * 100) / 100, byCategory };
}

export interface DateRange {
  start: string;
  end: string;
}

export async function getTransactionDetail(
  dateMin: string,
  dateMax: string,
  shopIds?: string[]
): Promise<any[]> {
  let query = supabaseAdmin
    .from("sales")
    .select("id, shop_id, item_name, quantity, unit_price, total_with_tax, date, client_name, payment_method, employee_id")
    .gte("date", dateMin)
    .lte("date", dateMax)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(1000);

  if (shopIds && shopIds.length > 0) {
    query = query.in("shop_id", shopIds);
  }

  const { data } = await query;
  return (data || []).map((s: any) => ({
    id: s.id,
    shopId: s.shop_id,
    itemName: s.item_name || "Unknown",
    quantity: Number(s.quantity || 0),
    unitPrice: Number(s.unit_price || 0),
    totalWithTax: Number(s.total_with_tax || 0),
    date: s.date,
    clientName: s.client_name || "Walk-in",
    paymentMethod: s.payment_method || "cash",
    employeeId: s.employee_id,
  }));
}

export async function getGrossMarginSummary(): Promise<{ totalRevenue: number; totalCost: number; grossProfit: number; marginPct: number }> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const sales = await fetchAll<any>("sales", "item_id, quantity, total_with_tax, total_before_tax", (q) =>
    q.gte("date", sixtyDaysAgo).is("deleted_at", null)
  );
  const inv = await fetchAll<any>("inventory_items", "id, landed_cost");

  const invMap = new Map((inv || []).map((i: any) => [i.id, Number(i.landed_cost || 0)]));
  let totalRevenue = 0;
  let totalCost = 0;

  (sales || []).forEach((s: any) => {
    totalRevenue += Number(s.total_with_tax || 0);
    totalCost += (invMap.get(s.item_id) || 0) * Number(s.quantity || 0);
  });

  totalRevenue = Math.round(totalRevenue * 100) / 100;
  totalCost = Math.round(totalCost * 100) / 100;
  const grossProfit = Math.round((totalRevenue - totalCost) * 100) / 100;
  const marginPct = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 10000) / 100 : 0;

  return { totalRevenue, totalCost, grossProfit, marginPct };
}
