// Shared steps of the public form routes (/api/public/apply and /api/public/contact).
// These routes have no login: they check the Origin, a bot-trap field, the input, and a per-visitor limit,
// then call a database function with the service-role client (the only place that key serves visitors).
import 'server-only';
import { createHmac } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { clientIp } from '@/lib/auth/ip';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = { 'Cache-Control': 'no-store' };

// The shape the website's forms.js reads: any 2xx is "sent"; anything else shows its error box.
export const sent = () => NextResponse.json({ ok: true }, { headers: NO_STORE });
export const refuse = (status: 400 | 403 | 405 | 429 | 500, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

/** HMAC-SHA256 of the visitor's IP with a "form-rate:" prefix. Raw IPs are never stored. */
export function ipHash(ip: string): string | null {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`form-rate:${ip}`).digest('hex');
}


export async function handleForm<T>(
  req: NextRequest,
  opts: { fn: 'submit_application' | 'submit_contact'; schema: ZodType<T>; args: (data: T, hash: string) => Record<string, unknown> },
): Promise<NextResponse> {
  try {
    // Only the site's own origin may post.
    if (req.headers.get('origin') !== req.nextUrl.origin) return refuse(403, 'Not allowed.');

    const type = (req.headers.get('content-type') ?? '').toLowerCase();
    if (!type.startsWith('multipart/form-data') && !type.startsWith('application/x-www-form-urlencoded')) {
      return refuse(400, 'Could not read the form.');
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return refuse(400, 'Could not read the form.');
    }
    const raw: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string' && !(key in raw)) raw[key] = value;
    }

    // A filled trap field means a robot: answer like a success, save nothing.
    if ((raw._gotcha ?? '').trim() !== '') return sent();

    const parsed = opts.schema.safeParse(raw);
    if (!parsed.success) return refuse(400, 'Please check the form and try again.');

    const hash = ipHash(await clientIp());
    if (!hash) {
      console.error('form route: UNSUBSCRIBE_SECRET is not set');
      return refuse(500, 'Something went wrong. Please try again later.');
    }
    const { data, error } = await createAdminClient().rpc(opts.fn, opts.args(parsed.data, hash));
    if (error) {
      console.error('form route: rpc failed', opts.fn, error.code);
      return refuse(500, 'Something went wrong. Please try again later.');
    }
    if ((data as { ok?: boolean } | null)?.ok !== true) {
      return refuse(429, 'You have sent too many forms in the last hour. Please try again later.');
    }
    return sent();
  } catch (e) {
    console.error('form route error', e instanceof Error ? e.message : e);
    return refuse(500, 'Something went wrong. Please try again later.');
  }
}

export const methodNotAllowed = () =>
  NextResponse.json({ ok: false, error: 'Use POST.' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
