import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export const ORACLE_RECIPIENT = process.env.ORACLE_REPORT_RECIPIENT || 'admin@nirvana.com';
