from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from .models.inventory_forecast import run_sales_forecast, calculate_inventory_velocity
from .models.finance_optimizer import optimize_capital_allocation

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
