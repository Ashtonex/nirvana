import { NextResponse } from 'next/server';
import { sendVerificationSMS, generateVerificationCode } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const { mobile, employeeId } = await request.json();

        if (!mobile || !employeeId) {
            return NextResponse.json({ error: 'Missing mobile or employeeId' }, { status: 400 });
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
