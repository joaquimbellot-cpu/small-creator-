// Client IP for rate limiting. Only headers set by the hosting platform are trusted.
//  * On Vercel (process.env.VERCEL is set): only x-vercel-forwarded-for. No other header is read.
//  * Elsewhere (local, tests): x-real-ip if present, else the fixed bucket 'local'.
// The client-supplied x-forwarded-for chain is never used, because anyone could put a fresh value there
// on every try and dodge the per-IP limit.
import 'server-only';
import { headers } from 'next/headers';

export const onVercel = () => Boolean(process.env.VERCEL);

/** The trusted client IP, or null when on Vercel and the platform header is missing. */
export async function trustedIp(): Promise<string | null> {
  const h = await headers();
  if (onVercel()) {
    const ip = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    return ip ? ip.slice(0, 100) : null;
  }
  const ip = h.get('x-real-ip')?.split(',')[0]?.trim();
  return ip ? ip.slice(0, 100) : 'local';
}

/** For the login limit: always returns a bucket name ('unknown' when no trusted IP is found). */
export async function clientIp(): Promise<string> {
  return (await trustedIp()) ?? 'unknown';
}
