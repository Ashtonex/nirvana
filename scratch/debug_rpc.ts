import { supabaseAdmin } from '../lib/supabase';

async function testRpc() {
    console.log("Testing get_oracle_pulse_metrics RPC...");
    const { data, error } = await supabaseAdmin.rpc('get_oracle_pulse_metrics', { 
        p_days: 7,
        p_shop_id: ""
    });

    if (error) {
        console.error("RPC ERROR:", error);
    } else {
        console.log("RPC SUCCESS:", JSON.stringify(data, null, 2).substring(0, 500) + "...");
    }
}

testRpc();
