const fs = require("fs");
const path = require("path");
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default || require("jspdf-autotable");

const reportData = JSON.parse(fs.readFileSync(path.join(__dirname, "../reports/may_june_accurate_financials.json"), "utf8"));

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value || 0));
}

function generatePDF() {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  const periods = ["May 2026", "June 2026"];
  const shops = ["Consolidated (All Shops)", "Kipasa Branch", "Dubdub Outlet", "Trade Center HQ", "Nirvana Tees"];

  let isFirstPage = true;

  for (const period of periods) {
    for (const shopName of shops) {
      const data = reportData[period]?.[shopName];
      if (!data) continue;

      if (!isFirstPage) doc.addPage();
      isFirstPage = false;

      // Header
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 25, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`NIRVANA POS FINANCIAL STATEMENTS`, 14, 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${shopName.toUpperCase()} — ${period.toUpperCase()} (STRICT POS & PERFUMES ONLY)`, 14, 18);

      let currentY = 32;

      // --- 1. INCOME STATEMENT TABLE ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(16, 185, 129); // emerald-500
      doc.text("1. INCOME STATEMENT (P&L)", 14, currentY);

      const is = data.incomeStatement;
      const isBody = [
        ["Gross Sales Revenue (POS Sales)", formatMoney(is.grossSalesRevenue)],
        ["Less: Cost of Goods Sold (COGS)", `(${formatMoney(is.cogs)})`],
        ["Gross Profit", formatMoney(is.grossProfit)],
        ["Gross Margin %", `${is.grossMarginPercent.toFixed(2)}%`],
        ["Less: Operating Overhead (Rent, ZESA, Wifi, Transport, Supplies)", `(${formatMoney(is.operatingOverhead)})`],
        ["Less: Staff Salaries & Payroll", `(${formatMoney(is.salaries)})`],
        ["Total Operating Expenses", `(${formatMoney(is.totalOperatingExpenses)})`],
        ["Operating Profit (EBIT)", formatMoney(is.operatingProfit)],
        ["Less: Personal Drawings, Groceries & Tithes", `(${formatMoney(is.nonOperatingExpenses)})`],
        ["NET INCOME", formatMoney(is.netIncome)],
      ];

      autoTable(doc, {
        startY: currentY + 3,
        head: [["Financial Line Item", "Amount (USD)"]],
        body: isBody,
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: { 0: { cellWidth: 180 }, 1: { halign: "right", cellWidth: 70 } },
        margin: { left: 14, right: 14 },
      });

      currentY = doc.lastAutoTable.finalY + 8;

      // --- 2. CASH FLOW STATEMENT TABLE ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(59, 130, 246); // blue-500
      doc.text("2. CASH FLOW STATEMENT (POS CASH DRAWER)", 14, currentY);

      const cf = data.cashFlowStatement;
      const cfBody = [
        ["Operating Activities: Cash Sales & Lay-by Receipts Collected", formatMoney(cf.cashReceivedFromSales)],
        ["Operating Activities: Less Cash Paid for Operating Expenses", `(${formatMoney(cf.cashPaidOperatingExpenses)})`],
        ["Net Cash Flow from Operating Activities", formatMoney(cf.netCashFromOperatingActivities)],
        ["Investing Activities: Cash Spent on Direct POS Stock Purchases", `(${formatMoney(cf.cashPaidStockPurchases)})`],
        ["Investing Activities: Cash Transferred to Perfumes Investment Pool", `(${formatMoney(cf.cashTransferredToPerfumesPool)})`],
        ["Net Cash Flow from Investing Activities", formatMoney(cf.netCashFromInvestingActivities)],
        ["Financing Activities: Cash Transferred to Vault / Blackbox / Bank", `(${formatMoney(cf.cashTransferredToVaultSavings)})`],
        ["Financing Activities: Owner Personal Drawings, Groceries & Tithes", `(${formatMoney(cf.cashPersonalDrawingsAndTithes)})`],
        ["Net Cash Flow from Financing Activities", formatMoney(cf.netCashFromFinancingActivities)],
        ["NET CHANGE IN CASH DRAWER", formatMoney(cf.netChangeInCash)],
        ["Beginning Cash Drawer Opening Balance", formatMoney(cf.openingCashDrawerTotal)],
        ["ENDING CASH IN DRAWER", formatMoney(cf.endingCashInDrawer)],
      ];

      autoTable(doc, {
        startY: currentY + 3,
        head: [["Cash Flow Line Item", "Amount (USD)"]],
        body: cfBody,
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: { 0: { cellWidth: 180 }, 1: { halign: "right", cellWidth: 70 } },
        margin: { left: 14, right: 14 },
      });

      currentY = doc.lastAutoTable.finalY + 8;

      // Check remaining space for Balance Sheet
      if (currentY > 140) {
        doc.addPage();
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 25, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(`NIRVANA POS FINANCIAL STATEMENTS`, 14, 11);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`${shopName.toUpperCase()} — ${period.toUpperCase()} (BALANCE SHEET)`, 14, 18);
        currentY = 32;
      }

      // --- 3. BALANCE SHEET TABLE ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(139, 92, 246); // violet-500
      doc.text("3. BALANCE SHEET (SNAPSHOT AT PERIOD END)", 14, currentY);

      const bs = data.balanceSheet;
      const bsBody = [
        ["Current Assets: Ending Cash in POS Drawers", formatMoney(bs.endingCashInDrawer)],
        ["Current Assets: Cumulative Perfume Investment Capital Held", formatMoney(bs.cumulativePerfumeAvailable)],
        ["Current Assets: Inventory Asset Valuation (Landed Cost)", formatMoney(bs.currentInventoryValuation)],
        ["TOTAL ASSETS", formatMoney(bs.totalCurrentAssets)],
        ["Current Liabilities: Cumulative Lay-by Deposit Liabilities Held", formatMoney(bs.cumulativeLaybyLiability)],
        ["Owner's Equity & Retained Capital", formatMoney(bs.ownerEquity)],
        ["TOTAL LIABILITIES AND OWNER'S EQUITY", formatMoney(bs.totalLiabilitiesAndEquity)],
      ];

      autoTable(doc, {
        startY: currentY + 3,
        head: [["Balance Sheet Category", "Amount (USD)"]],
        body: bsBody,
        theme: "grid",
        headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: { 0: { cellWidth: 180 }, 1: { halign: "right", cellWidth: 70 } },
        margin: { left: 14, right: 14 },
      });
    }
  }

  const outputPath = path.join(__dirname, "../reports/May_June_2026_POS_Financial_Statements.pdf");
  doc.save(outputPath);
  console.log(`Saved clean PDF to ${outputPath}`);

  const desktopPath = path.join(process.env.USERPROFILE || process.env.HOME || "C:\\Users\\ashjx", "Desktop", "May_June_2026_POS_Financial_Statements.pdf");
  doc.save(desktopPath);
  console.log(`Saved copy to Desktop: ${desktopPath}`);
}

generatePDF();
