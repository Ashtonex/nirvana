
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

async function breakdownByShop() {
  console.log('--- Revenue & Expense Breakdown by Shop ---');
  
  // Fetch all data
  const { data: sales } = await supabase.from('sales').select('*').is('deleted_at', null);
  const { data: ledger } = await supabase.from('ledger_entries').select('*').is('deleted_at', null);
  const { data: shops } = await supabase.from('shops').select('id, name');

  const shopStats = {};
  shops.forEach(s => {
    shopStats[s.id] = { name: s.name, revenue: 0, posExpenses: 0, overheadLedger: 0, transfers: 0 };
  });

  sales.forEach(s => {
    if (shopStats[s.shop_id]) {
      shopStats[s.shop_id].revenue += Number(s.total_before_tax || 0);
    }
  });

  ledger.forEach(l => {
    if (shopStats[l.shop_id]) {
      const amt = Number(l.amount || 0);
      if (l.type === 'expense') {
        if (l.category === 'Overhead') {
          shopStats[l.shop_id].overheadLedger += amt;
        } else if (l.category === 'POS Expense' || l.category === 'misc') {
          shopStats[l.shop_id].posExpenses += amt;
        }
      } else if (l.category === 'Transfer' || l.type === 'asset') {
        shopStats[l.shop_id].transfers += amt;
      }
    }
  });

  console.log(JSON.stringify(shopStats, null, 2));

  // Check for sales with NO shop_id
  const noShopSales = sales.filter(s => !s.shop_id);
  if (noShopSales.length > 0) {
    const sum = noShopSales.reduce((sum, s) => sum + Number(s.total_before_tax || 0), 0);
    console.log(`Sales with NO shop_id: ${noShopSales.length} | Sum: ${sum}`);
  }

  process.exit(0);
}

breakdownByShop();
