'use server';
import { z } from 'zod';
import { createAnonClient } from '@/lib/supabase/anon';
import { siteUrl } from '@/lib/supabase/env';

export type ForgotState = { sent?: boolean; error?: string };

export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const parsed = z.string().trim().toLowerCase().email().max(320).safeParse(formData.get('email'));
  if (parsed.success) {
    // The result is deliberately ignored: the answer never reveals whether the address has an account.
    const { error } = await createAnonClient().auth.resetPasswordForEmail(parsed.data, { redirectTo: `${siteUrl()}/auth/confirm` });
    if (error) console.error('reset email failed', error.status);
  }
  return { sent: true };
}
