import { supabaseAdmin } from "@/lib/supabase";
import {
  TSHIRTS_SHOP_ID,
  classifyTeeLine,
  teeLineLabel,
  type TeeProductLine,
} from "@/lib/tshirts";

type SaleRow = {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_with_tax: number;
  total_before_tax: number;
  date: string;
  payment_method: string;
  client_name: string;
  employee_id: string;
};

type InventoryRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  landed_cost: number;
};

async function fetchTshirtsSales(sinceIso?: string): Promise<SaleRow[]> {
  let all: SaleRow[] = [];
  let from = 0;
  const batch = 1000;

  while (true) {
    let q = supabaseAdmin
      .from("sales")
      .select(
        "id, item_id, item_name, quantity, unit_price, total_with_tax, total_before_tax, date, payment_method, client_name, employee_id"
      )
      .eq("shop_id", TSHIRTS_SHOP_ID)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .range(from, from + batch - 1);

    if (sinceIso) q = q.gte("date", sinceIso);

    const { data, error } = await q;
    if (error || !data?.length) break;
    all = [...all, ...(data as SaleRow[])];
    if (data.length < batch) break;
    from += batch;
  }

  return all;
}

function toLocalDateKey(date: string): string {
  try {
    return new Date(date).toLocaleDateString("en-CA");
  } catch {
    return "";
  }
}

function lineForSale(
  sale: SaleRow,
  inventoryMap: Map<string, InventoryRow>
): TeeProductLine {
  const inv = inventoryMap.get(sale.item_id);
  if (inv) return classifyTeeLine(inv);
  return classifyTeeLine({ name: sale.item_name, category: null });
}

function sumRevenue(sales: SaleRow[]): number {
  return sales.reduce((s, r) => s + Number(r.total_with_tax || 0), 0);
}

function sumUnits(sales: SaleRow[]): number {
  return sales.reduce((s, r) => s + Number(r.quantity || 0), 0);
}

export interface TshirtsAnalytics {
  summary: {
    revenueAllTime: number;
    revenueLast60Days: number;
    revenueMonthToDate: number;
    unitsLast60Days: number;
    plainRevenue60d: number;
    golfRevenue60d: number;
    plainUnits60d: number;
    golfUnits60d: number;
    transactionCount60d: number;
    /** Sales that could not be mapped to plain/golf (missing item row, odd name, etc.) */
    unknownTransactions60d: number;
    unknownRevenue60d: number;
  };
  stockByLine: {
    line: TeeProductLine;
    label: string;
    skus: number;
    units: number;
  }[];
  dailyRevenue: { date: string; plain: number; golf: number; total: number }[];
  lineBreakdown: {
    line: TeeProductLine;
    label: string;
    revenue: number;
    units: number;
    sharePct: number;
  }[];
  topProducts: {
    itemId: string;
    itemName: string;
    line: TeeProductLine;
    lineLabel: string;
    quantity: number;
    revenue: number;
  }[];
  paymentMix: { method: string; count: number; revenue: number }[];
  sales: {
    id: string;
    date: string;
    itemName: string;
    line: TeeProductLine;
    lineLabel: string;
    quantity: number;
    unitPrice: number;
    totalWithTax: number;
    paymentMethod: string;
    clientName: string;
  }[];
}

