// Run: node scripts/check_db.mjs
// Reads env from process.env (must be set beforehand)

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const headers = {
  "apikey": KEY,
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Prefer": "count=exact"
};

async function query(table, select = "*", limit = 10000) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=${select}&limit=${limit}`, { headers });
  const countHeader = res.headers.get("Content-Range");
  const data = await res.json();
  return { data, count: countHeader, status: res.status };
}

async function run() {
  console.log("=== Shops ===");
  const shops = await query("shops", "id,name");
  console.log("Status:", shops.status, "Count-Range:", shops.count);
  console.log(JSON.stringify(shops.data, null, 2));

  console.log("\n=== Allocations Count ===");
  const allocRes = await fetch(`${URL}/rest/v1/inventory_allocations?select=id,item_id,shop_id,quantity&limit=1`, { 
    headers: { ...headers, "Prefer": "count=exact" }
  });
  const countHdr = allocRes.headers.get("Content-Range");
  console.log("Content-Range:", countHdr); // shows X-Y/total

  console.log("\n=== Full Allocations (first 20 rows) ===");
  const allocFirst = await query("inventory_allocations", "id,item_id,shop_id,quantity", 20);
  console.log("Status:", allocFirst.status);
  console.log(JSON.stringify(allocFirst.data, null, 2));

  console.log("\n=== Unique shop_ids in allocations ===");
  const allAllocs = await query("inventory_allocations", "shop_id", 10000);
  const shopIds = [...new Set(allAllocs.data.map(a => a.shop_id))];
  console.log("Unique shop_ids:", shopIds);
  
  const byShop = {};
  for (const a of allAllocs.data) {
    byShop[a.shop_id] = (byShop[a.shop_id] || 0) + 1;
  }
  console.log("Rows per shop_id:", byShop);

  console.log("\n=== Inventory Items Count ===");
  const items = await query("inventory_items", "id,name,quantity", 10000);
  console.log("Status:", items.status, "Count-Range:", items.count);
  console.log("Total items returned:", items.data.length);
}

run().catch(console.error);
