import json

with open('dossier_data.json', 'r') as f:
    data = json.load(f)

sales = data.get('sales', [])
ledger = data.get('ledger', [])

print(f"Total Sales Records: {len(sales)}")
if sales:
    print("Sales fields:", list(sales[0].keys()))
    
print(f"Total Ledger Records: {len(ledger)}")
if ledger:
    print("Ledger fields:", list(ledger[0].keys()))
