const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = process.cwd();
const SHOP_ID = "dubdub";
const PERIOD_START = "2026-01-01T00:00:00.000Z";
const PERIOD_END = "2026-07-31T23:59:59.999+02:00";
const REPORT_DIR = path.join(ROOT, "reports");
const PDF_OUTPUT = path.join(REPORT_DIR, "Dub_Dub_Operations_Savings_Blackbox_Reconciliation_Jan_to_Jul_31_2026.pdf");
const JSON_OUTPUT = path.join(REPORT_DIR, "dubdub_operations_savings_blackbox_reconciliation_jan_to_jul_31_2026.json");
const CSV_OUTPUT = path.join(REPORT_DIR, "dubdub_operations_savings_blackbox_flags_jan_to_jul_31_2026.csv");

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

function isDriftReset(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? JSON.stringify(row.metadata) : "";
  const text = normalize(`${row.kind || ""} ${row.category || ""} ${row.title || ""} ${row.description || ""} ${row.notes || ""} ${metadata}`);
  return /\b(drift|baseline reset|vault baseline|variance reset|reset to zero)\b/.test(text);
}

function ledgerBucket(row) {
  if (isDriftReset(row)) return null;
  const text = normalize(`${row.category || ""} ${row.description || ""}`);
  if (text.includes("blackbox") || text.includes("black box")) return "Blackbox";
  if (text.includes("saving")) return "Savings";
  return null;
}

function operationsBucket(row) {
  if (isDriftReset(row)) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const fundingPool = metadata.fundingPool || metadata.funding_pool || metadata.pool || "";
  const text = normalize(`${row.kind || ""} ${row.title || ""} ${row.notes || ""} ${fundingPool}`);
  if (text.includes("blackbox") || text.includes("black box")) return "Blackbox";
  if (text.includes("saving")) return "Savings";
  return null;
}

function day(value) {
  return String(value || "").slice(0, 10);
}

function month(value) {
  return String(value || "").slice(0, 7);
}

function daysBetween(a, b) {
  const ms = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime());
  return Math.round(ms / 86400000);
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

function toLedgerActual(row) {
  const bucket = ledgerBucket(row);
  if (!bucket) return null;
  return {
    id: row.id,
    source: "POS ledger",
    date: day(row.date),
    month: month(row.date),
    bucket,
    amount: Math.abs(Number(row.amount || 0)),
    rawAmount: Number(row.amount || 0),
    category: row.category || "",
    description: row.description || "",
    employeeId: row.employee_id || "",
  };
}

function toOperationsActual(row) {
  const bucket = operationsBucket(row);
  if (!bucket) return null;
  const date = row.effective_date || row.created_at;
  return {
    id: row.id,
    source: "Operations ledger",
    date: day(date),
    month: month(date),
    bucket,
    amount: Math.abs(Number(row.amount || 0)),
    rawAmount: Number(row.amount || 0),
    kind: row.kind || "",
    title: row.title || "",
    notes: row.notes || "",
    employeeId: row.employee_id || "",
  };
}

