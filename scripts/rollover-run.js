#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: 'no-store' }) }
  });

  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from('operations_ledger')
      .select('shop_id, amount, kind, created_at')
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth)
      .in('kind', ['overhead_contribution', 'overhead_payment']);

    if (error) throw error;

    const netByShop = {};
    (rows || []).forEach(r => {
      const shop = r.shop_id || 'unknown';
      netByShop[shop] = (netByShop[shop] || 0) + Number(r.amount || 0);
    });

    const timestamp = new Date().toISOString();
    let rolled = 0;
    let totalRolled = 0;

    for (const shopId of Object.keys(netByShop)) {
      const net = netByShop[shopId];
      if (!net || Number(net) <= 0) continue;
      rolled++;
      totalRolled += net;

      try {
        await supabaseAdmin.from('ledger_entries').insert({
          id: Math.random().toString(36).substring(2, 9),
          shop_id: shopId,
          type: 'transfer',
          category: 'Operations Transfer',
          amount: net,
          date: timestamp,
          description: 'Monthly overhead rollover to Vault',
        });
      } catch (e) {
        console.warn('rollover ledger_entries insert failed:', e?.message || e);
      }

      try {
        await supabaseAdmin.from('operations_ledger').insert({
          amount: net,
          kind: 'overhead_rollover',
          shop_id: shopId,
          title: 'Monthly Overhead Rollover',
          notes: 'Rollover from overhead tracker',
          effective_date: timestamp.split('T')[0],
          created_at: timestamp,
        });
      } catch (e) {
        console.warn('rollover operations_ledger insert failed:', e?.message || e);
      }
    }

    if (totalRolled > 0) {
      const { data: state } = await supabaseAdmin.from('operations_state').select('actual_balance').eq('id', 1).maybeSingle();
      const prev = Number(state?.actual_balance || 0);
      const newBalance = prev + totalRolled;
      await supabaseAdmin.from('operations_state').upsert({ id: 1, actual_balance: newBalance, updated_at: timestamp });
    }

    console.log('Rollover complete:', { rolled, totalRolled });
    process.exit(0);
  } catch (e) {
    console.error('Rollover failed:', e?.message || e);
    process.exit(1);
  }
}

main();
