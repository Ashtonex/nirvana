import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendVerificationSMS(to: string, code: string) {
    if (!client || !twilioPhoneNumber) {
        console.warn('Twilio not configured. SMS will not be sent.');
        return { success: false, error: 'Twilio not configured' };
    }

    try {
        const message = await client.messages.create({
            body: `Your Nirvana verification code is: ${code}`,
            from: twilioPhoneNumber,
            to
        });
        return { success: true, messageId: message.sid };
    } catch (error) {
        console.error('Twilio SMS error:', error);
        return { success: false, error };
    }
}

export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