function pushTotal(target, key, row) {
  target[key] ||= { Savings: 0, Blackbox: 0, total: 0, count: 0 };
  target[key][row.bucket] += row.amount;
  target[key].total += row.amount;
  target[key].count += 1;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function addText(page, text, x, y, size, font, color = rgb(0.08, 0.09, 0.11), maxWidth) {
  page.drawText(String(text), { x, y, size, font, color, maxWidth });
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
  const lines = wrap(text, maxChars);
  for (const line of lines) {
    addText(page, line, x, y, size, font, color);
    y -= lineHeight;
  }
  return y;
}

function drawTable(doc, fonts, title, headers, rows, widths, mapper, rowsPerPage = 28) {
  const pages = [];
  for (let offset = 0; offset < rows.length || offset === 0; offset += rowsPerPage) {
    const page = doc.addPage([842, 595]);
    pages.push(page);
    let y = 552;
    addText(page, offset === 0 ? title : `${title} continued`, 36, y, 15, fonts.bold);
    y -= 28;
    const xs = [36];
    for (let i = 1; i < widths.length; i += 1) xs[i] = xs[i - 1] + widths[i - 1];
    headers.forEach((header, i) => addText(page, header, xs[i], y, 8, fonts.bold, rgb(0.18, 0.2, 0.24)));
    y -= 10;
    page.drawLine({ start: { x: 36, y }, end: { x: 806, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
    y -= 14;
    const slice = rows.slice(offset, offset + rowsPerPage);
    for (const row of slice) {
      mapper(row).forEach((cell, i) => {
        let text = String(cell ?? "");
        const max = Math.max(8, Math.floor(widths[i] / 5));
        if (text.length > max) text = `${text.slice(0, max - 3)}...`;
        addText(page, text, xs[i], y, 7.5, fonts.regular, rgb(0.12, 0.14, 0.18));
      });
      y -= 15;
    }
  }
  return pages;
}

async function buildPdf(payload) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const page = doc.addPage([842, 595]);

  addText(page, "Dub Dub Savings and Black Box Reconciliation", 36, 548, 22, bold);
  addText(page, "Period: January 1, 2026 to July 31, 2026. Drift resets excluded.", 36, 522, 10, regular, rgb(0.28, 0.31, 0.36));

  addText(page, "Executive Summary", 36, 486, 14, bold);
  let y = 466;
  for (const line of payload.executiveSummary) {
    y = drawWrapped(page, `• ${line}`, 46, y, 9.2, regular, rgb(0.11, 0.13, 0.16), 116, 12);
    y -= 3;
  }

  y -= 8;
  const metrics = [
    ["POS ledger sent", money(payload.totals.ledger.total)],
    ["Operations cash activity", money(payload.totals.operations.total)],
    ["Unmatched POS amount", money(payload.totals.unmatchedLedgerAmount)],
    ["Unmatched ops amount", money(payload.totals.unmatchedOperationsAmount)],
  ];
  let x = 36;
  for (const [label, value] of metrics) {
    addText(page, label, x, y, 8.5, bold, rgb(0.38, 0.41, 0.46));
    addText(page, value, x, y - 24, 18, bold, rgb(0.06, 0.23, 0.32));
    x += 194;
  }

  y -= 76;
  addText(page, "Monthly Reconciliation", 36, y, 14, bold);
  y -= 24;
  const monthHeaders = ["Month", "POS Savings", "POS Blackbox", "Ops Savings", "Ops Blackbox", "Variance"];
  const widths = [72, 105, 105, 105, 105, 105];
  const xs = [36];
  for (let i = 1; i < widths.length; i += 1) xs[i] = xs[i - 1] + widths[i - 1];
  monthHeaders.forEach((header, i) => addText(page, header, xs[i], y, 8, bold, rgb(0.18, 0.2, 0.24)));
  y -= 10;
  page.drawLine({ start: { x: 36, y }, end: { x: 650, y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 16;
  for (const row of payload.monthlyRows) {
    [row.month, money(row.ledgerSavings), money(row.ledgerBlackbox), money(row.opsSavings), money(row.opsBlackbox), money(row.variance)]
      .forEach((cell, i) => addText(page, cell, xs[i], y, 8.3, i === 5 ? bold : regular, i === 5 && Math.abs(row.variance) > 0 ? rgb(0.65, 0.16, 0.12) : rgb(0.12, 0.14, 0.18)));
    y -= 15;
  }

  const flagRows = payload.flags.slice().sort((a, b) => {
    const sev = { High: 0, Medium: 1, Low: 2 };
    return (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9) || String(a.date).localeCompare(String(b.date));
  });
  drawTable(
    doc,
    fonts,
    "Flagged Unexplained or Unreasonable Figures",
    ["Severity", "Date", "Bucket", "Amount", "Source", "Reason"],
    flagRows,
    [60, 72, 74, 80, 104, 380],
    (row) => [row.severity, row.date, row.bucket, money(row.amount), row.source, row.reason],
    34
  );

  drawTable(
    doc,
    fonts,
    "Matched Cash Activity Detail",
    ["Date", "Bucket", "Amount", "POS ID", "Ops ID", "Match"],
    payload.matches,
    [72, 76, 80, 124, 220, 198],
    (row) => [row.ledger.date, row.ledger.bucket, money(row.ledger.amount), row.ledger.id, row.operations.id, row.matchType],
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
      .gte("date", PERIOD_START)
      .lte("date", PERIOD_END)
      .order("date", { ascending: true })
  );
  const operationRows = await fetchAll(() =>
    supabase
      .from("operations_ledger")
      .select("*")
      .eq("shop_id", SHOP_ID)
      .gte("created_at", PERIOD_START)
      .lte("created_at", PERIOD_END)
      .order("created_at", { ascending: true })
  );

  const ledgerCandidates = ledgerRows.map(toLedgerActual).filter(Boolean);
  const operationsCandidates = operationRows.map(toOperationsActual).filter(Boolean);
  const excludedZeroLedger = ledgerCandidates.filter((row) => row.amount <= 0);
  const excludedZeroOperations = operationsCandidates.filter((row) => row.amount <= 0);
  const ledgerActuals = ledgerCandidates.filter((row) => row.amount > 0);
  const operationsActuals = operationsCandidates.filter((row) => row.amount > 0 && row.rawAmount > 0);
  const negativeOperations = operationsCandidates.filter((row) => row.rawAmount < 0);

  const usedOps = new Set();
  const matches = [];
  for (const ledger of ledgerActuals) {
    let idx = operationsActuals.findIndex((ops, i) =>
      !usedOps.has(i) &&
      ops.date === ledger.date &&
      ops.bucket === ledger.bucket &&
      Math.abs(ops.amount - ledger.amount) < 0.01
    );
    let matchType = "Exact date, bucket, and amount";
    if (idx === -1) {
      idx = operationsActuals.findIndex((ops, i) =>
        !usedOps.has(i) &&
        ops.bucket === ledger.bucket &&
        Math.abs(ops.amount - ledger.amount) < 0.01 &&
        daysBetween(ops.date, ledger.date) <= 2
      );
      matchType = "Same amount within two days";
    }
    if (idx !== -1) {
      usedOps.add(idx);
      matches.push({ ledger, operations: operationsActuals[idx], matchType });
    }
  }

  const matchedLedgerIds = new Set(matches.map((row) => row.ledger.id));
  const unmatchedLedger = ledgerActuals.filter((row) => !matchedLedgerIds.has(row.id));
  const unmatchedOperations = operationsActuals.filter((_, i) => !usedOps.has(i));

  const totals = {
    ledger: { Savings: 0, Blackbox: 0, total: 0, count: 0 },
    operations: { Savings: 0, Blackbox: 0, total: 0, count: 0 },
    matchedAmount: matches.reduce((sum, row) => sum + row.ledger.amount, 0),
    unmatchedLedgerAmount: unmatchedLedger.reduce((sum, row) => sum + row.amount, 0),
    unmatchedOperationsAmount: unmatchedOperations.reduce((sum, row) => sum + row.amount, 0),
  };
  for (const row of ledgerActuals) {
    totals.ledger[row.bucket] += row.amount;
    totals.ledger.total += row.amount;
    totals.ledger.count += 1;
  }
  for (const row of operationsActuals) {
    totals.operations[row.bucket] += row.amount;
    totals.operations.total += row.amount;
    totals.operations.count += 1;
  }

  const ledgerByMonth = {};
  const operationsByMonth = {};
  for (const row of ledgerActuals) pushTotal(ledgerByMonth, row.month, row);
  for (const row of operationsActuals) pushTotal(operationsByMonth, row.month, row);
  const months = Array.from(new Set([...Object.keys(ledgerByMonth), ...Object.keys(operationsByMonth)])).sort();
  const monthlyRows = months.map((m) => {
    const ledger = ledgerByMonth[m] || { Savings: 0, Blackbox: 0, total: 0 };
    const ops = operationsByMonth[m] || { Savings: 0, Blackbox: 0, total: 0 };
    return {
      month: m,
      ledgerSavings: ledger.Savings,
      ledgerBlackbox: ledger.Blackbox,
      ledgerTotal: ledger.total,
      opsSavings: ops.Savings,
      opsBlackbox: ops.Blackbox,
      opsTotal: ops.total,
      variance: ledger.total - ops.total,
    };
  });

  const allAmounts = [...ledgerActuals, ...operationsActuals].map((row) => row.amount).filter((amount) => amount > 0);
  const q1 = percentile(allAmounts, 0.25);
  const q3 = percentile(allAmounts, 0.75);
  const highAmountThreshold = Math.max(500, q3 + 1.5 * (q3 - q1));
  const duplicateKeys = new Map();
  for (const row of [...ledgerActuals, ...operationsActuals]) {
    const key = `${row.source}|${row.date}|${row.bucket}|${row.amount.toFixed(2)}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  }

  const flags = [];
  for (const row of unmatchedLedger) {
    flags.push({
      severity: "High",
      date: row.date,
      bucket: row.bucket,
      amount: row.amount,
      source: row.source,
      id: row.id,
      reason: "POS shows cash sent from Dub Dub, but no matching positive operations cash activity was found on the same date, same bucket and amount, or within two days.",
      detail: row.description,
    });
  }
  for (const row of unmatchedOperations) {
    flags.push({
      severity: "High",
      date: row.date,
      bucket: row.bucket,
      amount: row.amount,
      source: row.source,
      id: row.id,
      reason: "Operations shows cash activity for Dub Dub, but no matching POS ledger transfer was found.",
      detail: `${row.kind} ${row.title} ${row.notes}`.trim(),
    });
  }
  for (const row of matches.filter((row) => row.matchType !== "Exact date, bucket, and amount")) {
    flags.push({
      severity: "Medium",
      date: row.ledger.date,
      bucket: row.ledger.bucket,
      amount: row.ledger.amount,
      source: "POS ledger / Operations ledger",
      id: `${row.ledger.id} -> ${row.operations.id}`,
      reason: `Matched only by amount and bucket within two days. POS date ${row.ledger.date}; operations date ${row.operations.date}.`,
      detail: row.ledger.description,
    });
  }
  for (const row of [...ledgerActuals, ...operationsActuals].filter((row) => row.amount >= highAmountThreshold)) {
    flags.push({
      severity: "Medium",
      date: row.date,
      bucket: row.bucket,
      amount: row.amount,
      source: row.source,
      id: row.id,
      reason: `Amount is high versus the observed distribution. Outlier threshold used: ${money(highAmountThreshold)}.`,
      detail: row.description || `${row.kind || ""} ${row.title || ""} ${row.notes || ""}`.trim(),
    });
  }
  for (const row of [...ledgerActuals, ...operationsActuals]) {
    const key = `${row.source}|${row.date}|${row.bucket}|${row.amount.toFixed(2)}`;
    if ((duplicateKeys.get(key) || 0) > 1) {
      flags.push({
        severity: "Low",
        date: row.date,
        bucket: row.bucket,
        amount: row.amount,
        source: row.source,
        id: row.id,
        reason: "Same source, date, bucket, and amount appears more than once. This may be legitimate repeated cash movement, but it should be checked.",
        detail: row.description || `${row.kind || ""} ${row.title || ""} ${row.notes || ""}`.trim(),
      });
    }
  }
  for (const row of [...excludedZeroLedger, ...excludedZeroOperations]) {
    flags.push({
      severity: "Low",
      date: row.date,
      bucket: row.bucket,
      amount: row.amount,
      source: row.source,
      id: row.id,
      reason: "Zero-value row excluded from totals because it is not actual cash movement.",
      detail: row.description || `${row.kind || ""} ${row.title || ""} ${row.notes || ""}`.trim(),
    });
  }
  for (const row of negativeOperations) {
    flags.push({
      severity: "Medium",
      date: row.date,
      bucket: row.bucket,
      amount: row.rawAmount,
      source: row.source,
      id: row.id,
      reason: "Negative operations row found in the savings/black box classification. It is an outflow, not a Dub Dub cash-send deposit, so it is excluded from sent-to-operations totals.",
      detail: `${row.kind} ${row.title} ${row.notes}`.trim(),
    });
  }

  const executiveSummary = [
    `Dub Dub POS records show ${money(totals.ledger.total)} sent to Savings / Black Box from January 1 to July 31, 2026, but operations cash activity only shows ${money(totals.operations.total)} for the same shop and buckets.`,
    `The unexplained gap is ${money(totals.ledger.total - totals.operations.total)} before any manual correction: ${money(totals.unmatchedLedgerAmount)} is in POS with no matching operations cash activity, while ${money(totals.unmatchedOperationsAmount)} is in operations with no matching POS transfer.`,
    `Only ${matches.length} POS rows matched a positive operations cash row. ${unmatchedLedger.length} POS transfer rows and ${unmatchedOperations.length} operations cash rows need review.`,
    `Drift resets were excluded. Zero-value edit-history rows were also excluded from actual totals and listed only as low-priority data hygiene flags.`,
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    scope: {
      shopId: SHOP_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-07-31",
      exclusions: ["drift resets", "zero-value rows from actual cash totals", "negative operations rows from sent-to-operations totals"],
      matchRules: ["exact date + bucket + amount", "fallback: same bucket + amount within two days"],
    },
    sourceRowsScanned: {
      ledgerEntries: ledgerRows.length,
      operationsLedger: operationRows.length,
    },
    excludedRows: {
      driftResetLedger: ledgerRows.filter(isDriftReset).length,
      driftResetOperations: operationRows.filter(isDriftReset).length,
      zeroValueLedger: excludedZeroLedger.length,
      zeroValueOperations: excludedZeroOperations.length,
      negativeOperations: negativeOperations.length,
    },
    totals,
    monthlyRows,
    matches,
    unmatchedLedger,
    unmatchedOperations,
    flags,
    executiveSummary,
    highAmountThreshold,
  };

  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(payload, null, 2));
  const csvRows = [
    ["severity", "date", "bucket", "amount", "source", "id", "reason", "detail"],
    ...flags.map((row) => [row.severity, row.date, row.bucket, row.amount, row.source, row.id, row.reason, row.detail]),
  ];
  fs.writeFileSync(CSV_OUTPUT, csvRows.map((row) => row.map(csvEscape).join(",")).join("\n"));
  await buildPdf(payload);

  console.log(JSON.stringify({
    pdf: PDF_OUTPUT,
    json: JSON_OUTPUT,
    csv: CSV_OUTPUT,
    totals,
    sourceRowsScanned: payload.sourceRowsScanned,
    excludedRows: payload.excludedRows,
    flags: {
      high: flags.filter((row) => row.severity === "High").length,
      medium: flags.filter((row) => row.severity === "Medium").length,
      low: flags.filter((row) => row.severity === "Low").length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
