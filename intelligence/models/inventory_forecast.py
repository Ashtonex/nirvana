from __future__ import annotations
from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from ..data_loader import load_sales

def _forecast_series(series: pd.Series, horizon: int) -> list[dict]:
    daily = series.asfreq("D").fillna(0)
    if len(daily) < 14 or daily.sum() <= 0:
        baseline = float(daily.tail(7).mean() if len(daily) else 0)
        forecast = np.repeat(baseline, horizon)
    else:
        seasonal_periods = 7 if len(daily) >= 28 else None
        try:
            model = ExponentialSmoothing(
                daily,
                trend="add",
                seasonal="add" if seasonal_periods else None,
                seasonal_periods=seasonal_periods,
                initialization_method="estimated",
            )
            fitted = model.fit(optimized=True)
            forecast = np.maximum(fitted.forecast(horizon).to_numpy(), 0)
        except Exception:
            # Fallback to simple mean if model fails to converge
            baseline = float(daily.tail(14).mean())
            forecast = np.repeat(baseline, horizon)

    start = (daily.index.max() if len(daily) else pd.Timestamp.utcnow()).date()
    return [
        {"date": str(start + timedelta(days=i + 1)), "predicted_sales": round(float(value), 2)}
        for i, value in enumerate(forecast)
    ]

def run_sales_forecast(days: int = 90, horizon: int = 14, shop_id: str | None = None) -> dict:
    sales = load_sales()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    if sales.empty or "date" not in sales:
        return {"status": "empty", "message": "No sales rows available.", "forecasts": []}

    recent = sales[sales["date"] >= cutoff].copy()
    if shop_id:
        recent = recent[recent.get("shop_id") == shop_id]

    amount_col = "total_with_tax" if "total_with_tax" in recent else "amount"
    recent["day"] = recent["date"].dt.floor("D")
    grouped = recent.groupby(["shop_id", "day"], dropna=False)[amount_col].sum().reset_index()

    forecasts = []
    for sid, frame in grouped.groupby("shop_id", dropna=False):
        series = frame.set_index("day")[amount_col].sort_index()
        forecasts.append({
            "shop_id": sid or "all_shops" if not shop_id else shop_id,
            "history_days": int(series.shape[0]),
            "history_total": round(float(series.sum()), 2),
            "forecast": _forecast_series(series, horizon),
        })

    return {
        "status": "success",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_days": days,
        "horizon_days": horizon,
        "forecasts": forecasts,
    }

def calculate_inventory_velocity() -> dict:
    # Basic implementation of inventory velocity: how fast items are moving
    sales = load_sales(limit=100000)
    if sales.empty:
        return {"status": "empty", "message": "No sales data for velocity calculation."}
    
    # Calculate velocity per product/shop
    sales["day"] = sales["date"].dt.floor("D")
    velocity = sales.groupby(["shop_id", "item_name"])["quantity"].sum().reset_index()
    
    # Simple velocity: total quantity sold in last 30 days / 30
    cutoff_30 = datetime.now(timezone.utc) - timedelta(days=30)
    recent_sales = sales[sales["date"] >= cutoff_30]
    velocity_30 = recent_sales.groupby(["shop_id", "item_name"])["quantity"].sum().reset_index()
    velocity_30["daily_velocity"] = velocity_30["quantity"] / 30.0
    
    return {
        "status": "success",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "velocity_data": velocity_30.to_dict(orient="records")
    }
