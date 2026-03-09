import { NextResponse } from 'next/server';
import { updateGlobalSettings } from '../../../actions';
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        
        const taxRate = Number(formData.get('taxRate')) / 100;
        const taxThreshold = Number(formData.get('taxThreshold'));
        const taxMode = formData.get('taxMode') as string;

        await updateGlobalSettings({
            taxRate,
            taxThreshold,
            taxMode
        });

        revalidatePath('/admin/settings');
        revalidatePath('/admin/tax');
        revalidatePath('/');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating tax settings:', error);
        return NextResponse.json({ success: false, error: 'Failed to update settings' }, { status: 500 });
    }
}
