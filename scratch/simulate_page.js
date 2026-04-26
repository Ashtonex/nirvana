
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim().replace(/^"|"$/g, '');
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function simulatePageLogic() {
  console.log('--- Simulating Page Logic ---');
  
  // getFinancials simulation
  const { data: ledger } = await supabase.from('ledger_entries').select('*').is('deleted_at', null).limit(50000);
  const { data: sales } = await supabase.from('sales').select('*, inventory_items(landed_cost)').is('deleted_at', null).limit(50000);

  console.log(`Fetched ${sales.length} sales.`);
  console.log(`Fetched ${ledger.length} ledger entries.`);

  const revenue = sales.reduce((sum, s) => sum + Number(s.total_before_tax || 0), 0);
  const posRevenue = sales.reduce((sum, s) => sum + Number(s.total_with_tax || 0), 0);
  
  const posExpenses = ledger
    .filter(l => l.shop_id && String(l.type || '').toLowerCase() === 'expense')
    .reduce((sum, l) => sum + Number(l.amount || 0), 0);

  console.log(`Revenue: ${revenue}`);
  console.log(`POS Revenue: ${posRevenue}`);
  console.log(`POS Expenses: ${posExpenses}`);

  // Breakdown of sales by shop in this simulated list
  const shopRev = {};
  sales.forEach(s => {
    shopRev[s.shop_id] = (shopRev[s.shop_id] || 0) + Number(s.total_before_tax || 0);
  });
  console.log('Sales Breakdown by Shop:', JSON.stringify(shopRev, null, 2));

  process.exit(0);
}

simulatePageLogic();
