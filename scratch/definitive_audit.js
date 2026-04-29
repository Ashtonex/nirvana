
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

async function fetchAllSales() {
  let allSales = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('sales')
      .select('total_with_tax, total_before_tax, date, shop_id')
      .is('deleted_at', null)
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    
    allSales = allSales.concat(data);
    if (data.length < batchSize) break;
    from += batchSize;
  }
  
  return allSales;
}

async function runFullDiagnostics() {
  console.log('--- TRUE ALL-TIME SALES AUDIT ---');
  const sales = await fetchAllSales();
  
  const totalWithTax = sales.reduce((s, x) => s + Number(x.total_with_tax || 0), 0);
  const totalBeforeTax = sales.reduce((s, x) => s + Number(x.total_before_tax || 0), 0);

  console.log(`Total Sales Count: ${sales.length}`);
  console.log(`True Total (With Tax): $${totalWithTax.toFixed(2)}`);
  console.log(`True Total (Before Tax): $${totalBeforeTax.toFixed(2)}`);

  // Check Ledger Income again (fully)
  let allLedger = [];
  let lFrom = 0;
  while(true) {
      const { data, error } = await supabase.from('ledger_entries').select('amount, type, category').is('deleted_at', null).range(lFrom, lFrom + batchSize - 1);
      if (error || !data || data.length === 0) break;
      allLedger = allLedger.concat(data);
      if (data.length < batchSize) break;
      lFrom += batchSize;
  }

  const ledgerIncome = allLedger.filter(e => e.type === 'income').reduce((s, x) => s + Number(x.amount || 0), 0);
  console.log(`Total Ledger Income: $${ledgerIncome.toFixed(2)}`);
  
  const grandTotal = totalWithTax + ledgerIncome;
  console.log(`\nGRAND TOTAL REVENUE: $${grandTotal.toFixed(2)}`);

  process.exit(0);
}

const batchSize = 1000;
runFullDiagnostics();
