const fs = require('fs');
const filePath = 'g:/work/ATMCAPPROJECTS/nirvana/app/actions.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// === PATCH 1: Replace the operations routing block in recordPosExpense ===

const oldBlock = `    // Auto-create Operations entry for overhead expenses OR if manually toggled
    // Overhead logged at POS is a contribution into the central ops pool.
    // User requested to hide historical transfers to perfumes/invest from operations page.
    const shouldPostToOps = false; // REPLACED - see new routing logic below

    if (shouldPostToOps) {
        const opsKind = isOverheadExpense ? "overhead_contribution" : "eod_deposit";
        
        // Insert to operations_ledger
        await supabaseAdmin.from('operations_ledger').insert({
            amount: amount,
            kind: opsKind,
            shop_id: shopId,
            title: description,
            notes: \`Auto-routed from POS expense: \${isOverheadExpense ? 'Overhead contribution' : 'Manual deposit'}\`,
            employee_id: employeeId,
            effective_date: timestamp.split('T')[0],
            created_at: timestamp,
        });
        
        // ALSO update the actual balance in operations_state
        // This ensures posting from POS doesn't create fake drift
        if (!isOverheadExpense) {
            // EOD deposit - update actual balance
            const { data: currentState } = await supabaseAdmin
                .from('operations_state')
                .select('actual_balance')
                .eq('id', 1)
                .maybeSingle();
            
            const newBalance = Number(currentState?.actual_balance || 0) + amount;
            await supabaseAdmin
                .from('operations_state')
                .upsert({ 
                    id: 1, 
                    actual_balance: newBalance, 
                    updated_at: new Date().toISOString() 
                });
        }
    }`;

const newBlock = `    // === OPERATIONS ROUTING ===
    // POS can ONLY ADD to operations (positive amounts). Never deduct.
    // Vault-increasing kinds: eod_deposit, savings_deposit, blackbox
    // Overhead-tracker kinds: overhead_contribution (does NOT increase vault)
    const isSavingsTransfer = ["savings", "saving"].some((kw) => descLower.includes(kw)) && !descLower.includes("black");
    const isBlackboxTransfer = ["black box", "blackbox"].some((kw) => descLower.includes(kw));

    // Determine which operations routing applies (mutually exclusive, priority order)
    const shouldRouteToVault = (isSavingsTransfer || isBlackboxTransfer || options?.toOperations) && !isPerfumeExpense && !options?.toInvest;
    const shouldRouteToOverhead = isOverheadExpense && !isPerfumeExpense && !options?.toInvest && !shouldRouteToVault;

    if (shouldRouteToVault) {
        // Savings, blackbox, or manual "Deposit to Operations" -> vault deposit
        const opsKind = isSavingsTransfer ? "savings_deposit" : isBlackboxTransfer ? "blackbox" : "eod_deposit";
        const label = isSavingsTransfer ? "Savings deposit" : isBlackboxTransfer ? "Black Box deposit" : "Manual deposit";

        await supabaseAdmin.from('operations_ledger').insert({
            amount: amount,
            kind: opsKind,
            shop_id: shopId,
            title: description,
            notes: \`Auto-routed from POS expense: \${label}\`,
            employee_id: employeeId,
            effective_date: timestamp.split('T')[0],
            created_at: timestamp,
        });

        // Vault deposits update actual_balance
        const { data: currentState } = await supabaseAdmin
            .from('operations_state')
            .select('actual_balance')
            .eq('id', 1)
            .maybeSingle();

        const newBalance = Number(currentState?.actual_balance || 0) + amount;
        await supabaseAdmin
            .from('operations_state')
            .upsert({
                id: 1,
                actual_balance: newBalance,
                updated_at: new Date().toISOString()
            });
    } else if (shouldRouteToOverhead) {
        // Overhead keywords -> per-shop overhead tracker (does NOT increase vault)
        await supabaseAdmin.from('operations_ledger').insert({
            amount: amount,
            kind: "overhead_contribution",
            shop_id: shopId,
            title: description,
            notes: \`Auto-routed from POS expense: Overhead contribution\`,
            employee_id: employeeId,
            effective_date: timestamp.split('T')[0],
            created_at: timestamp,
        });
        // NOTE: No actual_balance update - overhead contributions don't inflate the vault
    }`;

// Normalize line endings for matching
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOld = oldBlock.replace(/\r\n/g, '\n');

if (normalizedContent.includes(normalizedOld)) {
    content = content.replace(/\r\n/g, '\n').replace(normalizedOld, newBlock).replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, content);
    console.log('PATCH 1 applied: recordPosExpense operations routing replaced.');
} else {
    console.error('PATCH 1 FAILED: Could not find old block in file.');
    // Debug: search for partial match
    const lines = normalizedContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('shouldPostToOps')) {
            console.log(`  Found 'shouldPostToOps' at line ${i + 1}: ${lines[i].trim()}`);
        }
    }
}

// === PATCH 2: Fix audit log details to use new variable names ===
content = fs.readFileSync(filePath, 'utf-8');
const oldAudit = `            toOperations: options?.toOperations || isOverheadExpense,
            isPerfume: isPerfumeExpense,
            isOverhead: isOverheadExpense,
            kind: isOverheadExpense ? "overhead_contribution" : "eod_deposit"`;

const newAudit = `            toVault: shouldRouteToVault,
            toOverheadTracker: shouldRouteToOverhead,
            isPerfume: isPerfumeExpense,
            isOverhead: isOverheadExpense,
            isSavings: isSavingsTransfer,
            isBlackbox: isBlackboxTransfer,
            kind: shouldRouteToVault ? (isSavingsTransfer ? "savings_deposit" : isBlackboxTransfer ? "blackbox" : "eod_deposit") : shouldRouteToOverhead ? "overhead_contribution" : "none"`;

const norm2 = content.replace(/\r\n/g, '\n');
const normOldAudit = oldAudit.replace(/\r\n/g, '\n');

if (norm2.includes(normOldAudit)) {
    content = norm2.replace(normOldAudit, newAudit.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, content);
    console.log('PATCH 2 applied: audit log details updated.');
} else {
    console.error('PATCH 2 FAILED: Could not find old audit block.');
}

// === PATCH 3: Fix postDrawerToOperations to support more kinds and correct actual_balance logic ===
content = fs.readFileSync(filePath, 'utf-8');

const oldVaultUpdate = `        // Update the actual balance in operations_state for EOD deposits
        if (kind !== "overhead_contribution") {`;

const newVaultUpdate = `        // Update the actual balance in operations_state
        // Only vault-increasing kinds update actual_balance: eod_deposit, savings_deposit, blackbox
        // Overhead kinds (overhead_contribution, rent, salaries) do NOT update vault
        const vaultKinds = ["eod_deposit", "savings_deposit", "blackbox"];
        if (vaultKinds.includes(kind)) {`;

const norm3 = content.replace(/\r\n/g, '\n');
const normOld3 = oldVaultUpdate.replace(/\r\n/g, '\n');

if (norm3.includes(normOld3)) {
    content = norm3.replace(normOld3, newVaultUpdate.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, content);
    console.log('PATCH 3 applied: postDrawerToOperations vault logic fixed.');
} else {
    console.error('PATCH 3 FAILED: Could not find old vault update block.');
}

console.log('All patches complete.');
