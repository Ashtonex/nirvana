import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { getOperationsVaultImpact, isOverheadContributionKind, isOverheadPaymentKind } from "@/lib/operations";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function startOfDaysBackUTC(daysBack: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, Number(daysBack || 7)));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfPeriodUTC(period: string, daysBack: number) {
  const d = new Date();
  if (period === "day") {
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "week") {
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "month") {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "year") {
    d.setUTCMonth(0, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return startOfDaysBackUTC(daysBack);
}

function periodLabel(period: string, daysBack: number) {
  const labels: Record<string, string> = {
    day: "Today",
    week: "This Week",
    month: "This Month",
    year: "This Year",
  };
  return labels[period] || `Last ${daysBack} Days`;
}

function winAnsiSafe(text: any) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKD");
  let out = "";
  for (const ch of normalized) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp <= 0x7e) { out += ch; continue; }
    if (ch === "’" || ch === "‘") { out += "'"; continue; }
    if (ch === "“" || ch === "”") { out += "\""; continue; }
    if (ch === "–" || ch === "—") { out += "-"; continue; }
    if (ch === "•") { out += "-"; continue; }
    if (ch === "…") { out += "..."; continue; }
    if (cp >= 0xa0 && cp <= 0xff) { out += ch; }
  }
  return out;
}

const COLORS = {
  header: rgb(0.1, 0.1, 0.4),
  primary: rgb(0.1, 0.4, 0.7),
  profit: rgb(0.1, 0.5, 0.2),
  expense: rgb(0.8, 0.1, 0.1),
  neutral: rgb(0.4, 0.4, 0.4),
};

