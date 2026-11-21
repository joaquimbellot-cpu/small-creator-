'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

export type ResetState = { error?: string };

const schema = z
  .object({ password: z.string().min(12, 'Use at least 12 characters.').max(128), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'The two passwords do not match.', path: ['confirm'] });

export async function setPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/forgot-password?error=expired');

  const parsed = schema.safeParse({ password: formData.get('password'), confirm: formData.get('confirm') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === 'insufficient_aal') redirect('/login/2fa?next=/reset-password');
    return { error: 'Could not set that password. Try a different one.' };
  }
  await logAudit('auth.password_changed', 'profile', data.user.id, { label: data.user.email ?? '' });
  await supabase.auth.signOut();
  redirect('/login?notice=password_updated');
}
