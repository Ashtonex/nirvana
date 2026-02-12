import { readDb } from "./db";
import { getBestSellers, getReorderSuggestions, getDeadStock, getStaffLeaderboard } from "./analytics";

export async function generateSystemContext(path: string = "/") {
    const db = await readDb();

    // 1. Live Data Snapshot
    const bestSellers = await getBestSellers();
    const reorders = await getReorderSuggestions();
    const deadStock = await getDeadStock();
    const staff = await getStaffLeaderboard();

    const totalRevenue = db.sales.reduce((sum, s) => sum + s.totalWithTax, 0);
    const totalExpenses = Object.values(db.globalExpenses).reduce((a, b) => a + Number(b), 0);
    const inventoryCount = db.inventory.reduce((sum, i) => sum + i.quantity, 0);

    const liveStats = `
Current System Status:
- Total Revenue (All Time): $${totalRevenue.toFixed(2)}
- Total Monthly Expenses: $${totalExpenses.toFixed(2)}
- Total Inventory Items: ${inventoryCount}

Top Performing Staff:
${staff.slice(0, 3).map((s, i) => `${i + 1}. ${s.name} ($${s.revenue.toFixed(2)})`).join('\n')}

Top Selling Items:
${bestSellers.slice(0, 3).map((i, idx) => `${idx + 1}. ${i.itemName} ($${i.totalRevenue.toFixed(2)})`).join('\n')}

Critical Alerts:
- ${reorders.length} items need reordering (Low Stock).
- ${deadStock.length} items are Dead Stock (>60 days unsold).
    `;

    // 2. App Documentation (The "Manual")
    const appManual = `
You are Nirvana, the AI operating system for this business. 
Your goal is to assist the user by answering questions about the business's performance, inventory, and staff.

Key Terminologies:
- **Smart Reorder**: A system that flags items with <14 days of stock based on 30-day velocity.
- **Zombie Stock**: Items that haven't sold in 60 days, bleeding capital through overheads.
- **Performance Pulse**: The 30-day revenue growth trend vs. the previous 30 days.

Capabilities:
- You have access to the live database stats above. Use them to answer questions accurately.
- If asked about "Best Sellers", refer to the list above.
- If asked about "Staff", refer to the leaderboard.
- Be concise, professional, and helpful. You are a high-end business tool.
    `;

    return `
${appManual}

---
CURRENT PAGE CONTEXT:
${PAGE_CONTEXT[path] || "User is navigating the app."}

---
LIVE DATA SNAPSHOT:
${liveStats}
    `;
}

const PAGE_CONTEXT: Record<string, string> = {
    "/": "User is on the MAIN DASHBOARD (Command Center). Focus on: Total Revenue, Performance Pulse, and Critical Alerts (Reorders/Dead Stock).",
    "/inventory": "User is in the INVENTORY MANAGER. Focus on: Stock levels, Adding new items (Shipments), and Stocktakes.",
    "/shops": "User is viewing SHOP PERFORMANCE. Focus on: Individual shop revenue and stock allocation.",
    "/employees": "User is in the STAFF REGISTRY. Focus on: Employee performance, Sales Leaderboard, and Conversion Rates.",
    "/finance": "User is in the FINANCE HUB. Focus on: Global Expenses, Profit Margins, and Ledgers.",
    "/transfers": "User is in STOCK TRANSFERS. Focus on: Moving stock between shops to balance inventory."
};
