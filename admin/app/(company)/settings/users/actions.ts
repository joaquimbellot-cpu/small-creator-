'use server';
// Owner-only. Every action re-checks the role on the server (requireOwner) before doing anything.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/staff';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/env';
import { logAudit } from '@/lib/audit';

export type UserFormState = { error?: string; ok?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(320),
  full_name: z.string().trim().max(200).optional(),
});

export async function inviteWorkerAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  await requireOwner();
  const parsed = inviteSchema.safeParse({ email: formData.get('email'), full_name: formData.get('full_name') || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, full_name } = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) return { error: 'That person already has an account. Restore their access instead if it was removed.' };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm`,
    data: full_name ? { full_name } : undefined,
  });
  if (error || !data.user) {
    console.error('invite failed', error?.status);
    return { error: 'Could not send the invite. Check the address and try again.' };
  }
  const { error: roleErr } = await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role: 'worker' } });
  if (roleErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'Could not finish the invite. Nothing was changed; try again.' };
  }
  await logAudit('user.invited', 'profile', data.user.id, { label: email, role: 'worker' });
  revalidatePath('/settings/users');
  return { ok: `Invite sent to ${email}.` };
}

const idSchema = z.string().uuid();

export async function removeUserAction(formData: FormData): Promise<void> {
  const me = await requireOwner();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success || id.data === me.id) return; // never yourself
  const supabase = await createClient();
  const { data: target } = await supabase.from('profiles').select('id, email, role, is_active').eq('id', id.data).maybeSingle();
  if (!target) return;
  if (target.role === 'owner' && target.is_active) {
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('is_active', true);
    if ((count ?? 0) <= 1) return; // never the last owner (the database refuses it too)
  }
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', target.id);
  if (error) return;
  await createAdminClient().auth.admin.updateUserById(target.id, { ban_duration: '876000h' });
  await logAudit('user.removed', 'profile', target.id, { label: String(target.email), role: target.role });
  revalidatePath('/settings/users');
}

export async function restoreUserAction(formData: FormData): Promise<void> {
  await requireOwner();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: target } = await supabase.from('profiles').select('id, email, role').eq('id', id.data).maybeSingle();
  if (!target) return;
  const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', target.id);
  if (error) return;
  await createAdminClient().auth.admin.updateUserById(target.id, { ban_duration: 'none' });
  await logAudit('user.restored', 'profile', target.id, { label: String(target.email), role: target.role });
  revalidatePath('/settings/users');
}
