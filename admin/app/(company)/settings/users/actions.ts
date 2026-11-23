'use server';
// Owner-only. Every action re-checks the role on the server (requireOwner) before doing anything.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
    // Roll the half-made account back; if that fails too, say so (an account without a role is left behind).
    const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id);
    if (delErr) {
      console.error('invite rollback failed', delErr.status);
      return { error: `Could not finish the invite, and the half-made account for ${email} could not be cleaned up. Check Supabase Auth, Users.` };
    }
    return { error: 'Could not finish the invite. Nothing was changed; try again.' };
  }
  await logAudit('user.invited', 'profile', data.user.id, { label: email, role: 'worker' });
  revalidatePath('/settings/users');
  return { ok: `Invite sent to ${email}.` };
}

const idSchema = z.string().uuid();

// These two are plain form actions, so a failure comes back as /settings/users?error=... (the page shows it).
const FAILED = { remove: '/settings/users?error=remove_failed', restore: '/settings/users?error=restore_failed' };

export async function removeUserAction(formData: FormData): Promise<void> {
  const me = await requireOwner();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success || id.data === me.id) return; // never yourself
  const supabase = await createClient();
  const { data: target, error: findErr } = await supabase.from('profiles').select('id, email, role, is_active').eq('id', id.data).maybeSingle();
  if (findErr) {
    console.error('remove user: lookup failed', findErr.code);
    redirect(FAILED.remove);
  }
  if (!target) return;
  if (target.role === 'owner' && target.is_active) {
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('is_active', true);
    if ((count ?? 0) <= 1) return; // never the last owner (the database refuses it too)
  }
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', target.id);
  if (error) {
    console.error('remove user: profile update failed', error.code);
    redirect(FAILED.remove);
  }
  const { error: banErr } = await createAdminClient().auth.admin.updateUserById(target.id, { ban_duration: '876000h' });
  if (banErr) {
    // The account is not banned, so do not leave it half-removed: put the profile back and tell the owner.
    console.error('remove user: ban failed', banErr.status);
    await supabase.from('profiles').update({ is_active: true }).eq('id', target.id);
    redirect(FAILED.remove);
  }
  await logAudit('user.removed', 'profile', target.id, { label: String(target.email), role: target.role });
  revalidatePath('/settings/users');
}

export async function restoreUserAction(formData: FormData): Promise<void> {
  await requireOwner();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: target, error: findErr } = await supabase.from('profiles').select('id, email, role').eq('id', id.data).maybeSingle();
  if (findErr) {
    console.error('restore user: lookup failed', findErr.code);
    redirect(FAILED.restore);
  }
  if (!target) return;
  const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', target.id);
  if (error) {
    console.error('restore user: profile update failed', error.code);
    redirect(FAILED.restore);
  }
  const { error: unbanErr } = await createAdminClient().auth.admin.updateUserById(target.id, { ban_duration: 'none' });
  if (unbanErr) {
    console.error('restore user: unban failed', unbanErr.status);
    await supabase.from('profiles').update({ is_active: false }).eq('id', target.id);
    redirect(FAILED.restore);
  }
  await logAudit('user.restored', 'profile', target.id, { label: String(target.email), role: target.role });
  revalidatePath('/settings/users');
}
