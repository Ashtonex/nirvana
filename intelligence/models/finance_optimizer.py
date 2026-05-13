from __future__ import annotations
from datetime import datetime, timezone
import pandas as pd
import numpy as np
from ..data_loader import load_operations, load_ledger

def optimize_capital_allocation() -> dict:
    """
    Analyzes historical cash flow and optimizes allocation across safety, growth, and operations.
    No actual trading occurs; this provides mathematical targets.
    """
    ops = load_operations()
    if ops.empty:
        return {"status": "empty", "message": "Insufficient operations data for optimization."}

    # Calculate current vault state
    total_vault = ops[ops["amount"] > 0]["amount"].sum() - ops[ops["amount"] < 0]["amount"].abs().sum()
    
    # Simple Optimization Logic:
    # 1. Operational Buffer (3 months of average expenses)
    # 2. Safety Reserve (Low risk, liquid)
    # 3. Growth Pool (High yield, less liquid)
    
    # Calculate average monthly expenses from operations ledger
    ops["month"] = ops["created_at"].dt.to_period("M")
    monthly_expenses = ops[ops["amount"] < 0].groupby("month")["amount"].sum().abs()
    avg_monthly_burn = float(monthly_expenses.mean()) if not monthly_expenses.empty else 0.0
    
    operational_buffer_target = avg_monthly_burn * 3
    safety_reserve_target = (total_vault - operational_buffer_target) * 0.6 if total_vault > operational_buffer_target else 0.0
    growth_pool_target = (total_vault - operational_buffer_target - safety_reserve_target) if total_vault > (operational_buffer_target + safety_reserve_target) else 0.0

    return {
        "status": "success",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            "total_capital": round(total_vault, 2),
            "avg_monthly_burn": round(avg_monthly_burn, 2),
            "targets": {
                "operational_buffer": round(operational_buffer_target, 2),
                "safety_reserve": round(safety_reserve_target, 2),
                "growth_pool": round(growth_pool_target, 2)
            },
            "allocation_ratios": {
                "operations": round(operational_buffer_target / total_vault, 2) if total_vault > 0 else 0,
                "safety": round(safety_reserve_target / total_vault, 2) if total_vault > 0 else 0,
                "growth": round(growth_pool_target / total_vault, 2) if total_vault > 0 else 0
            }
        }
    }
