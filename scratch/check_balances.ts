import { supabaseAdmin } from "@/lib/supabase";

async function checkBalances() {
  console.log('=== CURRENT BALANCES ===\n');

  // Operations State
  const { data: opsState } = await supabaseAdmin
    .from("operations_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  console.log('OPERATIONS VAULT:');
  console.log(`  Actual Balance (Manual): $${opsState?.actual_balance || 0}`);

  // Operations Ledger (Computed)
  const { data: ledgerRows } = await supabaseAdmin
    .from("operations_ledger")
    .select("amount, kind");

  const computedBalance = (ledgerRows || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  console.log(`  Computed Balance (Ledger): $${computedBalance}`);
  console.log(`  Delta (Ghost Capital): $${(opsState?.actual_balance || 0) - computedBalance}\n`);

  // Invest Deposits
  const { data: investRows } = await supabaseAdmin
    .from("invest_deposits")
    .select("amount, withdrawn_amount");

  let totalInvest = 0;
  let totalInvestWithdrawn = 0;

  (investRows || []).forEach((d: any) => {
    totalInvest += Number(d.amount || 0);
    totalInvestWithdrawn += Number(d.withdrawn_amount || 0);
  });

  const investAvailable = totalInvest - totalInvestWithdrawn;

  console.log('INVEST (PERFUMES):');
  console.log(`  Total Deposited: $${totalInvest}`);
  console.log(`  Total Withdrawn: $${totalInvestWithdrawn}`);
  console.log(`  Invest Available: $${investAvailable}\n`);

  console.log('=== SUMMARY ===');
  console.log(`Perfumes (Invest Available): $${investAvailable}`);
  console.log(`Vault (System Recognized): $${computedBalance}`);
  console.log(`Vault (Physical Manual): $${opsState?.actual_balance || 0}`);
}

checkBalances().catch(console.error);