async function generateOperationsPDF(daysBack: number, data: {
  ledger: any[];
  investDeposits: any[];
  sales: any[];
  shops: any[];
  periodLabel: string;
}) {
  const pdf = await PDFDocument.create();
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  const drawText = (text: string, size = 10, bold = false, color = rgb(0, 0, 0), x = margin) => {
    page.drawText(winAnsiSafe(text), { x, y, size, font: bold ? fontBold : font, color });
    y -= (size + 6);
  };

  const drawLine = (color = rgb(0.8, 0.8, 0.8), thickness = 1) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness,
      color
    });
    y -= 15;
  };

  const ensureSpace = (minY = 100) => {
    if (y < minY) {
      page = pdf.addPage(pageSize);
      y = height - margin;
    }
  };

  // Header
  const vaultImpact = data.ledger.reduce((s, row) => s + getOperationsVaultImpact(row), 0);
  const vaultIn = data.ledger.reduce((s, row) => {
    const impact = getOperationsVaultImpact(row);
    return impact > 0 ? s + impact : s;
  }, 0);
  const vaultOut = Math.abs(data.ledger.reduce((s, row) => {
    const impact = getOperationsVaultImpact(row);
    return impact < 0 ? s + impact : s;
  }, 0));
  const overheadContributions = data.ledger.filter((l) => isOverheadContributionKind(l.kind));
  const overheadPayments = data.ledger.filter((l) => isOverheadPaymentKind(l.kind) && l.shop_id);
  const overheadIn = overheadContributions.reduce((s, l) => s + (Number(l.amount || 0) > 0 ? Number(l.amount || 0) : 0), 0);
  const overheadPaid = Math.abs(data.ledger.filter((l: any) => isOverheadPaymentKind(l.kind) || (isOverheadContributionKind(l.kind) && Number(l.amount || 0) < 0)).reduce((s: number, l: any) => s + Number(l.amount || 0), 0));
  const overheadNet = overheadIn - overheadPaid;

  drawText("NIRVANA OPERATIONS REPORT", 20, true, COLORS.header);
  drawText(`Period: ${data.periodLabel} | Generated: ${new Date().toLocaleString()}`, 10, false, COLORS.neutral);
  y -= 20;
  drawLine(COLORS.header, 2);

  // 1. FINANCIAL SUMMARY
  const totalInvest = data.investDeposits.reduce((s, d) => s + Number(d.amount), 0);
  
  drawText("1. EXECUTIVE SUMMARY", 14, true, COLORS.primary);
  drawText(`Master Vault In: $${vaultIn.toFixed(2)}`, 11, true, COLORS.profit);
  drawText(`Master Vault Out: -$${vaultOut.toFixed(2)}`, 11, true, COLORS.expense);
  drawText(`Net Master Vault Movement: $${vaultImpact.toFixed(2)}`, 11, true, vaultImpact >= 0 ? COLORS.profit : COLORS.expense);
  drawText(`Shop Overhead Held: $${overheadNet.toFixed(2)} (${overheadIn.toFixed(2)} set aside - ${overheadPaid.toFixed(2)} paid)`, 10, false, COLORS.neutral);
  y -= 10;
  drawText(`Total Investment Capital: $${totalInvest.toFixed(2)}`, 11, true, COLORS.primary);
  y -= 20;

  // 2. INVESTMENT DETAIL
  ensureSpace(200);
  drawText("2. INVESTMENT & ASSET GROWTH", 14, true, COLORS.primary);
  if (data.investDeposits.length === 0) {
    drawText("No investment deposits recorded in this period.", 10, false, COLORS.neutral);
  } else {
    data.investDeposits.forEach(d => {
      ensureSpace(40);
      drawText(`${new Date(d.created_at).toLocaleDateString()} | ${d.deposited_by || 'Unknown'} | $${Number(d.amount).toFixed(2)}`, 10);
    });
  }
  y -= 20;

  // 3. LEDGER HIGHLIGHTS
  ensureSpace(300);
  drawText("3. KEY OPERATIONS MOVEMENTS", 14, true, COLORS.primary);
  const topOps = [...data.ledger].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 15);
  topOps.forEach(l => {
    ensureSpace(40);
    const color = l.amount < 0 ? COLORS.expense : COLORS.profit;
    drawText(`${new Date(l.created_at).toLocaleDateString()} | ${l.title || l.kind} | ${l.amount < 0 ? '-' : '+'}$${Math.abs(l.amount).toFixed(2)}`, 9, false, color);
  });

  y -= 20;
  drawText("--- END OF REPORT ---", 10, true, COLORS.neutral, width/2 - 50);

  return await pdf.save();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const daysBack = Number(body?.daysBack || 7);
  const period = String(body?.period || "");
  const reportPeriodLabel = periodLabel(period, daysBack);

  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;
  const adminToken = cookieStore.get("nirvana_admin")?.value;

  if (!staffToken && !ownerToken && !adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const since = startOfPeriodUTC(period, daysBack);

    const { data: shops } = await supabaseAdmin.from('shops').select('id, name, expenses');
    const shopList = shops || [];

    const { data: opsLedger } = await supabaseAdmin
      .from('operations_ledger')
      .select('amount, kind, title, shop_id, created_at, notes, employee_id, effective_date, overhead_category')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const { data: investDeposits } = await supabaseAdmin
      .from('invest_deposits')
      .select('amount, withdrawn, shop_id, created_at, deposited_by')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const { data: allSales } = await supabaseAdmin
      .from('sales')
      .select('shop_id, item_name, quantity, total_with_tax, total_before_tax, tax, date, payment_method, discount_applied')
      .gte('date', since.split('T')[0]);

    const { data: laybyEntries } = await supabaseAdmin
      .from('ledger_entries')
      .select('amount, category, description, shop_id, date')
      .in('category', ['Lay-by Deposit', 'Lay-by Payment', 'Lay-by Completed'])
      .gte('date', since.split('T')[0])
      .order('date', { ascending: false });

    const opsRows = opsLedger || [];
    const investRows = investDeposits || [];
    const salesRows = allSales || [];
    const laybyRows = laybyEntries || [];

    const startDateDisplay = new Date(since).toLocaleDateString();
    const endDateDisplay = new Date().toLocaleDateString();

    if (body.format === 'pdf') {
      const pdfBytes = await generateOperationsPDF(daysBack, {
        ledger: opsRows,
        investDeposits: investRows,
        sales: salesRows,
        shops: shopList,
        periodLabel: reportPeriodLabel
      });
      return new Response(pdfBytes as any, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Nirvana_Operations_Report_${new Date().toISOString().split('T')[0]}.pdf"`
        }
      });
    }

    const filename = `ops-report-${new Date().toISOString().split('T')[0]}.html`;

    const vaultMovements = opsRows.map((r: any) => ({ ...r, vaultImpact: getOperationsVaultImpact(r) }));
    const vaultDeposits = vaultMovements.filter((r: any) => r.vaultImpact > 0);
    const vaultExpenses = vaultMovements.filter((r: any) => r.vaultImpact < 0);
    const overheadContributions = opsRows.filter((r: any) => isOverheadContributionKind(r.kind) && r.shop_id);
    const overheadPayments = opsRows.filter((r: any) => isOverheadPaymentKind(r.kind) && r.shop_id);
    const totalDeposits = vaultDeposits.reduce((sum: number, r: any) => sum + Number(r.vaultImpact || 0), 0);
    const totalExpenses = Math.abs(vaultExpenses.reduce((sum: number, r: any) => sum + Number(r.vaultImpact || 0), 0));
    const totalOverheadContributed = overheadContributions.reduce((sum: number, r: any) => sum + (Number(r.amount || 0) > 0 ? Number(r.amount || 0) : 0), 0);
    const totalOverheadPaid = Math.abs(opsRows.filter((r: any) => isOverheadPaymentKind(r.kind) || (isOverheadContributionKind(r.kind) && Number(r.amount || 0) < 0)).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
    const totalOverheadHeld = totalOverheadContributed - totalOverheadPaid;
    const totalInvest = investRows.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
    const totalLayby = laybyRows.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
    const globalRevenue = salesRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const netOps = totalDeposits - totalExpenses;

    const expenseByCategory: Record<string, number> = {};
    vaultExpenses.forEach((r: any) => {
      const cat = r.kind || 'other';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Math.abs(Number(r.vaultImpact || 0));
    });
    const sortedExpenses = Object.entries(expenseByCategory).sort((a, b) => Number(b[1]) - Number(a[1]));

    const depositByCategory: Record<string, number> = {};
    vaultDeposits.forEach((r: any) => {
      const cat = r.kind || 'other';
      depositByCategory[cat] = (depositByCategory[cat] || 0) + Number(r.vaultImpact || 0);
    });
    const sortedDeposits = Object.entries(depositByCategory).sort((a, b) => Number(b[1]) - Number(a[1]));

    const suggestions: string[] = [];
    if (totalExpenses > totalDeposits) {
      suggestions.push(`Expenses ($${totalExpenses.toFixed(2)}) exceed deposits ($${totalDeposits.toFixed(2)})`);
    }
    const largestExpense = sortedExpenses[0];
    if (largestExpense) {
      suggestions.push(`Largest: "${largestExpense[0]}" at $${Number(largestExpense[1]).toFixed(2)}`);
    }
    if (totalOverheadHeld > 0) {
      suggestions.push(`Shop overhead held outside Master Vault: $${totalOverheadHeld.toFixed(2)}`);
    }
    if (totalInvest > 0) {
      suggestions.push(`Invest/Perfume: $${totalInvest.toFixed(2)}`);
    }
    if (suggestions.length === 0) {
      suggestions.push(`No major flags detected`);
    }

    const kindLabel = (kind: string) => {
      const labels: Record<string, string> = {
        eod_deposit: 'EOD Deposit',
        overhead_contribution: 'Contribution',
        overhead_payment: 'Overhead Payment',
        stock_orders: 'Stock Orders',
        transport: 'Transport',
        peer_payout: 'Peer Payout',
        loan_received: 'Loan Received',
        peer_transfer: 'Peer Transfer',
        other_income: 'Other Income',
        other_expense: 'Other Expense',
        drawdown: 'Drawdown',
        invest_withdrawal: 'Invest Withdrawal',
      };
      return labels[kind] || kind?.replace(/_/g, ' ') || 'Unknown';
    };

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Operations Report — ${startDateDisplay} to ${endDateDisplay}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #0f172a; color: #f1f5f9; }
    .wrap { max-width: 900px; margin: 0 auto; }
    .header { background: linear-gradient(135deg,#1e3a5f,#1e40af,#4338ca); padding: 24px 32px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 900; color: #fff; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #93c5fd; }
    .content { padding: 24px 32px; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi { padding: 18px 14px; border-radius: 10px; text-align: center; }
    .kpi.green { background: linear-gradient(135deg,#064e3b,#065f46); }
    .kpi.red { background: linear-gradient(135deg,#7c2d12,#991b1b); }
    .kpi.purple { background: linear-gradient(135deg,#6b21a8,#7c3aed); }
    .kpi.blue { background: linear-gradient(135deg,#1e3a5f,#1e40af); }
    .kpi p { margin: 0; }
    .kpi .lbl { font-size: 9px; letter-spacing: 2px; font-weight: bold; }
    .kpi.green .lbl { color: #6ee7b7; }
    .kpi.red .lbl { color: #fca5a5; }
    .kpi.purple .lbl { color: #ddd6fe; }
    .kpi.blue .lbl { color: #93c5fd; }
    .kpi .val { margin: 8px 0 0; font-size: 26px; font-weight: 900; color: #fff; }
    .kpi .sub { margin: 4px 0 0; font-size: 10px; }
    .kpi.green .sub { color: #6ee7b7; }
    .kpi.red .sub { color: #fca5a5; }
    .kpi.purple .sub { color: #ddd6fe; }
    .kpi.blue .sub { color: #93c5fd; }
    .sec-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .sec { background: #1e293b; padding: 14px; border-radius: 10px; text-align: center; border: 1px solid #334155; }
    .sec p { margin: 0; }
    .sec .lbl { font-size: 9px; color: #94a3b8; letter-spacing: 1px; }
    .sec .val { margin: 6px 0 0; font-size: 20px; font-weight: 900; color: #10b981; }
    .sec .val.yellow { color: #f59e0b; }
    .sec .val.gold { color: #fbbf24; }
    .sec .sub { margin: 4px 0 0; font-size: 10px; color: #64748b; }
    table.card { background: #1e293b; border-radius: 10px; overflow: hidden; margin-bottom: 20px; width: 100%; }
    .thdr { background: #334155; padding: 10px 16px; }
    .thdr strong { font-size: 11px; color: #94a3b8; letter-spacing: 1px; }
    th { padding: 8px 12px; text-align: left; color: #64748b; font-size: 10px; border-bottom: 1px solid #334155; }
    th.r { text-align: right; }
    td { padding: 8px 12px; border-bottom: 1px solid #1e293b; font-size: 12px; }
    td.r { text-align: right; }
    td.g { color: #10b981; }
    td.rd { color: #ef4444; }
    td.p { color: #c4b5fd; }
    td.b { font-weight: 700; }
    tr.total { background: #0f172a; }
    tr.total td { font-weight: 900; color: #fff; }
    .br { padding: 10px 16px; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 12px; }
    .br-num { width: 20px; text-align: center; font-size: 11px; color: #64748b; font-weight: 700; }
    .br-inner { flex: 1; }
    .br-meta { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .br-label { font-size: 12px; color: #f1f5f9; font-weight: 600; }
    .br-val { font-size: 12px; font-weight: 700; }
    .br-val.g { color: #10b981; }
    .br-val.rd { color: #ef4444; }
    .br-pct { color: #64748b; font-size: 10px; }
    .br-bar { background: #0f172a; height: 5px; border-radius: 3px; }
    .br-fill { height: 100%; border-radius: 3px; }
    .br-fill.g { background: #10b981; }
    .br-fill.rd { background: #ef4444; }
    .amber { background: #78350f; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #f59e0b; overflow: hidden; }
    .amber-hdr { background: #92400e; padding: 10px 16px; }
    .amber-hdr strong { font-size: 11px; color: #fef3c7; }
    .amber table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 0; }
    .amber th { color: #fde68a; border-bottom: 1px solid #78350f; }
    .amber td { color: #fde68a; border-bottom: 1px solid #78350f; }
    .amber td.rd { text-align: right; font-weight: 700; }
    .cost { background: #78350f; border-radius: 10px; padding: 18px; margin-bottom: 20px; border-left: 5px solid #f59e0b; }
    .cost h3 { margin: 0 0 12px; font-size: 15px; font-weight: 900; color: #fef3c7; }
    .cost ul { margin: 0; padding: 0 0 0 20px; color: #fef3c7; font-size: 12px; }
    .cost li { margin: 6px 0; }
    .rec { background: #064e3b; border-radius: 10px; padding: 18px; }
    .rec h3 { margin: 0 0 12px; font-size: 15px; font-weight: 900; color: #6ee7b7; }
    .rec ol { margin: 0; padding: 0 0 0 20px; color: #d1fae5; font-size: 12px; line-height: 1.8; }
    .rec li { margin: 6px 0; }
    .footer { background: #0c1322; padding: 14px 32px; text-align: center; border-top: 1px solid #1e293b; border-radius: 0 0 10px 10px; }
    .footer p { margin: 0; font-size: 10px; color: #475569; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>OPERATIONS REPORT</h1>
    <p>${shopList.length} Shops &nbsp;|&nbsp; ${startDateDisplay} — ${endDateDisplay} &nbsp;|&nbsp; ${reportPeriodLabel} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
  </div>
  <div class="content">
    <div class="kpi-row">
      <div class="kpi green"><p class="lbl">VAULT IN</p><p class="val">$${totalDeposits.toFixed(2)}</p><p class="sub">${vaultDeposits.length} vault entries</p></div>
      <div class="kpi red"><p class="lbl">VAULT OUT</p><p class="val">$${totalExpenses.toFixed(2)}</p><p class="sub">${vaultExpenses.length} vault entries</p></div>
      <div class="kpi purple"><p class="lbl">SHOP OVERHEAD HELD</p><p class="val">$${totalOverheadHeld.toFixed(2)}</p><p class="sub">$${totalOverheadContributed.toFixed(2)} set aside</p></div>
      <div class="kpi blue"><p class="lbl">NET VAULT</p><p class="val" style="color:${netOps >= 0 ? '#10b981' : '#ef4444'};">${netOps >= 0 ? '+' : ''}$${netOps.toFixed(2)}</p><p class="sub">Vault in - vault out</p></div>
    </div>
    <div class="sec-row">
      <div class="sec"><p class="lbl">POS REVENUE</p><p class="val">$${globalRevenue.toFixed(2)}</p><p class="sub">${salesRows.length} sales</p></div>
      <div class="sec"><p class="lbl">LAY-BY</p><p class="val gold">$${totalLayby.toFixed(2)}</p><p class="sub">${laybyRows.length} txns</p></div>
      <div class="sec"><p class="lbl">OVERHEAD PAID</p><p class="val yellow">$${totalOverheadPaid.toFixed(2)}</p><p class="sub">${overheadPayments.length} shop payments</p></div>
    </div>

    <table class="card">
      <tr><td colspan="5" class="thdr"><strong>BY-SHOP CASH FLOW SUMMARY</strong></td></tr>
      <tr><th>SHOP</th><th class="r">VAULT IN</th><th class="r">VAULT OUT</th><th class="r">OVERHEAD HELD</th><th class="r">NET VAULT</th></tr>
      ${shopList.map((shop: any) => {
        const shopOps = opsRows.filter((r: any) => r.shop_id === shop.id);
        const shopVaultImpacts = shopOps.map((r: any) => getOperationsVaultImpact(r));
        const shopDep = shopVaultImpacts.filter((n: number) => n > 0).reduce((s: number, n: number) => s + n, 0);
        const shopExp = Math.abs(shopVaultImpacts.filter((n: number) => n < 0).reduce((s: number, n: number) => s + n, 0));
        const shopOverheadIn = shopOps.filter((r: any) => isOverheadContributionKind(r.kind)).reduce((s: number, r: any) => s + (Number(r.amount || 0) > 0 ? Number(r.amount || 0) : 0), 0);
        const shopOverheadPaid = Math.abs(shopOps.filter((r: any) => isOverheadPaymentKind(r.kind) || (isOverheadContributionKind(r.kind) && Number(r.amount || 0) < 0)).reduce((s: number, r: any) => s + Number(r.amount || 0), 0));
        const shopOverheadHeld = shopOverheadIn - shopOverheadPaid;
        const shopNet = shopDep - shopExp;
        return `<tr>
          <td class="b">${shop.name}</td>
          <td class="r g">$${shopDep.toFixed(2)}</td>
          <td class="r rd">$${shopExp.toFixed(2)}</td>
          <td class="r p">$${shopOverheadHeld.toFixed(2)}</td>
          <td class="r b" style="color:${shopNet >= 0 ? '#10b981' : '#ef4444'};">${shopNet >= 0 ? '+' : ''}$${shopNet.toFixed(2)}</td>
        </tr>`;
      }).join('')}
      <tr class="total">
        <td>TOTAL</td>
        <td class="r">$${totalDeposits.toFixed(2)}</td>
        <td class="r">$${totalExpenses.toFixed(2)}</td>
        <td class="r">$${totalOverheadHeld.toFixed(2)}</td>
        <td class="r" style="color:${netOps >= 0 ? '#10b981' : '#ef4444'};">${netOps >= 0 ? '+' : ''}$${netOps.toFixed(2)}</td>
      </tr>
    </table>

    ${sortedDeposits.length > 0 ? `<table class="card">
      <tr><td colspan="3" class="thdr"><strong>DEPOSIT BREAKDOWN</strong></td></tr>
      ${sortedDeposits.slice(0, 8).map(([cat, amount], index) => {
        const pct = ((Number(amount) / (totalDeposits || 1)) * 100).toFixed(0);
        return `<div class="br">
          <div class="br-num">${index + 1}</div>
          <div class="br-inner">
            <div class="br-meta"><span class="br-label">${kindLabel(cat)}</span><span class="br-val g">$${Number(amount).toFixed(2)} <span class="br-pct">(${pct}%)</span></span></div>
            <div class="br-bar"><div class="br-fill g" style="width:${pct}%;"></div></div>
          </div>
        </div>`;
      }).join('')}
    </table>` : ''}

    ${sortedExpenses.length > 0 ? `<table class="card">
      <tr><td colspan="3" class="thdr"><strong>EXPENSE BREAKDOWN</strong></td></tr>
      ${sortedExpenses.slice(0, 8).map(([cat, amount], index) => {
        const pct = ((Number(amount) / (totalExpenses || 1)) * 100).toFixed(0);
        return `<div class="br">
          <div class="br-num">${index + 1}</div>
          <div class="br-inner">
            <div class="br-meta"><span class="br-label">${kindLabel(cat)}</span><span class="br-val rd">$${Number(amount).toFixed(2)} <span class="br-pct">(${pct}%)</span></span></div>
            <div class="br-bar"><div class="br-fill rd" style="width:${pct}%;"></div></div>
          </div>
        </div>`;
      }).join('')}
    </table>` : ''}

    ${(overheadPayments.length > 0 || opsRows.some((r: any) => isOverheadContributionKind(r.kind) && Number(r.amount) < 0)) ? `<div class="amber">

      <div class="amber-hdr"><strong>OVERHEAD PAYMENTS</strong></div>

      <table>
        <tr><th>DATE</th><th>DESCRIPTION</th><th class="r">AMOUNT</th></tr>
        ${opsRows.filter((r: any) => isOverheadPaymentKind(r.kind) || (isOverheadContributionKind(r.kind) && Number(r.amount) < 0)).map((h: any) => `<tr>

          <td>${new Date(h.created_at).toLocaleDateString()}</td>
          <td>${h.title || h.overhead_category || 'Overhead'}</td>
          <td class="rd">-$${Math.abs(Number(h.amount || 0)).toFixed(2)}</td>
        </tr>`).join('')}
      </table>
    </div>` : ''}

    ${investRows.length > 0 ? `<table class="card">
      <tr><td colspan="4" class="thdr"><strong>INVEST / PERFUME DEPOSITS (${investRows.length} entries)</strong></td></tr>
      <tr><th>DATE</th><th>SHOP</th><th>DEPOSITED BY</th><th class="r">AMOUNT</th></tr>
      ${investRows.map((d: any) => {
        const shopName = shopList.find((s: any) => s.id === d.shop_id)?.name || d.shop_id || '-';
        return `<tr><td>${new Date(d.created_at).toLocaleDateString()}</td><td>${shopName}</td><td>${d.deposited_by || 'Unknown'}</td><td class="r p">+$${Number(d.amount || 0).toFixed(2)}</td></tr>`;
      }).join('')}
    </table>` : ''}

    ${opsRows.length > 0 ? `<table class="card">
      <tr><td colspan="5" class="thdr"><strong>OPERATIONS LEDGER (${opsRows.length} entries)</strong></td></tr>
      <tr><th>DATE</th><th>SHOP</th><th>TYPE</th><th>DESCRIPTION</th><th class="r">AMOUNT</th></tr>
      ${opsRows.slice(0, 50).map((r: any) => {
        const shopName = shopList.find((s: any) => s.id === r.shop_id)?.name || r.shop_id || '-';
        return `<tr>
          <td>${new Date(r.created_at).toLocaleDateString()}</td>
          <td>${shopName}</td>
          <td>${kindLabel(r.kind)}</td>
          <td>${r.title || r.notes || '-'}</td>
          <td class="r b" style="color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}</td>
        </tr>`;
      }).join('')}
      ${opsRows.length > 50 ? `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:8px;">...and ${opsRows.length - 50} more entries</td></tr>` : ''}
    </table>` : ''}

    ${laybyRows.length > 0 ? `<table class="card">
      <tr><td colspan="4" class="thdr"><strong>LAY-BY TRANSACTIONS (${laybyRows.length} entries)</strong></td></tr>
      <tr><th>DATE</th><th>TYPE</th><th>DESCRIPTION</th><th class="r">AMOUNT</th></tr>
      ${laybyRows.map((l: any) => `<tr>
        <td>${l.date ? new Date(l.date).toLocaleDateString() : '-'}</td>
        <td>${l.category || 'Lay-by'}</td>
        <td>${l.description || '-'}</td>
        <td class="r" style="color:#fbbf24;">+$${Number(l.amount || 0).toFixed(2)}</td>
      </tr>`).join('')}
    </table>` : ''}

    <div class="cost">
      <h3>COST ANALYSIS & FLAGS</h3>
      <ul>${suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
    </div>

    <div class="rec">
      <h3>ACTIONABLE RECOMMENDATIONS</h3>
      <ol>
        <li>Review the cost analysis flags above and prioritize top actions.</li>
        <li>Ensure all shops post EOD deposits consistently for accurate cash flow tracking.</li>
        <li>Track perfume/invest growth as a leading indicator of customer engagement.</li>
        <li>Follow up on active lay-bys to improve cash flow from completions.</li>
        ${totalExpenses > totalDeposits * 0.5 ? '<li>Expenses are running high relative to deposits — review overhead categories.</li>' : ''}
        ${overheadPayments.length > 0 ? '<li>Review overhead payments — ensure they align with budget allocations per shop.</li>' : ''}
      </ol>
    </div>
  </div>
  <div class="footer">
    <p>Nirvana Operations &nbsp;|&nbsp; ${shopList.length} Shops &nbsp;|&nbsp; ${startDateDisplay} — ${endDateDisplay} &nbsp;|&nbsp; Generated ${new Date().toLocaleString()}</p>
  </div>
</div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("[OPS REPORT] Failed:", e?.message || e);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
