import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey
  ? new Resend(apiKey)
  : ({
      // Fallback no-op client so build doesn't crash when key is missing
      emails: {
        async send() {
          console.warn(
            "[Resend] RESEND_API_KEY is not set. Email send was skipped at runtime."
          );
          return {} as any;
        },
      },
    } as unknown as Resend);

export const ORACLE_RECIPIENT = process.env.ORACLE_REPORT_RECIPIENT || 'admin@nirvana.com';
