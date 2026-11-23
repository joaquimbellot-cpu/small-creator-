// Sends one plain-text message through SMTP (Gmail in production, the local mail catcher in dev).
// Settings come from env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM.
import 'server-only';
import nodemailer from 'nodemailer';

export type Outgoing = {
  to: string;
  fromName: string;
  subject: string;
  text: string;
  /** The one-click address, /api/unsubscribe/<token> (not the confirm page). */
  unsubscribeUrl: string;
};

// Exactly one plain address: no list ("a@x, b@x"), no "Name <a@x>", no spaces. nodemailer would send to every address
// in a list, which would dodge the suppression check (that looks at the whole text) and the daily count.
const ONE_ADDRESS = /^[^\s,;<>"()\\@]+@[^\s,;<>"()\\@]+\.[^\s,;<>"()\\@]{2,}$/;

export function assertOneRecipient(to: string): void {
  if (!ONE_ADDRESS.test(to)) throw new Error('recipient is not exactly one address');
}

/** The two headers mail apps use for their own Unsubscribe button (RFC 2369 and RFC 8058).
 *  oneClickUrl must be the API address (/api/unsubscribe/<token>): the app POSTs there. */
export function unsubscribeHeaders(oneClickUrl: string, from: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>, <mailto:${from}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function fromAddress(): string {
  const a = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!a) throw new Error('EMAIL_FROM is not set');
  return a;
}

/** Returns the SMTP message id. Throws when the server refuses. */
export async function sendMail(m: Outgoing): Promise<string> {
  assertOneRecipient(m.to);
  const user = process.env.SMTP_USER;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === 'true',
    auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    // A silent mail server must not hold the request open (the library defaults are minutes).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const from = fromAddress();
  const info = await transport.sendMail({
    from: { name: m.fromName, address: from },
    to: m.to,
    subject: m.subject,
    text: m.text,
    headers: unsubscribeHeaders(m.unsubscribeUrl, from),
  });
  return info.messageId;
}
