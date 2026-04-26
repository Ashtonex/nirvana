
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

async function updateTransfers() {
  const { data: ledger, error } = await supabase
    .from('ledger_entries')
    .select('*')
    .is('deleted_at', null)
    .eq('type', 'expense');

  if (error) {
    console.error(error);
    return;
  }

  const transferIds = ledger.filter(l => {
    const d = (l.description || '').toLowerCase();
    const c = (l.category || '').toLowerCase();
    return d.includes('savings') || d.includes('black box') || d.includes('blackbox') ||
           c.includes('savings') || c.includes('black box') || c.includes('blackbox');
  }).map(l => l.id);

  console.log(`Updating ${transferIds.length} entries...`);

  if (transferIds.length > 0) {
    const { error: updateError } = await supabase
      .from('ledger_entries')
      .update({ type: 'asset', category: 'Transfer' })
      .in('id', transferIds);

    if (updateError) {
      console.error('Update failed:', updateError);
    } else {
      console.log('Update successful!');
    }
  }

  process.exit(0);
}

updateTransfers();
