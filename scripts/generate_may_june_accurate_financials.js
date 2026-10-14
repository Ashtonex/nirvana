const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const env = { ...loadEnv(path.join(__dirname, "../.env.local")), ...process.env };
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table) {
  let all = [];
  let from = 0;
  while (true) {
    let { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

function getEffectiveDate(r) {
  if (r.date) return String(r.date);
  if (r.effective_date) return String(r.effective_date);
  if (r.deposited_at) return String(r.deposited_at);
  if (r.timestamp) return String(r.timestamp);
  return String(r.created_at || "");
}

function inMonth(row, yearStr, monthStr) {
  const d = getEffectiveDate(row);
  return d.startsWith(`${yearStr}-${monthStr}`);
}

function inOrBeforeMonth(row, yearStr, monthStr) {
  const d = getEffectiveDate(row);
  return d <= `${yearStr}-${monthStr}-31T23:59:59Z`;
}

function formatMoney(num) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(num || 0);
}

async function main() {
  console.log("Fetching POS transactions & perfumes data (excluding operations pages)...");
  
  const [sales, ledger, invest, inventory, shops] = await Promise.all([
    fetchAll("sales"),
    fetchAll("ledger_entries"),
    fetchAll("invest_deposits"),
    fetchAll("inventory_items"),
    fetchAll("shops")
  ]);

  console.log(`Loaded ${sales.length} sales, ${ledger.length} ledger entries, ${invest.length} invest deposits, ${inventory.length} inventory items, ${shops.length} shops.`);

  // Build inventory cost map
  const inventoryCostMap = {};
  inventory.forEach(item => {
    const cost = Number(item.landed_cost || item.acquisition_price || 0);
    if (item.id) inventoryCostMap[item.id] = cost;
    if (item.name) inventoryCostMap[item.name.toLowerCase().trim()] = cost;
  });

  const shopConfigs = [
    { id: "kipasa", name: "Kipasa Branch", aliases: ["kipasa"] },
    { id: "dubdub", name: "Dubdub Outlet", aliases: ["dubdub", "dub dub"] },
    { id: "tradecenter", name: "Trade Center HQ", aliases: ["tradecenter", "trade center"] },
    { id: "tshirts", name: "Nirvana Tees", aliases: ["tshirt", "t-shirt", "tees"] },
    { id: "consolidated", name: "Consolidated (All Shops)", aliases: [] }
  ];

  const periods = [
    { yearStr: "2026", monthStr: "05", monthName: "May 2026" },
    { yearStr: "2026", monthStr: "06", monthName: "June 2026" }
  ];

  const reportData = {};

  for (const period of periods) {
    reportData[period.monthName] = {};

    for (const shop of shopConfigs) {
      const isConsolidated = shop.id === "consolidated";

      const belongsToShop = (row) => {
        if (isConsolidated) return true;
        const rowShop = String(row.shop_id || row.shopId || "").toLowerCase();
        if (rowShop === shop.id) return true;
        const text = `${row.title || ""} ${row.notes || ""} ${row.description || ""} ${row.category || ""}`.toLowerCase();
        return shop.aliases.some(alias => text.includes(alias));
      };

      // POS Sales
      const periodSales = sales.filter(s => !s.deleted_at && belongsToShop(s) && inMonth(s, period.yearStr, period.monthStr));
      const priorSales = sales.filter(s => !s.deleted_at && belongsToShop(s) && inOrBeforeMonth(s, period.yearStr, period.monthStr));

      // POS Ledger (Expenses, Openings, Transfers, Adjustments)
      const periodLedger = ledger.filter(l => !l.deleted_at && belongsToShop(l) && inMonth(l, period.yearStr, period.monthStr));
      const priorLedger = ledger.filter(l => !l.deleted_at && belongsToShop(l) && inOrBeforeMonth(l, period.yearStr, period.monthStr));

      // Perfume Deposits
      const periodInvest = invest.filter(i => belongsToShop(i) && inMonth(i, period.yearStr, period.monthStr));
      const priorInvest = invest.filter(i => belongsToShop(i) && inOrBeforeMonth(i, period.yearStr, period.monthStr));

      // --- 1. REVENUE & COGS ---
      const grossSalesRevenue = periodSales.reduce((sum, s) => sum + Number(s.total_with_tax || s.total_before_tax || 0), 0);
      
      let cogs = 0;
      periodSales.forEach(s => {
        const qty = Number(s.quantity || 1);
        let unitCost = Number(s.landed_cost || s.cost_price || 0);
        if (!unitCost && s.inventory_item_id && inventoryCostMap[s.inventory_item_id]) {
          unitCost = inventoryCostMap[s.inventory_item_id];
        } else if (!unitCost && s.item_name && inventoryCostMap[s.item_name.toLowerCase().trim()]) {
          unitCost = inventoryCostMap[s.item_name.toLowerCase().trim()];
        }
        cogs += (qty * unitCost);
      });

      const grossProfit = grossSalesRevenue - cogs;
      const grossMarginPercent = grossSalesRevenue > 0 ? (grossProfit / grossSalesRevenue) * 100 : 0;

      // --- 2. POS EXPENSES BREAKDOWN ---
      let operatingOverhead = 0;
      let salaries = 0;
      let posStockOrders = 0;
      let perfumeTransfers = 0;
      let personalDrawings = 0;
      let groceries = 0;
      let tithes = 0;
      let bankVaultSavingsTransfers = 0;
      let openingCashDrawerTotal = 0;
      let netDrawerAdjustments = 0;
      let laybyIncomeCollected = 0;

      const breakdownDetails = {
        operatingOverhead: [],
        salaries: [],
        perfumeTransfers: [],
        posStockOrders: [],
        personalAndFamily: [],
        groceries: [],
        tithes: [],
        bankVaultSavings: [],
      };

      periodLedger.forEach(l => {
        const type = String(l.type || "").toLowerCase();
        const cat = String(l.category || "").toLowerCase();
        const amt = Math.abs(Number(l.amount || 0));
        const desc = l.description || l.title || l.notes || cat;
        const text = `${l.title || ""} ${l.notes || ""} ${l.description || ""} ${l.category || ""} ${l.kind || ""}`.toLowerCase();

        if (cat === "cash drawer opening") {
          openingCashDrawerTotal += amt;
          return;
        }
        if (cat === "cash drawer adjustment") {
          if (type === "income") netDrawerAdjustments += amt;
          if (type === "expense") netDrawerAdjustments -= amt;
          return;
        }
        if (cat.includes("lay-by") || cat.includes("layby")) {
          if (type === "income") laybyIncomeCollected += amt;
          return;
        }
        if (cat === "inventory acquisition") {
          // Master catalog addition - non cash drawer entry
          return;
        }

        // Categorize cash drawer expenses / transfers
        if (cat === "perfume" || text.includes("perfume")) {
          perfumeTransfers += amt;
          breakdownDetails.perfumeTransfers.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (text.includes("salary") || text.includes("salaries") || text.includes("wage") || text.includes("payroll")) {
          salaries += amt;
          breakdownDetails.salaries.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (cat === "stock orders" || (cat === "pos expense" && (text.includes("stock") || text.includes("china") || text.includes("sa order") || text.includes("harare")))) {
          posStockOrders += amt;
          breakdownDetails.posStockOrders.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (cat === "groceries" || /grocer|food|sugar|bread|milk/.test(text)) {
          groceries += amt;
          breakdownDetails.groceries.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (cat === "tithe" || text.includes("tithe")) {
          tithes += amt;
          breakdownDetails.tithes.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (text.includes("personal") || text.includes("owner") || text.includes("drawing")) {
          personalDrawings += amt;
          breakdownDetails.personalAndFamily.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (cat === "savings" || cat === "blackbox" || cat === "transfer" || text.includes("blackbox") || text.includes("eod")) {
          bankVaultSavingsTransfers += amt;
          breakdownDetails.bankVaultSavings.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        } else if (type === "expense" || cat === "pos expense" || cat === "overhead" || cat === "misc") {
          operatingOverhead += amt;
          breakdownDetails.operatingOverhead.push({ desc, amt, date: getEffectiveDate(l).slice(0, 10) });
        }
      });

      const totalOperatingExpenses = operatingOverhead + salaries;
      const operatingProfit = grossProfit - totalOperatingExpenses;

      const nonOperatingExpenses = personalDrawings + groceries + tithes;
      const netIncome = operatingProfit - nonOperatingExpenses;

      // --- 3. CASH FLOW STATEMENT ---
      const cashReceivedFromSales = grossSalesRevenue + laybyIncomeCollected + Math.max(0, netDrawerAdjustments);
      const cashPaidOperatingExpenses = totalOperatingExpenses;
      const netCashFromOperatingActivities = cashReceivedFromSales - cashPaidOperatingExpenses;

      const cashPaidStockPurchases = posStockOrders;
      const cashTransferredToPerfumesPool = perfumeTransfers;
      const netCashFromInvestingActivities = -(cashPaidStockPurchases + cashTransferredToPerfumesPool);

      const cashTransferredToVaultSavings = bankVaultSavingsTransfers;
      const cashPersonalDrawingsAndTithes = personalDrawings + groceries + tithes;
      const netCashFromFinancingActivities = -(cashTransferredToVaultSavings + cashPersonalDrawingsAndTithes);

      const netChangeInCash = netCashFromOperatingActivities + netCashFromInvestingActivities + netCashFromFinancingActivities;
      const endingCashInDrawer = Math.max(0, openingCashDrawerTotal + netChangeInCash);

      // --- 4. BALANCE SHEET (PERIOD END SNAPSHOT) ---
      // Perfume investment available balance (cumulative active deposits)
      const cumulativePerfumeAvailable = priorInvest.reduce((sum, inv) => {
        const deposited = Number(inv.amount || 0);
        const withdrawn = Number(inv.withdrawn_amount || 0);
        return sum + (deposited - withdrawn);
      }, 0);

      // Inventory Asset Valuation at end of period
      const shopInventoryItems = inventory.filter(inv => {
        if (isConsolidated) return true;
        return String(inv.shop_id || "").toLowerCase() === shop.id;
      });

      const currentInventoryValuation = shopInventoryItems.reduce((sum, inv) => {
        const qty = Number(inv.quantity || 0);
        const cost = Number(inv.landed_cost || inv.acquisition_price || 0);
        return sum + (qty * cost);
      }, 0);

      const totalCurrentAssets = endingCashInDrawer + Math.max(0, cumulativePerfumeAvailable) + currentInventoryValuation;

      // Lay-by Deposit Liabilities (Unfulfilled layby deposits held)
      const cumulativeLaybyLiability = priorLedger.reduce((sum, l) => {
        const cat = String(l.category || "").toLowerCase();
        const amt = Math.abs(Number(l.amount || 0));
        if (cat.includes("lay-by deposit") || cat.includes("lay-by payment")) return sum + amt;
        if (cat.includes("lay-by completed") || cat.includes("lay-by final")) return sum - amt;
        return sum;
      }, 0);

      const totalLiabilities = Math.max(0, cumulativeLaybyLiability);
      const ownerEquity = totalCurrentAssets - totalLiabilities;

      reportData[period.monthName][shop.name] = {
        shopId: shop.id,
        shopName: shop.name,
        month: period.monthName,
        incomeStatement: {
          grossSalesRevenue,
          cogs,
          grossProfit,
          grossMarginPercent,
          operatingOverhead,
          salaries,
          totalOperatingExpenses,
          operatingProfit,
          personalDrawings,
          groceries,
          tithes,
          nonOperatingExpenses,
          netIncome
        },
        cashFlowStatement: {
          cashReceivedFromSales,
          laybyIncomeCollected,
          cashPaidOperatingExpenses,
          netCashFromOperatingActivities,
          cashPaidStockPurchases,
          cashTransferredToPerfumesPool,
          netCashFromInvestingActivities,
          cashTransferredToVaultSavings,
          cashPersonalDrawingsAndTithes,
          netCashFromFinancingActivities,
          netChangeInCash,
          openingCashDrawerTotal,
          endingCashInDrawer
        },
        balanceSheet: {
          endingCashInDrawer,
          cumulativePerfumeAvailable,
          currentInventoryValuation,
          totalCurrentAssets,
          cumulativeLaybyLiability: totalLiabilities,
          ownerEquity,
          totalLiabilitiesAndEquity: totalLiabilities + ownerEquity
        },
        breakdownDetails
      };
    }
  }

  // Save report JSON
  fs.writeFileSync(path.join(__dirname, "../reports/may_june_accurate_financials.json"), JSON.stringify(reportData, null, 2));
  console.log("Successfully generated and saved reports/may_june_accurate_financials.json!");
}

main().catch(console.error);
