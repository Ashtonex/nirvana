import urllib.request
import json

url = "https://tpbiqsazcmglxmzbmhxb.supabase.co/rest/v1/?apikey=sb_publishable_-7gS261srnq3lBOqmY3TCA_wgZPkBzI"
headers = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYmlxc2F6Y21nbHhtemJtaHhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0ODg0MiwiZXhwIjoyMDg4MDI0ODQyfQ.N7OlwIcW90sWlgwxBsPx7N2HBba5vwGLtPyhyZ7P82A",
}

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as response:
    result = json.loads(response.read())
    print(json.dumps(result, indent=2))
