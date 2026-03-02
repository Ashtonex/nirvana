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

async function migrate() {
    console.log('🚀 Starting Migration: Local JSON -> Supabase Cloud');

    try {
        const dbPath = path.join(process.cwd(), 'lib', 'db.json');
        const data = JSON.parse(await fs.readFile(dbPath, 'utf8'));

        // 1. Migrate Shops
        console.log('📦 Migrating Shops...');
        if (data.shops) {
            for (const shop of data.shops) {
                await supabase.from('shops').upsert({
                    id: shop.id,
                    name: shop.name,
                    expenses: shop.expenses
                });
            }
        }

        // 2. Migrate Inventory & Allocations
        console.log('📦 Migrating Inventory...');
        if (data.inventory) {
            for (const item of data.inventory) {
                // Main Item
                await supabase.from('inventory_items').upsert({
                    id: item.id,
                    shipment_id: item.shipmentId || null,
                    name: item.name,
                    category: item.category,
                    acquisition_price: item.acquisitionPrice,
                    landed_cost: item.landedCost,
                    overhead_contribution: item.overheadContribution,
                    date_added: item.dateAdded,
                    quantity: item.quantity
                });

                // Allocations
                if (item.allocations) {
                    for (const alloc of item.allocations) {
                        await supabase.from('inventory_allocations').upsert({
                            item_id: item.id,
                            shop_id: alloc.shopId,
                            quantity: alloc.quantity
                        }, { onConflict: 'item_id,shop_id' });
                    }
                }
            }
        }

        // 3. Migrate Employees
        console.log('📦 Migrating Employees...');
        if (data.employees) {
            for (const emp of data.employees) {
                await supabase.from('employees').upsert({
                    id: emp.id,
                    name: emp.name,
                    role: emp.role,
                    shop_id: emp.shopId,
                    hire_date: emp.hireDate,
                    active: emp.active
                });
            }
        }

        // 4. Migrate Sales
        console.log('📦 Migrating Sales...');
        if (data.sales) {
            for (const sale of data.sales) {
                await supabase.from('sales').upsert({
                    id: sale.id,
                    shop_id: sale.shopId,
                    item_id: sale.itemId,
                    item_name: sale.itemName,
                    quantity: sale.quantity,
                    unit_price: sale.unitPrice,
                    total_before_tax: sale.totalBeforeTax,
                    tax: sale.tax,
                    total_with_tax: sale.totalWithTax,
                    date: sale.date,
                    employee_id: sale.employeeId,
                    client_name: sale.clientName
                });
            }
        }

        // 5. Migrate Ledger
        console.log('📦 Migrating Ledger...');
        if (data.ledger) {
            for (const entry of data.ledger) {
                await supabase.from('ledger_entries').upsert({
                    id: entry.id,
                    type: entry.type,
                    category: entry.category,
                    amount: entry.amount,
                    date: entry.date,
                    description: entry.description,
                    shop_id: entry.shopId || null
                });
            }
        }

        // 6. Migrate Settings
        console.log('📦 Migrating Settings...');
        if (data.settings) {
            await supabase.from('oracle_settings').upsert({
                id: 1,
                tax_rate: data.settings.taxRate,
                tax_threshold: data.settings.taxThreshold,
                tax_mode: data.settings.taxMode,
                zombie_days: data.settings.zombieDays,
                currency_symbol: data.settings.currencySymbol
            });
        }

        // 7. Migrate Audit Log
        console.log('📦 Migrating Audit Log...');
        if (data.auditLog) {
            const chunks = [];
            for (let i = 0; i < data.auditLog.length; i += 100) {
                chunks.push(data.auditLog.slice(i, i + 100));
            }
            for (const chunk of chunks) {
                await supabase.from('audit_log').upsert(chunk.map(entry => ({
                    id: entry.id,
                    timestamp: entry.timestamp,
                    employee_id: entry.employeeId,
                    action: entry.action,
                    details: entry.details,
                    changes: entry.changes
                })));
            }
        }

        console.log('✅ Migration Complete! Nirvana is now cloud-synchronized.');

    } catch (error) {
        console.error('❌ Migration Failed:', error);
    }
}

migrate();
