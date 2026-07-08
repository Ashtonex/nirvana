const fs = require('fs');

const data = JSON.parse(fs.readFileSync('dossier_data.json', 'utf8'));

// 1. Income (Sales)
let totalRevenue = 0;
let revenueByShop = {};

data.sales.forEach(s => {
  const shop = s.shop_id || 'Unknown';
  const rev = parseFloat(s.total_with_tax) || 0;
  totalRevenue += rev;
  revenueByShop[shop] = (revenueByShop[shop] || 0) + rev;
});

// 2. Expenses (Ledger)
// The user specified: "transfers arent expenses so dont get confused"
let totalExpenses = 0;
let expensesByShop = {};
let expensesByCategory = {};
let strangeEntries = [];

data.ledger.forEach(l => {
  const shop = l.shop_id || 'Unknown';
  const amount = parseFloat(l.amount) || 0;
  const kind = l.kind || 'Unknown'; // e.g. expense, transfer, adjustment
  const category = l.overhead_category || 'Uncategorized';
  
  if (kind !== 'transfer' && kind !== 'handshake') {
    // Treat as expense if it's an expense kind, or an adjustment that might be an expense
    // Let's print all kinds to be sure
    totalExpenses += amount;
    expensesByShop[shop] = (expensesByShop[shop] || 0) + amount;
    expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
    
    // Flag unusual things
    if (amount > 1000 || !l.notes || l.notes.length < 5) {
      strangeEntries.push({
        id: l.id, shop, amount, kind, category, title: l.title, notes: l.notes, date: l.effective_date || l.created_at
      });
    }
  }
});

let ledgerKinds = [...new Set(data.ledger.map(l => l.kind))];

// 3. Handshakes (Transfers) - look for pending or cancelled
let pendingTransfers = [];
data.handshakes.forEach(h => {
  if (h.status !== 'completed') {
    pendingTransfers.push(h);
  }
});

console.log("=== REVENUE ===");
console.log(`Total Revenue: ${totalRevenue}`);
console.log("Revenue by Shop:");
console.table(revenueByShop);

console.log("\n=== EXPENSES ===");
console.log(`Total Expenses: ${totalExpenses}`);
console.log("Ledger Kinds found:", ledgerKinds);
console.log("Expenses by Shop:");
console.table(expensesByShop);
console.log("Expenses by Category:");
console.table(expensesByCategory);

console.log("\n=== ACCOUNTABILITY & WEAKNESSES ===");
console.log(`Total Strange/Suspicious Entries: ${strangeEntries.length}`);
console.log("Top 5 Suspicious Entries:");
console.table(strangeEntries.slice(0, 5));

console.log(`Pending/Unresolved Transfers: ${pendingTransfers.length}`);
if (pendingTransfers.length > 0) {
  console.table(pendingTransfers.slice(0, 5));
}
