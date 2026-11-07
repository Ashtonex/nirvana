import { NextResponse } from 'next/server';
import { transferStockBetweenShops } from '@/app/actions';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { fromShopId, toShopId, itemId, quantity, notes, employeeId } = body;

        if (!fromShopId || !toShopId || !itemId) {
            return NextResponse.json(
                { error: 'Missing required fields: fromShopId, toShopId, itemId' },
                { status: 400 }
            );
        }

        const qty = Number(quantity || 1);
        if (qty <= 0) {
            return NextResponse.json(
                { error: 'Quantity must be greater than 0' },
                { status: 400 }
            );
        }

        const result = await transferStockBetweenShops({
            fromShopId,
            toShopId,
            itemId,
            quantity: qty,
            notes,
            employeeId,
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API /api/inventory/transfer] Error:', error);
        return NextResponse.json(
            { error: error?.message || 'Internal transfer error' },
            { status: 500 }
        );
    }
}
