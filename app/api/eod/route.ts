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
    .select('shop_id, item_name, quantity, total_with_tax, total_before_tax, tax, date, payment_method, discount_applied')
    .gte('date', since);

  // Get last week's sales for comparison
  const { data: lastWeekSales } = await supabaseAdmin
    .from('sales')
    .select('shop_id, total_with_tax')
    .gte('date', lastWeekStart.toISOString())
    .lt('date', since);

  // Get operations ledger
  const { data: opsLedger } = await supabaseAdmin
    .from('operations_ledger')
    .select('amount, kind, title, shop_id, created_at')
    .gte('created_at', since);

  // Get invest deposits
  const { data: investDeposits } = await supabaseAdmin
    .from('invest_deposits')
    .select('amount, withdrawn, shop_id, created_at')
    .gte('created_at', since);

  // Get today's POS expenses for closing shop
  const { data: todayExpenses } = await supabaseAdmin
    .from('ledger_entries')
    .select('amount, category, description, date')
    .eq('shop_id', closingShopId)
    .eq('category', 'POS Expense')
    .gte('date', `${today}T00:00:00`);

  const allSalesRows = allSales || [];
  const lastWeekRows = lastWeekSales || [];
  const opsRows = opsLedger || [];
  const investRows = investDeposits || [];
  const todayExpenseRows = todayExpenses || [];

  // ==================== SECTION 1: EOD REPORT (Closing Shop) ====================
  const closingShop = shopList.find((s: any) => s.id === closingShopId);
  const closingShopName = closingShop?.name || closingShopId.toUpperCase();
  
  const todaySales = allSalesRows.filter((s: any) => 
    s.shop_id === closingShopId && (s.date || '').startsWith(today)
  );
  
  const todayTotal = todaySales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const todayExpensesTotal = todayExpenseRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
  const todayCashSales = todaySales.filter((s: any) => s.payment_method === 'cash');
  const todayEcocashSales = todaySales.filter((s: any) => s.payment_method === 'ecocash');
  const todayCashTotal = todayCashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const todayEcocashTotal = todayEcocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

  // ==================== SECTION 2: KIPASA WEEKLY REPORT ====================
  const kipasaId = shopList.find((s: any) => s.id?.toLowerCase().includes('kipasa') || s.name?.toLowerCase().includes('kipasa'))?.id;
  const kipasaSales = allSalesRows.filter((s: any) => s.shop_id === kipasaId);
  const kipasaLastWeek = lastWeekRows.filter((s: any) => s.shop_id === kipasaId);
  const kipasaTodaySales = todaySales.filter((s: any) => s.shop_id === kipasaId);
  const kipasaTodayExpenses = todayExpenseRows.filter((e: any) => e.shop_id === kipasaId);
  
  const kipasaTotal = kipasaSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const kipasaLastTotal = kipasaLastWeek.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const kipasaGrowth = kipasaLastTotal > 0 ? ((kipasaTotal - kipasaLastTotal) / kipasaLastTotal) * 100 : 0;
  const kipasaExpenses = opsRows.filter((r: any) => r.shop_id === kipasaId && (r.kind?.includes('expense') || r.kind === 'overhead_payment'));
  const kipasaExpensesTotal = kipasaExpenses.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  const kipasaInvest = investRows.filter((d: any) => d.shop_id === kipasaId);
  const kipasaInvestTotal = kipasaInvest.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);

  // ==================== SECTION 3: DUB DUB & TRADE CENTER WEEKLY REPORT ====================
  const dubDubId = shopList.find((s: any) => s.id?.toLowerCase().includes('dub') || s.name?.toLowerCase().includes('dub'))?.id;
  const tradeCenterId = shopList.find((s: any) => s.id?.toLowerCase().includes('trade') || s.name?.toLowerCase().includes('trade'))?.id;
  
  const otherShopIds = [dubDubId, tradeCenterId].filter(Boolean);
  const otherSales = allSalesRows.filter((s: any) => otherShopIds.includes(s.shop_id));
  const otherLastWeek = lastWeekRows.filter((s: any) => otherShopIds.includes(s.shop_id));
  const otherTodaySales = todaySales.filter((s: any) => otherShopIds.includes(s.shop_id));
  const otherTodayExpenses = todayExpenseRows.filter((e: any) => otherShopIds.includes(e.shop_id));
  
  const otherTotal = otherSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const otherLastTotal = otherLastWeek.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const otherGrowth = otherLastTotal > 0 ? ((otherTotal - otherLastTotal) / otherLastTotal) * 100 : 0;
  const otherExpenses = opsRows.filter((r: any) => otherShopIds.includes(r.shop_id) && (r.kind?.includes('expense') || r.kind === 'overhead_payment'));
  const otherExpensesTotal = otherExpenses.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  const otherInvest = investRows.filter((d: any) => otherShopIds.includes(d.shop_id));
  const otherInvestTotal = otherInvest.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);

  // ==================== SECTION 4: ENTIRE BUSINESS WEEKLY REPORT ====================
  const globalTotal = allSalesRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const globalLastTotal = lastWeekRows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const globalGrowth = globalLastTotal > 0 ? ((globalTotal - globalLastTotal) / globalLastTotal) * 100 : 0;
  
  const opsDeposits = opsRows.filter((r: any) => r.kind === 'eod_deposit' || r.kind === 'overhead_contribution');
  const opsExpenses = opsRows.filter((r: any) => r.kind?.includes('expense') || r.kind === 'overhead_payment');
  const totalDeposits = opsDeposits.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const totalExpenses = opsExpenses.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
  
  const globalInvest = investRows.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const lastWeekInvest = await supabaseAdmin
    .from('invest_deposits')
    .select('amount')
    .gte('created_at', lastWeekStart.toISOString())
    .lt('created_at', since);
  const lastWeekInvestTotal = (lastWeekInvest.data || []).reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const investGrowth = lastWeekInvestTotal > 0 ? ((globalInvest - lastWeekInvestTotal) / lastWeekInvestTotal) * 100 : 0;

  // Monthly overhead
  const monthlyOverhead = shopList.reduce((sum: number, shop: any) => {
    const exp = shop.expenses as Record<string, number> || {};
    return sum + Object.values(exp).reduce((a: number, b: number) => a + (b || 0), 0);
  }, 0);
  const weeklyOverheadTarget = monthlyOverhead / 4.33;

  // Cost Analysis
  const suggestions: string[] = [];
  const highCostCategories: Record<string, number> = {};
  opsExpenses.forEach((e: any) => {
    const cat = e.title || e.kind || 'Uncategorized';
    highCostCategories[cat] = (highCostCategories[cat] || 0) + Math.abs(Number(e.amount || 0));
  });
  
  if (totalExpenses > totalDeposits * 0.3) {
    suggestions.push(`⚠️ EXPENSES HIGH: $${totalExpenses.toFixed(2)} exceeds 30% of deposits.`);
  }
  if (globalGrowth < 0) {
    suggestions.push(`📉 REVENUE DIP: Sales down ${Math.abs(globalGrowth).toFixed(1)}% vs last week.`);
  } else if (globalGrowth > 10) {
    suggestions.push(`📈 STRONG GROWTH: Revenue up ${globalGrowth.toFixed(1)}% vs last week!`);
  }
  if (investGrowth > 0) {
    suggestions.push(`💰 INVEST GROWTH: Perfume deposits up ${investGrowth.toFixed(1)}% this week.`);
  }
  if (suggestions.length === 0) {
    suggestions.push("✅ OPERATIONS STABLE: All metrics within acceptable ranges.");
  }

  const startDate = new Date(since).toLocaleDateString();
  const endDate = new Date().toLocaleDateString();
  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  try {
    await sendEmail({
      to: recipient,
      subject: `[WEEKLY] Complete Business Report — ${startDate} to ${endDate}`,
      html: `
        <div style="font-family:sans-serif;max-width:900px;margin:0 auto;background:#0f172a;color:#e2e8f0;">
          
          <!-- HEADER -->
          <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:30px;text-align:center;border-bottom:3px solid #3b82f6;">
            <h1 style="margin:0;font-size:28px;color:#fff;">📊 COMPLETE WEEKLY BUSINESS REPORT</h1>
            <p style="margin:10px 0 0;color:#94a3b8;font-size:14px;">${startDate} - ${endDate}</p>
            <p style="margin:5px 0 0;color:#64748b;font-size:12px;">Generated: ${new Date().toLocaleString()}</p>
          </div>

          <!-- SECTION 1: EOD REPORT -->
          <div style="padding:24px;border-bottom:2px solid #1e293b;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#f59e0b;border-left:4px solid #f59e0b;padding-left:12px;">
              📋 SECTION 1: EOD Report — ${closingShopName}
            </h2>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Today's Sales</p>
                <p style="margin:8px 0 0;font-size:24px;font-weight:bold;color:#10b981;">$${todayTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${todaySales.length} transactions</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Cash Sales</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#fff;">$${todayCashTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${todayCashSales.length} sales</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">EcoCash</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#8b5cf6;">$${todayEcocashTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${todayEcocashSales.length} sales</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Today's Expenses</p>
                <p style="margin:8px 0 0;font-size:24px;font-weight:bold;color:#ef4444;">$${todayExpensesTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${todayExpenseRows.length} entries</p>
              </div>
            </div>
            ${todayExpenseRows.length > 0 ? `
              <table style="width:100%;border-collapse:collapse;font-size:11px;background:#1e293b;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#334155;">
                    <th style="padding:8px;text-align:left;color:#94a3b8;">Time</th>
                    <th style="padding:8px;text-align:left;color:#94a3b8;">Description</th>
                    <th style="padding:8px;text-align:right;color:#94a3b8;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${todayExpenseRows.map((e: any) => `
                    <tr style="border-top:1px solid #334155;">
                      <td style="padding:8px;color:#94a3b8;">${new Date(e.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                      <td style="padding:8px;">${e.description || e.category}</td>
                      <td style="padding:8px;text-align:right;color:#ef4444;">-$${Number(e.amount).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : '<p style="color:#64748b;text-align:center;padding:20px;">No expenses recorded today</p>'}
          </div>

          <!-- SECTION 2: KIPASA WEEKLY -->
          <div style="padding:24px;border-bottom:2px solid #1e293b;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#10b981;border-left:4px solid #10b981;padding-left:12px;">
              🏪 SECTION 2: Kipasa Weekly Report
            </h2>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Weekly Revenue</p>
                <p style="margin:8px 0 0;font-size:24px;font-weight:bold;color:#10b981;">$${kipasaTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:${kipasaGrowth >= 0 ? '#10b981' : '#ef4444'};">${kipasaGrowth >= 0 ? '↑' : '↓'} ${Math.abs(kipasaGrowth).toFixed(1)}% vs last week</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Today's Sales</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#fff;">$${kipasaTodaySales.reduce((s: number, x: any) => s + Number(x.total_with_tax || 0), 0).toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${kipasaTodaySales.length} sales</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Weekly Expenses</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#ef4444;">$${kipasaExpensesTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${kipasaExpenses.length} entries</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Invest/Perfume</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#8b5cf6;">$${kipasaInvestTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${kipasaInvest.length} deposits</p>
              </div>
            </div>
          </div>

          <!-- SECTION 3: DUB DUB & TRADE CENTER WEEKLY -->
          <div style="padding:24px;border-bottom:2px solid #1e293b;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#3b82f6;border-left:4px solid #3b82f6;padding-left:12px;">
              🏢 SECTION 3: Dub Dub & Trade Center Weekly Report
            </h2>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Weekly Revenue</p>
                <p style="margin:8px 0 0;font-size:24px;font-weight:bold;color:#10b981;">$${otherTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:${otherGrowth >= 0 ? '#10b981' : '#ef4444'};">${otherGrowth >= 0 ? '↑' : '↓'} ${Math.abs(otherGrowth).toFixed(1)}% vs last week</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Today's Sales</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#fff;">$${otherTodaySales.reduce((s: number, x: any) => s + Number(x.total_with_tax || 0), 0).toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${otherTodaySales.length} sales</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Weekly Expenses</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#ef4444;">$${otherExpensesTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${otherExpenses.length} entries</p>
              </div>
              <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#64748b;">Invest/Perfume</p>
                <p style="margin:8px 0 0;font-size:20px;font-weight:bold;color:#8b5cf6;">$${otherInvestTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${otherInvest.length} deposits</p>
              </div>
            </div>
          </div>

          <!-- SECTION 4: ENTIRE BUSINESS WEEKLY -->
          <div style="padding:24px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#ec4899;border-left:4px solid #ec4899;padding-left:12px;">
              🌐 SECTION 4: Entire Business Weekly Report
            </h2>
            
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
              <div style="background:linear-gradient(135deg,#065f46,#064e3b);padding:20px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#6ee7b7;">Total Revenue</p>
                <p style="margin:8px 0 0;font-size:28px;font-weight:bold;color:#fff;">$${globalTotal.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#6ee7b7;">${globalGrowth >= 0 ? '↑' : '↓'} ${Math.abs(globalGrowth).toFixed(1)}% vs last week</p>
              </div>
              <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);padding:20px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#93c5fd;">Operations Deposits</p>
                <p style="margin:8px 0 0;font-size:28px;font-weight:bold;color:#fff;">$${totalDeposits.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#93c5fd;">${opsDeposits.length} transactions</p>
              </div>
              <div style="background:linear-gradient(135deg,#7c2d12,#991b1b);padding:20px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#fca5a5;">Total Expenses</p>
                <p style="margin:8px 0 0;font-size:28px;font-weight:bold;color:#fff;">$${totalExpenses.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#fca5a5;">${opsExpenses.length} entries</p>
              </div>
              <div style="background:linear-gradient(135deg,#6b21a8,#7c3aed);padding:20px;border-radius:8px;text-align:center;">
                <p style="margin:0;font-size:11px;color:#ddd6fe;">Invest/Perfume Growth</p>
                <p style="margin:8px 0 0;font-size:28px;font-weight:bold;color:#fff;">$${globalInvest.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#ddd6fe;">${investGrowth >= 0 ? '↑' : '↓'} ${Math.abs(investGrowth).toFixed(1)}% vs last week</p>
              </div>
            </div>

            <div style="background:#1e293b;padding:20px;border-radius:8px;margin-bottom:20px;">
              <h3 style="margin:0 0 12px;color:#fbbf24;">📊 By-Shop Performance Summary</h3>
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="border-bottom:1px solid #334155;">
                    <th style="padding:8px;text-align:left;color:#94a3b8;">Shop</th>
                    <th style="padding:8px;text-align:right;color:#94a3b8;">Revenue</th>
                    <th style="padding:8px;text-align:right;color:#94a3b8;">Deposits</th>
                    <th style="padding:8px;text-align:right;color:#94a3b8;">Expenses</th>
                    <th style="padding:8px;text-align:right;color:#94a3b8;">Net</th>
                  </tr>
                </thead>
                <tbody>
                  ${shopList.map((shop: any) => {
                    const shopRev = allSalesRows.filter((s: any) => s.shop_id === shop.id).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
                    const shopDeposits = opsDeposits.filter((r: any) => r.shop_id === shop.id).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
                    const shopExpenses = opsExpenses.filter((r: any) => r.shop_id === shop.id).reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);
                    const net = shopDeposits - shopExpenses;
                    return `
                      <tr style="border-bottom:1px solid #334155;">
                        <td style="padding:8px;font-weight:600;">${shop.name}</td>
                        <td style="padding:8px;text-align:right;color:#10b981;">$${shopRev.toFixed(2)}</td>
                        <td style="padding:8px;text-align:right;color:#3b82f6;">$${shopDeposits.toFixed(2)}</td>
                        <td style="padding:8px;text-align:right;color:#ef4444;">$${shopExpenses.toFixed(2)}</td>
                        <td style="padding:8px;text-align:right;font-weight:600;color:${net >= 0 ? '#10b981' : '#ef4444'};">$${net.toFixed(2)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div style="background:#1e293b;padding:20px;border-radius:8px;margin-bottom:20px;">
              <h3 style="margin:0 0 12px;color:#fbbf24;">💵 Operations Ledger Summary</h3>
              <p style="margin:0 0 12px;font-size:12px;color:#64748b;">All cash movements from Operations page this week (showing latest 15)</p>
              <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                  <tr style="border-bottom:1px solid #334155;">
                    <th style="padding:6px;text-align:left;color:#94a3b8;">Date</th>
                    <th style="padding:6px;text-align:left;color:#94a3b8;">Type</th>
                    <th style="padding:6px;text-align:left;color:#94a3b8;">Description</th>
                    <th style="padding:6px;text-align:right;color:#94a3b8;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${opsRows.slice(0, 15).map((r: any) => `
                    <tr style="border-bottom:1px solid #334155;">
                      <td style="padding:6px;color:#64748b;">${new Date(r.created_at).toLocaleDateString()}</td>
                      <td style="padding:6px;"><span style="background:${r.amount >= 0 ? '#065f46' : '#7f1d1d'};padding:2px 6px;border-radius:4px;font-size:10px;">${r.kind || 'unknown'}</span></td>
                      <td style="padding:6px;">${r.title || '-'}</td>
                      <td style="padding:6px;text-align:right;color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                  ${opsRows.length === 0 ? '<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b;">No operations entries this week</td></tr>' : ''}
                </tbody>
              </table>
            </div>

            <div style="background:#78350f;padding:20px;border-radius:8px;border-left:4px solid #f59e0b;margin-bottom:20px;">
              <h3 style="margin:0 0 12px;color:#fef3c7;">🔍 Cost Analysis & Alerts</h3>
              <ul style="margin:0;padding-left:20px;color:#fef3c7;font-size:13px;">
                ${suggestions.map(s => `<li style="margin:8px 0;">${s}</li>`).join('')}
              </ul>
            </div>

            <div style="background:#064e3b;padding:20px;border-radius:8px;">
              <h3 style="margin:0 0 12px;color:#6ee7b7;">💡 Weekly Recommendations</h3>
              <ol style="margin:0;padding-left:20px;color:#d1fae5;font-size:13px;">
                <li style="margin:6px 0;">Review high-cost categories and identify potential savings of 5-10%</li>
                <li style="margin:6px 0;">Maintain consistent deposit schedule to improve cash flow visibility</li>
                <li style="margin:6px 0;">Monitor shop-specific expense ratios weekly</li>
                <li style="margin:6px 0;">Track invest/perfume growth as indicator of customer engagement</li>
                ${globalGrowth < 5 ? '<li style="margin:6px 0;">Consider promotional campaigns to boost weekly revenue growth</li>' : ''}
              </ol>
            </div>
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

// Old enhanced weekly report - kept for compatibility
async function sendEnhancedWeeklyReport() {
  const since = startOfWeekUTC();
  const lastWeekStart = new Date(since);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  // Get all shops
  const { data: shops } = await supabaseAdmin.from('shops').select('id, name, expenses');
  const shopList = shops || [];

  // Get this week's sales (ALL shops)
  const { data: thisWeekSales } = await supabaseAdmin
    .from('sales')
    .select('shop_id, total_with_tax, date')
    .gte('date', since);

  // Get last week's sales for comparison
  const { data: lastWeekSales } = await supabaseAdmin
    .from('sales')
    .select('shop_id, total_with_tax, date')
    .gte('date', lastWeekStart.toISOString())
    .lt('date', since);

  // Get operations ledger (ALL shops for the week)
  const { data: opsLedger } = await supabaseAdmin
    .from('operations_ledger')
    .select('amount, kind, title, shop_id, created_at')
    .gte('created_at', since);

  // Get invest deposits (ALL shops)
  const { data: investDeposits } = await supabaseAdmin
    .from('invest_deposits')
    .select('amount, withdrawn, shop_id, created_at')
    .gte('created_at', since);

  // Calculate totals
  const thisWeekRevenue = (thisWeekSales || []).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const lastWeekRevenue = (lastWeekSales || []).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const revenueGrowth = lastWeekRevenue > 0 ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : 0;

  // Operations summary
  const opsRows = opsLedger || [];
  const deposits = opsRows.filter((r: any) => r.kind === 'eod_deposit' || r.kind === 'overhead_contribution');
  const totalDeposits = deposits.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const expenses = opsRows.filter((r: any) => r.kind?.includes('expense') || r.kind === 'overhead_payment');
  const totalExpenses = expenses.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0);

  // By shop breakdown
  const byShop: Record<string, { revenue: number; deposits: number; expenses: number }> = {};
  shopList.forEach((shop: any) => {
    const shopSales = (thisWeekSales || []).filter((s: any) => s.shop_id === shop.id);
    const shopRevenue = shopSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
    const shopDeposits = deposits.filter((d: any) => d.shop_id === shop.id);
    const shopDepositTotal = shopDeposits.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
    const shopExpenses = expenses.filter((e: any) => e.shop_id === shop.id);
    const shopExpenseTotal = shopExpenses.reduce((sum: number, e: any) => sum + Math.abs(Number(e.amount || 0)), 0);
    byShop[shop.name] = { revenue: shopRevenue, deposits: shopDepositTotal, expenses: shopExpenseTotal };
  });

  // Invest/Perfume growth
  const thisWeekInvest = (investDeposits || []).reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const { data: lastWeekInvest } = await supabaseAdmin
    .from('invest_deposits')
    .select('amount')
    .gte('created_at', lastWeekStart.toISOString())
    .lt('created_at', since);
  const lastWeekInvestTotal = (lastWeekInvest || []).reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const investGrowth = lastWeekInvestTotal > 0 ? ((thisWeekInvest - lastWeekInvestTotal) / lastWeekInvestTotal) * 100 : 0;

  // Get monthly overhead target from shop expenses
  const monthlyOverhead = shopList.reduce((sum: number, shop: any) => {
    const exp = shop.expenses as Record<string, number> || {};
    return sum + Object.values(exp).reduce((a: number, b: number) => a + (b || 0), 0);
  }, 0);
  const weeklyOverheadTarget = monthlyOverhead / 4.33;

  // Cost Analysis & Suggestions (AI-style deterministic analysis)
  const suggestions: string[] = [];
  const highCostCategories: Record<string, number> = {};

  // Analyze expense categories
  expenses.forEach((e: any) => {
    const cat = e.title || e.kind || 'Uncategorized';
    highCostCategories[cat] = (highCostCategories[cat] || 0) + Math.abs(Number(e.amount || 0));
  });

  // Generate suggestions based on data
  if (totalExpenses > totalDeposits * 0.3) {
    suggestions.push(`⚠️ EXPENSES HIGH: Expenses ($${totalExpenses.toFixed(2)}) exceed 30% of deposits. Review overhead allocation.`);
  }

  if (revenueGrowth < 0) {
    suggestions.push(`📉 REVENUE DIP: Sales down ${Math.abs(revenueGrowth).toFixed(1)}% vs last week. Consider promotions or inventory check.`);
  } else if (revenueGrowth > 10) {
    suggestions.push(`📈 STRONG GROWTH: Revenue up ${revenueGrowth.toFixed(1)}% vs last week. Capitalize on this momentum!`);
  }

  if (investGrowth > 0) {
    suggestions.push(`💰 INVESTMENT GROWTH: Perfume/Invest deposits up ${investGrowth.toFixed(1)}% this week.`);
  }

  // High cost categories
  const topCosts = Object.entries(highCostCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  if (topCosts.length > 0) {
    suggestions.push(`💸 TOP COSTS THIS WEEK: ${topCosts.map(([k, v]) => `${k} ($${v.toFixed(2)})`).join(', ')}`);
  }

  // Efficiency suggestions
  const avgDailyRevenue = thisWeekRevenue / 7;
  if (avgDailyRevenue < weeklyOverheadTarget) {
    suggestions.push(`🎯 BREAK-EVEN FOCUS: Average daily revenue ($${avgDailyRevenue.toFixed(2)}) below overhead target ($${weeklyOverheadTarget.toFixed(2)}/day).`);
  }

  // Shop-specific suggestions
  Object.entries(byShop).forEach(([shopName, data]) => {
    if (data.revenue > 0 && data.expenses > data.revenue * 0.5) {
      suggestions.push(`🏪 ${shopName.toUpperCase()}: High expense ratio (${((data.expenses / data.revenue) * 100).toFixed(0)}% of revenue). Audit overhead.`);
    }
  });

  if (suggestions.length === 0) {
    suggestions.push("✅ OPERATIONS STABLE: All metrics within acceptable ranges. Continue current strategy.");
  }

  const startDate = new Date(since).toLocaleDateString();
  const endDate = new Date().toLocaleDateString();

  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  try {
    await sendEmail({
      to: recipient,
      subject: `[WEEKLY OVERVIEW] All Shops — ${startDate} to ${endDate}`,
      html: `
        <div style="font-family:sans-serif;max-width:800px;margin:0 auto;">
          <h2 style="margin:0 0 12px;">📊 Enhanced Weekly Overview — All Shops Combined</h2>
          <p style="color:#64748b;margin:0 0 4px;">Week: ${startDate} - ${endDate}</p>
          <p style="color:#64748b;margin:0 0 16px;">Generated: ${new Date().toLocaleString()}</p>

          <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:20px;border-radius:12px;margin-bottom:16px;">
            <h3 style="margin:0 0 16px;color:#fff;">💰 Weekly Performance Summary</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div style="background:rgba(255,255,255,0.1);padding:12px;border-radius:8px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;">This Week Revenue</p>
                <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#10b981;">$${thisWeekRevenue.toFixed(2)}</p>
                ${revenueGrowth !== 0 ? `<p style="margin:4px 0 0;font-size:12px;color:${revenueGrowth >= 0 ? '#10b981' : '#ef4444'};">${revenueGrowth >= 0 ? '↑' : '↓'} ${Math.abs(revenueGrowth).toFixed(1)}% vs last week</p>` : ''}
              </div>
              <div style="background:rgba(255,255,255,0.1);padding:12px;border-radius:8px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;">Invest/Perfume Growth</p>
                <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#8b5cf6;">$${thisWeekInvest.toFixed(2)}</p>
                ${investGrowth !== 0 ? `<p style="margin:4px 0 0;font-size:12px;color:${investGrowth >= 0 ? '#10b981' : '#ef4444'};">${investGrowth >= 0 ? '↑' : '↓'} ${Math.abs(investGrowth).toFixed(1)}% vs last week</p>` : ''}
              </div>
              <div style="background:rgba(255,255,255,0.1);padding:12px;border-radius:8px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;">Operations Deposits</p>
                <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#3b82f6;">$${totalDeposits.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${deposits.length} transactions</p>
              </div>
              <div style="background:rgba(255,255,255,0.1);padding:12px;border-radius:8px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;">Total Expenses</p>
                <p style="margin:4px 0 0;font-size:24px;font-weight:bold;color:#ef4444;">$${totalExpenses.toFixed(2)}</p>
                <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${expenses.length} entries</p>
              </div>
            </div>
          </div>

          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin-bottom:16px;">
            <h3 style="margin:0 0 12px;">📍 Performance by Shop</h3>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:#e2e8f0;">
                  <th style="text-align:left;padding:8px;">Shop</th>
                  <th style="text-align:right;padding:8px;">Revenue</th>
                  <th style="text-align:right;padding:8px;">Deposits</th>
                  <th style="text-align:right;padding:8px;">Expenses</th>
                  <th style="text-align:right;padding:8px;">Net</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(byShop).map(([name, data]) => `
                  <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:8px;font-weight:600;">${name}</td>
                    <td style="padding:8px;text-align:right;color:#10b981;">$${data.revenue.toFixed(2)}</td>
                    <td style="padding:8px;text-align:right;color:#3b82f6;">$${data.deposits.toFixed(2)}</td>
                    <td style="padding:8px;text-align:right;color:#ef4444;">$${data.expenses.toFixed(2)}</td>
                    <td style="padding:8px;text-align:right;font-weight:600;color:${(data.deposits - data.expenses) >= 0 ? '#10b981' : '#ef4444'};">$${(data.deposits - data.expenses).toFixed(2)}</td>
                  </tr>
                `).join('')}
                <tr style="background:#f8fafc;font-weight:700;">
                  <td style="padding:8px;">TOTAL</td>
                  <td style="padding:8px;text-align:right;color:#10b981;">$${thisWeekRevenue.toFixed(2)}</td>
                  <td style="padding:8px;text-align:right;color:#3b82f6;">$${totalDeposits.toFixed(2)}</td>
                  <td style="padding:8px;text-align:right;color:#ef4444;">$${totalExpenses.toFixed(2)}</td>
                  <td style="padding:8px;text-align:right;color:#10b981;">$${(totalDeposits - totalExpenses).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="background:#fef3c7;padding:16px;border-radius:12px;border-left:4px solid #f59e0b;margin-bottom:16px;">
            <h3 style="margin:0 0 12px;color:#92400e;">🔍 Cost Analysis & Efficiency Suggestions</h3>
            <ul style="margin:0;padding-left:20px;color:#78350f;">
              ${suggestions.map(s => `<li style="margin:8px 0;font-size:13px;">${s}</li>`).join('')}
            </ul>
          </div>

          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin-bottom:16px;">
            <h3 style="margin:0 0 12px;">💵 Operations Ledger Summary</h3>
            <p style="margin:0 0 8px;font-size:12px;color:#64748b;">All cash movements from Operations page this week</p>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
              <thead>
                <tr>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Date</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Type</th>
                  <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:6px;">Description</th>
                  <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:6px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${opsRows.slice(0, 20).map((r: any) => `
                  <tr>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${new Date(r.created_at).toLocaleDateString()}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;">
                      <span style="background:${r.amount >= 0 ? '#dcfce7' : '#fee2e2'};padding:2px 6px;border-radius:4px;font-size:10px;">
                        ${r.kind || 'unknown'}
                      </span>
                    </td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;">${r.title || '-'}</td>
                    <td style="padding:6px;border-bottom:1px solid #e2e8f0;text-align:right;color:${r.amount >= 0 ? '#10b981' : '#ef4444'};">
                      ${r.amount >= 0 ? '+' : ''}$${Number(r.amount || 0).toFixed(2)}
                    </td>
                  </tr>
                `).join('')}
                ${opsRows.length > 20 ? `<tr><td colspan="4" style="padding:8px;text-align:center;color:#64748b;font-size:11px;">...and ${opsRows.length - 20} more entries</td></tr>` : ''}
                ${opsRows.length === 0 ? '<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b;">No operations ledger entries this week</td></tr>' : ''}
              </tbody>
            </table>
          </div>

          <div style="background:#f0fdf4;padding:16px;border-radius:12px;border-left:4px solid #22c55e;">
            <h3 style="margin:0 0 8px;color:#166534;">💡 Weekly Recommendations</h3>
            <ol style="margin:0;padding-left:20px;color:#15803d;font-size:13px;">
              <li style="margin:6px 0;">Review high-cost categories and identify potential savings of 5-10%</li>
              <li style="margin:6px 0;">Maintain consistent deposit schedule to improve cash flow visibility</li>
              <li style="margin:6px 0;">Monitor shop-specific expense ratios weekly</li>
              <li style="margin:6px 0;">Track invest/perfume growth as indicator of customer engagement</li>
              ${revenueGrowth < 5 ? '<li style="margin:6px 0;">Consider promotional campaigns to boost weekly revenue growth</li>' : ''}
            </ol>
          </div>
        </div>
      `,
    });
    return true;
  } catch (e: any) {
    console.error("[ENHANCED WEEKLY] Email send failed:", e?.message || e);
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

  const laybyRows = ledgerRows.filter((l: any) => String(l.category || "").startsWith("Lay-by"));
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

  // Check if we should generate weekly report (Saturday = 6 only)
  const today = new Date().getDay();
  const shouldSendWeekly = today === 6;
  
  let comprehensiveWeeklyEmailed = false;
  if (shouldSendWeekly) {
    try {
      // Send comprehensive 4-section weekly report (all shops combined)
      comprehensiveWeeklyEmailed = await sendComprehensiveWeeklyReport(shopId, staffName);
    } catch (e: any) {
      console.error("[EOD] Comprehensive weekly report failed:", e?.message || e);
    }
  }

  return NextResponse.json({
    success: true,
    emailed,
    comprehensiveWeeklyEmailed,
    isWeeklyDay: shouldSendWeekly,
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
