import urllib.request
import json

url = "https://tpbiqsazcmglxmzbmhxb.supabase.co/rest/v1/operations_ledger?id=eq.f8e13f06-32ac-4ef7-9c86-c434d410d85a"
headers = {
    "apikey": "sb_publishable_-7gS261srnq3lBOqmY3TCA_wgZPkBzI",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYmlxc2F6Y21nbHhtemJtaHhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0ODg0MiwiZXhwIjoyMDg4MDI0ODQyfQ.N7OlwIcW90sWlgwxBsPx7N2HBba5vwGLtPyhyZ7P82A",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}
data = {
    "amount": 100.0,
    "kind": "overhead_contribution",
    "notes": "Auto-routed from POS expense: Overhead contribution"
}

req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="PATCH")
with urllib.request.urlopen(req) as response:
    result = json.loads(response.read())
    print(json.dumps(result, indent=2))
