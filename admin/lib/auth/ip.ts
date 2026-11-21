// Client IP for rate limiting (first hop of x-forwarded-for, as set by Vercel; else x-real-ip).
import 'server-only';
import { headers } from 'next/headers';

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  const ip = (xff ? xff.split(',')[0] : h.get('x-real-ip'))?.trim();
  return ip ? ip.slice(0, 100) : null;
}
