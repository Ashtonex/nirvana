import sgMail from "@sendgrid/mail";

const apiKey = process.env.SENDGRID_API_KEY;
const from = process.env.SENDGRID_FROM;

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!apiKey || !from) {
    throw new Error(
      "SendGrid not configured. Set SENDGRID_API_KEY and SENDGRID_FROM in environment variables."
    );
  }

  sgMail.setApiKey(apiKey);

  const res = await sgMail.send({
    to: params.to,
    from,
    subject: params.subject,
    html: params.html,
  });

  return res;
}
