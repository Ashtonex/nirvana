const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  console.log("Checking Tracked Cash components with deleted_at IS NULL filter...");

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
      let value = parts.slice(1).join('=').trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      envVars[key] = value;
    }
  });

  const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceRoleKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Fetch the data exactly like control-center
  const [salesData, ledgerData, opsStateData, investData] = await Promise.all([
    supabaseAdmin.from('sales').select('shop_id, total_with_tax, total_before_tax, quantity, payment_method, date').is('deleted_at', null),
    supabaseAdmin.from('ledger_entries').select('id, shop_id, amount, type, category, description, date').is('deleted_at', null),
    supabaseAdmin.from('operations_state').select('*').eq('id', 1).single(),
    supabaseAdmin.from('invest_deposits').select('shop_id, amount, withdrawn_amount')
  ]);

  const sales = salesData.data || [];
  const ledger = ledgerData.data || [];
  const opsState = opsStateData.data;
  const investDeposits = investData.data || [];

  const operationsActualBalance = Number(opsState?.actual_balance || 0);

  const investAvailable = investDeposits.reduce(
    (total, deposit) => total + Number(deposit.amount || 0) - Number(deposit.withdrawn_amount || 0),
    0
  );

  const shopLedger = ledger.filter((entry) => entry?.shop_id);

  const drawerOpening = shopLedger
    .filter((entry) => entry.category === "Cash Drawer Opening")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const salesCash = sales
    .filter((sale) => (sale.payment_method || sale.paymentMethod) === "cash")
    .reduce((sum, sale) => sum + Number(sale.total_with_tax || 0), 0);

  // Check if a ledger entry is a transfer to savings or blackbox
  const isSavingsOrBlackboxTransferEntry = (entry) => {
    const desc = (entry.description || '').toLowerCase();
    const cat = (entry.category || '').toLowerCase();
    const notes = (entry.notes || '').toLowerCase();
    return desc.includes('savings') || cat.includes('savings') || notes.includes('savings') ||
           desc.includes('blackbox') || cat.includes('blackbox') || notes.includes('blackbox') ||
           desc.includes('eod') || cat.includes('eod') || notes.includes('eod');
  };

  const drawerExpenses = shopLedger
    .filter((entry) => String(entry.type || "").toLowerCase() === "expense" || isSavingsOrBlackboxTransferEntry(entry))
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const postedToOperations = shopLedger
    .filter((entry) => entry.category === "Operations Transfer")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  const drawerExpectedCash = drawerOpening + salesCash - drawerExpenses - postedToOperations;
  const totalTrackedCash = drawerExpectedCash + operationsActualBalance + investAvailable;

  console.log("\n--- RECONCILIATION WITH DELETED_AT FILTER ---");
  console.log(`- Drawer Opening (Total): $${drawerOpening.toFixed(2)}`);
  console.log(`- Cash Sales (Total): $${salesCash.toFixed(2)}`);
  console.log(`- Drawer Expenses / Transfers to Savings & Blackbox (Total): $${drawerExpenses.toFixed(2)}`);
  console.log(`- Posted to Operations (Total): $${postedToOperations.toFixed(2)}`);
  console.log(`-------------------------------------------`);
  console.log(`= Drawer Expected Cash: $${drawerExpectedCash.toFixed(2)}`);
  console.log(`+ Operations Actual Balance: $${operationsActualBalance.toFixed(2)}`);
  console.log(`+ Invest Available: $${investAvailable.toFixed(2)}`);
  console.log(`===========================================`);
  console.log(`=> TOTAL TRACKED CASH: $${totalTrackedCash.toFixed(2)}`);
  console.log(`===========================================`);
}

main().catch(err => console.error(err));
