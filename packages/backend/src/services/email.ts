import { getEnv } from '@healthcare/shared/config';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

let transporter: any = null;

async function getTransporter() {
  if (transporter) return transporter;
  const env = getEnv();

  // Try SendGrid
  if (env.SENDGRID_API_KEY) {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(env.SENDGRID_API_KEY);
      transporter = sgMail;
      return transporter;
    } catch { /* not installed */ }
  }

  // Try nodemailer
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    return transporter;
  } catch { /* not installed */ }

  transporter = { sendMail: async (opts: EmailOptions) => { console.log('[EMAIL DEV]', opts); return opts; } };
  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transport = await getTransporter();
    const env = getEnv();
    if (transport.send) {
      await transport.send({ to: options.to, from: env.SMTP_FROM || 'no-reply@localhost', subject: options.subject, text: options.text, html: options.html });
    } else {
      await transport.sendMail({ from: `"Clinic Management System" <${env.SMTP_FROM || 'no-reply@localhost'}>`, to: options.to, subject: options.subject, text: options.text, html: options.html });
    }
    return true;
  } catch (error: any) {
    console.error('✗ Email send failed:', error.message);
    return false;
  }
}
