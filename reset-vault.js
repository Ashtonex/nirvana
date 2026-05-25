const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  console.log("Starting manual vault baseline reset script...");

  // Parse .env.local manually
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error("Error: .env.local not found!");
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      // join back in case value had '='
      let value = parts.slice(1).join('=').trim();
      // strip quotes if present
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      envVars[key] = value;
    }
  });

  const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceRoleKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local!");
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Get current operations state (id=1)
  const { data: opsState, error: stateError } = await supabaseAdmin
    .from('operations_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (stateError) {
    console.error("Error fetching operations_state:", stateError.message);
    process.exit(1);
  }

  console.log("Current operations_state:", opsState);

  // Force actual balance to 1550 if it is different, but user says it currently has 1550
  const actualVault = 1550;
  if (Number(opsState.actual_balance) !== actualVault) {
    console.log(`Updating operations_state actual_balance to $${actualVault}...`);
    const { error: updateError } = await supabaseAdmin
      .from('operations_state')
      .update({ actual_balance: actualVault, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (updateError) {
      console.error("Failed to update operations_state:", updateError.message);
      process.exit(1);
    }
    console.log("Successfully updated operations_state actual_balance to 1550!");
  }

  // Calculate computed balance for last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: opsEntries, error: entriesError } = await supabaseAdmin
    .from('operations_ledger')
    .select('*')
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (entriesError) {
    console.error("Error fetching operations_ledger entries:", entriesError.message);
    process.exit(1);
  }

  const computedVault = (opsEntries || []).reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  const drift = actualVault - computedVault;
  console.log(`Reconciliation:\n- Actual Vault: $${actualVault}\n- 30-day Computed: $${computedVault}\n- Drift: $${drift}`);

  if (Math.abs(drift) < 0.01) {
    console.log("Vault is already balanced! No drift to fix.");
    process.exit(0);
  }

  console.log(`Inserting balancing entry of $${drift.toFixed(2)} to reset drift to 0...`);
  const { data: insertData, error: insertError } = await supabaseAdmin
    .from('operations_ledger')
    .insert({
      title: 'Vault Baseline Reset',
      kind: 'vault_baseline',
      amount: drift,
      shop_id: null,
    notes: `Baseline reset: computed was $${computedVault.toFixed(2)}, actual was $${actualVault.toFixed(2)}. Inserted $${drift.toFixed(2)} to balance. Drift reset to 0 on ${now.toISOString()}`,
    effective_date: now.toISOString(),
    created_at: now.toISOString(),
  })
    .select()
    .single();

  if (insertError) {
    console.error("Error inserting balancing entry:", insertError.message);
    process.exit(1);
  }

  console.log("Balancing entry successfully inserted:", insertData);
  console.log("Vault drift successfully reset to 0!");
}

main().catch(err => {
  console.error("Fatal error:", err);
});
