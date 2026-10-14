const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = process.cwd();
const START = "2026-01-01T00:00:00.000Z";
const END = "2026-07-29T23:59:59.999+02:00";
const SHOP_ID = "dubdub";
const OUTPUT = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Desktop", "Dub Dub Savings Blackbox Jan-to-Date 2026.pdf");

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function money(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function transferBucket(category, description) {
  const cat = String(category || "");
  const text = normalize(`${category || ""} ${description || ""}`);
  if (cat === "Blackbox" || text.includes("blackbox") || text.includes("black box")) return "Blackbox";
  if (cat === "Savings" || text.includes("saving") || text.includes("savings")) return "Savings";
  return null;
}

function operationsBucket(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const fundingPool = normalize(metadata.fundingPool || metadata.funding_pool || metadata.pool || "");
  const text = normalize(`${row.kind || ""} ${row.title || ""} ${row.notes || ""} ${fundingPool}`);
  if (text.includes("blackbox") || text.includes("black box")) return "Blackbox";
  if (fundingPool === "savings" || text.includes("saving") || text.includes("savings")) return "Savings";
  return null;
}

function monthKey(dateValue) {
  return String(dateValue || "").slice(0, 7);
}

async function fetchAll(queryFactory) {
  const rows = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await queryFactory().range(from, from + size - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return rows;
}

function addText(page, text, x, y, size, font, color = rgb(0.08, 0.09, 0.11)) {
  page.drawText(String(text), { x, y, size, font, color });
}

function drawTablePage(doc, fonts, title, headers, rows, yStart = 760) {
  const page = doc.addPage([842, 595]);
  const { bold, regular } = fonts;
  let y = yStart;
  addText(page, title, 36, y, 15, bold);
  y -= 24;
  const widths = [82, 72, 92, 94, 300, 78];
  const xs = [36];
  for (let i = 1; i < widths.length; i += 1) xs[i] = xs[i - 1] + widths[i - 1];
  headers.forEach((h, i) => addText(page, h, xs[i], y, 8, bold, rgb(0.18, 0.2, 0.24)));
  y -= 10;
  page.drawLine({ start: { x: 36, y }, end: { x: 806, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 14;
  for (const row of rows) {
    if (y < 42) return { pageFullAt: row };
    row.forEach((cell, i) => {
      let text = String(cell ?? "");
      const max = i === 4 ? 62 : i === 3 ? 18 : 15;
      if (text.length > max) text = `${text.slice(0, max - 3)}...`;
      addText(page, text, xs[i], y, 7.5, regular, rgb(0.12, 0.14, 0.18));
    });
    y -= 13;
  }
  return {};
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or service role key in .env.local");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const ledgerRows = await fetchAll(() =>
    supabase
      .from("ledger_entries")
      .select("id, shop_id, type, category, amount, date, description, employee_id")
      .eq("shop_id", SHOP_ID)
      .is("deleted_at", null)
      .gte("date", START)
      .lte("date", END)
      .order("date", { ascending: true })
  );

  const operationRows = await fetchAll(() =>
    supabase
      .from("operations_ledger")
      .select("id, shop_id, amount, kind, title, notes, effective_date, created_at, metadata")
      .eq("shop_id", SHOP_ID)
      .gte("created_at", START)
      .lte("created_at", END)
      .order("created_at", { ascending: true })
  );

  const entries = [];

  for (const row of ledgerRows) {
    const bucket = transferBucket(row.category, row.description);
    if (!bucket) continue;
    entries.push({
      source: "ledger_entries",
      id: row.id,
      date: row.date,
      month: monthKey(row.date),
      bucket,
      amount: Math.abs(Number(row.amount || 0)),
      category: row.category || "",
      description: row.description || "",
    });
  }

  const ledgerMatchCounts = new Map();
  for (const row of entries) {
    const key = `${String(row.date || "").slice(0, 10)}|${row.bucket}|${row.amount.toFixed(2)}`;
    ledgerMatchCounts.set(key, (ledgerMatchCounts.get(key) || 0) + 1);
  }

  const excludedDuplicateOperations = [];
  for (const row of operationRows) {
    const bucket = operationsBucket(row);
    if (!bucket) continue;
    const amount = Number(row.amount || 0);
    if (amount <= 0) continue;
    const date = row.effective_date || row.created_at;
    const key = `${String(date || "").slice(0, 10)}|${bucket}|${Math.abs(amount).toFixed(2)}`;
    const remainingLedgerMatches = ledgerMatchCounts.get(key) || 0;
    if (remainingLedgerMatches > 0) {
      ledgerMatchCounts.set(key, remainingLedgerMatches - 1);
      excludedDuplicateOperations.push({ ...row, bucket, amount: Math.abs(amount), duplicateKey: key });
      continue;
    }
    entries.push({
      source: "operations_ledger",
      id: row.id,
      date,
      month: monthKey(date),
      bucket,
      amount: Math.abs(amount),
      category: row.kind || "",
      description: row.title || row.notes || "",
    });
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totals = entries.reduce(
    (acc, row) => {
      acc.total += row.amount;
      acc[row.bucket] = (acc[row.bucket] || 0) + row.amount;
      acc.bySource[row.source] ||= { Savings: 0, Blackbox: 0, total: 0, count: 0 };
      acc.bySource[row.source][row.bucket] += row.amount;
      acc.bySource[row.source].total += row.amount;
      acc.bySource[row.source].count += 1;
      acc.byMonth[row.month] ||= { Savings: 0, Blackbox: 0, total: 0 };
      acc.byMonth[row.month][row.bucket] += row.amount;
      acc.byMonth[row.month].total += row.amount;
      return acc;
    },
    { total: 0, Savings: 0, Blackbox: 0, byMonth: {}, bySource: {} }
  );

  const excludedDuplicateOperationsTotal = excludedDuplicateOperations.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([842, 595]);

  addText(page, "Dub Dub Savings / Blackbox Transfers", 36, 540, 24, bold);
  addText(page, "Period: January 1, 2026 to July 29, 2026", 36, 512, 11, regular, rgb(0.25, 0.28, 0.33));
  addText(page, "Source: Supabase ledger_entries and operations_ledger filtered to shop_id = dubdub", 36, 496, 9, regular, rgb(0.35, 0.38, 0.43));

  addText(page, "Total Sent", 36, 450, 10, bold, rgb(0.35, 0.38, 0.43));
  addText(page, money(totals.total), 36, 420, 28, bold, rgb(0.05, 0.35, 0.2));
  addText(page, "Savings", 230, 450, 10, bold, rgb(0.35, 0.38, 0.43));
  addText(page, money(totals.Savings || 0), 230, 423, 22, bold, rgb(0.05, 0.25, 0.5));
  addText(page, "Blackbox", 420, 450, 10, bold, rgb(0.35, 0.38, 0.43));
  addText(page, money(totals.Blackbox || 0), 420, 423, 22, bold, rgb(0.15, 0.1, 0.35));
  addText(page, "Transaction Count", 610, 450, 10, bold, rgb(0.35, 0.38, 0.43));
  addText(page, String(entries.length), 610, 423, 22, bold, rgb(0.1, 0.12, 0.16));

  addText(page, "Monthly Breakdown", 36, 362, 15, bold);
  let y = 334;
  addText(page, "Month", 36, y, 9, bold);
  addText(page, "Savings", 150, y, 9, bold);
  addText(page, "Blackbox", 270, y, 9, bold);
  addText(page, "Total", 390, y, 9, bold);
  y -= 12;
  page.drawLine({ start: { x: 36, y }, end: { x: 500, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 17;
  for (const [month, row] of Object.entries(totals.byMonth).sort(([a], [b]) => a.localeCompare(b))) {
    addText(page, month, 36, y, 9, regular);
    addText(page, money(row.Savings), 150, y, 9, regular);
    addText(page, money(row.Blackbox), 270, y, 9, regular);
    addText(page, money(row.total), 390, y, 9, bold);
    y -= 16;
  }

  addText(page, "Source Breakdown", 560, 362, 15, bold);
  let sourceY = 334;
  addText(page, "Source", 560, sourceY, 9, bold);
  addText(page, "Rows", 682, sourceY, 9, bold);
  addText(page, "Total", 730, sourceY, 9, bold);
  sourceY -= 12;
  page.drawLine({ start: { x: 560, y: sourceY }, end: { x: 806, y: sourceY }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  sourceY -= 17;
  for (const [source, row] of Object.entries(totals.bySource).sort(([a], [b]) => a.localeCompare(b))) {
    addText(page, source, 560, sourceY, 8.5, regular);
    addText(page, String(row.count), 682, sourceY, 8.5, regular);
    addText(page, money(row.total), 730, sourceY, 8.5, bold);
    sourceY -= 16;
  }

  addText(page, "Method", 36, 98, 11, bold);
  addText(page, "Included rows where category/description/kind/funding metadata indicates Savings, Blackbox, or Black Box.", 36, 82, 8.5, regular);
  addText(page, "Amounts are shown as positive cash sent to those pools. Operations rows are included only when amount is positive.", 36, 68, 8.5, regular);
  addText(page, `Excluded likely duplicate operations-ledger rows: ${excludedDuplicateOperations.length} (${money(excludedDuplicateOperationsTotal)}).`, 36, 54, 8.5, regular);

  const tableRows = entries.map((row) => [
    String(row.date || "").slice(0, 10),
    row.bucket,
    row.source,
    row.category,
    row.description,
    money(row.amount),
  ]);
  const headers = ["Date", "Pool", "Source", "Category", "Description", "Amount"];
  for (let i = 0; i < tableRows.length; i += 34) {
    drawTablePage(doc, { regular, bold }, `Transaction Detail (${i + 1}-${Math.min(i + 34, tableRows.length)} of ${tableRows.length})`, headers, tableRows.slice(i, i + 34));
  }

  const bytes = await doc.save();
  fs.writeFileSync(OUTPUT, bytes);

  console.log(JSON.stringify({
    output: OUTPUT,
    from: START,
    to: END,
    ledgerRowsScanned: ledgerRows.length,
    operationRowsScanned: operationRows.length,
    matchedRows: entries.length,
    savings: totals.Savings || 0,
    blackbox: totals.Blackbox || 0,
    total: totals.total,
    byMonth: totals.byMonth,
    bySource: totals.bySource,
    excludedDuplicateOperations: excludedDuplicateOperations.length,
    excludedDuplicateOperationsTotal,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
