import { NextResponse } from "next/server";
import { enforceOwnerOnly } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(value: unknown) {
  return Number(value || 0);
}

function daysBetween(value: unknown) {
  const time = new Date(String(value || "")).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24)));
}

type CommandItem = {
  id: string;
  sku: string;
  item: string;
  category: string;
  stock: number;
  landedCost: number;
  trappedCapital: number;
  velocity: number;
  daysToZero: number | null;
  reorderPoint: number;
  safetyStock: number;
  suggestedOrderQty: number;
  sold30d: number;
  revenue30d: number;
  soldAllTime: number;
  revenueAllTime: number;
  lastSaleAt: string | null;
  daysInStock: number;
};

export async function GET() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: inventoryData, error: inventoryError },
      { data: sales30dData },
      { data: salesAllData },
      { data: shipmentsData },
    ] = await Promise.all([
      supabaseAdmin.from("inventory_items").select("*, inventory_allocations(*)"),
      supabaseAdmin.from("sales").select("item_id, item_name, quantity, total_with_tax, date").is("deleted_at", null).gte("date", thirtyDaysAgo),
      supabaseAdmin.from("sales").select("item_id, item_name, quantity, total_with_tax, date").is("deleted_at", null),
      supabaseAdmin.from("shipments").select("*"),
    ]);

    if (inventoryError) {
      return NextResponse.json({ success: false, message: inventoryError.message }, { status: 500 });
    }

    const sales30d = sales30dData || [];
    const salesAll = salesAllData || [];
    const inventory = inventoryData || [];

    const salesByItem30d = new Map<string, { units: number; revenue: number; lastSale: string | null }>();
    for (const sale of sales30d as any[]) {
      const id = String(sale.item_id || "");
      if (!id) continue;
      const current = salesByItem30d.get(id) || { units: 0, revenue: 0, lastSale: null };
      current.units += num(sale.quantity);
      current.revenue += num(sale.total_with_tax);
      current.lastSale = !current.lastSale || String(sale.date || "") > current.lastSale ? String(sale.date || "") : current.lastSale;
      salesByItem30d.set(id, current);
    }

    const salesByItemAll = new Map<string, { units: number; revenue: number; lastSale: string | null }>();
    for (const sale of salesAll as any[]) {
      const id = String(sale.item_id || "");
      if (!id) continue;
      const current = salesByItemAll.get(id) || { units: 0, revenue: 0, lastSale: null };
      current.units += num(sale.quantity);
      current.revenue += num(sale.total_with_tax);
      current.lastSale = !current.lastSale || String(sale.date || "") > current.lastSale ? String(sale.date || "") : current.lastSale;
      salesByItemAll.set(id, current);
    }

    const itemRows: CommandItem[] = inventory.map((item: any) => {
      const stock = num(item.quantity);
      const landedCost = num(item.landed_cost || item.landedCost);
      const sales = salesByItem30d.get(String(item.id)) || { units: 0, revenue: 0, lastSale: null };
      const allSales = salesByItemAll.get(String(item.id)) || { units: 0, revenue: 0, lastSale: null };
      const velocity = sales.units / 30;
      const safetyStock = Math.ceil(velocity * 7 * 0.5);
      const reorderPoint = Math.ceil((velocity * 7) + safetyStock);
      const daysToZero = velocity > 0 ? Math.floor(stock / velocity) : null;
      const trappedCapital = stock * landedCost;
      const daysInStock = daysBetween(item.date_added || item.created_at);

      return {
        id: item.id,
        sku: item.sku || item.id,
        item: item.name || "Unknown item",
        category: item.category || "Uncategorised",
        stock,
        landedCost,
        trappedCapital,
        velocity,
        daysToZero,
        reorderPoint,
        safetyStock,
        suggestedOrderQty: Math.max(0, Math.ceil((velocity * 30) - stock)),
        sold30d: sales.units,
        revenue30d: sales.revenue,
        soldAllTime: allSales.units,
        revenueAllTime: allSales.revenue,
        lastSaleAt: allSales.lastSale,
        daysInStock,
      };
    });

    const priorityReorders = itemRows
      .filter((item) => item.velocity > 0 && (item.stock <= item.reorderPoint || (item.daysToZero ?? Infinity) <= 14))
      .sort((a, b) => (a.daysToZero ?? 999999) - (b.daysToZero ?? 999999))
      .slice(0, 100);

    const trappedCapital = [...itemRows]
      .filter((item) => item.trappedCapital > 0)
      .sort((a, b) => b.trappedCapital - a.trappedCapital)
      .slice(0, 200);

    const deadStock = itemRows
      .filter((item) => item.stock > 0 && item.sold30d <= 0 && (!item.lastSaleAt || item.lastSaleAt < sixtyDaysAgo) && item.daysInStock >= 60)
      .sort((a, b) => b.trappedCapital - a.trappedCapital)
      .slice(0, 200);

    const itemById = new Map(inventory.map((item: any) => [String(item.id), item]));
    const shipments = new Map<string, any>();
    for (const shipment of (shipmentsData || []) as any[]) {
      const id = String(shipment.id || shipment.shipment_number || "UNKNOWN");
      shipments.set(id, {
        id,
        shipment: shipment.shipment_number || id,
        supplier: shipment.supplier || "Unknown supplier",
        costBasis: num(shipment.purchase_price) + num(shipment.shipping_cost) + num(shipment.duty_cost) + num(shipment.misc_cost),
        currentUnits: 0,
        soldUnits: 0,
        revenue: 0,
        grossProfit: 0,
        fastestMover: "",
        slowestMover: "",
        items: new Map<string, any>(),
      });
    }

    for (const item of inventory as any[]) {
      const shipmentId = String(item.shipment_id || "UNASSIGNED");
      if (!shipments.has(shipmentId)) {
        shipments.set(shipmentId, {
          id: shipmentId,
          shipment: shipmentId,
          supplier: "Unassigned / ad-hoc",
          costBasis: 0,
          currentUnits: 0,
          soldUnits: 0,
          revenue: 0,
          grossProfit: 0,
          fastestMover: "",
          slowestMover: "",
          items: new Map<string, any>(),
        });
      }
      const shipment = shipments.get(shipmentId);
      const currentQty = num(item.quantity);
      const unitCost = num(item.landed_cost);
      shipment.currentUnits += currentQty;
      shipment.costBasis += currentQty * unitCost;
      shipment.items.set(String(item.id), {
        name: item.name || "Unknown item",
        currentQty,
        soldQty: 0,
        revenue: 0,
        grossProfit: 0,
        unitCost,
      });
    }

    for (const sale of salesAll as any[]) {
      const item = itemById.get(String(sale.item_id || "")) as any;
      if (!item) continue;
      const shipment = shipments.get(String(item.shipment_id || "UNASSIGNED"));
      if (!shipment) continue;
      const stats = shipment.items.get(String(item.id));
      if (!stats) continue;
      const qty = num(sale.quantity);
      const revenue = num(sale.total_with_tax);
      const cost = num(item.landed_cost) * qty;
      shipment.soldUnits += qty;
      shipment.revenue += revenue;
      shipment.grossProfit += revenue - cost;
      stats.soldQty += qty;
      stats.revenue += revenue;
      stats.grossProfit += revenue - cost;
    }

    const shipmentWarnings = [...shipments.values()]
      .map((shipment) => {
        const itemStats = [...shipment.items.values()].map((item: any) => {
          const originalQty = item.currentQty + item.soldQty;
          return {
            ...item,
            sellThrough: originalQty > 0 ? (item.soldQty / originalQty) * 100 : 0,
          };
        });
        const sellThrough = shipment.currentUnits + shipment.soldUnits > 0
          ? (shipment.soldUnits / (shipment.currentUnits + shipment.soldUnits)) * 100
          : 0;
        const roi = shipment.costBasis > 0 ? (shipment.grossProfit / shipment.costBasis) * 100 : 0;
        const fastest = [...itemStats].sort((a, b) => b.sellThrough - a.sellThrough)[0];
        const slowest = [...itemStats].sort((a, b) => a.sellThrough - b.sellThrough)[0];
        let status = "monitor";
        if (roi > 25 && sellThrough > 50) status = "winning";
        if (sellThrough < 25 && shipment.currentUnits > 0) status = "slow";
        if (roi < 0) status = "margin-risk";
        return {
          shipment: shipment.shipment,
          supplier: shipment.supplier,
          status,
          currentUnits: shipment.currentUnits,
          soldUnits: shipment.soldUnits,
          costBasis: shipment.costBasis,
          revenue: shipment.revenue,
          grossProfit: shipment.grossProfit,
          roi,
          sellThrough,
          fastestMover: fastest?.name || "",
          slowestMover: slowest?.name || "",
          signal: ["winning"].includes(status) ? "buy again" : "review",
        };
      })
      .filter((shipment) => ["slow", "margin-risk"].includes(shipment.status) || shipment.roi < 0)
      .sort((a, b) => a.roi - b.roi)
      .slice(0, 100);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      summary: {
        priorityReorders: priorityReorders.length,
        trappedCapitalValue: trappedCapital.reduce((sum, item) => sum + item.trappedCapital, 0),
        deadStockCount: deadStock.length,
        deadStockValue: deadStock.reduce((sum, item) => sum + item.trappedCapital, 0),
        shipmentWarnings: shipmentWarnings.length,
      },
      lists: {
        priorityReorders,
        trappedCapital,
        deadStock,
        shipmentWarnings,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to load inventory command lists" }, { status: 500 });
  }
}
