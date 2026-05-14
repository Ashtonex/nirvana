from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from .models.inventory_forecast import run_sales_forecast, calculate_inventory_velocity
from .models.finance_optimizer import optimize_capital_allocation
from analytics.nirvana_analytics import demand_forecast, expense_anomaly, inventory_velocity, capital_allocation

app = FastAPI(title="Nirvana Intelligence API")

# Configure CORS for Next.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Nirvana Intelligence Engine is running"}

@app.post("/api/py/analytics/run")
async def run_analytics_job(kind: str = Query("all")):
    """
    Triggers the high-power analytics snapshots and saves results to DB.
    Replaces the fragile child_process.spawn bridge.
    """
    results = []
    jobs = {
        "demand_forecast": demand_forecast,
        "expense_anomaly": expense_anomaly,
        "inventory_velocity": inventory_velocity,
        "capital_allocation": capital_allocation,
    }
    
    kinds = jobs.keys() if kind == "all" else [kind]
    
    for k in kinds:
        if k not in jobs:
            continue
        
        module = jobs[k]
        try:
            # Most analytics modules have a run() function
            # We pass save_db=True if the module supports it or handle saving here
            payload = module.run() if hasattr(module, "run") else {}
            
            # Use module's internal saver or default logic
            summary = "Snapshot generated"
            if k == "demand_forecast":
                summary = f"{len(payload.get('forecasts', []))} shop forecasts generated"
            elif k == "expense_anomaly":
                summary = f"{len(payload.get('anomalies', []))} expense anomalies flagged"
            elif k == "inventory_velocity":
                summary = f"{len(payload.get('priority_items', []))} priority inventory items identified"
            elif k == "capital_allocation":
                summary = f"${payload.get('total_capital', 0):,.2f} capital optimized"
            
            from analytics.nirvana_analytics.data_loader import save_analytics_result
            save_analytics_result(k, payload, summary)
            
            results.append({"kind": k, "ok": True, "summary": summary})
        except Exception as e:
            results.append({"kind": k, "ok": False, "error": str(e)})
            
    return {"success": all(r["ok"] for r in results), "results": results}

@app.get("/api/py/forecast/sales")
async def get_sales_forecast(
    days: int = Query(90, description="History window in days"),
    horizon: int = Query(14, description="Forecast horizon in days"),
    shopId: str = Query(None, description="Optional shop filter")
):
    """
    Returns predicted sales for the next N days.
    """
    return run_sales_forecast(days=days, horizon=horizon, shop_id=shopId)

@app.get("/api/py/inventory/velocity")
async def get_inventory_velocity():
    """
    Returns how fast products are selling per shop.
    """
    return calculate_inventory_velocity()

@app.get("/api/py/finance/optimize")
async def get_finance_optimization():
    """
    Returns mathematical optimization for capital allocation.
    """
    return optimize_capital_allocation()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
