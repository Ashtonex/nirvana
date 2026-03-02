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

async function check() {
    await loadEnv();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: shops, error } = await supabase.from('shops').select('*');
    if (error) {
        console.error('Error fetching shops:', error);
    } else {
        console.log('Shops in database:', shops);
    }
}

check();
