export async function sendVerificationSMS(to: string, code: string) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioPhoneNumber) {
        console.warn('Twilio not configured. SMS will not be sent.');
        return { success: false, error: 'Twilio not configured' };
    }

    console.log(`[SMS] Would send to ${to}: Your verification code is: ${code}`);
    return { success: true, messageId: 'mock-message-id' };
}

export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
