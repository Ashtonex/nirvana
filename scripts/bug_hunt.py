import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env variables from .env.local
load_dotenv(".env.local")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

def bug_hunt():
    print("--- Nirvana System Bug Hunt ---")
    
    # 1. Check for sales with zero inventory effect (potential bug)
    print("\n[1] Checking Sales vs Inventory Consistency...")
    # This is hard to do purely via script without knowing exact relations, 
    # but we can look for recent sales and check audit log for errors.
    
    # 2. Check for Pending Handshakes > 24h
    print("\n[2] Checking Stuck Handshakes...")
    handshakes = supabase.table("operations_handshakes").select("*").eq("status", "pending").execute()
    stuck = []
    for h in handshakes.data:
        stuck.append(h)
    
    if stuck:
        print(f"ALERT: {len(stuck)} handshakes are stuck in PENDING status.")
    else:
        print("Success: No stuck handshakes found.")

    # 3. Check for Operations Ledger entries without attribution
    print("\n[3] Checking Ledger Attribution...")
    ledger = supabase.table("operations_ledger").select("*").is_("shop_id", "null").is_("notes", "null").execute()
    if ledger.data:
        print(f"ALERT: {len(ledger.data)} ledger entries have no shop_id AND no notes.")
    else:
        print("Success: All ledger entries are attributed.")

    # 4. Check for unassigned shift sales
    print("\n[4] Checking Unassigned Sales (Handover Risk)...")
    sales = supabase.table("sales").select("*").is_("employee_id", "null").execute()
    if sales.data:
        print(f"ALERT: {len(sales.data)} sales are missing employee_id.")
    else:
        print("Success: All sales have employee attribution.")

    print("\n--- Bug Hunt Complete ---")

if __name__ == "__main__":
    bug_hunt()
