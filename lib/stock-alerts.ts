import { supabaseAdmin } from "@/lib/supabase";

export type StockAlert = {
  itemId: string;
  itemName: string;
  category: string;
  currentStock: number;
  shopId: string;
  shopName: string;
  lastSaleDate: string | null;
  daysOutOfStock: number;
  velocity7d: number; // units sold in last 7 days
  velocity30d: number; // units sold in last 30 days
  avgDailySalesRate: number; // units/day
  daysUntilStockout: number; // estimated days before next stockout at current rate
  severity: "critical" | "high" | "medium" | "low";
};

export type ReorderStrategy = {
  itemId: string;
  itemName: string;
  recommendedQty: number;
  estimatedCost: number;
  fromShipmentId: string | null;
  fromSupplier: string | null;
  lastPrice: number;
  urgency: "immediate" | "within-week" | "planned";
  rationale: string;
};

/**
 * Get items at the Nirvana Tees shop that are out of stock (qty = 0)
 */
export async function getOutOfStockAlerts(shopId: string = "tshirts"): Promise<StockAlert[]> {
  const alerts: StockAlert[] = [];

  try {
    // Get items with 0 allocation at tees shop
    const { data: zeroStockAllocations, error: allocErr } = await supabaseAdmin
      .from("inventory_allocations")
      .select("item_id")
      .eq("shop_id", shopId)
      .eq("quantity", 0);

    if (allocErr) {
      console.error("Error fetching zero-stock allocations:", allocErr);
      return alerts;
    }

    if (!zeroStockAllocations?.length) return alerts;

    const itemIds = zeroStockAllocations.map((a: any) => a.item_id as string);

    // Get item details
    const { data: items, error: itemErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, category")
      .in("id", itemIds);

    if (itemErr) {
      console.error("Error fetching items:", itemErr);
      return alerts;
    }

    // Get shop name
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("id, name")
      .eq("id", shopId)
      .single();

    const shopName = shop?.name || shopId;

    // For each item, get sales history
    for (const item of items || []) {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get 7-day sales
      const { data: sales7d = [] } = await supabaseAdmin
        .from("sales")
        .select("quantity, date")
        .eq("item_id", item.id)
        .eq("shop_id", shopId)
        .gte("date", sevenDaysAgo.toISOString());

      // Get 30-day sales
      const { data: sales30d = [] } = await supabaseAdmin
        .from("sales")
        .select("quantity, date")
        .eq("item_id", item.id)
        .eq("shop_id", shopId)
        .gte("date", thirtyDaysAgo.toISOString());

      const velocity7d = sales7d.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
      const velocity30d = sales30d.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
      const avgDailySalesRate = velocity30d > 0 ? velocity30d / 30 : 0;

      // Get last sale date
      const lastSale = sales30d[0];
      const lastSaleDate = lastSale?.date || null;
      const daysOutOfStock = lastSaleDate
        ? Math.floor((now.getTime() - new Date(lastSaleDate).getTime()) / (24 * 60 * 60 * 1000))
        : -1;

      const severity: StockAlert["severity"] =
        daysOutOfStock >= 7 ? "critical" : daysOutOfStock >= 3 ? "high" : "medium";

      alerts.push({
        itemId: item.id,
        itemName: item.name || "Unknown",
        category: item.category || "Uncategorized",
        currentStock: 0,
        shopId,
        shopName,
        lastSaleDate,
        daysOutOfStock: Math.max(0, daysOutOfStock),
        velocity7d,
        velocity30d,
        avgDailySalesRate,
        daysUntilStockout: 0, // Already at 0
        severity,
      });
    }
  } catch (err) {
    console.error("Error in getOutOfStockAlerts:", err);
  }

  return alerts.sort((a, b) => b.velocity30d - a.velocity30d);
}

/**
 * Get items running low on stock (approaching zero)
 */
export async function getLowStockAlerts(shopId: string = "tshirts", lowThreshold = 5): Promise<StockAlert[]> {
  const alerts: StockAlert[] = [];

  try {
    // Get items with low allocation at tees shop
    const { data: lowStockAllocations, error: allocErr } = await supabaseAdmin
      .from("inventory_allocations")
      .select("item_id, quantity")
      .eq("shop_id", shopId)
      .lte("quantity", lowThreshold)
      .gt("quantity", 0); // Exclude 0 stock (handled by getOutOfStockAlerts)

    if (allocErr) {
      console.error("Error fetching low-stock allocations:", allocErr);
      return alerts;
    }

    if (!lowStockAllocations?.length) return alerts;

    const itemIds = lowStockAllocations.map((a: any) => a.item_id as string);

    // Get item details
    const { data: items, error: itemErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, category")
      .in("id", itemIds);

    if (itemErr) {
      console.error("Error fetching items:", itemErr);
      return alerts;
    }

    // Get shop name
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("id, name")
      .eq("id", shopId)
      .single();

    const shopName = shop?.name || shopId;

    // For each item, get sales history
    for (const item of items || []) {
      const currentAlloc = lowStockAllocations.find((a: any) => a.item_id === item.id);
      const currentStock = currentAlloc?.quantity || 0;

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get sales
      const { data: sales7d = [] } = await supabaseAdmin
        .from("sales")
        .select("quantity")
        .eq("item_id", item.id)
        .eq("shop_id", shopId)
        .gte("date", sevenDaysAgo.toISOString());

      const { data: sales30d = [] } = await supabaseAdmin
        .from("sales")
        .select("quantity")
        .eq("item_id", item.id)
        .eq("shop_id", shopId)
        .gte("date", thirtyDaysAgo.toISOString());

      const velocity7d = sales7d.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
      const velocity30d = sales30d.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
      const avgDailySalesRate = velocity30d > 0 ? velocity30d / 30 : 0;
      const daysUntilStockout =
        avgDailySalesRate > 0 ? Math.ceil(currentStock / avgDailySalesRate) : 999;

      const severity: StockAlert["severity"] =
        daysUntilStockout <= 2 ? "critical" : daysUntilStockout <= 5 ? "high" : "medium";

      alerts.push({
        itemId: item.id,
        itemName: item.name || "Unknown",
        category: item.category || "Uncategorized",
        currentStock,
        shopId,
        shopName,
        lastSaleDate: null,
        daysOutOfStock: 0,
        velocity7d,
        velocity30d,
        avgDailySalesRate,
        daysUntilStockout,
        severity,
      });
    }
  } catch (err) {
    console.error("Error in getLowStockAlerts:", err);
  }

  return alerts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
}

/**
 * Combine out-of-stock and low-stock alerts
 */
export async function getAllStockAlerts(shopId: string = "tshirts"): Promise<StockAlert[]> {
  const [outOfStock, lowStock] = await Promise.all([
    getOutOfStockAlerts(shopId),
    getLowStockAlerts(shopId),
  ]);
  return [...outOfStock, ...lowStock].sort((a, b) => {
    // Critical first, then by velocity
    if (a.severity !== b.severity) {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.velocity30d - a.velocity30d;
  });
}

/**
 * Generate reorder strategy for an item based on shipment history and sales velocity
 */
export async function getReorderStrategy(itemId: string, shopId: string = "tshirts"): Promise<ReorderStrategy | null> {
  try {
    // Get item details
    const { data: item, error: itemErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, landed_cost")
      .eq("id", itemId)
      .single();

    if (itemErr || !item) {
      console.error("Error fetching item:", itemErr);
      return null;
    }

    // Get last 3 shipments for this item
    const { data: shipments } = await supabaseAdmin
      .from("shipments")
      .select("id, supplier_id, quantity, cost, received_at")
      .eq("item_id", itemId)
      .order("received_at", { ascending: false })
      .limit(3);

    // Get last shipment source
    const lastShipment = shipments?.[0];
    const avgQtyPerShipment = shipments
      ? shipments.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0) / shipments.length
      : 0;

    // Get recent sales velocity
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: sales30d = [] } = await supabaseAdmin
      .from("sales")
      .select("quantity")
      .eq("item_id", itemId)
      .eq("shop_id", shopId)
      .gte("date", thirtyDaysAgo.toISOString());

    const velocity30d = sales30d.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
    const avgDailySalesRate = velocity30d / 30;

    // Recommendation logic
    let recommendedQty = Math.max(5, Math.ceil(avgDailySalesRate * 14)); // 2 weeks supply
    let urgency: ReorderStrategy["urgency"] = "planned";

    // Get current stock
    const { data: allocation } = await supabaseAdmin
      .from("inventory_allocations")
      .select("quantity")
      .eq("item_id", itemId)
      .eq("shop_id", shopId)
      .single();

    const currentStock = allocation?.quantity || 0;
    const daysUntilStockout = avgDailySalesRate > 0 ? currentStock / avgDailySalesRate : 999;

    if (daysUntilStockout <= 2) {
      urgency = "immediate";
      recommendedQty = Math.max(10, Math.ceil(avgDailySalesRate * 30)); // 1 month supply
    } else if (daysUntilStockout <= 5) {
      urgency = "within-week";
      recommendedQty = Math.max(7, Math.ceil(avgDailySalesRate * 21)); // 3 weeks supply
    }

    const lastPrice = lastShipment?.cost || item.landed_cost || 0;
    const estimatedCost = recommendedQty * lastPrice;

    const rationale =
      velocity30d > 0
        ? `Selling ~${avgDailySalesRate.toFixed(1)}/day. Will run out in ~${daysUntilStockout.toFixed(1)} days. Last shipment: ${lastShipment?.quantity || 0} units${
            lastShipment?.received_at ? ` (${new Date(lastShipment.received_at).toLocaleDateString()})` : ""
          }.`
        : `No recent sales. Last restocked ${lastShipment?.received_at ? new Date(lastShipment.received_at).toLocaleDateString() : "unknown"}.`;

    return {
      itemId,
      itemName: item.name || "Unknown",
      recommendedQty,
      estimatedCost,
      fromShipmentId: lastShipment?.id || null,
      fromSupplier: lastShipment?.supplier_id || null,
      lastPrice,
      urgency,
      rationale,
    };
  } catch (err) {
    console.error("Error generating reorder strategy:", err);
    return null;
  }
}
