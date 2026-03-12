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
  
  // Get week's sales
  const { data: sales } = await supabaseAdmin
    .from("sales")
    .select("id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method,discount_applied")
    .eq("shop_id", shopId)
    .gte("date", since);

  const rows = sales || [];
  
  // Calculate totals
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
  const totalDiscount = rows.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);

  // Get expenses
  const { data: expenses } = await supabaseAdmin
    .from("ledger_entries")
    .select("amount, category")
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

  // Get week date range
  const startDate = new Date(since).toLocaleDateString();
  const endDate = new Date().toLocaleDateString();

  const recipient = process.env.EOD_REPORT_RECIPIENT || ORACLE_RECIPIENT;

  try {
    await sendEmail({
      to: recipient,
      subject: `[WEEKLY] ${shopId.toUpperCase()} — Week of ${startDate}`,
      html: `
        <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
          <h2 style="margin:0 0 12px;">📊 Weekly Report — ${shopId.toUpperCase()}</h2>
          <p style="color:#64748b;margin:0 0 16px;">Week: ${startDate} - ${endDate}</p>
          <p style="color:#64748b;margin:0 0 16px;">Generated: ${new Date().toLocaleString()}</p>

          <div style="background:#f1f5f9;padding:16px;border-radius:12px;">
            <h3 style="margin:0 0 12px;">💰 Revenue Summary</h3>
            <p style="margin:4px 0;"><b>Total Sales (inc tax):</b> $${totalWithTax.toFixed(2)}</p>
            <p style="margin:4px 0;"><b>Total Sales (pre tax):</b> $${totalBeforeTax.toFixed(2)}</p>
            <p style="margin:4px 0;"><b>Tax Collected:</b> $${totalTax.toFixed(2)}</p>
            <p style="margin:4px 0; color:#dc2626;"><b>Total Discounts Issued:</b> $${totalDiscount.toFixed(2)}</p>
            <p style="margin:4px 0; color:#dc2626;"><b>Total Expenses:</b> $${totalExpenses.toFixed(2)}</p>
            <p style="margin:8px 0 0; font-size:18px;"><b>Net Revenue:</b> $${(totalWithTax - totalDiscount - totalExpenses).toFixed(2)}</p>
          </div>

          <div style="background:#f1f5f9;padding:16px;border-radius:12px;margin-top:16px;">
            <h3 style="margin:0 0 12px;">💳 Payment Breakdown</h3>
            <p style="margin:4px 0;"><b>Cash:</b> $${totalCash.toFixed(2)} (${cashSales.length} transactions)</p>
            <p style="margin:4px 0;"><b>EcoCash:</b> $${totalEcocash.toFixed(2)} (${ecocashSales.length} transactions)</p>
          </div>

          <div style="margin-top:16px;">
            <h3 style="margin:0 0 8px;">📦 All Transactions (${rows.length} total)</h3>
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
              <tr>
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
  
  let weeklyEmailed = false;
  if (shouldSendWeekly) {
    try {
      weeklyEmailed = await sendWeeklyReport(shopId, staffName);
    } catch (e: any) {
      console.error("[EOD] Weekly report failed:", e?.message || e);
    }
  }

  return NextResponse.json({
    success: true,
    emailed,
    weeklyEmailed,
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
