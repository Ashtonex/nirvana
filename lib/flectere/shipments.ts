import { fetchAll } from "./data";

export interface ShipmentSummary {
  id: string;
  shipmentNumber: string;
  supplier: string;
  date: string;
  purchasePrice: number;
  shippingCost: number;
  dutyCost: number;
  miscCost: number;
  totalCost: number;
  manifestPieces: number;
  totalQuantity: number;
  itemCount: number;
}

export interface ShipmentItemDetail {
  id: string;
  name: string;
  category: string;
  acquisitionPrice: number;
  landedCost: number;
  quantity: number;
  dateAdded: string;
  sku: string;
}

export interface ShipmentItemPerformance {
  itemId: string;
  name: string;
  category: string;
  unitCost: number;
  originalQty: number;
  currentQty: number;
  soldQty: number;
  recentSoldQty: number;
  revenue: number;
  grossProfit: number;
  sellThrough: number;
  dailyVelocity: number;
  daysToZero: number;
  lastSold: string | null;
  isFastMover: boolean;
  isSlowMover: boolean;
}

export interface ShipmentPerformance {
  shipmentId: string;
  supplier: string;
  date: string;
  totalCost: number;
  totalRevenue: number;
  grossProfit: number;
  roi: number;
  sellThrough: number;
  overheadContribution: number;
  overheadContributionPct: number;
  daysSinceReceipt: number;
  fastMovers: ShipmentItemPerformance[];
  slowMovers: ShipmentItemPerformance[];
  supplierRecommendation: "keep" | "review" | "replace";
  recommendationReason: string;
  items: ShipmentItemPerformance[];
}

export interface ShipmentFullData {
  shipmentId: string;
  supplier: string;
  date: string;
  totalCost: number;
  summary: ShipmentSummary;
  performance: ShipmentPerformance;
}