export async function getTshirtsAnalytics(daysBack = 60): Promise<TshirtsAnalytics> {
  const now = new Date();
  const days60Ago = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [allSales, invRes, allocRes] = await Promise.all([
    fetchTshirtsSales(),
    supabaseAdmin.from("inventory_items").select("id, name, category, quantity, landed_cost"),
    supabaseAdmin
      .from("inventory_allocations")
      .select("item_id, quantity")
      .eq("shop_id", TSHIRTS_SHOP_ID),
  ]);

  const inventoryMap = new Map<string, InventoryRow>();
  (invRes.data || []).forEach((i: any) => {
    inventoryMap.set(i.id, {
      id: i.id,
      name: i.name,
      category: i.category,
      quantity: Number(i.quantity || 0),
      landed_cost: Number(i.landed_cost || 0),
    });
  });

  const allocByItem = new Map<string, number>();
  (allocRes.data || []).forEach((a: any) => {
    allocByItem.set(a.item_id, Number(a.quantity || 0));
  });

  const sales60 = allSales.filter((s) => s.date >= days60Ago);
  const salesMtd = allSales.filter((s) => s.date >= monthStart);

  const plain60 = sales60.filter((s) => lineForSale(s, inventoryMap) === "plain");
  const golf60 = sales60.filter((s) => lineForSale(s, inventoryMap) === "golf");
  const unknown60 = sales60.filter((s) => lineForSale(s, inventoryMap) === "unknown");

  const total60Rev = sumRevenue(sales60);
  const plainRev = sumRevenue(plain60);
  const golfRev = sumRevenue(golf60);
  const unknownRev = sumRevenue(unknown60);

  const stockByLine: TshirtsAnalytics["stockByLine"] = (["plain", "golf"] as const).map(
    (line) => {
      const items = [...inventoryMap.values()].filter(
        (i) => classifyTeeLine(i) === line
      );
      const units = items.reduce(
        (sum, i) => sum + (allocByItem.get(i.id) ?? 0),
        0
      );
      const skus = items.filter((i) => (allocByItem.get(i.id) ?? 0) > 0).length;
      return { line, label: teeLineLabel(line), skus, units };
    }
  );

  const dayMap = new Map<string, { plain: number; golf: number; total: number }>();
  for (let d = daysBack - 1; d >= 0; d--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    const key = toLocalDateKey(dt.toISOString());
    dayMap.set(key, { plain: 0, golf: 0, total: 0 });
  }

  sales60.forEach((s) => {
    const key = toLocalDateKey(s.date);
    if (!key || !dayMap.has(key)) return;
    const row = dayMap.get(key)!;
    const amt = Number(s.total_with_tax || 0);
    const line = lineForSale(s, inventoryMap);
    row.total += amt;
    if (line === "plain") row.plain += amt;
    else if (line === "golf") row.golf += amt;
  });

  const dailyRevenue = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const lineBreakdown: TshirtsAnalytics["lineBreakdown"] = (
    ["plain", "golf"] as const
  ).map((line) => {
    const subset = sales60.filter((s) => lineForSale(s, inventoryMap) === line);
    const revenue = sumRevenue(subset);
    return {
      line,
      label: teeLineLabel(line),
      revenue,
      units: sumUnits(subset),
      sharePct: total60Rev > 0 ? Math.round((revenue / total60Rev) * 1000) / 10 : 0,
    };
  });

  const productAgg = new Map<
    string,
    { itemName: string; line: TeeProductLine; quantity: number; revenue: number }
  >();
  sales60.forEach((s) => {
    const line = lineForSale(s, inventoryMap);
    const key = s.item_id || s.item_name;
    const cur = productAgg.get(key) || {
      itemName: s.item_name,
      line,
      quantity: 0,
      revenue: 0,
    };
    cur.quantity += Number(s.quantity || 0);
    cur.revenue += Number(s.total_with_tax || 0);
    productAgg.set(key, cur);
  });

  const topProducts = [...productAgg.entries()]
    .map(([itemId, v]) => ({
      itemId,
      itemName: v.itemName,
      line: v.line,
      lineLabel: teeLineLabel(v.line),
      quantity: v.quantity,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  const payMap = new Map<string, { count: number; revenue: number }>();
  sales60.forEach((s) => {
    const method = String(s.payment_method || "cash").toLowerCase();
    const cur = payMap.get(method) || { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(s.total_with_tax || 0);
    payMap.set(method, cur);
  });

  const paymentMix = [...payMap.entries()].map(([method, v]) => ({
    method,
    ...v,
  }));

  const sales = allSales.slice(0, 500).map((s) => {
    const line = lineForSale(s, inventoryMap);
    return {
      id: s.id,
      date: s.date,
      itemName: s.item_name,
      line,
      lineLabel: teeLineLabel(line),
      quantity: Number(s.quantity || 0),
      unitPrice: Number(s.unit_price || 0),
      totalWithTax: Number(s.total_with_tax || 0),
      paymentMethod: s.payment_method || "cash",
      clientName: s.client_name || "Walk-in",
    };
  });

  return {
    summary: {
      revenueAllTime: sumRevenue(allSales),
      revenueLast60Days: total60Rev,
      revenueMonthToDate: sumRevenue(salesMtd),
      unitsLast60Days: sumUnits(sales60),
      plainRevenue60d: plainRev,
      golfRevenue60d: golfRev,
      plainUnits60d: sumUnits(plain60),
      golfUnits60d: sumUnits(golf60),
      transactionCount60d: sales60.length,
      unknownTransactions60d: unknown60.length,
      unknownRevenue60d: unknownRev,
    },
    stockByLine,
    dailyRevenue,
    lineBreakdown,
    topProducts,
    paymentMix,
    sales,
  };
}
