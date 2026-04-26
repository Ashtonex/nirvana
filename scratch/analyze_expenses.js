
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

async function analyzeExpenses() {
  console.log('--- Expense Analysis ---');
  const { data: ledger, error } = await supabase
    .from('ledger_entries')
    .select('*')
    .is('deleted_at', null);

  if (error) {
    console.error(error);
    return;
  }

  const posExpenses = ledger.filter(l => l.shop_id && String(l.type || '').toLowerCase() === 'expense');
  console.log(`Total POS Expenses Count: ${posExpenses.length}`);
  const totalPosExpenseAmount = posExpenses.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  console.log(`Total POS Expense Amount: ${totalPosExpenseAmount}`);

  // Break down by category
  const categories = {};
  posExpenses.forEach(l => {
    categories[l.category] = (categories[l.category] || 0) + Number(l.amount || 0);
  });
  console.log('POS Expenses by Category:', JSON.stringify(categories, null, 2));

  // Check sales for comparison
  const { data: sales } = await supabase
    .from('sales')
    .select('total_with_tax')
    .is('deleted_at', null);
  
  const totalSales = sales.reduce((sum, s) => sum + Number(s.total_with_tax || 0), 0);
  console.log(`Total POS Sales (Inc. Tax): ${totalSales}`);

  process.exit(0);
}

analyzeExpenses();