export async function getAllShipments(): Promise<ShipmentSummary[]> {
  const rows = await fetchAll<any>("shipments", "*");
  if (!rows) return [];

  // Deduplicate by id (shipments table may have per-item rows)
  const map = new Map<string, any>();
  for (const r of rows) {
    const id = r.id || r.shipment_number || "UNKNOWN";
    if (!map.has(id)) {
      map.set(id, {
        id,
        shipmentNumber: r.shipment_number || id,
        supplier: r.supplier || "Unknown",
        date: r.date || r.created_at || r.received_at,
        purchasePrice: Number(r.purchase_price || 0),
        shippingCost: Number(r.shipping_cost || 0),
        dutyCost: Number(r.duty_cost || 0),
        miscCost: Number(r.misc_cost || 0),
        totalCost: 0,
        manifestPieces: Number(r.manifest_pieces || 0),
        totalQuantity: Number(r.total_quantity || 0),
        itemCount: 0,
      });
    }
  }

  // Get inventory items to count items per shipment
  const inventoryRows = await fetchAll<any>("inventory_items", "id, shipment_id");
  if (inventoryRows) {
    for (const inv of inventoryRows) {
      const sid = String(inv.shipment_id || "");
      const entry = map.get(sid);
      if (entry) entry.itemCount += 1;
    }
  }

  const result = Array.from(map.values());
  for (const s of result) {
    s.totalCost = s.purchasePrice + s.shippingCost + s.dutyCost + s.miscCost;
  }
  return result.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export async function getShipmentFullData(shipmentId: string): Promise<ShipmentFullData | null> {
  const [shipmentRows, inventoryRows, allSales, allShops] = await Promise.all([
    fetchAll<any>("shipments", "*"),
    fetchAll<any>("inventory_items", "*"),
    fetchAll<any>("sales", "*", (q: any) => q.is("deleted_at", null)),
    fetchAll<any>("shops", "id, name, expenses"),
  ]);

  if (!shipmentRows || !inventoryRows) return null;

  // Find shipment header
  const shipmentRow = shipmentRows.find((r: any) => r.id === shipmentId || r.shipment_number === shipmentId);
  if (!shipmentRow) return null;

  const summary: ShipmentSummary = {
    id: shipmentRow.id || shipmentId,
    shipmentNumber: shipmentRow.shipment_number || shipmentId,
    supplier: shipmentRow.supplier || "Unknown",
    date: shipmentRow.date || shipmentRow.created_at || shipmentRow.received_at,
    purchasePrice: Number(shipmentRow.purchase_price || 0),
    shippingCost: Number(shipmentRow.shipping_cost || 0),
    dutyCost: Number(shipmentRow.duty_cost || 0),
    miscCost: Number(shipmentRow.misc_cost || 0),
    totalCost: Number(shipmentRow.purchase_price || 0) + Number(shipmentRow.shipping_cost || 0) + Number(shipmentRow.duty_cost || 0) + Number(shipmentRow.misc_cost || 0),
    manifestPieces: Number(shipmentRow.manifest_pieces || 0),
    totalQuantity: Number(shipmentRow.total_quantity || 0),
    itemCount: 0,
  };

  // Get items in this shipment
  const items: ShipmentItemDetail[] = inventoryRows
    .filter((i: any) => String(i.shipment_id) === shipmentId)
    .map((i: any) => ({
      id: i.id,
      name: i.name || "Unknown",
      category: i.category || "General",
      acquisitionPrice: Number(i.acquisition_price || 0),
      landedCost: Number(i.landed_cost || i.acquisition_price || 0),
      quantity: Number(i.quantity || 0),
      dateAdded: i.date_added || i.created_at,
      sku: i.sku || "",
    }));

  summary.itemCount = items.length;

  // Compute performance per item
  const monthlyOverhead = (allShops || []).reduce((sum: number, shop: any) => {
    const exp = (shop.expenses as Record<string, number>) || {};
    return sum + Object.values(exp).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
  }, 0);
  const dailyOverhead = monthlyOverhead / 30;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const itemPerformance: ShipmentItemPerformance[] = items.map((item) => {
    const itemSales = (allSales || []).filter((s: any) => String(s.item_id) === item.id);
    const soldQty = itemSales.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);
    const revenue = itemSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const recentSales = itemSales.filter((s: any) => s.date >= ninetyDaysAgo);
    const recentSoldQty = recentSales.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);
    const cost = item.landedCost * soldQty;
    const grossProfit = revenue - cost;
    const originalQty = item.quantity + soldQty;
    const sellThrough = originalQty > 0 ? (soldQty / originalQty) * 100 : 0;
    const dailyVelocity = recentSoldQty / 90;
    const daysToZero = dailyVelocity > 0 ? item.quantity / dailyVelocity : (item.quantity > 0 ? 999 : 0);
    const lastSold = itemSales.length > 0 ? itemSales.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : null;

    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      unitCost: item.landedCost,
      originalQty,
      currentQty: item.quantity,
      soldQty,
      recentSoldQty,
      revenue,
      grossProfit,
      sellThrough,
      dailyVelocity,
      daysToZero,
      lastSold,
      isFastMover: false,
      isSlowMover: false,
    };
  });

  // Mark fast/slow movers
  const sortedByVelocity = [...itemPerformance].sort((a, b) => b.dailyVelocity - a.dailyVelocity);
  const sortedBySellThrough = [...itemPerformance].sort((a, b) => b.sellThrough - a.sellThrough);
  const top25Pct = Math.max(1, Math.ceil(itemPerformance.length * 0.25));
  sortedByVelocity.slice(0, top25Pct).forEach((i) => { const m = itemPerformance.find((p) => p.itemId === i.itemId); if (m) m.isFastMover = true; });
  sortedBySellThrough.slice(-top25Pct).forEach((i) => { const m = itemPerformance.find((p) => p.itemId === i.itemId); if (m) m.isSlowMover = true; });

  // Aggregate
  const totalRevenue = itemPerformance.reduce((s, i) => s + i.revenue, 0);
  const totalGrossProfit = itemPerformance.reduce((s, i) => s + i.grossProfit, 0);
  const totalSoldQty = itemPerformance.reduce((s, i) => s + i.soldQty, 0);
  const totalOriginalQty = itemPerformance.reduce((s, i) => s + i.originalQty, 0);
  const overallSellThrough = totalOriginalQty > 0 ? (totalSoldQty / totalOriginalQty) * 100 : 0;
  const roi = summary.totalCost > 0 ? (totalGrossProfit / summary.totalCost) * 100 : 0;

  // Overhead contribution: what % of total shipment cost is recovered vs daily overhead
  const totalRevenueDays = (totalRevenue / dailyOverhead);
  const overheadContribution = totalRevenueDays * dailyOverhead;
  const overheadContributionPct = dailyOverhead > 0 ? (totalRevenue / (dailyOverhead * 30)) * 100 : 0;

  const daysSinceReceipt = summary.date
    ? Math.max(0, Math.round((Date.now() - new Date(summary.date).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Supplier recommendation
  let supplierRecommendation: "keep" | "review" | "replace" = "keep";
  const reasons: string[] = [];

  if (roi > 15 && overallSellThrough > 40) {
    supplierRecommendation = "keep";
    reasons.push(`Strong ROI (${roi.toFixed(1)}%) with healthy sell-through (${overallSellThrough.toFixed(1)}%).`);
  } else if (roi > 0 && overallSellThrough > 20) {
    supplierRecommendation = "review";
    reasons.push(`Marginal ROI (${roi.toFixed(1)}%) — monitoring recommended before reordering from this supplier.`);
  } else {
    supplierRecommendation = "replace";
    reasons.push(`Poor ROI (${roi.toFixed(1)}%) and/or low sell-through (${overallSellThrough.toFixed(1)}%). Consider alternative suppliers or negotiate better pricing.`);
  }

  if (totalRevenue < summary.totalCost) {
    reasons.push(`Revenue ($${Math.round(totalRevenue).toLocaleString()}) has not yet covered shipment cost ($${Math.round(summary.totalCost).toLocaleString()}).`);
  }

  return {
    shipmentId,
    supplier: summary.supplier,
    date: summary.date,
    totalCost: summary.totalCost,
    summary,
    performance: {
      shipmentId,
      supplier: summary.supplier,
      date: summary.date,
      totalCost: summary.totalCost,
      totalRevenue,
      grossProfit: totalGrossProfit,
      roi,
      sellThrough: overallSellThrough,
      overheadContribution,
      overheadContributionPct,
      daysSinceReceipt,
      fastMovers: itemPerformance.filter((i) => i.isFastMover),
      slowMovers: itemPerformance.filter((i) => i.isSlowMover),
      supplierRecommendation,
      recommendationReason: reasons.join(" "),
      items: itemPerformance.sort((a, b) => b.revenue - a.revenue),
    },
  };
}