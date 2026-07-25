const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default || require("jspdf-autotable");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");

const SHOPS = [
  { id: "dubdub", nameFallback: "Dub Dub", aliases: ["dubdub", "dub dub"] },
  { id: "kipasa", nameFallback: "Kipasa", aliases: ["kipasa"] },
  { id: "tradecenter", nameFallback: "Trade Center", aliases: ["tradecenter", "trade center"] },
];

const MONTHS = [
  { key: "2026-05", label: "May 2026", year: 2026, monthIndex: 4 },
  { key: "2026-06", label: "June 2026", year: 2026, monthIndex: 5 },
];

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = { ...loadEnv(ENV_PATH), ...process.env };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }) },
});

function money(value) {
  return MONEY.format(Number(value || 0));
}

function safe(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(row) {
  return `${row.title || ""} ${row.notes || ""} ${row.description || ""} ${row.category || ""} ${row.kind || ""}`.toLowerCase();
}

function rowDate(row) {
  return row.date || row.effective_date || row.created_at || row.timestamp || "";
}

function rowAmount(row) {
  return Math.abs(Number(row.amount || 0));
}

function sum(rows, pick = rowAmount) {
  return rows.reduce((acc, row) => acc + Number(pick(row) || 0), 0);
}

function monthBounds(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  return { startIso: start.toISOString(), endIso: end.toISOString(), days: end.getUTCDate() };
}

function inBounds(row, startIso, endIso) {
  const d = rowDate(row);
  if (!d) return false;
  const iso = new Date(d).toISOString();
  return iso >= startIso && iso <= endIso;
}

function belongsToShop(row, shop) {
  const shopId = String(row.shop_id || row.shopId || "").toLowerCase();
  if (shopId === shop.id) return true;
  const text = textOf(row);
  return shop.aliases.some((alias) => text.includes(alias));
}

function classifyRow(row) {
  const category = String(row.category || "").toLowerCase();
  const kind = String(row.kind || "").toLowerCase();
  const text = textOf(row);
  const source = String(row.source || "");

  const isOpeningOrAdjustment = /cash drawer opening|cash drawer adjustment/.test(category);
  const isLaybyCollection = /lay-by deposit|lay-by payment/.test(category);
  const isAutoRoutedOps = /auto-routed from pos expense/i.test(String(row.notes || ""));
  const isHistoricalReserveAdjustment = /historical rent reconciliation|zero out unwithdrawn historical rent/.test(text);
  const isTithe = /tithe|tithes|offering|church|donation|charity|10%|ten percent/.test(text) || category === "tithe";
  const isGrocery =
    /grocer|supermarket|food|provisions|sundries|rice|sugar|cooking oil|flour|bread|milk|eggs|meat|vegetables|fruits|snacks|drinks|beverages/.test(text) ||
    category === "groceries";
  const isPerfumesInvestTransfer =
    category === "perfume" ||
    (/\bperfumes?\b/.test(text) && !/\b(stock|inventory|purchase|supplier|restock|reorder|wholesale|bulk order|procurement|order)\b/.test(text));
  const isStock =
    !isPerfumesInvestTransfer &&
    (/stock|inventory|purchase|supplier|restock|reorder|wholesale|bulk order|procurement|source:|china|harare order|mozambique|tshirt|tshirts|shirt|shirts|rings|hats|sa_order|sa order|sa_delivery|sa delivery|sa deliveries|harare delivery|city stock|platinum mothers/.test(text) ||
    category === "stock orders" ||
    kind === "stock_orders");
  const isPersonal =
    /personal|owner|drawing|withdrawal|household|family|home|lunch|pampers|diaper|diapers|medical|medicals|medication|aunt|uncle|linda|maxine|priscilla|eddie|freedom|dutch/.test(text);
  const isTransfer =
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isStock &&
    !isPersonal &&
    (/savings|saving|black\s*box|blackbox|deposit to|transfer to|vault|round|eod/.test(text) ||
      ["eod_deposit", "savings_deposit", "blackbox", "round_deposit"].includes(kind) ||
      ["savings", "blackbox"].includes(category));
  const isActualOverheadPayment =
    kind === "overhead_payment" &&
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isTransfer &&
    !isStock &&
    !isPersonal &&
    !isGrocery &&
    !isTithe;
  const isSalaryReserve = /salary|salaries|wage|wages|payroll|ashton salaries/.test(text);
  const isOverheadReserve =
    !isAutoRoutedOps &&
    !isActualOverheadPayment &&
    !isHistoricalReserveAdjustment &&
    (category === "overhead" ||
      kind === "overhead_contribution" ||
      (category === "pos expense" && (/\brent\b|\bremt\b|overhead/.test(text) || isSalaryReserve)));
  const isOperating =
    !isOpeningOrAdjustment &&
    !isLaybyCollection &&
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isTransfer &&
    !isOverheadReserve &&
    !isStock &&
    !isPersonal &&
    !isGrocery &&
    !isTithe &&
    (isActualOverheadPayment || category === "pos expense");

  return {
    source,
    isOpeningOrAdjustment,
    isLaybyCollection,
    isAutoRoutedOps,
    isHistoricalReserveAdjustment,
    isActualOverheadPayment,
    isSalaryReserve,
    isPerfumesInvestTransfer,
    isOverheadReserve,
    isTransfer,
    isTithe,
    isGrocery,
    isStock,
    isPersonal,
    isOperating,
  };
}

function isRentReserveRow(row, cls) {
  const category = String(row.category || "").toLowerCase();
  const kind = String(row.kind || "").toLowerCase();
  const text = textOf(row);
  if (cls.isAutoRoutedOps || cls.isHistoricalReserveAdjustment || cls.isOpeningOrAdjustment || cls.isLaybyCollection) return false;
  if (String(row.source || "") === "ledger_entries" && category === "overhead") return true;
  if (String(row.source || "") === "ledger_entries" && category === "pos expense" && /\brent\b|\bremt\b|overhead/.test(text)) return true;
  return false;
}

async function fetchAll(table, select = "*", pageSize = 1000, optional = false) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) {
      if (optional && /could not find the table|does not exist/i.test(error.message || "")) return [];
      throw new Error(`${table}: ${error.message}`);
    }
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

