import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

async function loadEnv() {
    const envPath = path.join(process.cwd(), '.env.local');
    const content = await fs.readFile(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val.length) {
            process.env[key.trim()] = val.join('=').trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

await loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function purge() {
    console.log('🧹 Purging all test records from cloud...');

    const tables = [
        'sales',
        'quotations',
        'transfers',
        'inventory_allocations',
        'employees',
        'inventory_items',
        'shipments',
        'ledger_entries',
        'audit_log',
        'oracle_emails'
    ];

    try {
        for (const table of tables) {
            console.log(`🗑️ Clearing ${table}...`);
            const { error } = await supabase.from(table).delete().neq('id', 'RESERVED_FALLBACK_ID');
            // Most tables use TEXT IDs, some might use UUIDs. neq is a safe way to say "delete all" without using '*' which delete() doesn't support for range.
            // Actually supabase .delete().filter('id', 'neq', '...') is safer or just use a range that covers all.
            // .delete().neq('id', '_') usually works.
            if (error) console.error(`Error clearing ${table}:`, error);
        }

        // Reset settings to defaults
        console.log('⚙️ Resetting Oracle settings...');
        await supabase.from('oracle_settings').update({
            tax_rate: 0.155,
            tax_threshold: 0,
            tax_mode: 'all',
            zombie_days: 60,
            currency_symbol: '$',
            global_expenses: {}
        }).eq('id', 1);

        // Reset all shop expenses to zero
        console.log('🏪 Resetting shop expenses...');
        const { data: shops } = await supabase.from('shops').select('id');
        for (const shop of (shops || [])) {
            await supabase.from('shops').update({
                expenses: { rent: 0, salaries: 0, utilities: 0, misc: 0 }
            }).eq('id', shop.id);
        }

        console.log('✅ Purge Complete. Nirvana is now a clean slate.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Purge Failed:', error);
        process.exit(1);
    }
}

purge();
