import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';

async function generateEODForDate(shopId: string, dateStr: string) {
  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Get sales for the day
  const { data: sales } = await supabaseAdmin
    .from('sales')
    .select('*')
    .eq('shop_id', shopId)
    .gte('date', startOfDay.toISOString())
    .lte('date', endOfDay.toISOString());

  // Get expenses for the day
  const { data: expenses } = await supabaseAdmin
    .from('ledger_entries')
    .select('*')
    .eq('shop_id', shopId)
    .eq('category', 'POS Expense')
    .gte('date', startOfDay.toISOString())
    .lte('date', endOfDay.toISOString());

  // Get shop info
  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('name')
    .eq('id', shopId)
    .single();

  const rows = sales || [];
  const totalWithTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalBeforeTax = rows.reduce((sum: number, s: any) => sum + Number(s.total_before_tax || 0), 0);
  const totalTax = rows.reduce((sum: number, s: any) => sum + Number(s.tax || 0), 0);
  const totalDiscount = rows.reduce((sum: number, s: any) => sum + Number(s.discount_applied || 0), 0);
  const totalExpenses = (expenses || []).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  // Payment breakdown
  const cashSales = rows.filter((s: any) => s.payment_method === 'cash');
  const ecocashSales = rows.filter((s: any) => s.payment_method === 'ecocash');
  const totalCash = cashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalEcocash = ecocashSales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);

  // Top items
  const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
  for (const s of rows as any[]) {
    const key = s.item_name || 'Unknown';
    const cur = itemMap.get(key) || { name: key, qty: 0, gross: 0 };
    cur.qty += Number(s.quantity || 0);
    cur.gross += Number(s.total_with_tax || 0);
    itemMap.set(key, cur);
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 10);

  // Build report HTML
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
        📊 End of Day Report
      </h1>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; background: #f1f5f9;"><strong>Shop</strong></td>
          <td style="padding: 8px;">${shop?.name || shopId}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f1f5f9;"><strong>Date</strong></td>
          <td style="padding: 8px;">${targetDate.toLocaleDateString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px; background: #f1f5f9;"><strong>Transactions</strong></td>
          <td style="padding: 8px;">${rows.length}</td>
        </tr>
      </table>

      <h2 style="color: #059669;">💰 Sales Summary</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Total (inc. Tax)</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">
            $${totalWithTax.toFixed(2)}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Total (ex. Tax)</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            $${totalBeforeTax.toFixed(2)}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Tax Collected</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            $${totalTax.toFixed(2)}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Discounts Given</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            $${totalDiscount.toFixed(2)}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Total Expenses</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;">
            -$${totalExpenses.toFixed(2)}
          </td>
        </tr>
        <tr style="background: #dcfce7;">
          <td style="padding: 12px; font-weight: bold;">Net</td>
          <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px;">
            $${(totalWithTax - totalExpenses).toFixed(2)}
          </td>
        </tr>
      </table>

      <h2 style="color: #0891b2;">💳 Payment Methods</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Cash</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            $${totalCash.toFixed(2)} (${cashSales.length} sales)
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Ecocash</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            $${totalEcocash.toFixed(2)} (${ecocashSales.length} sales)
          </td>
        </tr>
      </table>

      ${topItems.length > 0 ? `
      <h2 style="color: #7c3aed;">🏆 Top Selling Items</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
        ${topItems.map((item: any, i: number) => `
        <tr>
          <td style="padding: 6px; border-bottom: 1px solid #e2e8f0;">${i + 1}. ${item.name}</td>
          <td style="padding: 6px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            ${item.qty} × $${item.gross.toFixed(2)}
          </td>
        </tr>
        `).join('')}
      </table>
      ` : ''}

      ${expenses && expenses.length > 0 ? `
      <h2 style="color: #dc2626;">📝 Expenses Detail</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
        ${expenses.map((exp: any) => `
        <tr>
          <td style="padding: 6px; border-bottom: 1px solid #e2e8f0;">${exp.description || 'Expense'}</td>
          <td style="padding: 6px; border-bottom: 1px solid #e2e8f0; text-align: right;">
            -$${Number(exp.amount || 0).toFixed(2)}
          </td>
        </tr>
        `).join('')}
      </table>
      ` : ''}

      <p style="margin-top: 30px; color: #64748b; font-size: 12px;">
        Generated by NIRVANA POS • ${new Date().toLocaleString()}
      </p>
    </div>
  `;

  return {
    date: targetDate.toLocaleDateString(),
    shopName: shop?.name || shopId,
    shopId,
    transactions: rows.length,
    totalWithTax,
    totalBeforeTax,
    totalTax,
    totalDiscount,
    totalExpenses,
    net: totalWithTax - totalExpenses,
    cash: totalCash,
    ecocash: totalEcocash,
    topItems,
    expenses: expenses || [],
    html
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const shopId = formData.get('shopId') as string;
    const action = formData.get('action') as string;
    const email = formData.get('email') as string;

    if (!shopId) {
      return NextResponse.json({ error: 'Shop ID required' }, { status: 400 });
    }

    if (action === 'range') {
      // Generate multiple days
      const startDate = formData.get('startDate') as string;
      const endDate = formData.get('endDate') as string;

      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Date range required' }, { status: 400 });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const reports = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const report = await generateEODForDate(shopId, d.toISOString().split('T')[0]);
        if (report.transactions > 0 || report.totalExpenses > 0) {
          reports.push(report);
        }
      }

      return NextResponse.json({
        success: true,
        reports,
        count: reports.length
      });
    }

    // Single date
    const dateStr = formData.get('date') as string;
    if (!dateStr) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 });
    }

    const report = await generateEODForDate(shopId, dateStr);

    // If email requested
    if (action === 'email' && email) {
      await sendEmail({
        to: email,
        subject: `EOD Report - ${report.shopName} - ${report.date}`,
        html: report.html
      });
      return NextResponse.json({ success: true, message: 'Email sent', report });
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('Historical EOD error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
