import { supabaseAdmin } from '../lib/supabase';

async function probeSchema() {
    const tables = ['sales', 'inventory_items', 'ledger_entries', 'invest_deposits', 'oracle_settings'];
    console.log("Probing table schemas...");

    for (const table of tables) {
        const { data, error } = await supabaseAdmin.from(table).select('*').limit(1);
        if (error) {
            console.error(`Error probing ${table}:`, error.message);
        } else if (data && data.length > 0) {
            console.log(`Table ${table} COLUMNS:`, Object.keys(data[0]).join(', '));
        } else {
            // If empty, try to get columns via a dummy query if possible, or just note it's empty
            console.log(`Table ${table} is EMPTY or could not be probed for keys.`);
        }
    }
}

probeSchema();
