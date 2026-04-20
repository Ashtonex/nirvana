
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function diagnostic() {
    console.log("--- Oracle Deep Diagnostic ---");
    
    // 1. Connection Check
    const { data: shops, error: shopsError } = await supabaseAdmin.from('shops').select('id, name');
    console.log("Shops Connection:", shopsError ? `FAILED: ${shopsError.message}` : "OK");
    if (shopsError) return;

    // 2. Schema Probe
    console.log("\n--- Schema Probe ---");
    const tables = ['sales', 'ledger_entries', 'operations_ledger', 'inventory_items', 'invest_deposits'];
    for (const table of tables) {
        const { data, error } = await supabaseAdmin.from(table).select('*').limit(1);
        if (error) {
            console.error(`Table [${table}] Error: ${error.message}`);
        } else {
            console.log(`Table [${table}] OK. Columns:`, Object.keys(data[0] || {}).join(', '));
        }
    }

    // 3. RPC Probe
    console.log("\n--- RPC Probe ---");
    const rpcName = 'get_oracle_pulse_metrics';
    
    console.log(`Testing RPC: ${rpcName} with p_days: 7, p_shop_id: ""`);
    const { data: res1, error: err1 } = await supabaseAdmin.rpc(rpcName, { p_days: 7, p_shop_id: "" });
    if (err1) {
        console.error(`RPC Fail (p_days): ${err1.message}`);
    } else {
        console.log(`RPC Success! Keys:`, Object.keys(res1 || {}));
    }

    console.log(`\nTesting legacy RPC: ${rpcName} with days_limit_int: 7`);
    const { data: res2, error: err2 } = await supabaseAdmin.rpc(rpcName, { days_limit_int: 7 });
    if (err2) {
        console.error(`RPC Fail (legacy): ${err2.message}`);
    } else {
        console.log(`RPC Success! Keys:`, Object.keys(res2 || {}));
    }
}

diagnostic();
