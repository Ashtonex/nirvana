export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getRunningOutItems } from '@/lib/running-out-items';

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const cookies = req.cookies;
    if (!cookies.get('nirvana_owner') && !cookies.get('staff_id')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shopId = req.nextUrl.searchParams.get('shopId') || 'tshirts';
    const daysBack = parseInt(req.nextUrl.searchParams.get('daysBack') || '7', 10);
    const maxItems = parseInt(req.nextUrl.searchParams.get('maxItems') || '10', 10);

    const items = await getRunningOutItems(shopId, daysBack, maxItems);

    return NextResponse.json({
      success: true,
      items,
      count: items.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error fetching running out items:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch running out items' },
      { status: 500 }
    );
  }
}
