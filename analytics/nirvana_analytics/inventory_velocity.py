from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .data_loader import load_allocations, load_inventory, load_sales, save_analytics_result, write_json


def run(days: int, dead_stock_days: int, limit: int) -> dict:
    sales = load_sales()
    inventory = load_inventory()
    allocations = load_allocations()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    if inventory.empty:
        return {"status": "empty", "message": "No inventory rows available.", "items": []}

    recent_sales = sales[sales["date"] >= cutoff].copy() if not sales.empty and "date" in sales else pd.DataFrame()
    item_key = "item_id" if "item_id" in recent_sales else "inventory_item_id"
    if not recent_sales.empty and item_key in recent_sales:
        velocity = recent_sales.groupby(item_key).agg(
            sold_units=("quantity", "sum"),
            sales_value=("total_with_tax", "sum"),
            last_sale=("date", "max"),
        ).reset_index().rename(columns={item_key: "id"})
    else:
        velocity = pd.DataFrame(columns=["id", "sold_units", "sales_value", "last_sale"])

    if not allocations.empty and "item_id" in allocations:
        stock = allocations.groupby("item_id")["quantity"].sum().reset_index().rename(columns={"item_id": "id", "quantity": "allocated_stock"})
    else:
        stock_col = "quantity" if "quantity" in inventory else None
        stock = inventory[["id", stock_col]].rename(columns={stock_col: "allocated_stock"}) if stock_col else pd.DataFrame(columns=["id", "allocated_stock"])

    merged = inventory.merge(stock, on="id", how="left").merge(velocity, on="id", how="left")
    merged["allocated_stock"] = merged["allocated_stock"].fillna(0)
    merged["sold_units"] = merged["sold_units"].fillna(0)
    merged["sales_value"] = merged["sales_value"].fillna(0)
    merged["daily_velocity"] = merged["sold_units"] / max(days, 1)
    merged["days_to_zero"] = np.where(merged["daily_velocity"] > 0, merged["allocated_stock"] / merged["daily_velocity"], np.inf)

    now = pd.Timestamp.now(tz="UTC")
    date_added = merged["date_added"] if "date_added" in merged else pd.NaT
    merged["days_in_stock"] = (now - date_added).dt.days if hasattr(date_added, "dt") else np.nan
    cost_col = "landed_cost" if "landed_cost" in merged else "cost" if "cost" in merged else None
    merged["capital_tied"] = merged["allocated_stock"] * (merged[cost_col].fillna(0) if cost_col else 0)

    def status(row: pd.Series) -> str:
        if row["allocated_stock"] <= 0:
            return "out_of_stock"
        if row["sold_units"] <= 0 and (row.get("days_in_stock") or 0) >= dead_stock_days:
            return "dead_stock"
        if row["days_to_zero"] <= 14:
            return "reorder_risk"
        return "healthy"

    merged["status"] = merged.apply(status, axis=1)
    priority = merged[merged["status"].isin(["dead_stock", "reorder_risk"])].copy()
    priority = priority.sort_values(["status", "capital_tied"], ascending=[True, False]).head(limit)

    name_col = "name" if "name" in priority else "item_name" if "item_name" in priority else "id"
    items = []
    for row in priority.to_dict(orient="records"):
        days_to_zero = row.get("days_to_zero")
        items.append({
            "item_id": row.get("id"),
            "item_name": row.get(name_col),
            "status": row.get("status"),
            "stock": round(float(row.get("allocated_stock") or 0), 2),
            "sold_units": round(float(row.get("sold_units") or 0), 2),
            "daily_velocity": round(float(row.get("daily_velocity") or 0), 3),
            "days_to_zero": None if np.isinf(days_to_zero) else round(float(days_to_zero), 1),
            "capital_tied": round(float(row.get("capital_tied") or 0), 2),
        })

    return {
        "status": "success",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_days": days,
        "items_scanned": int(len(merged)),
        "priority_items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Calculate inventory velocity, reorder risk, and dead stock.")
    parser.add_argument("--days", type=int, default=60)
    parser.add_argument("--dead-stock-days", type=int, default=60)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--output")
    parser.add_argument("--save-db", action="store_true", help="Save this snapshot to analytics_results.")
    args = parser.parse_args()
    payload = run(args.days, args.dead_stock_days, args.limit)
    if args.save_db:
        count = len(payload.get("priority_items", []))
        save_analytics_result("inventory_velocity", payload, f"{count} priority inventory items identified")
    write_json(payload, args.output)


if __name__ == "__main__":
    main()
