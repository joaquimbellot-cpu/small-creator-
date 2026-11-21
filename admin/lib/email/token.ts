// Unsubscribe tokens. A token proves that a link was made by this server for one email row.
//   token = base64url(email row id) + "." + base64url(HMAC-SHA256(id, UNSUBSCRIBE_SECRET))
// Anyone can read the id inside, but without the secret nobody can make a valid signature.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error('UNSUBSCRIBE_SECRET is not set');
  return s;
}

function sign(id: string): Buffer {
  return createHmac('sha256', secret()).update(id).digest();
}

export function makeToken(emailId: string): string {
  return `${Buffer.from(emailId).toString('base64url')}.${sign(emailId).toString('base64url')}`;
}

/** Returns the email row id, or null when the token is malformed or the signature is wrong. */
export function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const id = Buffer.from(parts[0], 'base64url').toString();
  const given = Buffer.from(parts[1], 'base64url');
  const expected = sign(id);
  // timingSafeEqual throws when lengths differ, so compare lengths first.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}
