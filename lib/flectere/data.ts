import { supabaseAdmin } from "@/lib/supabase";

export async function fetchAll<T>(
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
  hasData: boolean;
  daysWithData: number;
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

  // Build daily actuals
  const dailyActuals: { dayRev: number; dayExp: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayRev = (sales || [])
      .filter((s: any) => s.date && toLocalDateString(s.date) === dateStr)
      .reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const dayExp = (ledger || [])
      .filter((l: any) => l.date && toLocalDateString(l.date) === dateStr)
      .reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
    dailyActuals.push({ dayRev, dayExp });
  }

  const actualDays = dailyActuals.slice(0, currentDay);
  const actualRevenue = actualDays.reduce((s, d) => s + d.dayRev, 0);
  const actualExpenses = actualDays.reduce((s, d) => s + d.dayExp, 0);
  const actualExpensesVariable = actualExpenses;
  const avgDailyRevenue = currentDay > 0 ? actualRevenue / currentDay : 0;
  const daysWithData = actualDays.filter((d) => d.dayRev > 0 || d.dayExp > 0).length;

  const daily: CashFlowDay[] = [];
  let cumRev = 0;
  let cumExp = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const { dayRev, dayExp } = dailyActuals[day - 1];

    if (day <= currentDay) {
      cumRev += dayRev;
      cumExp += dayExp;
    }

    const cumFixed = dailyFixed * day;
    // For future days, project revenue forward at avg daily rate
    const projectedRev = day <= currentDay ? cumRev : cumRev + avgDailyRevenue * (day - currentDay);
    const totalExp = cumExp + cumFixed;

    const revenue = day <= currentDay ? Math.round(cumRev * 100) / 100 : Math.round(projectedRev * 100) / 100;
    const expenses = Math.round(totalExp * 100) / 100;
    const netCash = Math.round((projectedRev - totalExp) * 100) / 100;
    const profit = Math.round((projectedRev - totalExp) * 100) / 100;

    daily.push({
      day,
      date: dateStr,
      revenue: day <= currentDay ? revenue : null,
      expenses,
      profit: day <= currentDay ? profit : null,
      netCash,
    });
  }

  const projectedMonthlyRevenue = avgDailyRevenue * daysInMonth;
  const projectedMonthlyExpenses = actualExpensesVariable + monthlyFixed;
  const netProjected = Math.round((projectedMonthlyRevenue - projectedMonthlyExpenses) * 100) / 100;

  // Runway: months of cash based on current burn
  const avgDailyTotalExpense = projectedMonthlyExpenses / daysInMonth;
  const currentCash = actualRevenue - actualExpenses - monthlyFixed;
  const runway = avgDailyTotalExpense > 0 && currentCash > 0 ? currentCash / avgDailyTotalExpense : currentCash > 0 ? 999 : 0;

  return {
    daily,
    totalRevenue: Math.round(actualRevenue * 100) / 100,
    totalExpenses: Math.round(projectedMonthlyExpenses * 100) / 100,
    netProjected,
    runway,
    hasData: daysWithData > 0,
    daysWithData,
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

export interface WoWComparison {
  currentWeekRevenue: number;
  previousWeekRevenue: number;
  growth: number;
  currentWeekOrders: number;
  previousWeekOrders: number;
  orderGrowth: number;
}

export async function getWeekOverWeek(): Promise<WoWComparison> {
  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - 7);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const currentSales = await fetchAll<any>("sales", "total_with_tax", (q) =>
    q.gte("date", currentWeekStart.toISOString()).is("deleted_at", null)
  );
  const previousSales = await fetchAll<any>("sales", "total_with_tax", (q) =>
    q.gte("date", previousWeekStart.toISOString()).lt("date", currentWeekStart.toISOString()).is("deleted_at", null)
  );

  const currentWeekRevenue = (currentSales || []).reduce((s: number, r: any) => s + Number(r.total_with_tax || 0), 0);
  const previousWeekRevenue = (previousSales || []).reduce((s: number, r: any) => s + Number(r.total_with_tax || 0), 0);
  const growth = previousWeekRevenue > 0 ? ((currentWeekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100 : currentWeekRevenue > 0 ? 100 : 0;

  return {
    currentWeekRevenue: Math.round(currentWeekRevenue * 100) / 100,
    previousWeekRevenue: Math.round(previousWeekRevenue * 100) / 100,
    growth: Math.round(growth * 100) / 100,
    currentWeekOrders: (currentSales || []).length,
    previousWeekOrders: (previousSales || []).length,
    orderGrowth: previousSales.length > 0 ? Math.round(((currentSales.length - previousSales.length) / previousSales.length) * 10000) / 100 : 0,
  };
}

export interface DataQualityReport {
  totalSales: number;
  totalInventory: number;
  totalEmployees: number;
  totalShops: number;
  salesWithoutClient: number;
  itemsWithoutCategory: number;
  salesThisMonth: number;
  lastSaleDate: string | null;
}

export async function getDataQuality(): Promise<DataQualityReport> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count: totalSales } = await supabaseAdmin.from("sales").select("*", { count: "exact", head: true }).is("deleted_at", null);
  const { count: totalInventory } = await supabaseAdmin.from("inventory_items").select("*", { count: "exact", head: true });
  const { count: totalEmployees } = await supabaseAdmin.from("employees").select("*", { count: "exact", head: true });
  const { count: totalShops } = await supabaseAdmin.from("shops").select("*", { count: "exact", head: true });

  const { data: noClient } = await supabaseAdmin.from("sales").select("id").is("client_name", null).is("deleted_at", null).limit(1);
  const { data: noCategory } = await supabaseAdmin.from("inventory_items").select("id").or("category.is.null,category.eq.").limit(1);

  const { count: salesThisMonth, error: monthErr } = await supabaseAdmin
    .from("sales").select("*", { count: "exact", head: true })
    .gte("date", monthStart).is("deleted_at", null);

  const { data: lastSale } = await supabaseAdmin
    .from("sales").select("date").is("deleted_at", null).order("date", { ascending: false }).limit(1);

  return {
    totalSales: totalSales || 0,
    totalInventory: totalInventory || 0,
    totalEmployees: totalEmployees || 0,
    totalShops: totalShops || 0,
    salesWithoutClient: noClient?.length || 0,
    itemsWithoutCategory: noCategory?.length || 0,
    salesThisMonth: salesThisMonth || 0,
    lastSaleDate: lastSale?.[0]?.date || null,
  };
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
