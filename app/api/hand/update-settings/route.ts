import { NextResponse } from 'next/server';
import { updateGlobalSettings } from '../../../actions';
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        const updates: any = {};
        if (body.taxRate !== undefined) updates.taxRate = Number(body.taxRate) / 100;
        if (body.taxThreshold !== undefined) updates.taxThreshold = Number(body.taxThreshold);
        if (body.zombieDays !== undefined) updates.zombieDays = Number(body.zombieDays);

        await updateGlobalSettings(updates);

        revalidatePath('/admin/hand');
        revalidatePath('/admin/settings');
        revalidatePath('/');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating intelligence settings:', error);
        return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
    }
}
