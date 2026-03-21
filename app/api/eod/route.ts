import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { ORACLE_RECIPIENT } from "@/lib/resend";
import { sendEmail } from "@/lib/email";

function startOfTodayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeekUTC() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfDaysBackUTC(daysBack: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, Number(daysBack || 0)));
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function sendWeeklyReport(shopId: string, staffName: string) {
  const since = startOfWeekUTC();
  const lastWeekStart = new Date(since);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  
  // Get all shops
  const { data: shops } = await supabaseAdmin.from('shops').select('id, name, expenses');
  const shopList = shops || [];

  // Get week's sales for this shop
  const { data: sales } = await supabaseAdmin
    .from("sales")
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method,discount_applied")
    .eq("shop_id", shopId)
    .gte("date", since);

  // Get last week sales for comparison
  const { data: lastWeekSales } = await supabaseAdmin
    .from("sales")
    .select("total_with_tax")
    .eq("shop_id", shopId)
    .gte("date", lastWeekStart.toISOString())
    .lt("date", since);

  const rows = sales || [];
  const lastWeekRows = lastWeekSales || [];
  
  // Calculate totals
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
  const totalDiscount = rows.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);
  const lastWeekTotal = lastWeekRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const revenueGrowth = lastWeekTotal > 0 ? ((totalWithTax - lastWeekTotal) / lastWeekTotal) * 100 : 0;

  // Get expenses
  const { data: expenses } = await supabaseAdmin
    .from("ledger_entries")
    .select("amount, category, description")
    .eq("shop_id", shopId)
    .eq("category", "POS Expense")
    .gte("date", since);
  
  const totalExpenses = (expenses || []).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  // Payment breakdown
  const cashSales = rows.filter((s: any) => s.payment_method === 'cash');
  const ecocashSales = rows.filter((s: any) => s.payment_method === 'ecocash');
  const totalCash = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalEcocash = ecocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

  // Top items (best sellers)
  const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
  for (const s of rows as any[]) {
    const key = s.item_name || "Unknown";
    const cur = itemMap.get(key) || { name: key, qty: 0, gross: 0 };
    cur.qty += Number(s.quantity || 0);
    cur.gross += Number(s.total_with_tax || 0);
    itemMap.set(key, cur);
  }
  const topItems = [...itemMap.values()]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 15);

  // Get shop name
  const shopName = shopList.find((s: any) => s.id === shopId)?.name || shopId.toUpperCase();

  // Get week date range
  const startDate = new Date(since).toLocaleDateString();
  const endDate = new Date().toLocaleDateString();

  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  try {
    await sendEmail({
      to: recipient,
      subject: `[WEEKLY] ${shopName} — Week of ${startDate}`,
      html: `
        <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:20px;border-radius:12px;margin-bottom:20px;">
            <h2 style="margin:0;color:#fff;font-size:20px;">📊 Weekly Report — ${shopName}</h2>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;">Week: ${startDate} - ${endDate} | Generated: ${new Date().toLocaleString()}</p>
          </div>

          <div style="background:#f1f5f9;padding:16px;border-radius:12px;">
            <h3 style="margin:0 0 12px;">💰 Revenue Summary</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <p style="margin:4px 0;font-size:14px;"><b>Total Sales (inc tax):</b></p>
                <p style="margin:0;font-size:24px;font-weight:bold;color:#10b981;">$${totalWithTax.toFixed(2)}</p>
                ${revenueGrowth !== 0 ? `<p style="margin:4px 0 0;font-size:11px;color:${revenueGrowth >= 0 ? '#10b981' : '#ef4444'};">${revenueGrowth >= 0 ? '↑' : '↓'} ${Math.abs(revenueGrowth).toFixed(1)}% vs last week</p>` : ''}
              </div>
              <div>
                <p style="margin:4px 0;font-size:14px;"><b>Net Revenue:</b></p>
                <p style="margin:0;font-size:24px;font-weight:bold;color:#3b82f6;">$${(totalWithTax - totalDiscount - totalExpenses).toFixed(2)}</p>
              </div>
            </div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0;">
            <p style="margin:4px 0;"><b>Total Sales (pre tax):</b> $${totalBeforeTax.toFixed(2)}</p>
            <p style="margin:4px 0;"><b>Tax Collected:</b> $${totalTax.toFixed(2)}</p>
            <p style="margin:4px 0; color:#dc2626;"><b>Total Discounts Issued:</b> $${totalDiscount.toFixed(2)}</p>
            <p style="margin:4px 0; color:#dc2626;"><b>Total Expenses:</b> $${totalExpenses.toFixed(2)}</p>
          </div>

          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin-top:16px;">
            <h3 style="margin:0 0 12px;">💳 Payment Breakdown</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="background:#fff;padding:12px;border-radius:8px;">
                <p style="margin:0;font-size:12px;color:#64748b;">Cash</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:bold;">$${totalCash.toFixed(2)}</p>
                <p style="margin:0;font-size:11px;color:#64748b;">${cashSales.length} transactions</p>
              </div>
              <div style="background:#fff;padding:12px;border-radius:8px;">
                <p style="margin:0;font-size:12px;color:#64748b;">EcoCash</p>
                <p style="margin:4px 0 0;font-size:18px;font-weight:bold;">$${totalEcocash.toFixed(2)}</p>
                <p style="margin:0;font-size:11px;color:#64748b;">${ecocashSales.length} transactions</p>
              </div>
            </div>
          </div>

          <div style="margin-top:16px;">
            <h3 style="margin:0 0 8px;">📦 All Transactions (${rows.length} total)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr style="background:#f1f5f9;">
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Time</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Item</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Qty</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Total</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Discount</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map((s: any) => `
                    <tr>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${new Date(s.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${s.item_name}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">${s.quantity}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(s.total_with_tax).toFixed(2)}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;">${s.discount_applied ? '-$'+Number(s.discount_applied).toFixed(2) : '-'}</td>
                    </tr>
                  `).join("")}
              </tbody>
            </table>
          </div>

          <h3 style="margin:18px 0 8px;">🏆 Top Selling Items</h3>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:8px;">Item</th>
                <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:8px;">Qty Sold</th>
                <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:8px;">Revenue</th>
              </tr>
            </thead>
            <tbody>
              ${topItems
                .map((i) => `
                  <tr>
                    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i.name}</td>
                    <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${i.qty}</td>
                    <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">$${i.gross.toFixed(2)}</td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        </div>
      `,
    });
    return true;
  } catch (e: any) {
    console.error("[WEEKLY] Email send failed:", e?.message || e);
    return false;
  }
}

// Comprehensive Weekly Report - ALL 4 SECTIONS IN ONE EMAIL
async function sendComprehensiveWeeklyReport(closingShopId: string, staffName: string) {
  const since = startOfWeekUTC();
  const lastWeekStart = new Date(since);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const today = new Date().toISOString().split('T')[0];

  // Get all shops
  const { data: shops } = await supabaseAdmin.from('shops').select('id, name, expenses');
  const shopList = shops || [];

  // Get all sales for the week
  const { data: allSales } = await supabaseAdmin
    .from('sales')
    .select('shop_id, item_name, quantity, total_with_tax, total_before_tax, tax, date, payment_method, discount_applied, employee_id')
    .gte('date', since);

  // Get last week's sales for comparison
  const { data: lastWeekSales } = await supabaseAdmin
    .from('sales')
    .select('shop_id, total_with_tax')
    .gte('date', lastWeekStart.toISOString())
    .lt('date', since);

  // Get ALL operations ledger entries this week
  const { data: opsLedger } = await supabaseAdmin
    .from('operations_ledger')
    .select('amount, kind, title, shop_id, created_at, notes, employee_id, effective_date')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  // Get ALL invest deposits this week
  const { data: investDeposits } = await supabaseAdmin
    .from('invest_deposits')
    .select('amount, withdrawn, shop_id, created_at, deposited_by')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  // Get today's POS expenses for closing shop
  const { data: todayExpenses } = await supabaseAdmin
    .from('ledger_entries')
    .select('amount, category, description, date')
    .eq('shop_id', closingShopId)
    .eq('category', 'POS Expense')
    .gte('date', `${today}T00:00:00`);

  // Get lay-by data for the week
  const { data: laybyRows } = await supabaseAdmin
    .from('ledger_entries')
    .select('amount, category, description, shop_id, date')
    .in('category', ['Lay-by Deposit', 'Lay-by Payment', 'Lay-by Completed'])
    .gte('date', since)
    .order('date', { ascending: false });

  // Get overhead payments
  const { data: overheadRows } = await supabaseAdmin
    .from('operations_ledger')
    .select('amount, title, shop_id, created_at')
    .eq('kind', 'overhead_payment')
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  const allSalesRows = allSales || [];
  const lastWeekRows = lastWeekSales || [];
  const opsRows = opsLedger || [];
  const investRows = investDeposits || [];
  const todayExpenseRows = todayExpenses || [];
  const laybyRowsFiltered = laybyRows || [];
  const overheadFiltered = overheadRows || [];

  // ==================== SECTION 1: EOD REPORT ====================
  const closingShop = shopList.find((s: any) => s.id === closingShopId);
  const closingShopName = closingShop?.name || closingShopId.toUpperCase();
  const todaySales = allSalesRows.filter((s: any) => s.shop_id === closingShopId && (s.date || '').startsWith(today));
  const todayTotal = todaySales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const todayExpensesTotal = todayExpenseRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
  const todayCashSales = todaySales.filter((s: any) => s.payment_method === 'cash');
  const todayEcocashSales = todaySales.filter((s: any) => s.payment_method === 'ecocash');
  const todayCashTotal = todayCashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const todayEcocashTotal = todayEcocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const todayNet = todayTotal - todayExpensesTotal;

  // ==================== SECTION 2: KIPASA ====================
  const kipasaId = shopList.find((s: any) => s.id?.toLowerCase().includes('kipasa') || s.name?.toLowerCase().includes('kipasa'))?.id;
  const kipasaSales = allSalesRows.filter((s: any) => s.shop_id === kipasaId);
  const kipasaLastWeek = lastWeekRows.filter((s: any) => s.shop_id === kipasaId);
  const kipasaTodaySales = todaySales.filter((s: any) => s.shop_id === kipasaId);
  const kipasaTotal = kipasaSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const kipasaLastTotal = kipasaLastWeek.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const kipasaGrowth = kipasaLastTotal > 0 ? ((kipasaTotal - kipasaLastTotal) / kipasaLastTotal) * 100 : 0;
  const kipasaOps = opsRows.filter((r: any) => r.shop_id === kipasaId);
  const kipasaDeposits = kipasaOps.filter((r: any) => r.amount >= 0).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const kipasaExpensesTotal = kipasaOps.filter((r: any) => r.amount < 0).reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  const kipasaInvest = investRows.filter((d: any) => d.shop_id === kipasaId);
  const kipasaInvestTotal = kipasaInvest.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const kipasaLayby = laybyRowsFiltered.filter((l: any) => l.shop_id === kipasaId);
  const kipasaLaybyTotal = kipasaLayby.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

  // ==================== SECTION 3: DUB DUB & TRADE CENTER ====================
  const dubDubId = shopList.find((s: any) => s.id?.toLowerCase().includes('dub') || s.name?.toLowerCase().includes('dub'))?.id;
  const tradeCenterId = shopList.find((s: any) => s.id?.toLowerCase().includes('trade') || s.name?.toLowerCase().includes('trade'))?.id;
  const otherShopIds = [dubDubId, tradeCenterId].filter(Boolean);
  const otherSales = allSalesRows.filter((s: any) => otherShopIds.includes(s.shop_id));
  const otherLastWeek = lastWeekRows.filter((s: any) => otherShopIds.includes(s.shop_id));
  const otherTodaySales = todaySales.filter((s: any) => otherShopIds.includes(s.shop_id));
  const otherTotal = otherSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const otherLastTotal = otherLastWeek.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const otherGrowth = otherLastTotal > 0 ? ((otherTotal - otherLastTotal) / otherLastTotal) * 100 : 0;
  const otherOps = opsRows.filter((r: any) => otherShopIds.includes(r.shop_id));
  const otherDeposits = otherOps.filter((r: any) => r.amount >= 0).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const otherExpensesTotal = otherOps.filter((r: any) => r.amount < 0).reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  const otherInvest = investRows.filter((d: any) => otherShopIds.includes(d.shop_id));
  const otherInvestTotal = otherInvest.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const otherLayby = laybyRowsFiltered.filter((l: any) => otherShopIds.includes(l.shop_id));
  const otherLaybyTotal = otherLayby.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

  // ==================== SECTION 4: ENTIRE BUSINESS ====================
  const globalTotal = allSalesRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const globalLastTotal = lastWeekRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const globalGrowth = globalLastTotal > 0 ? ((globalTotal - globalLastTotal) / globalLastTotal) * 100 : 0;
  const opsDeposits = opsRows.filter((r: any) => r.amount >= 0);
  const opsExpenses = opsRows.filter((r: any) => r.amount < 0);
  const totalDeposits = opsDeposits.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const totalExpenses = opsExpenses.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  const totalInvest = investRows.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const totalLayby = laybyRowsFiltered.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const netOps = totalDeposits - totalExpenses;
  const lastWeekInvestTotal = (await supabaseAdmin.from('invest_deposits').select('amount').gte('created_at', lastWeekStart.toISOString()).lt('created_at', since)).data?.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0) || 0;
  const investGrowth = lastWeekInvestTotal > 0 ? ((totalInvest - lastWeekInvestTotal) / lastWeekInvestTotal) * 100 : 0;
  const monthlyOverhead = shopList.reduce((sum: number, shop: any) => {
    const exp = shop.expenses as Record<string, number> || {};
    return sum + Object.values(exp).reduce((a: number, b: number) => a + (b || 0), 0);
  }, 0);
  const weeklyOverheadTarget = monthlyOverhead / 4.33;

  // Cost Analysis
  const suggestions: string[] = [];
  const expenseByKind: Record<string, number> = {};
  opsExpenses.forEach((e: any) => {
    const cat = e.kind || 'Other';
    expenseByKind[cat] = (expenseByKind[cat] || 0) + Math.abs(Number(e.amount || 0));
  });
  const sortedExpenses = Object.entries(expenseByKind).sort((a, b) => b[1] - a[1]);

  if (totalExpenses > totalDeposits * 0.5) {
    suggestions.push(`⚠️ HIGH EXPENSE RATIO: Expenses ($${totalExpenses.toFixed(2)}) exceed 50% of deposits ($${totalDeposits.toFixed(2)}). Immediate cost review needed.`);
  }
  if (totalExpenses > weeklyOverheadTarget * 1.2) {
    suggestions.push(`⚠️ OVERHEAD OVERSPEND: Weekly expenses ($${totalExpenses.toFixed(2)}) exceed target ($${weeklyOverheadTarget.toFixed(2)}).`);
  }
  if (globalGrowth < 0) {
    suggestions.push(`📉 REVENUE DIP: Sales down ${Math.abs(globalGrowth).toFixed(1)}% vs last week. Review marketing and pricing strategy.`);
  } else if (globalGrowth > 15) {
    suggestions.push(`📈 STRONG GROWTH: Revenue up ${globalGrowth.toFixed(1)}% vs last week. Maintain momentum!`);
  }
  if (investGrowth > 0) {
    suggestions.push(`💰 INVEST GROWTH: Perfume deposits up ${investGrowth.toFixed(1)}% ($${totalInvest.toFixed(2)} this week).`);
  }
  if (netOps < 0) {
    suggestions.push(`🔴 NET NEGATIVE: Operations net position is -$${Math.abs(netOps).toFixed(2)}. Review spending immediately.`);
  }
  if (sortedExpenses.length > 0 && sortedExpenses[0][1] > totalExpenses * 0.3) {
    suggestions.push(`💸 TOP EXPENSE: "${sortedExpenses[0][0]}" accounts for $${sortedExpenses[0][1].toFixed(2)} (${((sortedExpenses[0][1] / totalExpenses) * 100).toFixed(0)}% of all expenses).`);
  }
  if (globalTotal < weeklyOverheadTarget * 2) {
    suggestions.push(`📊 LOW REVENUE WARNING: Weekly revenue ($${globalTotal.toFixed(2)}) is less than 2x weekly overhead ($${(weeklyOverheadTarget * 2).toFixed(2)}). Focus on sales.`);
  }
  if (totalLayby > globalTotal * 0.2) {
    suggestions.push(`🏦 HIGH LAY-BY: Lay-by activity ($${totalLayby.toFixed(2)}) is ${((totalLayby / globalTotal) * 100).toFixed(0)}% of revenue. Monitor collection.`);
  }
  if (suggestions.length === 0) {
    suggestions.push("✅ ALL SYSTEMS STABLE: Revenue, expenses, and operations within acceptable ranges this week.");
  }

  const startDate = new Date(since).toLocaleDateString();
  const endDate = new Date().toLocaleDateString();
  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  // Helper to format kind labels
  const kindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      eod_deposit: 'EOD Deposit', overhead_contribution: 'Overhead', overhead_payment: 'Overhead Pay',
      stock_order: 'Stock Order', transport: 'Transport', peer_payout: 'Peer Payout', other_expense: 'Other Expense',
      expense: 'Expense', salary: 'Salary', utility: 'Utility'
    };
    return labels[kind] || kind?.replace(/_/g, ' ') || 'Unknown';
  };

  const kindColor = (amount: number) => amount >= 0 ? '#065f46' : '#7f1d1d';

  try {
    await sendEmail({
      to: recipient,
      subject: `[NIRVANA] Weekly Report — ${startDate} to ${endDate} — Closed by ${closingShopName}`,
      html: `
<div style="font-family:Calibri,Arial,sans-serif;max-width:960px;margin:0 auto;background:#0f172a;color:#f1f5f9;">

  <!-- ======= REPORT HEADER ======= -->
  <div style="background:linear-gradient(135deg,#0c2340,#1e3a5f);padding:28px 32px;border-bottom:4px solid #3b82f6;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 style="margin:0;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">NIRVANA WEEKLY BUSINESS REPORT</h1>
        <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">${startDate} — ${endDate} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Closed by: <strong style="color:#fbbf24;">${staffName}</strong> at <strong style="color:#fff;">${closingShopName}</strong></p>
      </div>
      <div style="text-align:right;">
        <div style="background:#1e40af;padding:12px 20px;border-radius:8px;display:inline-block;">
          <p style="margin:0;font-size:10px;color:#bfdbfe;letter-spacing:1px;">TOTAL REVENUE</p>
          <p style="margin:4px 0 0;font-size:32px;font-weight:900;color:#fff;">$${globalTotal.toFixed(2)}</p>
          <p style="margin:0;font-size:11px;color:${globalGrowth >= 0 ? '#86efac' : '#fca5a5'};">${globalGrowth >= 0 ? '↑' : '↓'} ${Math.abs(globalGrowth).toFixed(1)}% vs last week</p>
        </div>
      </div>
    </div>
  </div>

  <!-- ======= SECTION 1: EOD REPORT ======= -->
  <div style="padding:28px 32px;border-bottom:3px solid #f59e0b;">
    <h2 style="margin:0 0 20px;font-size:18px;font-weight:900;color:#f59e0b;border-left:5px solid #f59e0b;padding-left:14px;letter-spacing:0.5px;">
      📋 SECTION 1 — End of Day Report: ${closingShopName}
    </h2>

    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;">
      <div style="background:#1e293b;padding:14px 12px;border-radius:8px;text-align:center;border-top:3px solid #10b981;">
        <p style="margin:0;font-size:10px;color:#94a3b8;letter-spacing:1px;">TODAY'S SALES</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#10b981;">$${todayTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${todaySales.length} transactions</p>
      </div>
      <div style="background:#1e293b;padding:14px 12px;border-radius:8px;text-align:center;border-top:3px solid #3b82f6;">
        <p style="margin:0;font-size:10px;color:#94a3b8;letter-spacing:1px;">CASH SALES</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#fff;">$${todayCashTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${todayCashSales.length} sales</p>
      </div>
      <div style="background:#1e293b;padding:14px 12px;border-radius:8px;text-align:center;border-top:3px solid #8b5cf6;">
        <p style="margin:0;font-size:10px;color:#94a3b8;letter-spacing:1px;">ECOCASH</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#c4b5fd;">$${todayEcocashTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${todayEcocashSales.length} sales</p>
      </div>
      <div style="background:#1e293b;padding:14px 12px;border-radius:8px;text-align:center;border-top:3px solid #ef4444;">
        <p style="margin:0;font-size:10px;color:#94a3b8;letter-spacing:1px;">TODAY'S EXPENSES</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:#ef4444;">$${todayExpensesTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${todayExpenseRows.length} entries</p>
      </div>
      <div style="background:#1e293b;padding:14px 12px;border-radius:8px;text-align:center;border-top:3px solid ${todayNet >= 0 ? '#10b981' : '#ef4444'};">
        <p style="margin:0;font-size:10px;color:#94a3b8;letter-spacing:1px;">TODAY'S NET</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:900;color:${todayNet >= 0 ? '#10b981' : '#ef4444'};">${todayNet >= 0 ? '+' : ''}$${todayNet.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">Cash in drawer</p>
      </div>
    </div>

    ${todayExpenseRows.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;">
      <div style="background:#334155;padding:10px 16px;">
        <strong style="font-size:11px;color:#94a3b8;letter-spacing:1px;">TODAY'S EXPENSE DETAIL</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">TIME</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DESCRIPTION</th>
            <th style="padding:8px 16px;text-align:right;color:#64748b;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${todayExpenseRows.map((e: any) => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(e.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
            <td style="padding:8px 16px;">${e.description || e.category}</td>
            <td style="padding:8px 16px;text-align:right;color:#ef4444;font-weight:600;">-$${Number(e.amount || 0).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<p style="color:#475569;text-align:center;padding:16px;font-size:12px;">No expenses recorded today.</p>'}
  </div>

  <!-- ======= SECTION 2: KIPASA WEEKLY ======= -->
  <div style="padding:28px 32px;border-bottom:3px solid #10b981;">
    <h2 style="margin:0 0 20px;font-size:18px;font-weight:900;color:#10b981;border-left:5px solid #10b981;padding-left:14px;letter-spacing:0.5px;">
      🏪 SECTION 2 — Kipasa Weekly Report
    </h2>

    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px;">
      <div style="background:linear-gradient(135deg,#064e3b,#065f46);padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#6ee7b7;letter-spacing:1px;">WEEKLY REVENUE</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:900;color:#fff;">$${kipasaTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:${kipasaGrowth >= 0 ? '#86efac' : '#fca5a5'};">${kipasaGrowth >= 0 ? '↑' : '↓'} ${Math.abs(kipasaGrowth).toFixed(1)}% wk</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">TODAY SALES</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#fff;">$${kipasaTodaySales.reduce((sum: number, sale: any) => sum + Number(sale?.total_with_tax || 0), 0).toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${kipasaTodaySales.length} sales</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">OPS DEPOSITS</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#3b82f6;">$${kipasaDeposits.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${kipasaOps.filter((r: any) => r.amount >= 0).length} entries</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">OPS EXPENSES</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#ef4444;">$${kipasaExpensesTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${kipasaOps.filter((r: any) => r.amount < 0).length} entries</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">INVEST/PERFUME</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#c4b5fd;">$${kipasaInvestTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${kipasaInvest.length} deposits</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">LAY-BY</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#fbbf24;">$${kipasaLaybyTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${kipasaLayby.length} transactions</p>
      </div>
    </div>

    ${kipasaOps.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;">
      <div style="background:#334155;padding:10px 16px;">
        <strong style="font-size:11px;color:#94a3b8;letter-spacing:1px;">OPERATIONS CASH MOVEMENTS THIS WEEK (${kipasaOps.length} entries)</strong>
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
          ${kipasaOps.slice(0, 20).map((r: any) => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(r.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;"><span style="background:${kindColor(r.amount)};padding:2px 8px;border-radius:4px;font-size:10px;">${kindLabel(r.kind)}</span></td>
            <td style="padding:8px 16px;">${r.title || r.notes || '-'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}</td>
          </tr>`).join('')}
          ${kipasaOps.length > 20 ? `<tr><td colspan="4" style="padding:8px 16px;text-align:center;color:#64748b;font-size:11px;">...and ${kipasaOps.length - 20} more entries</td></tr>` : ''}
        </tbody>
      </table>
    </div>` : ''}

    ${kipasaInvest.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin-top:12px;">
      <div style="background:#334155;padding:10px 16px;">
        <strong style="font-size:11px;color:#94a3b8;letter-spacing:1px;">INVEST / PERFUME DEPOSITS (${kipasaInvest.length} this week)</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DATE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DEPOSITED BY</th>
            <th style="padding:8px 16px;text-align:right;color:#64748b;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${kipasaInvest.map((d: any) => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(d.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;">${d.deposited_by || 'Unknown'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:#c4b5fd;">+$${Number(d.amount || 0).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
  </div>

  <!-- ======= SECTION 3: DUB DUB & TRADE CENTER ======= -->
  <div style="padding:28px 32px;border-bottom:3px solid #3b82f6;">
    <h2 style="margin:0 0 20px;font-size:18px;font-weight:900;color:#3b82f6;border-left:5px solid #3b82f6;padding-left:14px;letter-spacing:0.5px;">
      🏢 SECTION 3 — Dub Dub & Trade Center Weekly Report
    </h2>

    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:16px;">
      <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#93c5fd;letter-spacing:1px;">WEEKLY REVENUE</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:900;color:#fff;">$${otherTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:${otherGrowth >= 0 ? '#93c5fd' : '#fca5a5'};">${otherGrowth >= 0 ? '↑' : '↓'} ${Math.abs(otherGrowth).toFixed(1)}% wk</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">TODAY SALES</p>
            <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#fff;">$${otherTodaySales.reduce((sum: number, sale: any) => sum + Number(sale?.total_with_tax || 0), 0).toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${otherTodaySales.length} sales</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">OPS DEPOSITS</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#3b82f6;">$${otherDeposits.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${otherOps.filter((r: any) => r.amount >= 0).length} entries</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">OPS EXPENSES</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#ef4444;">$${otherExpensesTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${otherOps.filter((r: any) => r.amount < 0).length} entries</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">INVEST/PERFUME</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#c4b5fd;">$${otherInvestTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${otherInvest.length} deposits</p>
      </div>
      <div style="background:#1e293b;padding:14px 10px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">LAY-BY</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:900;color:#fbbf24;">$${otherLaybyTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${otherLayby.length} transactions</p>
      </div>
    </div>

    ${otherOps.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;">
      <div style="background:#334155;padding:10px 16px;">
        <strong style="font-size:11px;color:#94a3b8;letter-spacing:1px;">OPERATIONS CASH MOVEMENTS THIS WEEK (${otherOps.length} entries)</strong>
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
          ${otherOps.slice(0, 20).map((r: any) => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(r.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;"><span style="background:${kindColor(r.amount)};padding:2px 8px;border-radius:4px;font-size:10px;">${kindLabel(r.kind)}</span></td>
            <td style="padding:8px 16px;">${r.title || r.notes || '-'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}</td>
          </tr>`).join('')}
          ${otherOps.length > 20 ? `<tr><td colspan="4" style="padding:8px 16px;text-align:center;color:#64748b;font-size:11px;">...and ${otherOps.length - 20} more entries</td></tr>` : ''}
        </tbody>
      </table>
    </div>` : ''}

    ${otherInvest.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin-top:12px;">
      <div style="background:#334155;padding:10px 16px;">
        <strong style="font-size:11px;color:#94a3b8;letter-spacing:1px;">INVEST / PERFUME DEPOSITS (${otherInvest.length} this week)</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DATE</th>
            <th style="padding:8px 16px;text-align:left;color:#64748b;font-size:10px;">DEPOSITED BY</th>
            <th style="padding:8px 16px;text-align:right;color:#64748b;font-size:10px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${otherInvest.map((d: any) => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(d.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;">${d.deposited_by || 'Unknown'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:#c4b5fd;">+$${Number(d.amount || 0).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
  </div>

  <!-- ======= SECTION 4: ENTIRE BUSINESS ======= -->
  <div style="padding:28px 32px;">

    <h2 style="margin:0 0 20px;font-size:18px;font-weight:900;color:#ec4899;border-left:5px solid #ec4899;padding-left:14px;letter-spacing:0.5px;">
      🌐 SECTION 4 — Entire Business Weekly Report (Operations + Invest)
    </h2>

    <!-- Top-level KPI row -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#064e3b,#065f46);padding:18px 14px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#6ee7b7;letter-spacing:1px;">TOTAL REVENUE</p>
        <p style="margin:6px 0 0;font-size:26px;font-weight:900;color:#fff;">$${globalTotal.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:${globalGrowth >= 0 ? '#86efac' : '#fca5a5'};">${globalGrowth >= 0 ? '↑' : '↓'} ${Math.abs(globalGrowth).toFixed(1)}% vs last wk</p>
      </div>
      <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);padding:18px 14px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#93c5fd;letter-spacing:1px;">OPS DEPOSITS</p>
        <p style="margin:6px 0 0;font-size:26px;font-weight:900;color:#fff;">$${totalDeposits.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#93c5fd;">${opsDeposits.length} entries</p>
      </div>
      <div style="background:linear-gradient(135deg,#7c2d12,#991b1b);padding:18px 14px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#fca5a5;letter-spacing:1px;">OPS EXPENSES</p>
        <p style="margin:6px 0 0;font-size:26px;font-weight:900;color:#fff;">$${totalExpenses.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#fca5a5;">${opsExpenses.length} entries</p>
      </div>
      <div style="background:linear-gradient(135deg,#6b21a8,#7c3aed);padding:18px 14px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#ddd6fe;letter-spacing:1px;">INVEST/PERFUME</p>
        <p style="margin:6px 0 0;font-size:26px;font-weight:900;color:#fff;">$${totalInvest.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:${investGrowth >= 0 ? '#ddd6fe' : '#fca5a5'};">${investGrowth >= 0 ? '↑' : '↓'} ${Math.abs(investGrowth).toFixed(1)}% vs last wk</p>
      </div>
      <div style="background:linear-gradient(135deg,#064e3b,#1e3a5f);padding:18px 14px;border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:9px;color:#94a3b8;letter-spacing:1px;">NET OPS POSITION</p>
        <p style="margin:6px 0 0;font-size:26px;font-weight:900;color:${netOps >= 0 ? '#10b981' : '#ef4444'};">${netOps >= 0 ? '+' : ''}$${netOps.toFixed(2)}</p>
        <p style="margin:4px 0 0;font-size:10px;color:#64748b;">Deposits - Expenses</p>
      </div>
    </div>

    <!-- By-Shop Summary Table -->
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">BY-SHOP PERFORMANCE SUMMARY</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid #334155;">
            <th style="padding:10px 16px;text-align:left;color:#64748b;font-size:10px;letter-spacing:1px;">SHOP</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">REVENUE</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">OPS DEPOSITS</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">OPS EXPENSES</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">INVEST</th>
            <th style="padding:10px 16px;text-align:right;color:#64748b;font-size:10px;letter-spacing:1px;">NET OPS</th>
          </tr>
        </thead>
        <tbody>
          ${shopList.map((shop: any) => {
            const shopRev = allSalesRows.filter((s: any) => s.shop_id === shop.id).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
            const shopOps = opsRows.filter((r: any) => r.shop_id === shop.id);
            const shopDep = shopOps.filter((r: any) => r.amount >= 0).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
            const shopExp = shopOps.filter((r: any) => r.amount < 0).reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
            const shopInv = investRows.filter((d: any) => d.shop_id === shop.id).reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
            const shopNet = shopDep - shopExp;
            return `
            <tr style="border-bottom:1px solid #334155;">
              <td style="padding:10px 16px;font-weight:700;color:#f1f5f9;">${shop.name}</td>
              <td style="padding:10px 16px;text-align:right;color:#10b981;font-weight:600;">$${shopRev.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;color:#3b82f6;">$${shopDep.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;color:#ef4444;">$${shopExp.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;color:#c4b5fd;">$${shopInv.toFixed(2)}</td>
              <td style="padding:10px 16px;text-align:right;font-weight:800;color:${shopNet >= 0 ? '#10b981' : '#ef4444'};">${shopNet >= 0 ? '+' : ''}$${shopNet.toFixed(2)}</td>
            </tr>`;
          }).join('')}
          <tr style="background:#0f172a;">
            <td style="padding:10px 16px;font-weight:900;color:#fff;">TOTAL</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#10b981;">$${globalTotal.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#3b82f6;">$${totalDeposits.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#ef4444;">$${totalExpenses.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:#c4b5fd;">$${totalInvest.toFixed(2)}</td>
            <td style="padding:10px 16px;text-align:right;font-weight:900;color:${netOps >= 0 ? '#10b981' : '#ef4444'};">${netOps >= 0 ? '+' : ''}$${netOps.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Full Operations Ledger -->
    ${opsRows.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">COMPLETE OPERATIONS LEDGER — ${opsRows.length} ENTRIES THIS WEEK</strong>
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
          ${opsRows.map((r: any) => {
            const shopName = shopList.find((s: any) => s.id === r.shop_id)?.name || r.shop_id || '-';
            return `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:8px 16px;color:#94a3b8;">${new Date(r.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;color:#94a3b8;">${shopName}</td>
            <td style="padding:8px 16px;"><span style="background:${kindColor(r.amount)};padding:2px 8px;border-radius:4px;font-size:10px;">${kindLabel(r.kind)}</span></td>
            <td style="padding:8px 16px;">${r.title || r.notes || '-'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}</td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Invest / Perfume All Shops -->
    ${investRows.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">INVEST / PERFUME DEPOSITS — ALL SHOPS (${investRows.length} this week | Total: $${totalInvest.toFixed(2)})</strong>
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

    <!-- Overhead Payments -->
    ${overheadFiltered.length > 0 ? `
    <div style="background:#78350f;border-radius:8px;overflow:hidden;margin-bottom:20px;border-left:4px solid #f59e0b;">
      <div style="background:#92400e;padding:10px 20px;">
        <strong style="font-size:12px;color:#fef3c7;letter-spacing:1px;">OVERHEAD PAYMENTS THIS WEEK — ${overheadFiltered.length} entries | Total: $${overheadFiltered.reduce((s: number, n: any) => s+Math.abs(Number(n?.amount||0)), 0).toFixed(2)}</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tbody>
          ${overheadFiltered.map((h: any) => `
          <tr style="border-bottom:1px solid #78350f;">
            <td style="padding:8px 16px;color:#fde68a;">${new Date(h.created_at).toLocaleDateString()}</td>
            <td style="padding:8px 16px;color:#fde68a;">${h.title || 'Overhead'}</td>
            <td style="padding:8px 16px;text-align:right;font-weight:700;color:#fde68a;">-$${Math.abs(Number(h.amount || 0)).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Cost Analysis -->
    <div style="background:#78350f;border-radius:8px;padding:20px;margin-bottom:20px;border-left:5px solid #f59e0b;">
      <h3 style="margin:0 0 14px;font-size:16px;font-weight:900;color:#fef3c7;letter-spacing:0.5px;">🔍 COST ANALYSIS & FLAGS</h3>
      <ul style="margin:0;padding:0;list-style:none;">
        ${suggestions.map(s => `<li style="margin:10px 0;padding:10px 14px;background:#92400e;border-radius:6px;color:#fef3c7;font-size:13px;font-weight:500;">${s}</li>`).join('')}
      </ul>
    </div>

    <!-- Expense Breakdown -->
    ${sortedExpenses.length > 0 ? `
    <div style="background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#334155;padding:12px 20px;">
        <strong style="font-size:12px;color:#94a3b8;letter-spacing:1px;">EXPENSE BREAKDOWN BY CATEGORY</strong>
      </div>
      ${sortedExpenses.slice(0, 10).map(([cat, amount], idx) => {
        const pct = ((Number(amount) / totalExpenses) * 100).toFixed(0);
        return `
      <div style="padding:10px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:12px;">
        <div style="width:22px;text-align:center;font-size:12px;color:#64748b;font-weight:700;">${idx + 1}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;color:#f1f5f9;font-weight:600;">${cat}</span>
            <span style="font-size:12px;color:#ef4444;font-weight:700;">$${Number(amount).toFixed(2)} <span style="color:#64748b;font-size:10px;">(${pct}%)</span></span>
          </div>
          <div style="background:#0f172a;height:6px;border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;background:#ef4444;height:100%;border-radius:3px;"></div>
          </div>
        </div>
      </div>`;}).join('')}
    </div>` : ''}

    <!-- Actionable Recommendations -->
    <div style="background:#064e3b;border-radius:8px;padding:20px;">
      <h3 style="margin:0 0 14px;font-size:16px;font-weight:900;color:#6ee7b7;letter-spacing:0.5px;">💡 ACTIONABLE RECOMMENDATIONS</h3>
      <ol style="margin:0;padding:0 0 0 24px;color:#d1fae5;font-size:13px;line-height:1.8;">
        <li style="margin:8px 0;">Review the cost analysis flags above and prioritize the top 3 actions this week.</li>
        <li style="margin:8px 0;">Target reducing the largest expense category by 5-10% — even small savings compound.</li>
        <li style="margin:8px 0;">Ensure all shops post EOD deposits consistently to maintain accurate cash flow tracking.</li>
        <li style="margin:8px 0;">Track perfume/invest growth as a leading indicator of customer engagement.</li>
        <li style="margin:8px 0;">Review underperforming shops for process improvements or targeted promotions.</li>
        ${globalGrowth < 5 ? `<li style="margin:8px 0;">Consider a promotional campaign or loyalty incentive to boost weekly revenue growth.</li>` : ''}
        ${totalLayby > 0 ? `<li style="margin:8px 0;">Follow up on active lay-bys — prompt collection improves cash flow.</li>` : ''}
      </ol>
    </div>

  </div>

  <!-- FOOTER -->
  <div style="background:#0c1322;padding:16px 32px;text-align:center;border-top:1px solid #1e293b;">
    <p style="margin:0;font-size:11px;color:#475569;">Nirvana Business Command Center &nbsp;|&nbsp; ${shopList.length} Shops &nbsp;|&nbsp; Week ${startDate} — ${endDate} &nbsp;|&nbsp; Generated ${new Date().toLocaleString()}</p>
  </div>

</div>
      `,
    });
    return true;
  } catch (e: any) {
    console.error("[COMPREHENSIVE WEEKLY] Email send failed:", e?.message || e);
    return false;
  }
}


export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const shopId = body?.shopId;
  const sendEmailEnabled = body?.sendEmail !== false;
  if (!shopId) {
    return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
  }

  // Auth: check staff first, then owner
  const cookieStore = await cookies();
  const staffToken = cookieStore.get("nirvana_staff")?.value;
  const ownerToken = cookieStore.get("nirvana_owner")?.value;

  if (!staffToken && !ownerToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let staffName = "Owner";

  if (staffToken) {
    const tokenHash = createHash("sha256").update(staffToken).digest("hex");
    const { data: session } = await supabaseAdmin
      .from("staff_sessions")
      .select("employee_id, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!session || (session.expires_at && new Date(session.expires_at).getTime() < Date.now())) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const { data: staff } = await supabaseAdmin
      .from("employees")
      .select("id, shop_id, name, surname")
      .eq("id", session.employee_id)
      .maybeSingle();

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 401 });
    }

    if (staff.shop_id !== shopId) {
      return NextResponse.json({ error: "Shop mismatch" }, { status: 403 });
    }
    staffName = `${staff.name} ${staff.surname}`;
  }
  // If no staff token but owner token exists, we let it through to the logic below.

  const since = startOfTodayUTC();
  const since7d = startOfDaysBackUTC(6);
  
  // Get today's sales with discount info
  const { data: sales, error } = await supabaseAdmin
    .from("sales")
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method,discount_applied")
    .eq("shop_id", shopId)
    .gte("date", since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = sales || [];
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
  const totalDiscount = rows.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);

  // Get today's ledger activity (expenses, drawer open, lay-by cash, adjustments)
  const { data: ledgerEntries } = await supabaseAdmin
    .from("ledger_entries")
    .select("amount, category, description, date, type")
    .eq("shop_id", shopId)
    .gte("date", since);

  const ledgerRows = ledgerEntries || [];

  const posExpenseRows = ledgerRows.filter((l: any) => l.category === "POS Expense");
  const totalExpenses = posExpenseRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const openingRows = ledgerRows
    .filter((l: any) => l.category === "Cash Drawer Opening")
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const opening = openingRows[0] || null;
  const openingCash = opening ? Number(opening.amount || 0) : 0;

  const adjustmentRows = ledgerRows.filter((l: any) => l.category === "Cash Drawer Adjustment");
  const adjustmentNet = adjustmentRows.reduce((sum: number, l: any) => {
    const amt = Number(l.amount || 0);
    const t = String(l.type || "").toLowerCase();
    return sum + (t === "income" ? amt : t === "expense" ? -amt : 0);
  }, 0);

  const laybyRows = ledgerRows.filter((l: any) => 
    ['Lay-by Deposit', 'Lay-by Payment', 'Lay-by Completed'].includes(l.category)
  );
  const laybyCash = laybyRows.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

  // Calculate payment method breakdown
  const cashSales = rows.filter((s: any) => s.payment_method === 'cash');
  const ecocashSales = rows.filter((s: any) => s.payment_method === 'ecocash');
  
  const totalCash = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalEcocash = ecocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const closingCashEstimate = openingCash + totalCash + laybyCash - totalExpenses + adjustmentNet;

  // Top items (best sellers)
  const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
  for (const s of rows as any[]) {
    const key = s.item_name || "Unknown";
    const cur = itemMap.get(key) || { name: key, qty: 0, gross: 0 };
    cur.qty += Number(s.quantity || 0);
    cur.gross += Number(s.total_with_tax || 0);
    itemMap.set(key, cur);
  }
  const topItems = [...itemMap.values()]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 8);

  // 7-day pulse (daily totals + best seller per day)
  const { data: recentSales } = await supabaseAdmin
    .from("sales")
    .select("item_name,total_with_tax,quantity,date")
    .eq("shop_id", shopId)
    .gte("date", since7d);

  const dailyMap = new Map<string, { date: string; gross: number; tx: number; items: Map<string, { name: string; gross: number }> }>();
  for (const s of (recentSales || []) as any[]) {
    const day = new Date(s.date).toISOString().split("T")[0];
    const cur = dailyMap.get(day) || { date: day, gross: 0, tx: 0, items: new Map() };
    cur.gross += Number(s.total_with_tax || 0);
    cur.tx += 1;
    const key = String(s.item_name || "Unknown");
    const icur = cur.items.get(key) || { name: key, gross: 0 };
    icur.gross += Number(s.total_with_tax || 0);
    cur.items.set(key, icur);
    dailyMap.set(day, cur);
  }

  const dailyPulse = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const top = [...d.items.values()].sort((a, b) => b.gross - a.gross)[0];
      return { date: d.date, gross: d.gross, transactions: d.tx, topItem: top ? { name: top.name, gross: top.gross } : null };
    });

  const avg7 = dailyPulse.length ? dailyPulse.reduce((s, d) => s + Number(d.gross || 0), 0) / dailyPulse.length : 0;

  // Low stock (<= 5) for this shop
  const { data: lowAllocs } = await supabaseAdmin
    .from("inventory_allocations")
    .select("item_id, quantity")
    .eq("shop_id", shopId)
    .lte("quantity", 5)
    .order("quantity", { ascending: true })
    .limit(5);

  const lowIds = (lowAllocs || []).map((a: any) => a.item_id).filter(Boolean);
  type LowItem = { id: string; name?: string | null; category?: string | null };
  const lowItems: LowItem[] = lowIds.length
    ? (((await supabaseAdmin.from("inventory_items").select("id,name,category").in("id", lowIds)).data as LowItem[]) || [])
    : [];

  const lowItemMap = new Map<string, LowItem>(lowItems.map((i) => [i.id, i]));
  type RestockItem = { itemId: string; name: string; category: string; qty: number };
  const restock: RestockItem[] = (lowAllocs || []).map((a: any) => {
    const it = lowItemMap.get(a.item_id);
    return { itemId: a.item_id, name: it?.name || a.item_id, category: it?.category || "", qty: Number(a.quantity || 0) };
  });

  // Oracle suggestions (deterministic, no external AI required)
  const oracle: string[] = [];
  if (avg7 > 0 && totalWithTax < avg7 * 0.8) oracle.push(`Revenue dipped vs 7-day average ($${avg7.toFixed(2)}). Review staffing, stock-outs, and promotions.`);
  if (avg7 > 0 && totalWithTax > avg7 * 1.2) oracle.push(`Strong day vs 7-day average ($${avg7.toFixed(2)}). Double down on today’s best sellers tomorrow.`);
  if (totalExpenses > 0 && totalWithTax > 0 && totalExpenses > totalWithTax * 0.1) oracle.push(`POS expenses are high relative to sales (${((totalExpenses / totalWithTax) * 100).toFixed(1)}%). Audit today's spend for preventable leakage.`);
  if (restock.length) oracle.push(`Low stock alert: ${restock.map(r => `${r.name} (${r.qty})`).join(", ")}. Prioritize replenishment.`);
  if (topItems.length) oracle.push(`Top seller today: ${topItems[0].name} (gross $${topItems[0].gross.toFixed(2)}). Ensure it stays visible and stocked.`);
  if (!oracle.length) oracle.push("Stable day. Focus on increasing basket size with accessories and controlled discounting.");

  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  let emailed = false;
  if (sendEmailEnabled) {
    try {
      await sendEmail({
        to: recipient,
        subject: `[EOD] ${shopId.toUpperCase()} — ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
            <h2 style="margin:0 0 12px;">End of Day Report — ${shopId.toUpperCase()}</h2>
            <p style="color:#64748b;margin:0 0 16px;">Generated: ${new Date().toLocaleString()}</p>

            <div style="background:#f1f5f9;padding:16px;border-radius:12px;">
              <p style="margin:0;"><b>Transactions:</b> ${rows.length}</p>
              <p style="margin:4px 0 0;"><b>Total (inc tax):</b> $${totalWithTax.toFixed(2)}</p>
              <p style="margin:4px 0 0;"><b>Total (pre tax):</b> $${totalBeforeTax.toFixed(2)}</p>
              <p style="margin:4px 0 0;"><b>Tax:</b> $${totalTax.toFixed(2)}</p>
              <p style="margin:4px 0 0; color:#dc2626;"><b>Discounts Issued:</b> $${totalDiscount.toFixed(2)}</p>
              <p style="margin:4px 0 0; color:#dc2626;"><b>Expenses:</b> $${totalExpenses.toFixed(2)}</p>
              
              <h4 style="margin:16px 0 8px;font-size:12px;">Payment Breakdown</h4>
              <p style="margin:4px 0;"><b>Cash Sales:</b> $${totalCash.toFixed(2)} (${cashSales.length} transactions)</p>
              <p style="margin:4px 0 0;"><b>EcoCash Sales:</b> $${totalEcocash.toFixed(2)} (${ecocashSales.length} transactions)</p>

              <h4 style="margin:16px 0 8px;font-size:12px;">Cash Operations</h4>
              <p style="margin:4px 0;"><b>Opening Drawer:</b> $${openingCash.toFixed(2)} ${opening?.date ? `(${new Date(opening.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})})` : ''}</p>
              <p style="margin:4px 0;"><b>Lay-by Cash Received:</b> $${laybyCash.toFixed(2)}</p>
              <p style="margin:4px 0;"><b>Drawer Adjustments (net):</b> $${adjustmentNet.toFixed(2)}</p>
              <p style="margin:4px 0;"><b>Estimated Closing Cash:</b> $${closingCashEstimate.toFixed(2)}</p>
            </div>

            <h3 style="margin:18px 0 8px;">💸 Expenses Entered Today</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Time</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Description</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${posExpenseRows.length > 0 ? posExpenseRows
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((e: any) => `
                    <tr>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${new Date(e.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${String(e.description || e.category || 'Expense')}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;">-$${Number(e.amount || 0).toFixed(2)}</td>
                    </tr>
                  `).join("") : '<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b;">No POS expenses recorded</td></tr>'}
              </tbody>
            </table>

            <h3 style="margin:18px 0 8px;">📉 Low Stock (Restock Watchlist)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Item</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Category</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${restock.length ? restock.map((r: any) => `
                  <tr>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${r.name}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;color:#64748b;">${r.category || '-'}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.qty}</td>
                  </tr>
                `).join("") : '<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b;">No low-stock items (<= 5) found</td></tr>'}
              </tbody>
            </table>

            <h3 style="margin:18px 0 8px;">📈 7-Day Sales Pulse</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Day (UTC)</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Gross</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Tx</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Best Seller</th>
                </tr>
              </thead>
              <tbody>
                ${dailyPulse.length ? dailyPulse.map((d: any) => `
                  <tr>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${d.date}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(d.gross || 0).toFixed(2)}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">${d.transactions}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${d.topItem ? `${d.topItem.name} ($${Number(d.topItem.gross || 0).toFixed(2)})` : '-'}</td>
                  </tr>
                `).join("") : '<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b;">Not enough sales data for pulse</td></tr>'}
              </tbody>
            </table>

            <h3 style="margin:18px 0 8px;">🔮 Oracle Suggestions</h3>
            <ul style="margin:0;padding-left:18px;">
              ${oracle.map((t) => `<li style="margin:6px 0;">${t}</li>`).join("")}
            </ul>

            <h3 style="margin:18px 0 8px;">📦 All Sales Today</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Time</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Item</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Qty</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Total</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Discount</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length > 0 ? rows
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((s: any) => `
                    <tr>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${new Date(s.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${s.item_name}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">${s.quantity}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(s.total_with_tax).toFixed(2)}</td>
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;">${s.discount_applied ? '-$'+Number(s.discount_applied).toFixed(2) : '-'}</td>
                    </tr>
                  `).join("") : '<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;">No sales today</td></tr>'}
              </tbody>
            </table>

            <h3 style="margin:18px 0 8px;">🏆 Top Items (Best Sellers)</h3>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:8px;">Item</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:8px;">Qty</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:8px;">Gross</th>
                </tr>
              </thead>
              <tbody>
                ${topItems
                  .map(
                    (i) => `
                      <tr>
                        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i.name}</td>
                        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${i.qty}</td>
                        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">$${i.gross.toFixed(2)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `,
      });
      emailed = true;
    } catch (e: any) {
      console.error("[EOD] Email send failed:", e?.message || e);
    }
  }

  // Send weekly reports on SATURDAYS only (Saturday = 6)
  const today = new Date().getDay();
  const shouldSendWeekly = today === 6;
  
  let comprehensiveWeeklyEmailed = false;
  let weeklyEmailed = false;
  if (shouldSendWeekly) {
    // Old per-shop weekly report (Kipasa-specific)
    try {
      weeklyEmailed = await sendWeeklyReport(shopId, staffName);
    } catch (e: any) {
      console.error("[EOD] Weekly per-shop report failed:", e?.message || e);
    }
    // New comprehensive 4-section report
    try {
      comprehensiveWeeklyEmailed = await sendComprehensiveWeeklyReport(shopId, staffName);
    } catch (e: any) {
      console.error("[EOD] Comprehensive weekly report failed:", e?.message || e);
    }
  }

  return NextResponse.json({
    success: true,
    emailed,
    weeklyEmailed,
    comprehensiveWeeklyEmailed,
    totals: { 
      totalWithTax, 
      totalBeforeTax, 
      totalTax, 
      totalDiscount,
      totalExpenses,
      count: rows.length,
      totalCash,
      totalEcocash,
      openingCash,
      laybyCash,
      adjustmentNet,
      closingCashEstimate,
      cashTransactionCount: cashSales.length,
      ecocashTransactionCount: ecocashSales.length
    },
    expenses: posExpenseRows.map((e: any) => ({
      time: new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      amount: Number(e.amount || 0),
      description: String(e.description || ""),
    })),
    restock,
    dailyPulse,
    oracle,
    topItems,
    allSales: rows.map((s: any) => ({
      time: new Date(s.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      item: s.item_name,
      quantity: s.quantity,
      total: Number(s.total_with_tax),
      discount: Number(s.discount_applied || 0)
    }))
  });
}
