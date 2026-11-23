'use server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/auth/ip';
import { createAnonClient } from '@/lib/supabase/anon';
import { siteUrl } from '@/lib/supabase/env';

export type ForgotState = { sent?: boolean; error?: string };

export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = z.string().trim().toLowerCase().email().max(320).safeParse(formData.get('email'));
  if (parsed.success) {
    // At most 3 reset emails an hour per address and per IP (counted in the database). Over the limit the answer is
    // the same neutral message and nothing is sent. If the check itself fails (for example the database function is
    // not installed yet) the request goes ahead: the reset email is the only way back in for a locked-out person.
    const admin = createAdminClient();
    const ip = await clientIp();
    const { data: allowed, error: limitErr } = await admin.rpc('reset_allowed', { email: parsed.data, ip });
    if (limitErr) console.error('reset: limit check failed', limitErr.code);
    if (!limitErr && allowed === false) return { sent: true };
    const { error: recErr } = await admin.rpc('record_reset_request', { email: parsed.data, ip });
    if (recErr) console.error('reset: could not record request', recErr.code);
    // The result is deliberately ignored: the answer never reveals whether the address has an account.
    const { error } = await createAnonClient().auth.resetPasswordForEmail(parsed.data, { redirectTo: `${siteUrl()}/auth/confirm` });
    if (error) console.error('reset email failed', error.status);
  }
  return { sent: true };
}
