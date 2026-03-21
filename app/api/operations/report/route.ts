import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { ORACLE_RECIPIENT } from "@/lib/resend";
import { sendEmail } from "@/lib/email";

function startOfDaysBackUTC(daysBack: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, Number(daysBack || 7)));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function sendOperationsReport(daysBack: number = 7) {
  const since = startOfDaysBackUTC(daysBack);
  const today = startOfTodayUTC();

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

  const opsDeposits = opsRows.filter((r: any) => r.amount >= 0);
  const opsExpenses = opsRows.filter((r: any) => r.amount < 0);
  const totalDeposits = opsDeposits.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const totalExpenses = Math.abs(opsExpenses.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
  const totalInvest = investRows.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const totalLayby = laybyRows.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const globalRevenue = salesRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const netOps = totalDeposits - totalExpenses;

  const expenseByCategory: Record<string, number> = {};
  opsExpenses.forEach((r: any) => {
    const cat = r.kind || 'other';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Math.abs(Number(r.amount || 0));
  });
  const sortedExpenses = Object.entries(expenseByCategory).sort((a, b) => Number(b[1]) - Number(a[1]));

  const depositByCategory: Record<string, number> = {};
  opsDeposits.forEach((r: any) => {
    const cat = r.kind || 'other';
    depositByCategory[cat] = (depositByCategory[cat] || 0) + Number(r.amount || 0);
  });
  const sortedDeposits = Object.entries(depositByCategory).sort((a, b) => Number(b[1]) - Number(a[1]));

  const overheadPayments = opsRows.filter((r: any) => r.kind === 'overhead_payment');

  const suggestions: string[] = [];
  if (totalExpenses > totalDeposits) {
    suggestions.push(`⚠️ Expenses ($${totalExpenses.toFixed(2)}) exceed deposits ($${totalDeposits.toFixed(2)}) — review overhead and cut non-essential spending.`);
  }
  const largestExpense = sortedExpenses[0];
  if (largestExpense) {
    suggestions.push(`💸 Largest expense category: "${largestExpense[0]}" at $${Number(largestExpense[1]).toFixed(2)} (${((Number(largestExpense[1]) / (totalExpenses || 1)) * 100).toFixed(0)}% of total).`);
  }
  if (totalInvest > 0) {
    suggestions.push(`📈 Invest/Perfume deposits of $${totalInvest.toFixed(2)} this period — track against targets.`);
  }
  if (globalRevenue > 0) {
    suggestions.push(`📊 POS revenue this period: $${globalRevenue.toFixed(2)} from ${salesRows.length} transactions.`);
  }
  if (laybyRows.length > 0) {
    suggestions.push(`📦 ${laybyRows.length} lay-by transactions worth $${totalLayby.toFixed(2)} — follow up on completions.`);
  }
  if (suggestions.length === 0) {
    suggestions.push(`✅ No major flags detected. Operations are running within expected parameters.`);
  }

  const startDate = new Date(since).toLocaleDateString();
  const endDate = new Date().toLocaleDateString();

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

  const kindColor = (amount: number) => amount >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';

  const recipientEmail = ORACLE_RECIPIENT || 'nirvana@example.com';

  await sendEmail({
    to: recipientEmail,
    subject: `📋 Operations Report — ${shopList.length} Shops | ${startDate} to ${endDate}`,
    html: `
<div style="background:#0f172a;min-height:100vh;font-family:Arial,sans-serif;color:#f1f5f9;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af,#4338ca);padding:24px 32px;text-align:center;">
    <h1 style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:1px;">📋 NIRVANA OPERATIONS REPORT</h1>
    <p style="margin:8px 0 0;font-size:13px;color:#93c5fd;">${shopList.length} Shops &nbsp;|&nbsp; ${startDate} — ${endDate} &nbsp;|&nbsp; ${daysBack} days</p>
    <p style="margin:4px 0 0;font-size:11px;color:#60a5fa;">Generated: ${new Date().toLocaleString()}</p>
  </div>

  <!-- KPI CARDS -->
  <div style="padding:24px 32px;">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#064e3b,#065f46);padding:20px 16px;border-radius:10px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#6ee7b7;letter-spacing:2px;font-weight:bold;">TOTAL DEPOSITS</p>
        <p style="margin:8px 0 0;font-size:28px;font-weight:900;color:#fff;">$${totalDeposits.toFixed(2)}</p>
        <p style="margin:6px 0 0;font-size:10px;color:#6ee7b7;">${opsDeposits.length} entries</p>
      </div>
      <div style="background:linear-gradient(135deg,#7c2d12,#991b1b);padding:20px 16px;border-radius:10px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#fca5a5;letter-spacing:2px;font-weight:bold;">TOTAL EXPENSES</p>
        <p style="margin:8px 0 0;font-size:28px;font-weight:900;color:#fff;">$${totalExpenses.toFixed(2)}</p>
        <p style="margin:6px 0 0;font-size:10px;color:#fca5a5;">${opsExpenses.length} entries</p>
      </div>
      <div style="background:linear-gradient(135deg,#6b21a8,#7c3aed);padding:20px 16px;border-radius:10px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#ddd6fe;letter-spacing:2px;font-weight:bold;">INVEST/PERFUME</p>
        <p style="margin:8px 0 0;font-size:28px;font-weight:900;color:#fff;">$${totalInvest.toFixed(2)}</p>
        <p style="margin:6px 0 0;font-size:10px;color:#ddd6fe;">${investRows.length} deposits</p>
      </div>
      <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);padding:20px 16px;border-radius:10px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#93c5fd;letter-spacing:2px;font-weight:bold;">NET OPS POSITION</p>
        <p style="margin:8px 0 0;font-size:28px;font-weight:900;color:${netOps >= 0 ? '#10b981' : '#ef4444'};">${netOps >= 0 ? '+' : ''}$${netOps.toFixed(2)}</p>
        <p style="margin:6px 0 0;font-size:10px;color:#93c5fd;">Deposits - Expenses</p>
      </div>
    </div>

    <!-- SECONDARY KPIs -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:#1e293b;padding:16px 14px;border-radius:10px;text-align:center;border:1px solid #334155;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">POS REVENUE</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#10b981;">$${globalRevenue.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${salesRows.length} sales</p>
      </div>
      <div style="background:#1e293b;padding:16px 14px;border-radius:10px;text-align:center;border:1px solid #334155;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">LAY-BY</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fbbf24;">$${totalLayby.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${laybyRows.length} transactions</p>
      </div>
      <div style="background:#1e293b;padding:16px 14px;border-radius:10px;text-align:center;border:1px solid #334155;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">OVERHEAD PAID</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#f59e0b;">$${overheadPayments.reduce((s,n) => s+Math.abs(Number(n?.amount||0)), 0).toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${overheadPayments.length} payments</p>
      </div>
    </div>

    <!-- BY-SHOP SUMMARY -->
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">BY-SHOP CASH FLOW SUMMARY</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:10px 16px;text-align:left;color:#64748b;font-size:10px;letter-spacing:1px;">SHOP</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">DEPOSITS</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">EXPENSES</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">INVEST</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">NET</th>
          </tr>
        </thead>
        <tbody>
          ${shopList.map((shop: any) => {
            const shopOps = opsRows.filter((r: any) => r.shop_id === shop.id);
            const shopDep = shopOps.filter((r: any) => r.amount >= 0).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
            const shopExp = Math.abs(shopOps.filter((r: any) => r.amount < 0).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0));
            const shopInv = investRows.filter((d: any) => d.shop_id === shop.id).reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
            const shopNet = shopDep - shopExp;
            return `
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 16px;font-weight:700;color:#f1f5f9;">${shop.name}</td>
              <td style="padding:10px 16px;text-align:right;color:#10b981;">$${shopDep.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;color:#ef4444;">$${shopExp.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;color:#c4b5fd;">$${shopInv.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;font-weight:800;color:${shopNet >= 0 ? '#10b981' : '#ef4444'};">${shopNet >= 0 ? '+' : ''}$${shopNet.toFixed(2)}</td>
            </tr>`;
          }).join('')}
          <tr style="background:#0f172a;">
            <td style="padding:10px 16px;font-weight:900;color:#fff;">TOTAL</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#10b981;">$${totalDeposits.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#ef4444;">$${totalExpenses.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#c4b5fd;">$${totalInvest.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:${netOps >= 0 ? '#10b981' : '#ef4444'};">${netOps >= 0 ? '+' : ''}$${netOps.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- DEPOSIT BREAKDOWN -->
    ${sortedDeposits.length > 0 ? `
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">DEPOSIT BREAKDOWN BY CATEGORY</strong>
      </div>
      ${sortedDeposits.slice(0, 8).map(([cat, amount], idx) => {
        const pct = ((Number(amount) / (totalDeposits || 1)) * 100).toFixed(0);
        return `
      <div style="padding:10px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;">
        <div style="width:22px;text-align:center;font-size:12px;color:#64748b;font-weight:700;">${idx + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;color:#f1f5f9;font-weight:600;">${kindLabel(cat)}</span>
            <span style="font-size:12px;color:#10b981;font-weight:700;">$${Number(amount).toFixed(2)} <span style="color:#64748b;font-size:10px;">(${pct}%)</span></span>
          </div>
          <div style="background:#0f172a;height:6px;border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;background:#10b981;height:100%;border-radius:3px;"></div>
          </div>
        </div>
      </div>`;}).join('')}
    </div>` : ''}

    <!-- EXPENSE BREAKDOWN -->
    ${sortedExpenses.length > 0 ? `
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">EXPENSE BREAKDOWN BY CATEGORY</strong>
      </div>
      ${sortedExpenses.slice(0, 8).map(([cat, amount], idx) => {
        const pct = ((Number(amount) / (totalExpenses || 1)) * 100).toFixed(0);
        return `
      <div style="padding:10px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;">
        <div style="width:22px;text-align:center;font-size:12px;color:#64748b;font-weight:700;">${idx + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;color:#f1f5f9;font-weight:600;">${kindLabel(cat)}</span>
            <span style="font-size:12px;color:#ef4444;font-weight:700;">$${Number(amount).toFixed(2)} <span style="color:#64748b;font-size:10px;">(${pct}%)</span></span>
          </div>
          <div style="background:#0f172a;height:6px;border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;background:#ef4444;height:100%;border-radius:3px;"></div>
          </div>
        </div>
      </div>`;}).join('')}
    </div>` : ''}

    <!-- OVERHEAD PAYMENTS -->
    ${overheadPayments.length > 0 ? `
    <div style="background:#78350f;border-radius:10px;overflow:hidden;margin-bottom:20px;border-left:4px solid #f59e0b;">
      <div style="background:#92400e;padding:12px 20px;">
        <strong style="font-size:12px;color:#fef3c7;letter-spacing:1px;">OVERHEAD PAYMENTS (${overheadPayments.length} entries | $${overheadPayments.reduce((s,n) => s+Math.abs(Number(n?.amount||0)), 0).toFixed(2)} total)</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #78350f;">
            <th style="padding:8px 16px;text-align:left;color:#fde68a;font-size:10px;">DATE</th>
            <th style="padding:8px 16px;text-align:left;color:#fde68a;font-size:10px;">DESCRIPTION</th>
            <th style="padding:8px 16px;text-align:right;color:#fde68a;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${overheadPayments.map((h: any) => `
          <tr style="border-bottom:1px solid #78350f;">
            <td style="padding:8px 16px;color:#fde68a;">${new Date(h.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;color:#fde68a;">${h.title || h.overhead_category || 'Overhead'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:#fde68a;">-$${Math.abs(Number(h.amount || 0)).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- INVEST DEPOSITS -->
    ${investRows.length > 0 ? `
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">INVEST / PERFUME DEPOSITS (${investRows.length} entries | $${totalInvest.toFixed(2)})</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DATE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">SHOP</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DEPOSITED BY</th>
            <th style="padding:8px 16px;text-align:right;color:#64748b;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${investRows.map((d: any) => {
            const shopName = shopList.find((s: any) => s.id === d.shop_id)?.name || d.shop_id || '-';
            return `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(d.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;color:#94a3b8;">${shopName}</td>
            <td style="padding:8px 16px;">${d.deposited_by || 'Unknown'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:#c4b5fd;">+$${Number(d.amount || 0).toFixed(2)}</td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- COMPLETE LEDGER ENTRIES -->
    ${opsRows.length > 0 ? `
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">COMPLETE OPERATIONS LEDGER (${opsRows.length} entries)</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DATE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">SHOP</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">TYPE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DESCRIPTION</th>
            <th style="padding:8px 16px;text-align:right;color:#64748b;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${opsRows.slice(0, 50).map((r: any) => {
            const shopName = shopList.find((s: any) => s.id === r.shop_id)?.name || r.shop_id || '-';
            return `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(r.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;color:#94a3b8;">${shopName}</td>
            <td style="padding:8px 16px;"><span style="background:${kindColor(r.amount)};padding:2px 8px;border-radius:4px;font-size:10px;color:#f1f5f9;">${kindLabel(r.kind)}</span></td>
            <td style="padding:8px 16px;">${r.title || r.notes || '-'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}</td>
          </tr>`;}).join('')}
          ${opsRows.length > 50 ? `<tr><td colspan="5" style="padding:10px 16px;text-align:center;color:#64748b;font-size:11px;">...and ${opsRows.length - 50} more entries</td></tr>` : ''}
        </tbody>
      </table>
    </div>` : ''}

    <!-- LAY-BY -->
    ${laybyRows.length > 0 ? `
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">LAY-BY TRANSACTIONS (${laybyRows.length} entries | $${totalLayby.toFixed(2)})</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DATE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">TYPE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DESCRIPTION</th>
            <th style="padding:8px 16px;text-align:right;color:#64748b;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${laybyRows.map((l: any) => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${l.date ? new Date(l.date).toLocaleDateString() : '-'}</td>
            <td style="padding:8px 16px;"><span style="background:rgba(251,191,36,0.2);padding:2px 8px;border-radius:4px;font-size:10px;color:#fbbf24;">${l.category || 'Lay-by'}</span></td>
            <td style="padding:8px 16px;">${l.description || '-'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:#fbbf24;">+$${Number(l.amount || 0).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- COST ANALYSIS -->
    <div style="background:#78350f;border-radius:10px;padding:20px;margin-bottom:20px;border-left:5px solid #f59e0b;">
      <h3 style="margin:0 0 14px;font-size:16px;font-weight:900;color:#fef3c7;letter-spacing:0.5px;">🔍 COST ANALYSIS & FLAGS</h3>
      <ul style="margin:0;padding:0;list-style:none;">
        ${suggestions.map(s => `<li style="margin:10px 0;padding:10px 14px;background:#92400e;border-radius:6px;color:#fef3c7;font-size:13px;font-weight:500;">${s}</li>`).join('')}
      </ul>
    </div>

    <!-- RECOMMENDATIONS -->
    <div style="background:#064e3b;border-radius:10px;padding:20px;">
      <h3 style="margin:0 0 14px;font-size:16px;font-weight:900;color:#6ee7b7;letter-spacing:0.5px;">💡 ACTIONABLE RECOMMENDATIONS</h3>
      <ol style="margin:0;padding:0 0 0 24px;color:#d1fae5;font-size:13px;line-height:1.8;">
        <li style="margin:8px 0;">Review the cost analysis flags above and prioritize top actions.</li>
        <li style="margin:8px 0;">Ensure all shops post EOD deposits consistently for accurate cash flow tracking.</li>
        <li style="margin:8px 0;">Track perfume/invest growth as a leading indicator of customer engagement.</li>
        <li style="margin:8px 0;">Follow up on active lay-bys to improve cash flow from completions.</li>
        ${totalExpenses > totalDeposits * 0.5 ? `<li style="margin:8px 0;">Expenses are running high relative to deposits — review overhead categories and identify savings.</li>` : ''}
        ${overheadPayments.length > 0 ? `<li style="margin:8px 0;">Review overhead payments — ensure they align with budget allocations per shop.</li>` : ''}
      </ol>
    </div>

  </div>

  <!-- FOOTER -->
  <div style="background:#0c1322;padding:16px 32px;text-align:center;border-top:1px solid #1e293b;">
    <p style="margin:0;font-size:11px;color:#475569;">Nirvana Operations Command &nbsp;|&nbsp; ${shopList.length} Shops &nbsp;|&nbsp; ${startDate} — ${endDate} &nbsp;|&nbsp; Generated ${new Date().toLocaleString()}</p>
  </div>

</div>
    `,
  });
  return true;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const daysBack = Number(body?.daysBack || 7);

  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;
  const adminToken = cookieStore.get("nirvana_admin")?.value;

  if (!staffToken && !ownerToken && !adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendOperationsReport(daysBack);
    return NextResponse.json({ success: true, message: "Operations report sent" });
  } catch (e: any) {
    console.error("[OPS REPORT] Failed:", e?.message || e);
    return NextResponse.json({ error: "Failed to send report" }, { status: 500 });
  }
}
