import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';

async function getStaffIdFromCookie() {
    const token = (await cookies()).get('nirvana_staff')?.value;
    if (!token) return null;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { data: session } = await supabaseAdmin
        .from('staff_sessions')
        .select('employee_id,expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();
    if (!session) return null;
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
    return session.employee_id as string;
}

export async function POST(request: Request) {
    try {
        const { code, employeeId } = await request.json();

        if (!code || !employeeId) {
            return NextResponse.json({ error: 'Missing code or employeeId' }, { status: 400 });
        }

        // Staff can only confirm verification for themselves.
        const staffId = await getStaffIdFromCookie();
        if (staffId && staffId !== employeeId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: employee, error: fetchError } = await supabaseAdmin
            .from('employees')
            .select('id,mobile_verification_code')
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