async function loadData() {
  const [shops, sales, ledgerEntries, operationsLedger, investDeposits, transfers, inventoryItems, allocations] = await Promise.all([
    fetchAll("shops"),
    fetchAll("sales"),
    fetchAll("ledger_entries"),
    fetchAll("operations_ledger"),
    fetchAll("invest_deposits"),
    fetchAll("transfers", "*", 1000, true),
    fetchAll("inventory_items"),
    fetchAll("inventory_allocations"),
  ]);
  return {
    shops,
    sales,
    ledgerEntries: ledgerEntries.map((row) => ({ ...row, source: "ledger_entries" })),
    operationsLedger: operationsLedger.map((row) => ({ ...row, source: "operations_ledger" })),
    investDeposits,
    transfers,
    inventoryItems,
    allocations,
  };
}

function groupRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()]
    .map(([key, items]) => ({ key, items, total: sum(items) }))
    .sort((a, b) => b.total - a.total);
}

function rowsForTable(rows, limit = 40) {
  return rows
    .slice()
    .sort((a, b) => new Date(rowDate(a)).getTime() - new Date(rowDate(b)).getTime())
    .slice(0, limit)
    .map((row) => [
      String(rowDate(row)).slice(0, 10),
      safe(row.category || row.kind || "Entry"),
      safe(row.description || row.title || row.notes || "").slice(0, 95),
      money(rowAmount(row)),
    ]);
}

function buildLowStockQueues(data) {
  const salesStart = "2026-06-01T00:00:00.000Z";
  const salesEnd = "2026-06-30T23:59:59.999Z";
  const recentSales = data.sales.filter((sale) => {
    if (sale.deleted_at) return false;
    const date = new Date(sale.date || 0).toISOString();
    return date >= salesStart && date <= salesEnd;
  });
  const sales30 = new Map();
  for (const sale of recentSales) {
    const key = `${String(sale.shop_id || "").toLowerCase()}|${sale.item_id || ""}`;
    sales30.set(key, (sales30.get(key) || 0) + Number(sale.quantity || 0));
  }
  const itemMap = new Map(data.inventoryItems.map((item) => [item.id, item]));
  const queues = {};
  for (const shop of SHOPS) {
    queues[shop.id] = data.allocations
      .filter((alloc) => String(alloc.shop_id || "").toLowerCase() === shop.id && Number(alloc.quantity || 0) <= 5)
      .map((alloc) => {
        const item = itemMap.get(alloc.item_id) || {};
        const qty = Number(alloc.quantity || 0);
        const salesQty = Number(sales30.get(`${shop.id}|${alloc.item_id}`) || 0);
        return {
          name: item.name || alloc.item_id,
          category: item.category || "General",
          qty,
          sales30d: salesQty,
          score: salesQty / (qty + 0.1),
        };
      })
      .filter((row) => row.sales30d > 0)
      .sort((a, b) => b.score - a.score);
  }
  return queues;
}

function weeklySalesRows(sales, startIso, days) {
  const start = new Date(startIso);
  const rows = [];
  for (let offset = 0; offset < days; offset += 7) {
    const wStart = new Date(start);
    wStart.setUTCDate(start.getUTCDate() + offset);
    const wEnd = new Date(wStart);
    wEnd.setUTCDate(Math.min(start.getUTCDate() + offset + 6, start.getUTCDate() + days - 1));
    wEnd.setUTCHours(23, 59, 59, 999);
    const gross = sum(
      sales.filter((sale) => {
        const d = new Date(sale.date).toISOString();
        return d >= wStart.toISOString() && d <= wEnd.toISOString();
      }),
      (sale) => sale.total_with_tax
    );
    rows.push([`W${rows.length + 1}`, `${wStart.toISOString().slice(5, 10)} to ${wEnd.toISOString().slice(5, 10)}`, money(gross)]);
  }
  return rows;
}

