import { supabaseAdmin } from "@/lib/supabase";

export type RunningOutItem = {
  itemId: string;
  itemName: string;
  category: string;
  currentStock: number;
  velocity7d: number;
  velocity30d: number;
  avgDailySalesRate: number;
  daysUntilStockout: number;
  lastRestockDate: string | null;
  lastRestockQty: number | null;
  lastRestockPrice: number | null;
  lastRestockSupplier: string | null;
  reorderRecommendation: {
    qty: number;
    estimatedCost: number;
    urgency: 'immediate' | 'within-week' | 'planned';
  };
};

/**
 * Get items that are running out at a specific shop in the last N days
 * Prioritizes by: high velocity + low stock = soon to stockout
 */
export async function getRunningOutItems(
  shopId: string = "tshirts",
  daysBack: number = 7,
  maxItems: number = 10
): Promise<RunningOutItem[]> {
  const items: RunningOutItem[] = [];

  try {
    const now = new Date();
    const periodStart = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get current allocations for this shop (to identify running out items)
    const { data: allocations } = await supabaseAdmin
      .from("inventory_allocations")
      .select("item_id, quantity")
      .eq("shop_id", shopId)
      .lte("quantity", 10); // Items with 10 or fewer units

    if (!allocations?.length) return items;

    const itemIds = allocations.map((a) => a.item_id as string);

    // Get item details
    const { data: inventoryItems } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, category")
      .in("id", itemIds);

    if (!inventoryItems?.length) return items;

    // For each item, get sales velocity and restock history
    for (const inv of inventoryItems) {
      // Get sales in last 30 days
      const { data: sales30d = [] } = await supabaseAdmin
        .from("sales")
        .select("quantity")
        .eq("item_id", inv.id)
        .eq("shop_id", shopId)
        .gte("date", thirtyDaysAgo.toISOString());

      // Get sales in last 7 days
      const { data: sales7d = [] } = await supabaseAdmin
        .from("sales")
        .select("quantity")
        .eq("item_id", inv.id)
        .eq("shop_id", shopId)
        .gte("date", periodStart.toISOString());

      const velocity30d = sales30d.reduce((sum, s) => sum + (s.quantity || 0), 0);
      const velocity7d = sales7d.reduce((sum, s) => sum + (s.quantity || 0), 0);

      if (velocity30d === 0) continue; // Skip items with no recent sales

      const avgDailySalesRate = velocity30d / 30;
      const currentStock = allocations.find((a) => a.item_id === inv.id)?.quantity || 0;
      const daysUntilStockout = currentStock > 0 ? currentStock / avgDailySalesRate : 0;

      // Get last shipment for restock info
      const { data: lastShipments } = await supabaseAdmin
        .from("shipments")
        .select("received_at, quantity, cost, supplier_id")
        .eq("item_id", inv.id)
        .order("received_at", { ascending: false })
        .limit(1);

      const lastShipment = lastShipments?.[0];

      // Calculate reorder recommendation
      let recommendedQty = Math.max(5, Math.ceil(avgDailySalesRate * 14)); // 2 weeks
      let urgency: "immediate" | "within-week" | "planned" = "planned";

      if (daysUntilStockout <= 2) {
        urgency = "immediate";
        recommendedQty = Math.max(10, Math.ceil(avgDailySalesRate * 30)); // 1 month
      } else if (daysUntilStockout <= 5) {
        urgency = "within-week";
        recommendedQty = Math.max(7, Math.ceil(avgDailySalesRate * 21)); // 3 weeks
      }

      const lastPrice = lastShipment?.cost || 0;
      const estimatedCost = recommendedQty * lastPrice;

      items.push({
        itemId: inv.id,
        itemName: inv.name || "Unknown",
        category: inv.category || "Uncategorized",
        currentStock,
        velocity7d,
        velocity30d,
        avgDailySalesRate,
        daysUntilStockout,
        lastRestockDate: lastShipment?.received_at || null,
        lastRestockQty: lastShipment?.quantity || null,
        lastRestockPrice: lastPrice > 0 ? lastPrice : null,
        lastRestockSupplier: lastShipment?.supplier_id || null,
        reorderRecommendation: {
          qty: recommendedQty,
          estimatedCost,
          urgency,
        },
      });
    }

    // Sort by urgency then by days until stockout
    return items
      .sort((a, b) => {
        const urgencyOrder = { immediate: 0, "within-week": 1, planned: 2 };
        const urgencyDiff =
          urgencyOrder[a.reorderRecommendation.urgency] -
          urgencyOrder[b.reorderRecommendation.urgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        return a.daysUntilStockout - b.daysUntilStockout;
      })
      .slice(0, maxItems);
  } catch (err) {
    console.error("Error getting running out items:", err);
  }

  return items;
}

/**
 * Generate a text-based report section for running out items (for email/daily reports)
 */
export async function getRunningOutItemsReport(shopId: string = "tshirts"): Promise<string> {
  const items = await getRunningOutItems(shopId, 7, 10);

  if (items.length === 0) {
    return "✅ No items running out — inventory is healthy.\n";
  }

  let report = `⚠️  RUNNING OUT FAST — Items to Reorder\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const item of items) {
    const urgencyIcon =
      item.reorderRecommendation.urgency === "immediate"
        ? "🔴"
        : item.reorderRecommendation.urgency === "within-week"
          ? "🟠"
          : "🟡";

    report += `${urgencyIcon} ${item.itemName}\n`;
    report += `   Category: ${item.category}\n`;
    report += `   Current Stock: ${item.currentStock} units | Daily Sales: ${item.avgDailySalesRate.toFixed(1)}/day\n`;
    report += `   Days Until Stockout: ${item.daysUntilStockout.toFixed(1)}\n`;
    report += `   30-Day Sales: ${item.velocity30d} units\n`;

    if (item.lastRestockDate) {
      const date = new Date(item.lastRestockDate).toLocaleDateString();
      report += `   Last Restock: ${item.lastRestockQty} units on ${date}`;
      if (item.lastRestockSupplier) {
        report += ` from ${item.lastRestockSupplier}`;
      }
      report += `\n`;
    }

    report += `   📋 REORDER: ${item.reorderRecommendation.qty} units`;
    if (item.lastRestockPrice) {
      report += ` (~$${item.reorderRecommendation.estimatedCost.toFixed(2)} at last unit price)`;
    }
    report += `\n\n`;
  }

  return report;
}
