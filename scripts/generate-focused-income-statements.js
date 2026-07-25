const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default || require("jspdf-autotable");

const ROOT = path.resolve(__dirname, "..");
const DESKTOP = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Desktop");

const SHOPS = [
  { id: "kipasa", label: "Kipasa", aliases: ["kipasa"] },
  { id: "dubdub", label: "Dubdub", aliases: ["dubdub", "dub dub"] },
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
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const env = { ...loadEnv(path.join(ROOT, ".env.local")), ...process.env };
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

function rowDate(row) {
  return row.date || row.effective_date || row.created_at || row.timestamp || "";
}

function rowAmount(row) {
  return Math.abs(Number(row.amount || 0));
}

function sum(rows, pick = rowAmount) {
  return rows.reduce((acc, row) => acc + Number(pick(row) || 0), 0);
}

function monthBounds(month) {
  const start = new Date(Date.UTC(month.year, month.monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(month.year, month.monthIndex + 1, 0, 23, 59, 59, 999));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function inBounds(row, bounds) {
  const d = rowDate(row);
  if (!d) return false;
  const iso = new Date(d).toISOString();
  return iso >= bounds.startIso && iso <= bounds.endIso;
}

function textOf(row) {
  return `${row.title || ""} ${row.notes || ""} ${row.description || ""} ${row.category || ""} ${row.kind || ""}`.toLowerCase();
}

function belongsToShop(row, shop) {
  const id = String(row.shop_id || row.shopId || "").toLowerCase();
  if (id === shop.id) return true;
  const text = textOf(row);
  return shop.aliases.some((alias) => text.includes(alias));
}

function classifyRow(row) {
  const category = String(row.category || "").toLowerCase();
  const kind = String(row.kind || "").toLowerCase();
  const text = textOf(row);
  const isAutoRoutedOps = /auto-routed from pos expense/i.test(String(row.notes || ""));
  const isHistoricalReserveAdjustment = /historical rent reconciliation|zero out unwithdrawn historical rent/.test(text);
  const isOpeningOrAdjustment = /cash drawer opening|cash drawer adjustment/.test(category);
  const isLaybyCollection = /lay-by deposit|lay-by payment/.test(category);
  const isSalary = /salary|salaries|wage|wages|payroll|ashton salaries/.test(text);
  const isPerfumesInvestTransfer =
    category === "perfume" ||
    (/\bperfumes?\b/.test(text) && !/\b(stock|inventory|purchase|supplier|restock|reorder|wholesale|bulk order|procurement|order)\b/.test(text));
  const isStock =
    !isPerfumesInvestTransfer &&
    (/stock|inventory|purchase|supplier|restock|reorder|wholesale|bulk order|procurement|source:|china|harare order|mozambique|tshirt|tshirts|shirt|shirts|rings|hats|sa_order|sa order|sa_delivery|sa delivery|sa deliveries|harare delivery|city stock|citystock|platinum mothers/.test(text) ||
      category === "stock orders" ||
      kind === "stock_orders");
  const isGrocery =
    /grocer|supermarket|food|provisions|sundries|rice|sugar|cooking oil|flour|bread|milk|eggs|meat|vegetables|fruits|snacks|drinks|beverages/.test(text) ||
    category === "groceries";
  const isTithe = /tithe|tithes|offering|church|donation|charity|10%|ten percent/.test(text) || category === "tithe";
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
  const isRentSetAside =
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isOpeningOrAdjustment &&
    !isLaybyCollection &&
    !isSalary &&
    (category === "overhead" || (category === "pos expense" && /\brent\b|\bremt\b|overhead/.test(text)));
  const isSalarySetAside =
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isOpeningOrAdjustment &&
    !isLaybyCollection &&
    isSalary;
  const isExplicitOperatingOverhead = /zesa|wifi|utility|utilities|electric|electricity|water|internet|accountant|accounting|fuel|transport|repair|maintenance|cleaning|security|rates|municipal|insurance|pos\b|receipt|stationery|supplies/.test(text);
  const isActualOverheadPayment =
    kind === "overhead_payment" &&
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isStock &&
    !isRentSetAside &&
    !isSalarySetAside &&
    !isPersonal &&
    !isGrocery &&
    !isTithe &&
    isExplicitOperatingOverhead;
  const isOperating =
    !isOpeningOrAdjustment &&
    !isLaybyCollection &&
    !isAutoRoutedOps &&
    !isHistoricalReserveAdjustment &&
    !isTransfer &&
    !isRentSetAside &&
    !isSalarySetAside &&
    !isStock &&
    !isPersonal &&
    !isGrocery &&
    !isTithe &&
    (isActualOverheadPayment || category === "pos expense");
  return {
    isAutoRoutedOps,
    isHistoricalReserveAdjustment,
    isOpeningOrAdjustment,
    isLaybyCollection,
    isRentSetAside,
    isSalarySetAside,
    isPerfumesInvestTransfer,
    isStock,
    isGrocery,
    isTithe,
    isPersonal,
    isTransfer,
    isOperating,
  };
}

function canonicalStock(row) {
  const text = textOf(row);
  if (text.includes("china")) return "China orders";
  if (text.includes("sa order") || text.includes("sa_order")) return "SA orders";
  if (text.includes("sa delivery") || text.includes("sa deliveries") || text.includes("sa_delivery")) return "SA deliveries";
  if (text.includes("city stock") || text.includes("citystock")) return "City stock";
  if (text.includes("perfume")) return "Perfumes";
  if (text.includes("tshirt") || text.includes("tshirts") || text.includes("shirt")) return "T-shirts/shirts";
  if (text.includes("harare")) return "Harare stock/order";
  if (text.includes("mozambique")) return "Mozambique";
  if (text.includes("rings")) return "Rings";
  if (text.includes("hats")) return "Hats";
  if (text.includes("stockvel")) return "Stockvel";
  return "Other stock";
}

function groupRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = safe(keyFn(row) || "Other");
    if (!map.has(key)) map.set(key, { key, rows: [], total: 0 });
    const bucket = map.get(key);
    bucket.rows.push(row);
    bucket.total += rowAmount(row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

async function fetchAll(table, select = "*") {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function loadData() {
  const [shops, sales, ledger, ops] = await Promise.all([
    fetchAll("shops"),
    fetchAll("sales"),
    fetchAll("ledger_entries"),
    fetchAll("operations_ledger"),
  ]);
  return {
    shops,
    sales,
    ledger: ledger.map((row) => ({ ...row, source: "POS" })),
    ops: ops.map((row) => ({ ...row, source: "Direct Ops" })),
  };
}

function reportFor(data, shop, month) {
  const bounds = monthBounds(month);
  const shopRow = data.shops.find((row) => String(row.id || "").toLowerCase() === shop.id) || {};
  const expectedRent = Number((shopRow.expenses || {}).rent || 0);
  const sales = data.sales.filter((row) => !row.deleted_at && String(row.shop_id || "").toLowerCase() === shop.id && inBounds(row, bounds));
  const ledgerRows = data.ledger.filter((row) => !row.deleted_at && String(row.shop_id || "").toLowerCase() === shop.id && inBounds(row, bounds));
  const opsRows = data.ops.filter((row) => belongsToShop(row, shop) && inBounds(row, bounds));
  const rows = [...ledgerRows, ...opsRows].map((row) => ({ row, cls: classifyRow(row) }));
  const bucket = (fn) => rows.filter(fn).map((item) => item.row);
  const isPosExpense = (row) => String(row.source || "") === "POS" && String(row.type || "").toLowerCase() === "expense";
  const isDirectWithdrawal = (row) => String(row.source || "") === "Direct Ops" && Number(row.amount || 0) < 0;
  const isRealCashUse = (row) => isPosExpense(row) || isDirectWithdrawal(row);

  const revenue = sum(sales, (row) => Number(row.total_with_tax || 0));
  const rentSetAsideRows = bucket((x) => isPosExpense(x.row) && x.cls.isRentSetAside);
  const salaryRows = bucket((x) => isRealCashUse(x.row) && x.cls.isSalarySetAside);
  const perfumesInvestTransferRows = bucket((x) => isRealCashUse(x.row) && !x.cls.isAutoRoutedOps && !x.cls.isHistoricalReserveAdjustment && !x.cls.isOpeningOrAdjustment && !x.cls.isLaybyCollection && !x.cls.isTransfer && x.cls.isPerfumesInvestTransfer);
  const stockRows = bucket((x) => isRealCashUse(x.row) && !x.cls.isAutoRoutedOps && !x.cls.isHistoricalReserveAdjustment && !x.cls.isOpeningOrAdjustment && !x.cls.isLaybyCollection && !x.cls.isTransfer && x.cls.isStock);
  const operatingRows = bucket((x) => isRealCashUse(x.row) && x.cls.isOperating);
  const personalRows = bucket((x) => isRealCashUse(x.row) && !x.cls.isAutoRoutedOps && !x.cls.isHistoricalReserveAdjustment && !x.cls.isOpeningOrAdjustment && !x.cls.isLaybyCollection && !x.cls.isPerfumesInvestTransfer && !x.cls.isStock && !x.cls.isGrocery && !x.cls.isTithe && x.cls.isPersonal);
  const groceryRows = bucket((x) => isRealCashUse(x.row) && !x.cls.isAutoRoutedOps && !x.cls.isHistoricalReserveAdjustment && !x.cls.isOpeningOrAdjustment && !x.cls.isLaybyCollection && !x.cls.isPerfumesInvestTransfer && !x.cls.isStock && x.cls.isGrocery);
  const titheRows = bucket((x) => isRealCashUse(x.row) && !x.cls.isAutoRoutedOps && !x.cls.isHistoricalReserveAdjustment && !x.cls.isOpeningOrAdjustment && !x.cls.isLaybyCollection && !x.cls.isPerfumesInvestTransfer && !x.cls.isStock && !x.cls.isGrocery && x.cls.isTithe);
  const transferRows = bucket((x) => x.cls.isTransfer);
  const excludedRows = bucket((x) => x.cls.isAutoRoutedOps || x.cls.isHistoricalReserveAdjustment || x.cls.isOpeningOrAdjustment || x.cls.isLaybyCollection);

  const stockOrders = sum(stockRows);
  const operatingExpenses = sum(operatingRows);
  const salaries = sum(salaryRows);
  const personalGroceriesTithes = sum(personalRows) + sum(groceryRows) + sum(titheRows);
  const grossCashAfterRentAndStock = revenue - expectedRent - stockOrders;
  const actualCashProfit = grossCashAfterRentAndStock - operatingExpenses - salaries - personalGroceriesTithes;
  const rentSetAside = sum(rentSetAsideRows);
  const rentPoolSurplus = rentSetAside - expectedRent;
  const perfumesInvestTransfers = sum(perfumesInvestTransferRows);
  const unrestrictedCash = actualCashProfit - rentPoolSurplus - perfumesInvestTransfers;

  return {
    shop,
    shopName: shopRow.name || shop.label,
    month,
    revenue,
    expectedRent,
    stockOrders,
    grossCashAfterRentAndStock,
    operatingExpenses,
    salaries,
    personalGroceriesTithes,
    actualCashProfit,
    rentSetAside,
    rentPoolSurplus,
    perfumesInvestTransfers,
    unrestrictedCash,
    buckets: {
      operatingRows,
      stockRows,
      perfumesInvestTransferRows,
      salaryRows,
      personalRows,
      groceryRows,
      titheRows,
      rentSetAsideRows,
      transferRows,
      excludedRows,
    },
    groups: {
      operating: groupRows(operatingRows, (row) => row.description || row.title || row.category || row.kind),
      stock: groupRows(stockRows, canonicalStock),
      perfumesInvestTransfers: groupRows(perfumesInvestTransferRows, (row) => row.description || row.title || "Perfumes/invest transfer"),
      salaries: groupRows(salaryRows, (row) => row.description || row.title || "Salaries"),
      personalGroceriesTithes: groupRows([...personalRows, ...groceryRows, ...titheRows], (row) => {
        const cls = classifyRow(row);
        if (cls.isGrocery) return "Groceries";
        if (cls.isTithe) return "Tithes";
        return "Personal use";
      }),
      rentSetAside: groupRows(rentSetAsideRows, (row) => row.description || row.title || "Rent set aside"),
    },
  };
}

function drawHeader(doc, report, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${safe(report.shopName)} Income Statement`, 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${report.month.label} | ${subtitle}`, 14, 20);
  doc.setTextColor(15, 23, 42);
}

function table(doc, startY, head, body, color = [15, 23, 42], options = {}) {
  autoTable(doc, {
    startY,
    head,
    body,
    theme: "grid",
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
    columnStyles: options.columnStyles || {},
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY;
}

function rowLabel(row) {
  return safe(row.description || row.title || row.notes || row.category || row.kind || "Entry");
}

function detailRows(rows) {
  return rows
    .slice()
    .sort((a, b) => String(rowDate(a)).localeCompare(String(rowDate(b))) || rowAmount(b) - rowAmount(a))
    .map((row) => [
      String(rowDate(row)).slice(0, 10),
      safe(row.source || ""),
      rowLabel(row),
      money(rowAmount(row)),
    ]);
}

function addBreakdownPage(doc, report, title, groupedRows, detail, note) {
  doc.addPage();
  drawHeader(doc, report, title);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(title, 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(82, 96, 115);
  doc.text(safe(note), 14, 44, { maxWidth: 180 });
  doc.setTextColor(15, 23, 42);
  const summary = groupedRows.length ? groupedRows.map((row) => [row.key, String(row.rows.length), money(row.total)]) : [["No rows", "0", money(0)]];
  let y = table(doc, 52, [["Group", "Rows", "Amount"]], summary, [30, 64, 175], {
    columnStyles: { 0: { cellWidth: 176 }, 1: { halign: "right", cellWidth: 25 }, 2: { halign: "right", cellWidth: 45 } },
  });
  y += 8;
  table(doc, y, [["Date", "Source", "Description", "Amount"]], detailRows(detail), [37, 99, 235], {
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 28 },
      2: { cellWidth: 165 },
      3: { halign: "right", cellWidth: 38 },
    },
  });
}

function generatePdf(report, outputPath) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  drawHeader(doc, report, "Clean statement");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Clean Income Statement", 14, 42);
  table(
    doc,
    52,
    [["Line", "Amount"]],
    [
      ["Sales", money(report.revenue)],
      ["Less actual rent cost", `(${money(report.expectedRent)})`],
      ["Less stock orders", `(${money(report.stockOrders)})`],
      ["Gross cash after rent and stock", money(report.grossCashAfterRentAndStock)],
      ["Less operating expenses", `(${money(report.operatingExpenses)})`],
      ["Less salaries", `(${money(report.salaries)})`],
      ["Less personal use, groceries and tithes", `(${money(report.personalGroceriesTithes)})`],
      ["Actual cash profit", money(report.actualCashProfit)],
    ],
    [15, 23, 42],
    { columnStyles: { 0: { cellWidth: 185 }, 1: { halign: "right", cellWidth: 55 } } }
  );

  const y = doc.lastAutoTable.finalY + 12;
  table(
    doc,
    y,
    [["Rent Pool Memo", "Amount"]],
    [
      ["Rent set aside from sales", money(report.rentSetAside)],
      ["Actual rent cost deducted once", `(${money(report.expectedRent)})`],
      ["Rent pool surplus committed", money(report.rentPoolSurplus)],
      ["Perfumes/invest pool transfers", money(report.perfumesInvestTransfers)],
      ["Unrestricted cash after pool allocations", money(report.unrestrictedCash)],
    ],
    [22, 101, 52],
    { columnStyles: { 0: { cellWidth: 185 }, 1: { halign: "right", cellWidth: 55 } } }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(82, 96, 115);
  doc.text(
    "Note: rent and perfumes/invest set-asides are not additional sales. They are cash allocated out of the sales total and shown only as pool memos.",
    14,
    doc.lastAutoTable.finalY + 10,
    { maxWidth: 180 }
  );
  doc.setTextColor(15, 23, 42);

  addBreakdownPage(doc, report, "Stock Orders Breakdown", report.groups.stock, report.buckets.stockRows, "These rows make up the stock-orders deduction.");
  addBreakdownPage(doc, report, "Perfumes / Invest Pool Transfers", report.groups.perfumesInvestTransfers, report.buckets.perfumesInvestTransferRows, "Perfume category rows are transfers to the perfumes/invest pool, not stock orders or operating expenses.");
  addBreakdownPage(doc, report, "Operating Expenses Breakdown", report.groups.operating, report.buckets.operatingRows, "These are ordinary operating costs. Rent, salaries, stock, personal use, groceries and tithes are excluded here.");
  addBreakdownPage(doc, report, "Salaries Breakdown", report.groups.salaries, report.buckets.salaryRows, "Salary-labelled cash movements deducted in the statement.");
  addBreakdownPage(doc, report, "Personal, Groceries And Tithes Breakdown", report.groups.personalGroceriesTithes, [...report.buckets.personalRows, ...report.buckets.groceryRows, ...report.buckets.titheRows], "Non-operating cash uses deducted below the operating section.");
  addBreakdownPage(doc, report, "Rent Set Aside Breakdown", report.groups.rentSetAside, report.buckets.rentSetAsideRows, "Rent-pool allocations from sales. This is not added to sales and is not deducted again as rent expense.");

  doc.save(outputPath);
}

async function main() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase environment variables");
  }
  const data = await loadData();
  const outputs = [];
  for (const shop of SHOPS) {
    for (const month of MONTHS) {
      const report = reportFor(data, shop, month);
      const fileName = `Nirvana_${shop.id}_${month.key}_Income_Statement.pdf`;
      const outputPath = path.join(DESKTOP, fileName);
      generatePdf(report, outputPath);
      outputs.push({ outputPath, report });
    }
  }
  for (const item of outputs) {
    const r = item.report;
    console.log(`${item.outputPath} | sales=${money(r.revenue)} rent=${money(r.expectedRent)} stock=${money(r.stockOrders)} perfume_invest=${money(r.perfumesInvestTransfers)} op=${money(r.operatingExpenses)} salaries=${money(r.salaries)} personal_groc_tithe=${money(r.personalGroceriesTithes)} profit=${money(r.actualCashProfit)} rent_set_aside=${money(r.rentSetAside)} rent_surplus=${money(r.rentPoolSurplus)} free_cash=${money(r.unrestrictedCash)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
