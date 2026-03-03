import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const { code, employeeId } = await request.json();

        if (!code || !employeeId) {
            return NextResponse.json({ error: 'Missing code or employeeId' }, { status: 400 });
        }

        const { data: employee, error: fetchError } = await supabaseAdmin
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (fetchError || !employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        if (employee.mobile_verification_code !== code) {
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
        }

        const { error: updateError } = await supabaseAdmin
            .from('employees')
            .update({ 
                mobile_verified: true,
                mobile_verification_code: null
            })
            .eq('id', employeeId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Mobile verified successfully' });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
