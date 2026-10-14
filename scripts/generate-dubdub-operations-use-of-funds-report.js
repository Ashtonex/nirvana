const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = process.cwd();
const SHOP_ID = "dubdub";
const START = "2026-01-01T00:00:00.000Z";
const END = "2026-07-31T23:59:59.999+02:00";
const REPORT_DIR = path.join(ROOT, "reports");
const PDF_OUTPUT = path.join(REPORT_DIR, "Dub_Dub_Operations_Use_Of_Funds_Jan_to_Jul_31_2026.pdf");
const JSON_OUTPUT = path.join(REPORT_DIR, "dubdub_operations_use_of_funds_jan_to_jul_31_2026.json");
const CSV_OUTPUT = path.join(REPORT_DIR, "dubdub_operations_paid_activity_jan_to_jul_31_2026.csv");

function loadEnv() {
  const text = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function money(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function monthOnly(value) {
  return String(value || "").slice(0, 7);
}

function metadataText(row) {
  return row.metadata && typeof row.metadata === "object" ? JSON.stringify(row.metadata) : "";
}

function isDriftReset(row) {
  const text = norm(`${row.kind || ""} ${row.category || ""} ${row.title || ""} ${row.description || ""} ${row.notes || ""} ${metadataText(row)}`);
  return /\b(drift|baseline reset|vault baseline|variance reset|reset to zero)\b/.test(text);
}

function dubDubTransferBucket(row) {
  if (isDriftReset(row)) return null;
  const text = norm(`${row.category || ""} ${row.description || ""}`);
  if (text.includes("blackbox") || text.includes("black box")) return "Black Box";
  if (text.includes("saving")) return "Savings";
  return null;
}

function classifyUse(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const text = norm(`${row.kind || ""} ${row.title || ""} ${row.notes || ""} ${row.overhead_category || ""} ${metadata.fundingPool || ""} ${metadata.operationType || ""}`);
  const title = norm(row.title);
  const notes = norm(row.notes);

  if (/\b(sa order|sa orders|sa order|china order|stock order|stock orders|stockvel|order payment|buying stock|stock)\b/.test(text)) return "Stock orders";
  if (/\b(rent|rates|landlord)\b/.test(text)) return "Rent / overhead";
  if (/\b(salary|salaries|wage|wages|payroll|staff pay)\b/.test(text)) return "Salaries / wages";
  if (/\b(utility|utilities|wifi|zesa|water|electric|electricity|internet)\b/.test(text)) return "Utilities";
  if (/\b(zimra|tax|bank|banking|bank charges)\b/.test(text)) return "Tax / banking";
  if (/\b(transport|fuel|bus|taxi)\b/.test(text)) return "Transport";
  if (/\b(invest|perfume|parfum)\b/.test(text)) return "Invest / perfumes";
  if (/\b(payable|payables|creditor|supplier)\b/.test(text)) return "Supplier / payables";
  if (/\b(grocery|groceries|food)\b/.test(text)) return "Groceries";
  if (title || notes) return "Other labelled payout";
  return "Unlabelled operations payout";
}

function evidenceStatus(row, category) {
  const text = norm(`${row.kind || ""} ${row.title || ""} ${row.notes || ""} ${metadataText(row)}`);
  if (/\b(historical reconciliation|system adjustment|zero out|adjustment)\b/.test(text)) return "Adjustment-looking";
  if (category === "Unlabelled operations payout") return "Unclear";
  if (category === "Other labelled payout" && /^\d+(\.\d+)?$/.test(norm(row.title))) return "Unclear";
  return "Labelled payment";
}

async function fetchAll(factory) {
  const rows = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await factory().range(from, from + size - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function addText(page, text, x, y, size, font, color = rgb(0.08, 0.09, 0.11)) {
  page.drawText(String(text), { x, y, size, font, color });
}

function wrap(text, maxChars) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!word) continue;
    if ((line + " " + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page, text, x, y, size, font, color, maxChars, lineHeight) {
  for (const line of wrap(text, maxChars)) {
    addText(page, line, x, y, size, font, color);
    y -= lineHeight;
  }
  return y;
}

function drawTable(doc, fonts, title, headers, rows, widths, mapper, rowsPerPage = 32) {
  for (let offset = 0; offset < rows.length || offset === 0; offset += rowsPerPage) {
    const page = doc.addPage([842, 595]);
    let y = 552;
    addText(page, offset === 0 ? title : `${title} continued`, 36, y, 15, fonts.bold);
    y -= 28;
    const xs = [36];
    for (let i = 1; i < widths.length; i += 1) xs[i] = xs[i - 1] + widths[i - 1];
    headers.forEach((header, i) => addText(page, header, xs[i], y, 8, fonts.bold, rgb(0.18, 0.2, 0.24)));
    y -= 10;
    page.drawLine({ start: { x: 36, y }, end: { x: 806, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
    y -= 14;
    for (const row of rows.slice(offset, offset + rowsPerPage)) {
      mapper(row).forEach((cell, i) => {
        let text = String(cell ?? "");
        const max = Math.max(8, Math.floor(widths[i] / 5));
        if (text.length > max) text = `${text.slice(0, max - 3)}...`;
        addText(page, text, xs[i], y, 7.4, fonts.regular, rgb(0.12, 0.14, 0.18));
      });
      y -= 15;
    }
  }
}

async function buildPdf(payload) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const page = doc.addPage([842, 595]);

  addText(page, "Dub Dub Operations Use of Funds", 36, 548, 22, bold);
  addText(page, "Period: January 1, 2026 to July 31, 2026. Drift resets excluded.", 36, 522, 10, regular, rgb(0.28, 0.31, 0.36));

  addText(page, "Executive Summary", 36, 486, 14, bold);
  let y = 466;
  for (const line of payload.executiveSummary) {
    y = drawWrapped(page, `• ${line}`, 46, y, 9.2, regular, rgb(0.11, 0.13, 0.16), 118, 12);
    y -= 3;
  }

  y -= 8;
  const metrics = [
    ["Dub Dub sent to Ops", money(payload.dubDubInflow.total)],
    ["Labelled Ops paid out", money(payload.totals.labelledOutflow)],
    ["Adjustment/unclear paid out", money(payload.totals.unclearOutflow)],
    ["Ops paid out total", money(payload.totals.totalOutflow)],
  ];
  let x = 36;
  for (const [label, value] of metrics) {
    addText(page, label, x, y, 8.5, bold, rgb(0.38, 0.41, 0.46));
    addText(page, value, x, y - 24, 18, bold, rgb(0.06, 0.23, 0.32));
    x += 194;
  }

  y -= 78;
  addText(page, "Where Operations Cash Went", 36, y, 14, bold);
  y -= 25;
  const xs = [36, 230, 330, 430, 530];
  ["Use", "Rows", "Labelled", "Unclear", "Total"].forEach((h, i) => addText(page, h, xs[i], y, 8, bold, rgb(0.18, 0.2, 0.24)));
  y -= 10;
  page.drawLine({ start: { x: 36, y }, end: { x: 650, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 16;
  for (const row of payload.categoryRows) {
    [row.category, row.count, money(row.labelled), money(row.unclear), money(row.total)]
      .forEach((cell, i) => addText(page, cell, xs[i], y, 8.3, i === 4 ? bold : regular, rgb(0.12, 0.14, 0.18)));
    y -= 15;
  }

  drawTable(
    doc,
    fonts,
    "Largest Operations Payments and Questionable Rows",
    ["Date", "Shop", "Use", "Status", "Amount", "Title / note"],
    payload.topRows,
    [72, 72, 120, 100, 84, 320],
    (row) => [row.date, row.shopId || "Ops", row.category, row.status, money(row.amount), row.label],
    34
  );

  drawTable(
    doc,
    fonts,
    "All Operations Paid Activity",
    ["Date", "Shop", "Use", "Status", "Amount", "Title / note"],
    payload.outflows,
    [72, 72, 120, 100, 84, 320],
    (row) => [row.date, row.shopId || "Ops", row.category, row.status, money(row.amount), row.label],
    34
  );

  fs.writeFileSync(PDF_OUTPUT, await doc.save());
}

async function main() {
  loadEnv();
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials in .env.local");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ledgerRows = await fetchAll(() =>
    supabase
      .from("ledger_entries")
      .select("*")
      .eq("shop_id", SHOP_ID)
      .gte("date", START)
      .lte("date", END)
      .order("date", { ascending: true })
  );
  const operationRows = await fetchAll(() =>
    supabase
      .from("operations_ledger")
      .select("*")
      .gte("created_at", START)
      .lte("created_at", END)
      .order("created_at", { ascending: true })
  );

  const dubDubTransfers = ledgerRows
    .map((row) => {
      const bucket = dubDubTransferBucket(row);
      if (!bucket) return null;
      return {
        id: row.id,
        date: dateOnly(row.date),
        month: monthOnly(row.date),
        bucket,
        amount: Math.abs(Number(row.amount || 0)),
        description: row.description || "",
      };
    })
    .filter((row) => row && row.amount > 0);

  const dubDubInflow = dubDubTransfers.reduce(
    (acc, row) => {
      acc[row.bucket] += row.amount;
      acc.total += row.amount;
      acc.count += 1;
      return acc;
    },
    { Savings: 0, "Black Box": 0, total: 0, count: 0 }
  );

  const outflows = operationRows
    .filter((row) => !isDriftReset(row) && Number(row.amount || 0) < 0)
    .map((row) => {
      const amount = Math.abs(Number(row.amount || 0));
      const category = classifyUse(row);
      const status = evidenceStatus(row, category);
      const label = [row.title, row.notes].filter(Boolean).join(" | ") || row.kind || "";
      return {
        id: row.id,
        date: dateOnly(row.effective_date || row.created_at),
        month: monthOnly(row.effective_date || row.created_at),
        shopId: row.shop_id || "",
        amount,
        rawAmount: Number(row.amount || 0),
        kind: row.kind || "",
        category,
        status,
        title: row.title || "",
        notes: row.notes || "",
        label,
        metadata: row.metadata || {},
      };
    });

  const categoryMap = {};
  for (const row of outflows) {
    categoryMap[row.category] ||= { category: row.category, count: 0, labelled: 0, unclear: 0, total: 0 };
    categoryMap[row.category].count += 1;
    categoryMap[row.category].total += row.amount;
    if (row.status === "Labelled payment") categoryMap[row.category].labelled += row.amount;
    else categoryMap[row.category].unclear += row.amount;
  }
  const categoryRows = Object.values(categoryMap).sort((a, b) => b.total - a.total);
  const labelledOutflow = outflows.filter((row) => row.status === "Labelled payment").reduce((sum, row) => sum + row.amount, 0);
  const unclearOutflow = outflows.filter((row) => row.status !== "Labelled payment").reduce((sum, row) => sum + row.amount, 0);
  const totalOutflow = outflows.reduce((sum, row) => sum + row.amount, 0);
  const questionableRows = outflows.filter((row) => row.status !== "Labelled payment" || row.amount >= 1000);
  const topRows = questionableRows.sort((a, b) => b.amount - a.amount).slice(0, 40);

  const monthlyMap = {};
  for (const row of outflows) {
    monthlyMap[row.month] ||= { month: row.month, labelledOutflow: 0, unclearOutflow: 0, totalOutflow: 0 };
    monthlyMap[row.month].totalOutflow += row.amount;
    if (row.status === "Labelled payment") monthlyMap[row.month].labelledOutflow += row.amount;
    else monthlyMap[row.month].unclearOutflow += row.amount;
  }
  const monthlyRows = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  const executiveSummary = [
    `Dub Dub POS transfers show ${money(dubDubInflow.total)} sent into Operations: ${money(dubDubInflow.Savings)} Savings and ${money(dubDubInflow["Black Box"])} Black Box.`,
    `Operations paid out ${money(totalOutflow)} during the same period, so the Operations ledger has enough outgoing activity to absorb the Dub Dub money, but the cash is pooled and not directly tagged back to Dub Dub transfer IDs.`,
    `Confirmed labelled uses total ${money(labelledOutflow)}. The largest labelled buckets are ${categoryRows.slice(0, 3).map((row) => `${row.category} ${money(row.labelled || row.total)}`).join(", ")}.`,
    `Unclear or adjustment-looking Operations outflows total ${money(unclearOutflow)}. These should not be treated as explained physical cash use until receipts or notes are added.`,
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    scope: {
      periodStart: "2026-01-01",
      periodEnd: "2026-07-31",
      dubDubSource: "ledger_entries for Dub Dub savings and black box transfers",
      operationsUseSource: "negative operations_ledger rows for all Operations payments in the same period",
      exclusions: ["drift resets"],
      attributionCaveat: "Operations cash is pooled. Uses are not directly linked to individual Dub Dub transfer IDs unless metadata contains that linkage.",
    },
    sourceRowsScanned: {
      dubDubLedgerEntries: ledgerRows.length,
      operationsLedger: operationRows.length,
    },
    dubDubInflow,
    totals: {
      labelledOutflow,
      unclearOutflow,
      totalOutflow,
      residualIfOnlyDubDubFundedOperations: dubDubInflow.total - totalOutflow,
      unexplainedIfOnlyLabelledPaymentsAccepted: dubDubInflow.total - labelledOutflow,
    },
    categoryRows,
    monthlyRows,
    topRows,
    outflows,
    executiveSummary,
  };

  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(payload, null, 2));
  const csvRows = [
    ["date", "shop", "category", "status", "amount", "kind", "title", "notes", "id"],
    ...outflows.map((row) => [row.date, row.shopId || "operations", row.category, row.status, row.amount, row.kind, row.title, row.notes, row.id]),
  ];
  fs.writeFileSync(CSV_OUTPUT, csvRows.map((row) => row.map(csvEscape).join(",")).join("\n"));
  await buildPdf(payload);

  console.log(JSON.stringify({
    pdf: PDF_OUTPUT,
    json: JSON_OUTPUT,
    csv: CSV_OUTPUT,
    dubDubInflow,
    totals: payload.totals,
    categoryRows,
    topRows: topRows.slice(0, 10).map((row) => ({
      date: row.date,
      shop: row.shopId || "operations",
      category: row.category,
      status: row.status,
      amount: row.amount,
      label: row.label,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
