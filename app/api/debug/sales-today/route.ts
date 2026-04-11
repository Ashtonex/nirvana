import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * DEBUG ROUTE — remove before production release.
 * Fetches today's raw sales directly from Supabase to diagnose
 * why the dashboard revenue trajectory is not reflecting live sales.
 */
export async function GET() {
  try {
    // Fetch the last 50 sales, ordered newest first — no date filter
    const { data: recentSales, error: recentError } = await supabaseAdmin
      .from('sales')
      .select('id, shop_id, item_name, total_with_tax, date, employee_id, payment_method')
      .order('date', { ascending: false })
      .limit(50);

    if (recentError) {
      return NextResponse.json({ error: recentError.message }, { status: 500 });
    }

    // Compute server time
    const serverNow = new Date().toISOString();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Filter to 24h window in memory to show what the chart sees
    const withinLast24h = (recentSales || []).filter(
      (s: any) => s.date >= last24h
    );

    const totalRevenue24h = withinLast24h.reduce(
      (sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0
    );

    return NextResponse.json({
      serverTime: serverNow,
      last24hCutoff: last24h,
      totalRevenueIn24hWindow: totalRevenue24h,
      salesIn24hWindow: withinLast24h.length,
      mostRecentSaleDate: recentSales?.[0]?.date ?? null,
      allRecentSales: recentSales,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
