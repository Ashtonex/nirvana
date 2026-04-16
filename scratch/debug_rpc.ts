import { supabaseAdmin } from '../lib/supabase';

async function testRpc() {
    console.log("Testing get_oracle_pulse_metrics RPC...");
    const { data, error } = await supabaseAdmin.rpc('get_oracle_pulse_metrics', { 
        days_limit_int: 60 
    });

    if (error) {
        console.error("RPC ERROR:", error);
    } else {
        console.log("RPC SUCCESS:", JSON.stringify(data, null, 2).substring(0, 500) + "...");
    }
}

testRpc();
