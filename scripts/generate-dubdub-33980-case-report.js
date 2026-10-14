const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");
const SOURCE_JSON = path.join(REPORT_DIR, "dubdub_33980_remainder_after_stock_breakdown.json");
const USE_OF_FUNDS_JSON = path.join(REPORT_DIR, "dubdub_operations_use_of_funds_jan_to_jul_31_2026.json");
const OUTPUT = path.join(REPORT_DIR, "Dub_Dub_33980_Operations_Consumption_Case_Report.pdf");

function money(value) {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value, denominator) {
  return `${((Number(value || 0) / Math.max(1, Number(denominator || 0))) * 100).toFixed(1)}%`;
}

function wrap(text, maxChars) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
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

function addText(page, text, x, y, size, font, color = rgb(0.08, 0.09, 0.11)) {
  page.drawText(String(text), { x, y, size, font, color });
}

function drawWrapped(page, text, x, y, size, font, color, maxChars, lineHeight) {
  for (const line of wrap(text, maxChars)) {
    addText(page, line, x, y, size, font, color);
    y -= lineHeight;
  }
  return y;
}

function drawPill(page, label, value, x, y, w, color, fonts) {
  page.drawRectangle({ x, y: y - 48, width: w, height: 48, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.84, 0.87, 0.9), borderWidth: 0.8 });
  addText(page, label, x + 10, y - 15, 8.5, fonts.bold, rgb(0.38, 0.41, 0.46));
  addText(page, value, x + 10, y - 37, 17, fonts.bold, color);
}

