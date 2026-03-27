import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data: shops } = await supabase.from('shops').select('*');
  console.log("Shops:", shops?.map(s => ({ id: s.id, name: s.name })));
  
  const { data: allocs } = await supabase.from('inventory_allocations').select('*').limit(10);
  console.log("Sample Allocations:", allocs);
}

checkData();
