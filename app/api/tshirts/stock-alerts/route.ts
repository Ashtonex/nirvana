export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAllStockAlerts } from '@/lib/stock-alerts';

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const cookies = req.cookies;
    if (!cookies.get('nirvana_owner') && !cookies.get('staff_id')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const alerts = await getAllStockAlerts('tshirts');
    
    return NextResponse.json({
      success: true,
      alerts,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error fetching stock alerts:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stock alerts' },
      { status: 500 }
    );
  }
}
