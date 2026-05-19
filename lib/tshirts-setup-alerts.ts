import { supabaseAdmin } from "@/lib/supabase";
import {
  TEE_CATEGORY_GOLF,
  TEE_CATEGORY_PLAIN,
  TSHIRTS_SHOP_ID,
  isNirvanaTeeItem,
} from "@/lib/tshirts";

export type TeeSetupAlert = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  itemId?: string;
  itemName?: string;
};

/**
 * Proactive checks for Nirvana Tees: mis-tagged SKUs, missing allocations, etc.
 * Safe to call from server pages (uses service role like other lib helpers).
 */
export async function getNirvanaTeesSetupAlerts(): Promise<TeeSetupAlert[]> {
  const alerts: TeeSetupAlert[] = [];

  const { data: posAllocs, error: allocErr } = await supabaseAdmin
    .from("inventory_allocations")
    .select("item_id, quantity")
    .eq("shop_id", TSHIRTS_SHOP_ID);

  if (allocErr) {
    alerts.push({
      severity: "warning",
      code: "ALLOC_QUERY_FAILED",
      message: `Could not load tee-shop allocations: ${allocErr.message}. POS stock counts may be wrong.`,
    });
    return alerts;
  }

  const positive = (posAllocs || []).filter((a: any) => Number(a.quantity || 0) > 0);
  if (positive.length === 0) {
    alerts.push({
      severity: "info",
      code: "NO_STOCK_AT_TEES_SHOP",
      message:
        "No units are allocated to shop “tshirts”. Move stock in Inventory / allocations so Plain T-Shirt and Plain Golf T-Shirt SKUs appear on the tee POS.",
    });
  }

  const itemIds = [...new Set(positive.map((a: any) => String(a.item_id || "")))].filter(
    Boolean
  );

  if (itemIds.length > 0) {
    const { data: stockedItems, error: itemsErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, category")
      .in("id", itemIds);

    if (itemsErr) {
      alerts.push({
        severity: "warning",
        code: "ITEM_QUERY_FAILED",
        message: `Could not load inventory for tee shop rows: ${itemsErr.message}.`,
      });
      return alerts;
    }

    for (const row of stockedItems || []) {
      if (!isNirvanaTeeItem(row)) {
        alerts.push({
          severity: "error",
          code: "STOCK_AT_TEES_UNCLASSIFIED",
          message: `This SKU has stock at Nirvana Tees but its category/name is not recognized as “${TEE_CATEGORY_PLAIN}” or “${TEE_CATEGORY_GOLF}”. It will not appear on the tee POS until fixed.`,
          itemId: row.id,
          itemName: row.name,
        });
      }
    }
  }

  const { data: allItems } = await supabaseAdmin
    .from("inventory_items")
    .select("id, name, category, quantity")
    .limit(10000);

  const allocQty = new Map<string, number>();
  (posAllocs || []).forEach((a: any) => {
    allocQty.set(String(a.item_id), Number(a.quantity || 0));
  });

  const notAllocated: TeeSetupAlert[] = [];

  for (const row of allItems || []) {
    if (!isNirvanaTeeItem(row)) continue;
    const atTees = allocQty.get(String(row.id)) ?? 0;
    const master = Number((row as any).quantity || 0);
    if (master > 0 && atTees === 0) {
      notAllocated.push({
        severity: "warning",
        code: "TEE_NOT_AT_TEES_SHOP",
        message: `Classified tee “${row.name}” has master stock but zero units allocated to shop “tshirts”. It will not sell on Nirvana Tees until you allocate.`,
        itemId: row.id,
        itemName: row.name,
      });
    }
  }

  const MAX_DETAIL = 18;
  notAllocated.slice(0, MAX_DETAIL).forEach((a) => alerts.push(a));
  if (notAllocated.length > MAX_DETAIL) {
    alerts.push({
      severity: "info",
      code: "TEE_NOT_AT_TEES_SHOP_TRUNCATED",
      message: `${notAllocated.length - MAX_DETAIL} more classified tee(s) have master stock but no allocation to “tshirts” (not listed individually).`,
    });
  }

  return alerts;
}
