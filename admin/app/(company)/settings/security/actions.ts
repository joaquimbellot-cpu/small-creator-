'use server';
// Owner-only two-step login (TOTP). Each action re-checks the role.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

export type EnrollResult = { error?: string; factorId?: string; qr?: string; secret?: string };
export type SimpleResult = { error?: string; ok?: boolean };

export async function startEnrollAction(): Promise<EnrollResult> {
  await requireOwner();
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Clear half-finished attempts so the name and secret are fresh.
  for (const f of factors?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Smallfold', friendlyName: `Authenticator ${Date.now()}` });
  if (error || !data) return { error: 'Could not start setup. Try again.' };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

const confirmSchema = z.object({ factorId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/) });

export async function confirmEnrollAction(input: { factorId: string; code: string }): Promise<SimpleResult> {
  const staff = await requireOwner();
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { error: 'Enter the 6-digit code from your app.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { error: 'That code is not right. Try the current code.' };
  await logAudit('auth.2fa_enabled', 'profile', staff.id, { label: staff.email });
  revalidatePath('/settings/security');
  return { ok: true };
}

export async function removeFactorAction(formData: FormData): Promise<void> {
  const staff = await requireOwner();
  const id = z.string().uuid().safeParse(formData.get('factorId'));
  if (!id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: id.data });
  if (error) return;
  await logAudit('auth.2fa_removed', 'profile', staff.id, { label: staff.email });
  revalidatePath('/settings/security');
}
