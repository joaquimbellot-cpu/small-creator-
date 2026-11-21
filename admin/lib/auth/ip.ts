// Client IP for rate limiting. Only headers set by the hosting platform are trusted
// (x-vercel-forwarded-for, then x-real-ip). The client-supplied x-forwarded-for chain is never used,
// because anyone could put a fresh value there on every try and dodge the per-IP limit.
import 'server-only';
import { headers } from 'next/headers';

export async function clientIp(): Promise<string> {
  const h = await headers();
  const ip = (h.get('x-vercel-forwarded-for') ?? h.get('x-real-ip'))?.split(',')[0]?.trim();
  return ip ? ip.slice(0, 100) : 'unknown';
}
