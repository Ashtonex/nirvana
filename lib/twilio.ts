import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM;

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

function toWhatsAppAddress(phone: string) {
    const raw = String(phone || '').trim();
    if (!raw) return null;
    if (raw.toLowerCase().startsWith('whatsapp:')) return raw;
    if (raw.startsWith('+')) return `whatsapp:${raw}`;
    // Refuse to guess country codes during critical workflows.
    return null;
}

export async function sendWhatsAppMessage(toPhone: string, body: string) {
    const to = toWhatsAppAddress(toPhone);
    if (!to) {
        console.warn('WhatsApp send skipped: invalid phone format (require E.164 like +263...)');
        return { success: false, error: 'Invalid phone format (require +E.164)' };
    }
    if (!client || !twilioWhatsAppFrom) {
        console.warn('Twilio WhatsApp not configured. Message will not be sent.');
        return { success: false, error: 'Twilio WhatsApp not configured' };
    }

    try {
        const message = await client.messages.create({
            body,
            from: twilioWhatsAppFrom,
            to,
        });
        return { success: true, messageId: message.sid };
    } catch (error) {
        console.error('Twilio WhatsApp error:', error);
        return { success: false, error };
    }
}

export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
