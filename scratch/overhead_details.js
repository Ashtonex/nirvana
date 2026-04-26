
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

async function findOverheadDetails() {
  console.log('--- Overhead Detail Analysis ---');
  const { data: ledger, error } = await supabase
    .from('ledger_entries')
    .select('date, amount, category, description, shop_id')
    .eq('category', 'Overhead')
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${ledger.length} overhead entries.`);
  ledger.forEach(l => {
    console.log(`[${l.date}] Shop: ${l.shop_id} | Amount: ${l.amount} | Desc: ${l.description}`);
  });

  process.exit(0);
}

findOverheadDetails();
