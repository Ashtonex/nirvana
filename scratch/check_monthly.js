
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

async function checkMonthly() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  console.log(`Checking from: ${startOfMonth}`);

  const { data: sales } = await supabase
    .from('sales')
    .select('total_before_tax, total_with_tax')
    .gte('date', startOfMonth)
    .is('deleted_at', null);

  const revenue = sales.reduce((sum, s) => sum + Number(s.total_before_tax || 0), 0);
  const posRevenue = sales.reduce((sum, s) => sum + Number(s.total_with_tax || 0), 0);

  console.log(`Current Month Sales Count: ${sales.length}`);
  console.log(`Current Month Revenue: ${revenue}`);
  console.log(`Current Month POS Revenue: ${posRevenue}`);

  const { data: ledger } = await supabase
    .from('ledger_entries')
    .select('amount')
    .gte('date', startOfMonth)
    .is('shop_id', 'not.is', null)
    .eq('type', 'expense')
    .is('deleted_at', null);

  const expenses = ledger.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  console.log(`Current Month POS Expenses: ${expenses}`);

  process.exit(0);
}

checkMonthly();
