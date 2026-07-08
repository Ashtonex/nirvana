import json
from collections import defaultdict
from datetime import datetime

with open('dossier_data.json', 'r') as f:
    data = json.load(f)

sales = data.get('sales', [])
ledger = data.get('ledger', [])

# 1. Shop Revenue & Daily Velocity
shop_rev = defaultdict(float)
daily_rev = defaultdict(float)
employee_rev = defaultdict(float)
items_rev = defaultdict(float)

for s in sales:
    rev = float(s.get('total_with_tax') or 0)
    shop = s.get('shop_id') or 'Unknown'
    emp = s.get('employee_id') or 'Unknown'
    item = s.get('item_name') or 'Unknown'
    date_str = s.get('date')
    
    if rev > 0:
        shop_rev[shop] += rev
        employee_rev[emp] += rev
        items_rev[item] += rev
        
        if date_str:
            # Parse '2026-06-01T08:00:00Z'
            day = date_str.split('T')[0]
            daily_rev[day] += rev

# Sort items
top_items = sorted(items_rev.items(), key=lambda x: x[1], reverse=True)[:10]

# Employee Ledger (Costs/Anomalies)
emp_anomalies = defaultdict(int)
for l in ledger:
    emp = l.get('employee_id') or 'Unknown'
    if not l.get('notes') or len(l.get('notes', '')) < 5:
         emp_anomalies[emp] += 1

print("=== SHOP REVENUE ===")
for k, v in sorted(shop_rev.items(), key=lambda x: x[1], reverse=True):
    print(f"{k}: {v:.2f}")

print("\n=== TOP 10 ITEMS ===")
for k, v in top_items:
    print(f"{k}: {v:.2f}")

print("\n=== EMPLOYEE PERFORMANCE ===")
for k, v in sorted(employee_rev.items(), key=lambda x: x[1], reverse=True):
    anoms = emp_anomalies.get(k, 0)
    print(f"Employee {k} | Rev: {v:.2f} | Anomalies: {anoms}")
    
print("\n=== DAILY REVENUE (First 10 days) ===")
for k, v in sorted(daily_rev.items())[:10]:
    print(f"{k}: {v:.2f}")