function reportData(data, shop, month, usedLowStock) {
  const bounds = monthBounds(month.year, month.monthIndex);
  const prevBounds = monthBounds(month.monthIndex === 0 ? month.year - 1 : month.year, month.monthIndex === 0 ? 11 : month.monthIndex - 1);
  const shopRow = data.shops.find((row) => String(row.id || "").toLowerCase() === shop.id) || {};
  const configuredExpenses = shopRow.expenses || {};
  const configuredRent = Number(configuredExpenses.rent || 0);

  const sales = data.sales.filter((sale) => !sale.deleted_at && String(sale.shop_id || "").toLowerCase() === shop.id && inBounds(sale, bounds.startIso, bounds.endIso));
  const prevSales = data.sales.filter((sale) => !sale.deleted_at && String(sale.shop_id || "").toLowerCase() === shop.id && inBounds(sale, prevBounds.startIso, prevBounds.endIso));
  const ledgerRows = data.ledgerEntries.filter((row) => !row.deleted_at && String(row.shop_id || "").toLowerCase() === shop.id && inBounds(row, bounds.startIso, bounds.endIso));
  const opsRows = data.operationsLedger.filter((row) => belongsToShop(row, shop) && inBounds(row, bounds.startIso, bounds.endIso));

  const classified = [...ledgerRows, ...opsRows].map((row) => ({ row, cls: classifyRow(row) }));
  const bucket = (predicate) => classified.filter(predicate).map((item) => item.row);

  const rentSetAsideRows = bucket((x) => isRentReserveRow(x.row, x.cls));
  const overheadReserveRows = bucket((x) => x.cls.isOverheadReserve && !isRentReserveRow(x.row, x.cls));
  const salaryRows = overheadReserveRows.filter((row) => /salary|salaries|wage|wages|payroll|ashton salaries/.test(textOf(row)));
  const otherOverheadReserveRows = overheadReserveRows.filter((row) => !/salary|salaries|wage|wages|payroll|ashton salaries/.test(textOf(row)));
  const actualOverheadRows = bucket((x) => x.cls.isActualOverheadPayment);
  const transferRows = bucket((x) => x.cls.isTransfer);
  const perfumesInvestTransferRows = bucket((x) => !x.cls.isTransfer && !x.cls.isOverheadReserve && !x.cls.isActualOverheadPayment && x.cls.isPerfumesInvestTransfer && !x.cls.isAutoRoutedOps && !x.cls.isOpeningOrAdjustment);
  const stockRows = bucket((x) => !x.cls.isTransfer && !x.cls.isOverheadReserve && !x.cls.isActualOverheadPayment && x.cls.isStock && !x.cls.isAutoRoutedOps && !x.cls.isOpeningOrAdjustment);
  const groceryRows = bucket((x) => !x.cls.isTransfer && !x.cls.isOverheadReserve && !x.cls.isActualOverheadPayment && !x.cls.isPerfumesInvestTransfer && !x.cls.isStock && x.cls.isGrocery && !x.cls.isAutoRoutedOps && !x.cls.isOpeningOrAdjustment);
  const titheRows = bucket((x) => !x.cls.isTransfer && !x.cls.isOverheadReserve && !x.cls.isActualOverheadPayment && !x.cls.isPerfumesInvestTransfer && !x.cls.isStock && !x.cls.isGrocery && x.cls.isTithe && !x.cls.isAutoRoutedOps && !x.cls.isOpeningOrAdjustment);
  const personalRows = bucket((x) => !x.cls.isTransfer && !x.cls.isOverheadReserve && !x.cls.isActualOverheadPayment && !x.cls.isPerfumesInvestTransfer && !x.cls.isStock && !x.cls.isGrocery && !x.cls.isTithe && x.cls.isPersonal && !x.cls.isAutoRoutedOps && !x.cls.isOpeningOrAdjustment);
  const operatingRows = bucket((x) => x.cls.isOperating && !x.cls.isActualOverheadPayment);
  const excludedRows = bucket((x) => x.cls.isOpeningOrAdjustment || x.cls.isLaybyCollection || x.cls.isAutoRoutedOps || x.cls.isHistoricalReserveAdjustment);

  const salesTotal = sum(sales, (sale) => sale.total_with_tax);
  const preTaxSales = sum(sales, (sale) => sale.total_before_tax);
  const tax = sum(sales, (sale) => sale.tax);
  const otherActualOverheadRows = actualOverheadRows.filter((row) => !/\brent\b|\bremt\b|may rent|june rent/.test(textOf(row)));
  const explicitActualOverheadRows = otherActualOverheadRows.filter((row) => /zesa|wifi|utility|utilities|electric|electricity|water|internet|accountant|accounting|fuel|transport|repair|maintenance|cleaning|security|rates|municipal|insurance|pos\b|receipt|stationery|supplies/.test(textOf(row)));
  const configuredRentRows = configuredRent > 0
    ? [{
        source: "shops.expenses",
        category: "Expected Rent",
        kind: "configured_rent",
        description: `${month.label} configured rent for ${shopRow.name || shop.nameFallback}`,
        amount: configuredRent,
        date: bounds.startIso,
      }]
    : [];
  const actualOperatingExpenses = sum(explicitActualOverheadRows) + sum(operatingRows);
  const overheadReserve = sum(overheadReserveRows);
  const rentSetAside = sum(rentSetAsideRows);
  const rentReserveRemaining = rentSetAside - configuredRent;
  const salariesPaid = sum(salaryRows);
  const actualOverheadPaid = configuredRent + sum(otherActualOverheadRows);
  const overheadReserveRemaining = overheadReserve - sum(otherActualOverheadRows);
  const netOperatingSurplus = salesTotal - actualOperatingExpenses;
  const personalGroceriesAndTithes = sum(personalRows) + sum(groceryRows) + sum(titheRows);
  const grossCashAfterRentAndStock = salesTotal - configuredRent - sum(stockRows);
  const actualCashProfit = grossCashAfterRentAndStock - actualOperatingExpenses - salariesPaid - personalGroceriesAndTithes;
  const perfumesInvestTransfers = sum(perfumesInvestTransferRows);
  const unrestrictedCashAfterPoolAllocations = actualCashProfit - rentReserveRemaining - perfumesInvestTransfers;
  const unrestrictedCashAfterRentPoolAllocation = unrestrictedCashAfterPoolAllocations;
  const surplusAfterRent = salesTotal - configuredRent;
  const distributableSurplus = actualCashProfit;
  const belowLineCashUses = sum(transferRows) + sum(stockRows) + sum(personalRows) + sum(groceryRows) + sum(titheRows);
  const prevSalesTotal = sum(prevSales, (sale) => sale.total_with_tax);
  const forecast = prevSalesTotal > 0 ? salesTotal + (salesTotal - prevSalesTotal) : salesTotal;
  const itemMap = new Map(data.inventoryItems.map((item) => [item.id, item]));
  const inventoryAsset = data.allocations
    .filter((alloc) => String(alloc.shop_id || "").toLowerCase() === shop.id)
    .reduce((acc, alloc) => {
      const item = itemMap.get(alloc.item_id) || {};
      const unitCost = Number(item.landed_cost || item.acquisition_price || 0);
      return acc + Number(alloc.quantity || 0) * unitCost;
    }, 0);
  const cumulativeOpsRows = data.operationsLedger.filter((row) => belongsToShop(row, shop) && new Date(rowDate(row) || 0).toISOString() <= bounds.endIso);
  const poolRows = (pool) => cumulativeOpsRows.filter((row) => String(row.metadata?.fundingPool || row.metadata?.funding_pool || "").toLowerCase() === pool);
  const operationsSavings = sum(poolRows("savings"), (row) => Number(row.amount || 0));
  const rentPool = sum(poolRows("overhead"), (row) => Number(row.amount || 0));
  const perfumesInvestPool = data.investDeposits
    .filter((row) => String(row.shop_id || "").toLowerCase() === shop.id && String(row.deposited_at || "") <= bounds.endIso)
    .reduce((acc, row) => acc + Number(row.amount || 0) - Number(row.withdrawn_amount || 0), 0);
  const rentPaid = sum(actualOverheadRows.filter((row) => /\brent\b|\bremt\b|may rent|june rent/.test(textOf(row))));
  const cashAndDrawerEstimate = Math.max(0, salesTotal - actualOperatingExpenses - salariesPaid - belowLineCashUses + sum(transferRows) - rentSetAside);
  const totalAssets = cashAndDrawerEstimate + inventoryAsset + Math.max(0, operationsSavings) + Math.max(0, rentPool) + Math.max(0, perfumesInvestPool);
  const unpaidFixedObligations = Math.max(0, configuredRent - rentPaid);
  const ownerEquity = totalAssets - unpaidFixedObligations;
  const netOperatingCashFlow = salesTotal - actualOperatingExpenses;
  const netInvestingCashFlow = -stockRows.reduce((acc, row) => acc + rowAmount(row), 0);
  const netFinancingCashFlow = sum(transferRows) + rentSetAside - configuredRent;
  const financialStatements = {
    incomeStatement: [
      ["Sales revenue, gross", money(salesTotal)],
      ["Sales tax recorded", money(tax)],
      ["Revenue before tax", money(preTaxSales)],
      ["Less actual rent cost", `(${money(configuredRent)})`],
      ["Less stock orders", `(${money(sum(stockRows))})`],
      ["Gross cash after rent and stock", money(grossCashAfterRentAndStock)],
      ["Less operating expenses", `(${money(actualOperatingExpenses)})`],
      ["Less salaries paid/set aside", `(${money(salariesPaid)})`],
      ["Less personal, groceries and tithes", `(${money(personalGroceriesAndTithes)})`],
      ["Actual cash profit", money(actualCashProfit)],
      ["Rent set aside memo", money(rentSetAside)],
      ["Rent pool surplus committed", money(rentReserveRemaining)],
      ["Perfumes/invest pool transfers", money(perfumesInvestTransfers)],
      ["Unrestricted cash after pool allocations", money(unrestrictedCashAfterPoolAllocations)],
      ["Net margin on total sales", `${salesTotal > 0 ? ((netOperatingSurplus / salesTotal) * 100).toFixed(1) : "0.0"}%`],
    ],
    balanceSheet: [
      ["Cash and drawer estimate", money(cashAndDrawerEstimate)],
      ["Inventory asset", money(inventoryAsset)],
      ["Operations savings pool", money(operationsSavings)],
      ["Rent pool", money(rentPool)],
      ["Perfumes/invest pool", money(perfumesInvestPool)],
      ["Total assets", money(totalAssets)],
      ["Unpaid fixed obligations", `(${money(unpaidFixedObligations)})`],
      ["Owner equity / retained capital", money(ownerEquity)],
    ],
    cashFlowStatement: [
      ["Cash receipts from customers", money(salesTotal)],
      ["Cash paid for operating expenses", `(${money(actualOperatingExpenses)})`],
      ["Net operating cash flow", money(netOperatingCashFlow)],
      ["Stock orders / inventory purchases", `(${money(stockRows.reduce((acc, row) => acc + rowAmount(row), 0))})`],
      ["Perfumes/invest pool transfers", `(${money(perfumesInvestTransfers)})`],
      ["Net investing cash flow", money(netInvestingCashFlow)],
      ["Transfers to savings / vault", money(sum(transferRows))],
      ["Rent reserve set aside", money(rentSetAside)],
      ["Expected rent obligation", `(${money(configuredRent)})`],
      ["Rent pool surplus committed", money(rentReserveRemaining)],
      ["Net financing/reserve cash flow", money(netFinancingCashFlow)],
      ["Net cash flow", money(netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow)],
    ],
    cashUses: [
      ["Actual operating expenses", money(actualOperatingExpenses)],
      ["Expected rent", money(configuredRent)],
      ["Salaries paid/set aside", money(salariesPaid)],
      ["Perfumes/invest pool transfers", money(perfumesInvestTransfers)],
      ["Stock purchases", money(sum(stockRows))],
      ["Transfers", money(sum(transferRows))],
      ["Personal use", money(sum(personalRows))],
      ["Groceries", money(sum(groceryRows))],
      ["Tithes", money(sum(titheRows))],
      ["Rent set aside", money(rentSetAside)],
    ].sort((a, b) => Number(String(b[1]).replace(/[^0-9.-]/g, "")) - Number(String(a[1]).replace(/[^0-9.-]/g, ""))),
  };

  const productRows = groupRows(sales, (sale) => sale.item_name || sale.item_id).slice(0, 10);
  const lowStock = [];
  const queue = usedLowStock.queue[shop.id] || [];
  while (queue.length && lowStock.length < 5) {
    const item = queue.shift();
    const key = `${shop.id}|${item.name}`;
    if (usedLowStock.seen.has(key)) continue;
    usedLowStock.seen.add(key);
    lowStock.push(item);
  }

  return {
    shopName: shopRow.name || shop.nameFallback,
    month,
    bounds,
    sales,
    metrics: {
      salesTotal,
      preTaxSales,
      tax,
      actualOperatingExpenses,
      netOperatingSurplus,
      grossCashAfterRentAndStock,
      surplusAfterRent,
      salariesPaid,
      personalGroceriesAndTithes,
      actualCashProfit,
      perfumesInvestTransfers,
      unrestrictedCashAfterPoolAllocations,
      unrestrictedCashAfterRentPoolAllocation,
      distributableSurplus,
      netMargin: salesTotal > 0 ? (netOperatingSurplus / salesTotal) * 100 : 0,
      overheadReserve,
      rentSetAside,
      configuredRent,
      configuredSalaries: Number(configuredExpenses.salaries || 0),
      configuredUtilities: Number(configuredExpenses.utilities || 0),
      configuredMisc: Number(configuredExpenses.misc || 0),
      rentReserveRemaining,
      actualOverheadPaid,
      overheadReserveRemaining,
      transfers: sum(transferRows),
      stockPurchases: sum(stockRows),
      perfumesInvestTransfers,
      personalUse: sum(personalRows),
      groceries: sum(groceryRows),
      tithes: sum(titheRows),
      belowLineCashUses,
      forecast,
      excludedCount: excludedRows.length,
    },
    buckets: {
      overheadReserveRows,
      salaryRows,
      otherOverheadReserveRows,
      rentSetAsideRows,
      configuredRentRows,
      actualOverheadRows,
      otherActualOverheadRows,
      explicitActualOverheadRows,
      transferRows,
      perfumesInvestTransferRows,
      stockRows,
      personalRows,
      groceryRows,
      titheRows,
      operatingRows,
      excludedRows,
    },
    grouped: {
      productRows,
      operating: groupRows([...configuredRentRows, ...explicitActualOverheadRows, ...operatingRows], (row) => row.category || row.kind || "Operating"),
      rentSetAside: groupRows(rentSetAsideRows, (row) => row.category || row.kind || "Rent set aside"),
      overheadReserve: groupRows(otherOverheadReserveRows, (row) => row.category || row.kind || "Overhead reserve"),
      salaries: groupRows(salaryRows, (row) => row.category || row.kind || "Salaries"),
      transfers: groupRows(transferRows, (row) => row.category || row.kind || "Transfer"),
      perfumesInvestTransfers: groupRows(perfumesInvestTransferRows, (row) => row.category || row.kind || "Perfumes/invest transfer"),
      stock: groupRows(stockRows, (row) => row.category || row.kind || "Stock purchase"),
      personal: groupRows(personalRows, (row) => row.category || row.kind || "Personal use"),
      groceries: groupRows(groceryRows, (row) => row.category || row.kind || "Groceries"),
      tithes: groupRows(titheRows, (row) => row.category || row.kind || "Tithes"),
    },
    financialStatements,
    weeklyRows: weeklySalesRows(sales, bounds.startIso, bounds.days),
    lowStock,
  };
}

