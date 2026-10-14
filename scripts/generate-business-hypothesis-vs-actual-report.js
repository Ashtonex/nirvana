const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, "reports");
const DESKTOP = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Desktop");
const CORE_PATH = path.join(REPORTS, "dubdub_33980_remainder_after_stock_breakdown.json");
const OUTPUT = path.join(DESKTOP, "Hypothesis_How_Business_Should_Be_Running_vs_Actual.pdf");
const COPY_OUTPUT = path.join(REPORTS, "Hypothesis_How_Business_Should_Be_Running_vs_Actual.pdf");
const JSON_OUTPUT = path.join(REPORTS, "hypothesis_how_business_should_be_running_vs_actual.json");

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

function drawMetric(page, label, value, x, y, w, fonts, color) {
  page.drawRectangle({ x, y: y - 52, width: w, height: 52, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.84, 0.87, 0.9), borderWidth: 0.8 });
  addText(page, label, x + 10, y - 16, 8.3, fonts.bold, rgb(0.37, 0.41, 0.46));
  addText(page, value, x + 10, y - 40, 16, fonts.bold, color);
}

function drawTable(page, rows, headers, x, y, widths, fonts, opts = {}) {
  headers.forEach((header, i) => addText(page, header, x + widths.slice(0, i).reduce((a, b) => a + b, 0), y, 8, fonts.bold, rgb(0.18, 0.2, 0.24)));
  y -= 10;
  page.drawLine({ start: { x, y }, end: { x: x + widths.reduce((a, b) => a + b, 0), y }, thickness: 0.7, color: rgb(0.75, 0.78, 0.82) });
  y -= 14;
  for (const row of rows) {
    row.forEach((cell, i) => {
      let text = String(cell ?? "");
      const max = Math.max(8, Math.floor(widths[i] / 5));
      if (text.length > max) text = `${text.slice(0, max - 3)}...`;
      const color = opts.varianceColumn === i && Number(row[i]) < 0 ? rgb(0.65, 0.14, 0.11) : rgb(0.12, 0.14, 0.18);
      addText(page, text, x + widths.slice(0, i).reduce((a, b) => a + b, 0), y, 7.6, opts.boldLast && i === row.length - 1 ? fonts.bold : fonts.regular, color);
    });
    y -= opts.rowHeight || 15;
  }
  return y;
}

function categoryAmount(core, name) {
  const row = core.breakdown.find((item) => item.category === name);
  return row ? Number(row.amount || 0) : 0;
}

