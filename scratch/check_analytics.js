const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAnalytics() {
  const { data, error } = await supabase
    .from('analytics_results')
    .select('kind, status, summary, generated_at')
    .order('generated_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching analytics_results:', error);
  } else {
    console.log('Latest Analytics Results:');
    console.table(data);
  }
}

checkAnalytics();