function drawTable(page, rows, headers, x, y, widths, fonts, options = {}) {
  const headerColor = rgb(0.18, 0.2, 0.24);
  headers.forEach((header, i) => addText(page, header, x + widths.slice(0, i).reduce((a, b) => a + b, 0), y, 8, fonts.bold, headerColor));
  y -= 10;
  page.drawLine({ start: { x, y }, end: { x: x + widths.reduce((a, b) => a + b, 0), y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 14;
  const rowHeight = options.rowHeight || 15;
  const maxRows = options.maxRows || rows.length;
  for (const row of rows.slice(0, maxRows)) {
    row.forEach((cell, i) => {
      const cellX = x + widths.slice(0, i).reduce((a, b) => a + b, 0);
      let text = String(cell ?? "");
      const max = Math.max(8, Math.floor(widths[i] / 5));
      if (text.length > max) text = `${text.slice(0, max - 3)}...`;
      addText(page, text, cellX, y, 7.6, i === row.length - 1 && options.boldLast ? fonts.bold : fonts.regular, rgb(0.12, 0.14, 0.18));
    });
    y -= rowHeight;
  }
  return y;
}

function groupTopRows(rows) {
  return rows.map((row) => [
    row.date,
    row.shop,
    row.category,
    money(row.amount),
    row.title,
  ]);
}

async function main() {
  const core = JSON.parse(fs.readFileSync(SOURCE_JSON, "utf8"));
  const useOfFunds = JSON.parse(fs.readFileSync(USE_OF_FUNDS_JSON, "utf8"));
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const navy = rgb(0.05, 0.16, 0.28);
  const red = rgb(0.63, 0.14, 0.11);
  const green = rgb(0.05, 0.34, 0.22);

  const page = doc.addPage([842, 595]);
  addText(page, "Dub Dub $33,980 Operations Consumption Case", 36, 550, 22, bold, navy);
  addText(page, "January 1, 2026 to July 31, 2026 | Drift resets and broad Operations outflows excluded from this case", 36, 526, 9.5, regular, rgb(0.32, 0.35, 0.4));

  addText(page, "Executive Summary", 36, 492, 14, bold, navy);
  let y = 470;
  const summary = [
    `The case is that Dub Dub sent ${money(core.dubDubPool)} into Operations and ${money(core.dubDubPool - core.unresolved)} of that pool is consumed by labelled Operations activity.`,
    `Stock orders account for ${money(core.stockOrders)}, or ${pct(core.stockOrders, core.dubDubPool)} of the Dub Dub pool.`,
    `The remaining non-stock labelled usage is ${money(core.nonStockLabelled)}, leaving only ${money(core.unresolved)} numerically unresolved inside the ${money(core.dubDubPool)} pool.`,
    "The risk is not that the full amount is mathematically missing. The risk is that too much of the non-stock spend is weakly described, including named payouts, rounds, banking, rent, and balance entries."
  ];
  for (const item of summary) {
    y = drawWrapped(page, `- ${item}`, 48, y, 9.2, regular, rgb(0.1, 0.12, 0.16), 118, 12);
    y -= 3;
  }

  y -= 6;
  drawPill(page, "Dub Dub pool", money(core.dubDubPool), 36, y, 170, navy, fonts);
  drawPill(page, "Stock orders", money(core.stockOrders), 220, y, 170, green, fonts);
  drawPill(page, "Other labelled use", money(core.nonStockLabelled), 404, y, 170, rgb(0.28, 0.21, 0.05), fonts);
  drawPill(page, "Unresolved", money(core.unresolved), 588, y, 170, red, fonts);

  y -= 82;
  addText(page, "How the $33,980 Was Consumed", 36, y, 14, bold, navy);
  y -= 12;
  page.drawRectangle({ x: 36, y: y - 28, width: 724 * (core.stockOrders / core.dubDubPool), height: 24, color: rgb(0.1, 0.48, 0.32) });
  page.drawRectangle({ x: 36 + 724 * (core.stockOrders / core.dubDubPool), y: y - 28, width: 724 * (core.nonStockLabelled / core.dubDubPool), height: 24, color: rgb(0.86, 0.61, 0.2) });
  page.drawRectangle({ x: 36 + 724 * ((core.stockOrders + core.nonStockLabelled) / core.dubDubPool), y: y - 28, width: Math.max(2, 724 * (core.unresolved / core.dubDubPool)), height: 24, color: rgb(0.76, 0.2, 0.18) });
  addText(page, `Stock orders ${money(core.stockOrders)}`, 44, y - 45, 8, regular, rgb(0.12, 0.14, 0.18));
  addText(page, `Other labelled use ${money(core.nonStockLabelled)}`, 300, y - 45, 8, regular, rgb(0.12, 0.14, 0.18));
  addText(page, `Unresolved ${money(core.unresolved)}`, 620, y - 45, 8, regular, rgb(0.12, 0.14, 0.18));

  const page2 = doc.addPage([842, 595]);
  addText(page2, "The Remainder After Stock Was Mostly Operational Spend", 36, 552, 18, bold, navy);
  let y2 = 526;
  y2 = drawWrapped(
    page2,
    `After stock orders, ${money(core.remainingAfterStock)} remained. Labelled non-stock payments explain ${money(core.nonStockLabelled)} of that amount, leaving ${money(core.unresolved)} unresolved. This is why the case should focus on spend control and proof, not only missing cash.`,
    36,
    y2,
    9.5,
    regular,
    rgb(0.1, 0.12, 0.16),
    122,
    12
  );
  y2 -= 18;
  const breakdownRows = core.breakdown.map((row) => [row.category, row.count, money(row.amount), pct(row.amount, core.dubDubPool)]);
  drawTable(page2, breakdownRows, ["Use", "Rows", "Amount", "Share of $33,980"], 36, y2, [240, 70, 110, 120], fonts, { boldLast: false });

  const page3 = doc.addPage([842, 595]);
  addText(page3, "Evidence Rows Supporting the Case", 36, 552, 18, bold, navy);
  let y3 = 526;
  y3 = drawWrapped(
    page3,
    "These are the largest non-stock payment rows that consume the remainder. Rows like Round, Balance, named payouts, and Banking need receipts or clearer explanations even when the arithmetic balances.",
    36,
    y3,
    9.5,
    regular,
    rgb(0.1, 0.12, 0.16),
    122,
    12
  );
  y3 -= 18;
  drawTable(
    page3,
    groupTopRows(core.topNonStockRows.slice(0, 24)),
    ["Date", "Shop", "Use", "Amount", "Label"],
    36,
    y3,
    [72, 78, 130, 84, 390],
    fonts,
    { maxRows: 24 }
  );

  const page4 = doc.addPage([842, 595]);
  addText(page4, "Case Position and Required Follow-Up", 36, 552, 18, bold, navy);
  let y4 = 526;
  const casePoints = [
    `Case position: the business consumed ${money(core.dubDubPool - core.unresolved)} of the ${money(core.dubDubPool)} Dub Dub Operations pool through recorded labelled activity.`,
    `Stock orders are the biggest use at ${money(core.stockOrders)}. That part should be checked against stock received, supplier receipts, and inventory movement.`,
    `The non-stock remainder is not one clean business line. It is spread across rent/overhead, banking/tax, supplier payables, salaries, utilities, transport, groceries, and many small named or balance entries.`,
    `The weak point is control evidence. The ledger descriptions are enough to show consumption, but not enough to prove every payout was reasonable or properly authorised.`,
  ];
  for (const point of casePoints) {
    y4 = drawWrapped(page4, `- ${point}`, 48, y4, 9.5, regular, rgb(0.1, 0.12, 0.16), 118, 13);
    y4 -= 5;
  }

  y4 -= 10;
  addText(page4, "Recommended Next Steps", 36, y4, 14, bold, navy);
  y4 -= 22;
  const steps = [
    "Attach receipts or proof for every stock order over $500.",
    "Force all Operations payouts to use a clear category instead of generic labels like Round, Balance, or a person name only.",
    "Review the named payouts and banking/rent rows with the owner and mark each as approved, rejected, or needs receipt.",
    "Treat the $100.99 unresolved balance as a small numeric open item, but treat weak documentation on the $16,142.01 non-stock spend as the main control issue.",
  ];
  for (const step of steps) {
    y4 = drawWrapped(page4, `- ${step}`, 48, y4, 9.2, regular, rgb(0.1, 0.12, 0.16), 118, 12);
    y4 -= 4;
  }

  y4 -= 8;
  addText(page4, "Caveat", 36, y4, 14, bold, navy);
  y4 -= 20;
  drawWrapped(
    page4,
    "This report caps the case at the Dub Dub $33,980 pool and ignores broader Operations outflows above that amount. Operations cash is pooled, so this is a defensible use-of-funds allocation based on labelled activity, not a direct bank-style tracing of each dollar note.",
    36,
    y4,
    9.2,
    regular,
    rgb(0.1, 0.12, 0.16),
    122,
    12
  );

  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    addText(p, `Page ${idx + 1} of ${pages.length}`, 744, 24, 8, regular, rgb(0.45, 0.48, 0.52));
    addText(p, "Source: Supabase POS ledger and Operations ledger extracts generated in Nirvana reports folder", 36, 24, 7.5, regular, rgb(0.45, 0.48, 0.52));
  });

  fs.writeFileSync(OUTPUT, await doc.save());
  console.log(JSON.stringify({
    output: OUTPUT,
    dubDubPool: core.dubDubPool,
    stockOrders: core.stockOrders,
    nonStockLabelled: core.nonStockLabelled,
    unresolved: core.unresolved,
    pages: pages.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
