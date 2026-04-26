
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

async function findPosExpenseDetails() {
  console.log('--- POS Expense Detail Analysis ---');
  const { data: ledger, error } = await supabase
    .from('ledger_entries')
    .select('date, amount, category, description, shop_id')
    .eq('category', 'POS Expense')
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${ledger.length} POS Expense entries.`);
  
  // Aggregate by description to see patterns
  const patterns = {};
  ledger.forEach(l => {
    const desc = (l.description || 'No Description').split(' (')[0].trim(); // Strip edit info
    patterns[desc] = (patterns[desc] || 0) + Number(l.amount || 0);
  });

  const sortedPatterns = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
  console.log('Top POS Expense Patterns:');
  sortedPatterns.slice(0, 20).forEach(([desc, total]) => {
    console.log(`${desc}: $${total.toLocaleString()}`);
  });

  process.exit(0);
}

findPosExpenseDetails();
