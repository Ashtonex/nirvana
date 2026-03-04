import { NextResponse } from 'next/server';
import { sendVerificationSMS, generateVerificationCode } from '@/lib/twilio';
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
        const { mobile, employeeId } = await request.json();

        if (!mobile || !employeeId) {
            return NextResponse.json({ error: 'Missing mobile or employeeId' }, { status: 400 });
        }

        // Staff can only request verification for themselves.
        const staffId = await getStaffIdFromCookie();
        if (staffId && staffId !== employeeId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const code = generateVerificationCode();
        
        const { error: updateError } = await supabaseAdmin
            .from('employees')
            .update({ 
                mobile_verification_code: code,
                mobile_verified: false 
            })
            .eq('id', employeeId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        const result = await sendVerificationSMS(mobile, code);
        
        return NextResponse.json({ 
            success: true, 
            message: result.success ? 'SMS sent' : 'SMS failed - code still generated'
        });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
