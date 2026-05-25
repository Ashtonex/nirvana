export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getReorderStrategy } from '@/lib/stock-alerts';

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const cookies = req.cookies;
    if (!cookies.get('nirvana_owner') && !cookies.get('staff_id')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    }

    const strategy = await getReorderStrategy(itemId, 'tshirts');

    return NextResponse.json({
      success: true,
      strategy,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error fetching reorder strategy:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch reorder strategy' },
      { status: 500 }
    );
  }
}
