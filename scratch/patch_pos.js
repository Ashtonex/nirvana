const fs = require('fs');
const filePath = 'g:/work/ATMCAPPROJECTS/nirvana/app/shops/[shopId]/POS.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// Normalize to LF for matching
let norm = content.replace(/\r\n/g, '\n');

// PATCH 1: Update the modal title
const oldTitle = 'title="Post Cash to Operations (Master Vault)"';
const newTitle = 'title="Post Cash to Operations"';
if (norm.includes(oldTitle)) {
    norm = norm.replace(oldTitle, newTitle);
    console.log('PATCH 1: Modal title updated.');
} else {
    console.error('PATCH 1 FAILED: title not found');
}

// PATCH 2: Update the description text
const oldDesc = 'This moves cash from the drawer into the business Operations vault. Drawer cash will decrease and Operations will increase.';
const newDesc = 'This moves cash from the drawer into Operations. Choose the deposit type below to control whether it increases the <span className="text-emerald-400 font-bold">Vault</span> or the <span className="text-amber-400 font-bold">Overhead Tracker</span>.';
if (norm.includes(oldDesc)) {
    norm = norm.replace(oldDesc, newDesc);
    console.log('PATCH 2: Description text updated.');
} else {
    console.error('PATCH 2 FAILED: description not found');
}

// PATCH 3: Update the select dropdown and type casting
const oldSelect = `<select
                            value={opsPostKind}
                            onChange={(e) => setOpsPostKind(e.target.value as "eod_deposit" | "overhead_contribution")}
                            className="w-full bg-slate-950 border border-emerald-500/30 text-white px-3 py-2 rounded-md mt-1 font-bold"
                        >
                            <option value="eod_deposit">EOD Deposit (General Sales)</option>
                            <option value="overhead_contribution">Overhead Contribution (Shop's Overhead Target)</option>
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">
                            {opsPostKind === "eod_deposit" 
                                ? "General sales deposit - adds to Master Vault"
                                : "Allocates toward shop's monthly overhead target"}
                        </p>`;

const newSelect = `<select
                            value={opsPostKind}
                            onChange={(e) => setOpsPostKind(e.target.value as typeof opsPostKind)}
                            className="w-full bg-slate-950 border border-emerald-500/30 text-white px-3 py-2 rounded-md mt-1 font-bold"
                        >
                            <optgroup label="🟢 Vault Deposits (increases vault balance)">
                                <option value="eod_deposit">EOD Deposit</option>
                                <option value="savings_deposit">Savings</option>
                                <option value="blackbox">Black Box</option>
                            </optgroup>
                            <optgroup label="🟡 Overhead Tracker (per-shop overhead)">
                                <option value="overhead_contribution">Overhead (General)</option>
                                <option value="rent">Rent</option>
                                <option value="salaries">Salaries</option>
                            </optgroup>
                        </select>
                        <p className="text-[10px] mt-1">
                            {["eod_deposit", "savings_deposit", "blackbox"].includes(opsPostKind)
                                ? <span className="text-emerald-400">↑ This increases the Operations Vault balance</span>
                                : <span className="text-amber-400">↑ This increases this shop&apos;s overhead tracker balance</span>}
                        </p>`;

if (norm.includes(oldSelect)) {
    norm = norm.replace(oldSelect, newSelect);
    console.log('PATCH 3: Select dropdown updated.');
} else {
    console.error('PATCH 3 FAILED: select not found');
    // Debug
    if (norm.includes('EOD Deposit (General Sales)')) {
        console.log('  Found "EOD Deposit (General Sales)" in file');
    }
    if (norm.includes("Shop's Overhead Target")) {
        console.log('  Found "Shop\'s Overhead Target" in file');
    }
}

// PATCH 4: Reset default kind in handlePostToOperations (from overhead_contribution to eod_deposit)
// This was already handled by the state default change, but also on the reset after posting
const oldReset = 'setOpsPostKind("eod_deposit");';
if (norm.includes(oldReset)) {
    console.log('PATCH 4: Reset kind already set to eod_deposit. Good.');
} else {
    console.log('PATCH 4: No eod_deposit reset found, checking for overhead_contribution...');
    if (norm.includes('setOpsPostKind("overhead_contribution")')) {
        norm = norm.replace('setOpsPostKind("overhead_contribution")', 'setOpsPostKind("eod_deposit")');
        console.log('  Fixed: reset kind changed to eod_deposit.');
    }
}

// Write back with CRLF
content = norm.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content);
console.log('All POS patches complete.');
