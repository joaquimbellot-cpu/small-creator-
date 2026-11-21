// Sends one plain-text message through SMTP (Gmail in production, the local mail catcher in dev).
// Settings come from env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM.
import 'server-only';
import nodemailer from 'nodemailer';

export type Outgoing = {
  to: string;
  fromName: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
};

export function fromAddress(): string {
  const a = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!a) throw new Error('EMAIL_FROM is not set');
  return a;
}

/** Returns the SMTP message id. Throws when the server refuses. */
export async function sendMail(m: Outgoing): Promise<string> {
  const user = process.env.SMTP_USER;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === 'true',
    auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
  });
  const from = fromAddress();
  const info = await transport.sendMail({
    from: { name: m.fromName, address: from },
    to: m.to,
    subject: m.subject,
    text: m.text,
    headers: {
      // Mail apps show their own unsubscribe button from these two headers (RFC 2369 and RFC 8058).
      'List-Unsubscribe': `<${m.unsubscribeUrl}>, <mailto:${from}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  return info.messageId;
}