function addHeader(doc, title, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(safe(title), 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(safe(subtitle), 14, 20);
  doc.setTextColor(15, 23, 42);
}

function drawMetricCards(doc, rows, startY) {
  const margin = 14;
  const cardW = 57;
  const cardH = 21;
  rows.forEach((row, idx) => {
    const x = margin + (idx % 3) * (cardW + 6);
    const y = startY + Math.floor(idx / 3) * (cardH + 5);
    const tone = row[2] || "neutral";
    if (tone === "green") {
      doc.setFillColor(220, 252, 231);
      doc.setDrawColor(34, 197, 94);
    } else if (tone === "blue") {
      doc.setFillColor(219, 234, 254);
      doc.setDrawColor(59, 130, 246);
    } else if (tone === "amber") {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(245, 158, 11);
    } else {
      doc.setFillColor(246, 248, 251);
      doc.setDrawColor(218, 225, 235);
    }
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 96, 115);
    doc.setFontSize(7);
    doc.text(safe(row[0]), x + 3, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(safe(row[1]), x + 3, y + 15, { maxWidth: cardW - 6 });
  });
}

function section(doc, title, subtitle) {
  doc.addPage();
  addHeader(doc, title, subtitle);
}

function table(doc, startY, head, body, color, options = {}) {
  autoTable(doc, {
    startY,
    head,
    body,
    theme: "grid",
    headStyles: { fillColor: color },
    styles: { fontSize: 7, cellPadding: 1.1, overflow: "ellipsize", minCellWidth: 6 },
    columnStyles: options.columnStyles || {},
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

function groupedBody(groups) {
  return groups.length
    ? groups.map((group) => [safe(group.key), String(group.items.length), money(group.total)])
    : [["None recorded", "0", money(0)]];
}

function addBreakdownSection(doc, report, title, subtitle, groups, rows, color) {
  section(doc, `${report.shopName} - ${title}`, `${report.month.label} | ${subtitle}`);
  let y = table(doc, 38, [["Group", "Rows", "Total"]], groupedBody(groups), color, {
    columnStyles: { 0: { cellWidth: 115 }, 1: { halign: "right", cellWidth: 18 }, 2: { halign: "right", cellWidth: 32 } },
  });
  y += 8;
  table(doc, y, [["Date", "Type", "Description", "Amount"]], rowsForTable(rows, 80), color, {
    columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 30 }, 2: { cellWidth: 91 }, 3: { halign: "right", cellWidth: 25 } },
  });
}

function generatePdf(report, outputPath) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  addHeader(doc, `${report.shopName} - Monthly Report`, `${report.month.label} | Generated ${generatedAt}`);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Monthly Summary", 14, 38);
  drawMetricCards(
    doc,
    [
      ["Total Sales", money(report.metrics.salesTotal)],
      ["Actual Op Expenses", money(report.metrics.actualOperatingExpenses)],
      ["Net Op Surplus", money(report.metrics.netOperatingSurplus), report.metrics.netOperatingSurplus >= 0 ? "green" : "amber"],
      ["After Rent", money(report.metrics.surplusAfterRent), report.metrics.surplusAfterRent >= 0 ? "green" : "amber"],
      ["Actual Profit", money(report.metrics.actualCashProfit), report.metrics.actualCashProfit >= 0 ? "green" : "amber"],
      ["Free Cash", money(report.metrics.unrestrictedCashAfterRentPoolAllocation), report.metrics.unrestrictedCashAfterRentPoolAllocation >= 0 ? "green" : "amber"],
      ["Rent Set Aside", money(report.metrics.rentSetAside), "blue"],
      ["Expected Rent", money(report.metrics.configuredRent)],
      ["Rent Remaining", money(report.metrics.rentReserveRemaining), report.metrics.rentReserveRemaining >= 0 ? "green" : "amber"],
      ["Perfumes/Invest", money(report.metrics.perfumesInvestTransfers), "blue"],
      ["Transfers", money(report.metrics.transfers), "green"],
      ["Stock Purchases", money(report.metrics.stockPurchases)],
      ["Salaries", money(report.metrics.salariesPaid)],
      ["Personal Use", money(report.metrics.personalUse)],
      ["Groceries", money(report.metrics.groceries)],
      ["Tithes", money(report.metrics.tithes)],
    ],
    43
  );

  let y = table(doc, 178, [["Week", "Dates", "Sales"]], report.weeklyRows, [30, 64, 175], {
    columnStyles: { 2: { halign: "right" } },
  });

  y += 8;
  table(
    doc,
    y,
    [["Figure", "How it is calculated", "Amount"]],
    [
      ["Actual operating expenses", "Ordinary POS operating costs. Excludes rent/salary set-aside, stock, personal, groceries and tithes.", money(report.metrics.actualOperatingExpenses)],
      ["Rent remaining", "Rent set aside minus the shop's configured monthly rent.", money(report.metrics.rentReserveRemaining)],
      ["Net operating surplus", "Total sales minus actual operating expenses. Transfers/stock/personal/groceries/tithes are shown below the line.", money(report.metrics.netOperatingSurplus)],
      ["Gross cash after rent/stock", "Sales less actual rent cost and stock orders before the second expense section.", money(report.metrics.grossCashAfterRentAndStock)],
      ["Actual cash profit", "Sales less rent, stock, operating expenses, salaries, personal use, groceries and tithes.", money(report.metrics.actualCashProfit)],
      ["Unrestricted cash", "Actual profit less rent-pool surplus and perfumes/invest transfers still committed inside pools.", money(report.metrics.unrestrictedCashAfterPoolAllocations)],
      ["Excluded duplicate/admin rows", "Cash drawer openings, lay-by collections, and auto-routed operations duplicates not treated as expenses.", String(report.metrics.excludedCount)],
    ],
    [71, 85, 105],
    { columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 94 }, 2: { halign: "right", cellWidth: 30 } } }
  );

  section(doc, `${report.shopName} - Income Statement`, `${report.month.label} | Operating performance`);
  table(
    doc,
    38,
    [["Line", "Amount"]],
    [
      ["Sales revenue, gross", money(report.metrics.salesTotal)],
      ["Sales tax recorded", money(report.metrics.tax)],
      ["Revenue before tax", money(report.metrics.preTaxSales)],
      ["Less actual rent cost", `(${money(report.metrics.configuredRent)})`],
      ["Less stock orders", `(${money(report.metrics.stockPurchases)})`],
      ["Gross cash after rent and stock", money(report.metrics.grossCashAfterRentAndStock)],
      ["Less operating expenses", `(${money(report.metrics.actualOperatingExpenses)})`],
      ["Less salaries paid/set aside", `(${money(report.metrics.salariesPaid)})`],
      ["Less personal, groceries and tithes", `(${money(report.metrics.personalGroceriesAndTithes)})`],
      ["Actual cash profit", money(report.metrics.actualCashProfit)],
      ["Rent set aside memo", money(report.metrics.rentSetAside)],
      ["Rent pool surplus committed", money(report.metrics.rentReserveRemaining)],
      ["Perfumes/invest pool transfers", money(report.metrics.perfumesInvestTransfers)],
      ["Unrestricted cash after pool allocations", money(report.metrics.unrestrictedCashAfterPoolAllocations)],
      ["Net margin on total sales", `${report.metrics.netMargin.toFixed(1)}%`],
    ],
    [15, 23, 42],
    { columnStyles: { 0: { cellWidth: 112 }, 1: { halign: "right", cellWidth: 45 } } }
  );

  table(
    doc,
    doc.lastAutoTable.finalY + 10,
    [["Cash Movement", "Treatment", "Amount"]],
    [
      ["Rent set aside", "Cash reserved for rent during the month", money(report.metrics.rentSetAside)],
      ["Actual rent cost", "Configured shop rent deducted once from sales", money(report.metrics.configuredRent)],
      ["Rent pool surplus committed", "Rent set aside minus actual rent cost; memo only, not added to sales", money(report.metrics.rentReserveRemaining)],
      ["Perfumes/invest pool transfers", "Cash moved from sales to the perfumes/invest pool, not stock orders", money(report.metrics.perfumesInvestTransfers)],
      ["Other overhead set aside", "Non-rent overhead reserve movements", money(report.metrics.overheadReserve)],
      ["Transfers", "Cash moved to savings/blackbox/EOD, not a loss", money(report.metrics.transfers)],
      ["Stock purchases", "Inventory/capital use, shown below operating result", money(report.metrics.stockPurchases)],
      ["Salaries paid/set aside", "Actual salary cash labels for the month", money(report.metrics.salariesPaid)],
      ["Personal use funds", "Owner/personal draw, shown separately", money(report.metrics.personalUse)],
      ["Groceries", "Separated from shop operating result", money(report.metrics.groceries)],
      ["Tithes", "Separated from shop operating result", money(report.metrics.tithes)],
    ],
    [22, 163, 74],
    { columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 86 }, 2: { halign: "right", cellWidth: 30 } } }
  );

  section(doc, `${report.shopName} - Balance Sheet`, `${report.month.label} | Management balance sheet snapshot`);
  table(doc, 38, [["Asset / Liability / Equity", "Amount"]], report.financialStatements.balanceSheet, [15, 23, 42], {
    columnStyles: { 0: { cellWidth: 122 }, 1: { halign: "right", cellWidth: 45 } },
  });

  section(doc, `${report.shopName} - Cash Flow Statement`, `${report.month.label} | Where cash moved`);
  table(doc, 38, [["Cash Flow Line", "Amount"]], report.financialStatements.cashFlowStatement, [22, 101, 52], {
    columnStyles: { 0: { cellWidth: 122 }, 1: { halign: "right", cellWidth: 45 } },
  });
  table(doc, doc.lastAutoTable.finalY + 10, [["Where Cash Went", "Amount"]], report.financialStatements.cashUses, [190, 18, 60], {
    columnStyles: { 0: { cellWidth: 122 }, 1: { halign: "right", cellWidth: 45 } },
  });

  addBreakdownSection(doc, report, "Actual Operating Expenses", "Expected rent plus real non-rent operating expenses", report.grouped.operating, [...report.buckets.configuredRentRows, ...report.buckets.explicitActualOverheadRows, ...report.buckets.operatingRows], [190, 18, 60]);
  addBreakdownSection(doc, report, "Rent Set Aside", "Rent reserve less configured monthly rent, highlighted in summary", report.grouped.rentSetAside, report.buckets.rentSetAsideRows, [37, 99, 235]);
  addBreakdownSection(doc, report, "Other Overhead Set Aside", "Other overhead contributions reserved before actual payment", report.grouped.overheadReserve, report.buckets.otherOverheadReserveRows, [59, 130, 246]);
  addBreakdownSection(doc, report, "Salaries Paid / Set Aside", "Salary cash labels deducted in the actual profit statement", report.grouped.salaries, report.buckets.salaryRows, [14, 116, 144]);
  addBreakdownSection(doc, report, "Transfers", "Savings, blackbox, EOD and other cash transfers highlighted green", report.grouped.transfers, report.buckets.transferRows, [22, 163, 74]);
  addBreakdownSection(doc, report, "Perfumes / Invest Transfers", "Perfume category rows moved to the perfumes/invest pool, not stock orders", report.grouped.perfumesInvestTransfers, report.buckets.perfumesInvestTransferRows, [37, 99, 235]);
  addBreakdownSection(doc, report, "Stock Purchases", "Stock/order/inventory cash uses only; perfume pool transfers excluded", report.grouped.stock, report.buckets.stockRows, [217, 119, 6]);
  addBreakdownSection(doc, report, "Personal, Groceries, Tithes", "Non-operating cash uses separated from shop performance", [
    { key: "Personal use", items: report.buckets.personalRows, total: report.metrics.personalUse },
    { key: "Groceries", items: report.buckets.groceryRows, total: report.metrics.groceries },
    { key: "Tithes", items: report.buckets.titheRows, total: report.metrics.tithes },
  ], [...report.buckets.personalRows, ...report.buckets.groceryRows, ...report.buckets.titheRows], [124, 58, 237]);

  section(doc, `${report.shopName} - Sales And Stock`, `${report.month.label} | Product and low-stock context`);
  table(
    doc,
    38,
    [["Top Product", "Rows", "Sales"]],
    report.grouped.productRows.length ? report.grouped.productRows.map((row) => [safe(row.key), String(row.items.length), money(row.total)]) : [["No product sales recorded", "0", money(0)]],
    [5, 150, 105],
    { columnStyles: { 0: { cellWidth: 112 }, 1: { halign: "right", cellWidth: 18 }, 2: { halign: "right", cellWidth: 32 } } }
  );
  table(
    doc,
    doc.lastAutoTable.finalY + 10,
    [["Priority Item", "Category", "Qty", "30D Sales", "Score"]],
    report.lowStock.length ? report.lowStock.map((item) => [safe(item.name), safe(item.category), String(item.qty), String(item.sales30d), item.score.toFixed(1)]) : [["No unique low-stock high-priority items remaining for this report", "", "", "", ""]],
    [217, 119, 6],
    { columnStyles: { 0: { cellWidth: 76 }, 1: { cellWidth: 42 }, 2: { halign: "right", cellWidth: 18 }, 3: { halign: "right", cellWidth: 22 }, 4: { halign: "right", cellWidth: 18 } } }
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - 32, pageHeight - 7);
    doc.text("Nirvana monthly report - overhead reserves separated from actual expenses", 14, pageHeight - 7);
  }

  fs.writeFileSync(outputPath, Buffer.from(doc.output("arraybuffer")));
}

async function main() {
  const data = await loadData();
  const desktop = path.join(process.env.USERPROFILE || "C:\\Users\\ashjx", "Desktop");
  const usedByShop = {};
  for (const shop of SHOPS) {
    usedByShop[shop.id] = { queue: buildLowStockQueues(data), seen: new Set() };
    for (const month of MONTHS) {
      const report = reportData(data, shop, month, usedByShop[shop.id]);
      const filename = `Nirvana_${shop.id}_${month.key}_Monthly_Report.pdf`;
      const outputPath = path.join(desktop, filename);
      generatePdf(report, outputPath);
      console.log(`${outputPath} | sales=${money(report.metrics.salesTotal)} actual_expenses=${money(report.metrics.actualOperatingExpenses)} net=${money(report.metrics.netOperatingSurplus)} rent_set_aside=${money(report.metrics.rentSetAside)} expected_rent=${money(report.metrics.configuredRent)} rent_remaining=${money(report.metrics.rentReserveRemaining)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
