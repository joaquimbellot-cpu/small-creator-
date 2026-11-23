// Client IP for rate limiting. Only headers set by the hosting platform are trusted.
//  * On Vercel (process.env.VERCEL is set): only x-vercel-forwarded-for. No other header is read.
//  * On Netlify: only x-nf-client-connection-ip, which Netlify's edge sets from the connection itself. x-real-ip is
//    never read there (a client could send it); a missing header means the shared 'unknown' bucket.
//  * Elsewhere (local, tests): x-real-ip if present, else the fixed bucket 'local'.
// The client-supplied x-forwarded-for chain is never used, because anyone could put a fresh value there
// on every try and dodge the per-IP limit.
import 'server-only';
import { headers } from 'next/headers';

export const onVercel = () => Boolean(process.env.VERCEL);
// NETLIFY is set at build time; SITE_ID and DEPLOY_ID are set in the running function.
export const onNetlify = () => Boolean(process.env.NETLIFY || process.env.SITE_ID || process.env.DEPLOY_ID);

/** Pure choice of the client IP from the request headers (easy to test). null = no trusted IP on a known host. */
export function pickIp(get: (name: string) => string | null, host: { vercel: boolean; netlify: boolean }): string | null {
  if (host.vercel) {
    const ip = get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    return ip ? ip.slice(0, 100) : null;
  }
  const netlify = get('x-nf-client-connection-ip')?.trim();
  if (netlify) return netlify.slice(0, 100);
  if (host.netlify) return null;
  const ip = get('x-real-ip')?.split(',')[0]?.trim();
  return ip ? ip.slice(0, 100) : 'local';
}

/** The trusted client IP, or null when on Vercel and the platform header is missing. */
export async function trustedIp(): Promise<string | null> {
  const h = await headers();
  return pickIp((n) => h.get(n), { vercel: onVercel(), netlify: onNetlify() });
}

/** For the login limit: always returns a bucket name ('unknown' when no trusted IP is found). */
export async function clientIp(): Promise<string> {
  return (await trustedIp()) ?? 'unknown';
}