async function main() {
  const core = JSON.parse(fs.readFileSync(CORE_PATH, "utf8"));
  const months = 7;

  const hypothesis = {
    months,
    monthlyDubDubTransfer: 4500,
    totalDubDubTransfer: 31500,
    monthlyRunningCost: 3000,
    totalRunningCost: 21000,
    preTaxSurplus: 10500,
    taxRate: 0.155,
    tax: 1627.5,
    afterTaxSurplus: 8872.5,
    monthlyRentProvision: 2000,
    totalRentProvision: 14000,
    monthlyRentPaid: 1200,
    totalRentPaid: 8400,
    rentExtra: 5600,
    expectedRetained: 14472.5,
  };

  const actual = {
    dubDubPool: core.dubDubPool,
    stockOrders: core.stockOrders,
    otherLabelledPayout: categoryAmount(core, "Other labelled payout"),
    supplierPayables: categoryAmount(core, "Supplier / payables"),
    salaries: categoryAmount(core, "Salaries / wages"),
    utilities: categoryAmount(core, "Utilities"),
    transport: categoryAmount(core, "Transport"),
    groceries: categoryAmount(core, "Groceries"),
    investPerfumes: categoryAmount(core, "Invest / perfumes"),
    taxBanking: categoryAmount(core, "Tax / banking"),
    rentPaid: categoryAmount(core, "Rent / overhead"),
    visibleRemainder: core.unresolved,
  };
  actual.otherOperating = actual.otherLabelledPayout + actual.supplierPayables + actual.salaries + actual.utilities + actual.transport + actual.groceries + actual.investPerfumes;
  actual.runningCostComparable = actual.stockOrders + actual.otherOperating;
  actual.preTaxSurplus = actual.dubDubPool - actual.runningCostComparable;
  actual.modelTaxOnActualSurplus = Math.max(0, actual.preTaxSurplus * hypothesis.taxRate);
  actual.afterModelTaxSurplus = actual.preTaxSurplus - actual.modelTaxOnActualSurplus;
  actual.actualRentExtraIfRingfenced = hypothesis.totalRentProvision - actual.rentPaid;
  actual.modeledRetainedIfRentRingfenced = actual.afterModelTaxSurplus + actual.actualRentExtraIfRingfenced;
  actual.visibleCashAfterLabelledUses = actual.dubDubPool - actual.runningCostComparable - actual.taxBanking - actual.rentPaid;

  const variance = {
    expectedRetainedVsVisibleCash: actual.visibleCashAfterLabelledUses - hypothesis.expectedRetained,
    inflow: actual.dubDubPool - hypothesis.totalDubDubTransfer,
    runningCost: actual.runningCostComparable - hypothesis.totalRunningCost,
    taxBanking: actual.taxBanking - hypothesis.tax,
    rentPaid: actual.rentPaid - hypothesis.totalRentPaid,
    modeledRetainedIfRingfencedGap: actual.modeledRetainedIfRentRingfenced - hypothesis.expectedRetained,
    missingRentReserveControl: hypothesis.totalRentProvision,
  };

  const payload = { generatedAt: new Date().toISOString(), hypothesis, actual, variance, source: CORE_PATH };
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(payload, null, 2));

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const navy = rgb(0.05, 0.16, 0.28);
  const red = rgb(0.65, 0.14, 0.11);
  const green = rgb(0.04, 0.34, 0.2);
  const amber = rgb(0.55, 0.36, 0.06);

  const page = doc.addPage([842, 595]);
  addText(page, "Hypothesis: How the Business Should Be Running", 36, 550, 22, bold, navy);
  addText(page, "Dub Dub model vs actual Operations usage | January 1, 2026 to July 31, 2026", 36, 526, 9.5, regular, rgb(0.32, 0.35, 0.4));

  addText(page, "Executive Summary", 36, 492, 14, bold, navy);
  let y = 470;
  const summary = [
    `Your model says the business should retain ${money(hypothesis.expectedRetained)} after seven months: ${money(hypothesis.afterTaxSurplus)} after tax plus ${money(hypothesis.rentExtra)} rental excess.`,
    `Actual labelled activity leaves only ${money(actual.visibleCashAfterLabelledUses)} visible from the Dub Dub pool after running costs, tax/banking, and rent/overhead payments.`,
    `The plot is being lost in two places: running costs are ${money(actual.runningCostComparable - hypothesis.totalRunningCost)} over the model, and the ${money(hypothesis.totalRentProvision)} rental provision is not visibly ring-fenced as a reserve.`,
    `If the rental provision had really been separated, the model would still be close: actual retained value would be ${money(actual.modeledRetainedIfRentRingfenced)}, only ${money(Math.abs(variance.modeledRetainedIfRingfencedGap))} away from the hypothesis.`
  ];
  for (const item of summary) {
    y = drawWrapped(page, `- ${item}`, 48, y, 9.2, regular, rgb(0.1, 0.12, 0.16), 118, 12);
    y -= 3;
  }

  y -= 6;
  drawMetric(page, "Expected retained", money(hypothesis.expectedRetained), 36, y, 170, fonts, green);
  drawMetric(page, "Actual visible left", money(actual.visibleCashAfterLabelledUses), 220, y, 170, fonts, red);
  drawMetric(page, "Running cost overrun", money(actual.runningCostComparable - hypothesis.totalRunningCost), 404, y, 170, fonts, amber);
  drawMetric(page, "Rent reserve not visible", money(hypothesis.totalRentProvision), 588, y, 170, fonts, red);

  y -= 88;
  addText(page, "Hypothetical Model", 36, y, 14, bold, navy);
  y -= 22;
  drawTable(page, [
    ["Dub Dub transfer", `${money(hypothesis.monthlyDubDubTransfer)} x 7`, money(hypothesis.totalDubDubTransfer)],
    ["Running costs", `${money(hypothesis.monthlyRunningCost)} x 7`, `-${money(hypothesis.totalRunningCost)}`],
    ["Pre-tax surplus", "", money(hypothesis.preTaxSurplus)],
    ["Tax at 15.5%", "", `-${money(hypothesis.tax)}`],
    ["After-tax surplus", "", money(hypothesis.afterTaxSurplus)],
    ["Rental extra", `${money(hypothesis.monthlyRentProvision)} - ${money(hypothesis.monthlyRentPaid)} x 7`, money(hypothesis.rentExtra)],
    ["Expected retained", "", money(hypothesis.expectedRetained)],
  ], ["Line", "Calculation", "Amount"], 36, y, [240, 250, 120], fonts, { boldLast: true });

  const page2 = doc.addPage([842, 595]);
  addText(page2, "Actual Analysis Following the Same Model", 36, 552, 18, bold, navy);
  let y2 = 526;
  y2 = drawWrapped(page2, "This uses the same logic as the hypothesis, but replaces the assumptions with labelled Dub Dub and Operations activity already identified in the case analysis.", 36, y2, 9.5, regular, rgb(0.1, 0.12, 0.16), 122, 12);
  y2 -= 18;
  drawTable(page2, [
    ["Actual Dub Dub pool", "Savings + Black Box", money(actual.dubDubPool), money(actual.dubDubPool - hypothesis.totalDubDubTransfer)],
    ["Stock orders", "Actual labelled stock", `-${money(actual.stockOrders)}`, ""],
    ["Other operating", "Payouts, payables, salaries, utilities, transport, groceries", `-${money(actual.otherOperating)}`, ""],
    ["Comparable running costs", "Stock + other operating", `-${money(actual.runningCostComparable)}`, `-${money(actual.runningCostComparable - hypothesis.totalRunningCost)}`],
    ["Tax / banking", "Actual labelled tax and banking", `-${money(actual.taxBanking)}`, `-${money(actual.taxBanking - hypothesis.tax)}`],
    ["Rent / overhead paid", "Actual labelled rent/overhead", `-${money(actual.rentPaid)}`, money(hypothesis.totalRentPaid - actual.rentPaid)],
    ["Visible cash left", "Pool less labelled uses", money(actual.visibleCashAfterLabelledUses), `-${money(hypothesis.expectedRetained - actual.visibleCashAfterLabelledUses)}`],
  ], ["Line", "Basis", "Actual", "Vs model"], 36, y2, [170, 310, 105, 105], fonts, { boldLast: false, rowHeight: 18 });

  const page3 = doc.addPage([842, 595]);
  addText(page3, "Where the Plot Is Being Lost", 36, 552, 18, bold, navy);
  let y3 = 526;
  const plot = [
    `Running costs are too high. The model allows ${money(hypothesis.totalRunningCost)} for stock, salaries, and other expenses. Actual comparable running costs are ${money(actual.runningCostComparable)}, which is ${money(actual.runningCostComparable - hypothesis.totalRunningCost)} over budget.`,
    `The rental provision is the main control failure. The model assumes ${money(hypothesis.totalRentProvision)} is put away for rentals. Actual rent/overhead paid is ${money(actual.rentPaid)}, so ${money(actual.actualRentExtraIfRingfenced)} should be sitting somewhere if the reserve was real.`,
    `That reserve is not visible in the cash outcome. After all labelled uses, only ${money(actual.visibleCashAfterLabelledUses)} remains visible from the Dub Dub pool.`,
    `Tax and banking are mixed. The model's tax is ${money(hypothesis.tax)}, while actual tax/banking labels total ${money(actual.taxBanking)}. Banking should be separated from tax because it can hide ordinary cash movement.`,
  ];
  for (const item of plot) {
    y3 = drawWrapped(page3, `- ${item}`, 48, y3, 9.5, regular, rgb(0.1, 0.12, 0.16), 118, 13);
    y3 -= 6;
  }

  y3 -= 8;
  addText(page3, "Actual Cost Breakdown", 36, y3, 14, bold, navy);
  y3 -= 22;
  drawTable(page3, [
    ["Stock orders", money(actual.stockOrders), pct(actual.stockOrders, actual.dubDubPool)],
    ["Other labelled payouts", money(actual.otherLabelledPayout), pct(actual.otherLabelledPayout, actual.dubDubPool)],
    ["Supplier / payables", money(actual.supplierPayables), pct(actual.supplierPayables, actual.dubDubPool)],
    ["Salaries / wages", money(actual.salaries), pct(actual.salaries, actual.dubDubPool)],
    ["Utilities / transport / groceries / tiny invest row", money(actual.utilities + actual.transport + actual.groceries + actual.investPerfumes), pct(actual.utilities + actual.transport + actual.groceries + actual.investPerfumes, actual.dubDubPool)],
    ["Tax / banking", money(actual.taxBanking), pct(actual.taxBanking, actual.dubDubPool)],
    ["Rent / overhead paid", money(actual.rentPaid), pct(actual.rentPaid, actual.dubDubPool)],
    ["Visible remainder", money(actual.visibleCashAfterLabelledUses), pct(actual.visibleCashAfterLabelledUses, actual.dubDubPool)],
  ], ["Use", "Amount", "Share of pool"], 36, y3, [320, 140, 120], fonts, { rowHeight: 17 });

  const page4 = doc.addPage([842, 595]);
  addText(page4, "Case Conclusion and Controls Needed", 36, 552, 18, bold, navy);
  let y4 = 526;
  const conclusion = [
    "The business can look close to the hypothesis only if the rental provision is treated as a real separate reserve.",
    `Without a visible reserve, the practical cash result is ${money(actual.visibleCashAfterLabelledUses)}, not ${money(hypothesis.expectedRetained)}.`,
    "The immediate control question is: where is the rental reserve account or physical cash box that proves the monthly $2,000 was actually put away?",
    "The second control question is why running costs exceeded the model by almost $6,000 despite inflow being above plan.",
  ];
  for (const item of conclusion) {
    y4 = drawWrapped(page4, `- ${item}`, 48, y4, 9.5, regular, rgb(0.1, 0.12, 0.16), 118, 13);
    y4 -= 6;
  }
  y4 -= 10;
  addText(page4, "Required Next Steps", 36, y4, 14, bold, navy);
  y4 -= 22;
  const steps = [
    "Create a separate rental reserve ledger and reconcile it monthly.",
    "Split tax from banking in Operations entries. Do not allow a combined tax/banking bucket.",
    "Require receipts for stock orders and any non-stock payout over $100.",
    "Review the other labelled payout bucket because it is too large to be treated as harmless miscellaneous spending.",
    "Track the model monthly: transfer target, running-cost cap, tax provision, rent reserve, actual rent paid, and retained cash."
  ];
  for (const step of steps) {
    y4 = drawWrapped(page4, `- ${step}`, 48, y4, 9.2, regular, rgb(0.1, 0.12, 0.16), 118, 12);
    y4 -= 4;
  }
  y4 -= 8;
  addText(page4, "Assumption", 36, y4, 14, bold, navy);
  y4 -= 20;
  drawWrapped(page4, "The actual comparison is capped to the Dub Dub $33,980 case base already established in the prior report. It does not use broader Operations outflows above that amount.", 36, y4, 9.2, regular, rgb(0.1, 0.12, 0.16), 122, 12);

  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    addText(p, `Page ${idx + 1} of ${pages.length}`, 744, 24, 8, regular, rgb(0.45, 0.48, 0.52));
    addText(p, "Source: Dub Dub $33,980 case breakdown and Operations labelled-use analysis", 36, 24, 7.5, regular, rgb(0.45, 0.48, 0.52));
  });

  const bytes = await doc.save();
  fs.mkdirSync(DESKTOP, { recursive: true });
  fs.writeFileSync(OUTPUT, bytes);
  fs.writeFileSync(COPY_OUTPUT, bytes);
  console.log(JSON.stringify({ output: OUTPUT, copy: COPY_OUTPUT, json: JSON_OUTPUT, pages: pages.length, hypothesis, actual, variance }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
