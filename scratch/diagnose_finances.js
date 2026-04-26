
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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('--- Sales Diagnosis ---');
  const { count, data: sales, error } = await supabase
    .from('sales')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching sales:', error);
    return;
  }

  console.log(`Total Sales Count (including deleted): ${count}`);
  
  const zeroSales = sales.filter(s => !s.total_before_tax || Number(s.total_before_tax) === 0);
  console.log(`Sales with 0 or null total_before_tax: ${zeroSales.length}`);
  
  if (sales.length > 0) {
    console.log(`Sample Sale: ${JSON.stringify(sales[0])}`);
  }

  const nonDeleted = sales.filter(s => !s.deleted_at);
  console.log(`Non-deleted Sales Count: ${nonDeleted.length}`);
  const ndTotalBeforeTax = nonDeleted.reduce((sum, s) => sum + Number(s.total_before_tax || 0), 0);
  console.log(`Non-deleted Sum total_before_tax: ${ndTotalBeforeTax}`);

  console.log('\n--- Ledger Diagnosis ---');
  const { count: lCount, data: ledger, error: lError } = await supabase
    .from('ledger_entries')
    .select('*', { count: 'exact' });

  if (lError) {
    console.error('Error fetching ledger:', lError);
    return;
  }

  console.log(`Total Ledger Count: ${lCount}`);
  const cogs = ledger.filter(l => l.category === 'Inventory Acquisition' && !l.deleted_at).reduce((sum, l) => sum + Number(l.amount || 0), 0);
  console.log(`Total COGS (Acquisition): ${cogs}`);

  process.exit(0);
}

diagnose();
