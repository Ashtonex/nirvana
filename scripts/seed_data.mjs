import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Manual env loader for zero-dependency portability
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
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SHOPS = [
    { id: 'kipasa', name: 'Kipasa Branch', expenses: { rent: 1200, salaries: 2500, utilities: 450, misc: 100 } },
    { id: 'dubdub', name: 'Dub Dub Outlet', expenses: { rent: 800, salaries: 1800, utilities: 300, misc: 50 } },
    { id: 'tradecenter', name: 'Trade Center HQ', expenses: { rent: 2000, salaries: 4500, utilities: 900, misc: 300 } }
];

const CATEGORIES = ['Electronics', 'Fashion', 'Home & Living', 'Accessories', 'Beauty'];

const PRODUCTS = [
    { name: 'Quantum X Phone', category: 'Electronics', price: 850, cost: 420 },
    { name: 'Nebula Watch', category: 'Accessories', price: 199, cost: 75 },
    { name: 'Titan Backpack', category: 'Fashion', price: 85, cost: 30 },
    { name: 'Lumina Smart Lamp', category: 'Home & Living', price: 45, cost: 12 },
    { name: 'Onyx Headphones', category: 'Electronics', price: 299, cost: 110 },
    { name: 'Aurora Skincare Kit', category: 'Beauty', price: 120, cost: 45 },
    { name: 'Zenith Keyboard', category: 'Electronics', price: 150, cost: 60 }
];

async function seed() {
    console.log('🔮 Initiating Oracle Data Seeding...');

    try {
        // 1. Seed Shops
        console.log('📍 Seeding Shops...');
        for (const shop of SHOPS) {
            await supabase.from('shops').upsert(shop);
        }

        // 2. Seed Employees
        console.log('👥 Seeding Employees...');
        const employees = [];
        for (const shop of SHOPS) {
            const empId = Math.random().toString(36).substring(2, 9);
            const emp = {
                id: empId,
                name: `Manager ${shop.name.split(' ')[0]}`,
                role: 'manager',
                shop_id: shop.id,
                active: true,
                hire_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString()
            };
            await supabase.from('employees').upsert(emp);
            employees.push(emp);
        }

        // 3. Seed Inventory
        console.log('📦 Seeding Inventory & Shipments...');
        const inventoryItems = [];
        for (const prod of PRODUCTS) {
            const itemId = Math.random().toString(36).substring(2, 9);
            const shipmentId = `SHIP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

            // Create shipment
            await supabase.from('shipments').upsert({
                id: shipmentId,
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
                supplier: 'Global Sourcing Corp',
                shipment_number: `REF-${Math.floor(Math.random() * 10000)}`,
                purchase_price: prod.cost * 100,
                shipping_cost: 500,
                duty_cost: 1200,
                manifest_pieces: 100,
                total_quantity: 100
            });

            const item = {
                id: itemId,
                shipment_id: shipmentId,
                name: prod.name,
                category: prod.category,
                acquisition_price: prod.cost,
                landed_cost: prod.cost + 17, // Adding some buffer
                overhead_contribution: 2.5,
                date_added: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString(),
                quantity: 100
            };
            await supabase.from('inventory_items').upsert(item);
            inventoryItems.push({ ...item, targetPrice: prod.price });

            // Distribute across shops
            for (const shop of SHOPS) {
                await supabase.from('inventory_allocations').upsert({
                    item_id: itemId,
                    shop_id: shop.id,
                    quantity: 33
                }, { onConflict: 'item_id,shop_id' });
            }
        }

        // 4. Seed Sales (Historical Data for charts)
        console.log('💰 Generating Sales History (30 Days)...');
        const salesEntries = [];
        for (let i = 30; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);

            // Random number of sales per day
            const dailyVolume = Math.floor(Math.random() * 5) + 2;
            for (let j = 0; j < dailyVolume; j++) {
                const shop = SHOPS[Math.floor(Math.random() * SHOPS.length)];
                const item = inventoryItems[Math.floor(Math.random() * inventoryItems.length)];
                const qty = Math.floor(Math.random() * 2) + 1;
                const baseTotal = item.targetPrice * qty;
                const tax = baseTotal * 0.155;

                salesEntries.push({
                    id: Math.random().toString(36).substring(2, 12),
                    shop_id: shop.id,
                    item_id: item.id,
                    item_name: item.name,
                    quantity: qty,
                    unit_price: item.targetPrice,
                    total_before_tax: baseTotal,
                    tax: tax,
                    total_with_tax: baseTotal + tax,
                    date: date.toISOString(),
                    employee_id: employees.find(e => e.shop_id === shop.id).id,
                    client_name: 'Test Customer'
                });
            }
        }

        // Chunk sales uploads to avoid payload limits
        console.log(`🚀 Uploading ${salesEntries.length} sales records...`);
        for (let i = 0; i < salesEntries.length; i += 50) {
            await supabase.from('sales').upsert(salesEntries.slice(i, i + 50));
        }

        // 5. Seed Ledger (Legacy assets and costs)
        console.log('📊 Seeding Ledger...');
        await supabase.from('ledger_entries').upsert({
            id: 'legacy-asset-1',
            type: 'asset',
            category: 'Inventory Acquisition',
            amount: 50000,
            date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
            description: 'Initial Stocking Fund'
        });

        // 6. Seed Oracle Settings
        console.log('⚙️ Fine-tuning Oracle Settings...');
        await supabase.from('oracle_settings').upsert({
            id: 1,
            tax_rate: 0.155,
            tax_threshold: 10,
            tax_mode: 'above_threshold',
            zombie_days: 60,
            currency_symbol: '$',
            global_expenses: { "SOFTWARE": 299, "MARKETING": 500, "SECURITY": 150 }
        });

        console.log('✅ Seeding Complete! Nirvana is now alive with data.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        process.exit(1);
    }
}

seed();
