
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

async function testJoin() {
  console.log('--- Join Test ---');
  // In Supabase, you need a foreign key relationship for this to work.
  // We'll see if it exists.
  const { data, error } = await supabase
    .from('sales')
    .select('id, item_id, quantity, inventory_items(landed_cost)')
    .limit(5);

  if (error) {
    console.log('Join failed:', error.message);
  } else {
    console.log('Join succeeded:', JSON.stringify(data, null, 2));
  }
  process.exit(0);
}

testJoin();
