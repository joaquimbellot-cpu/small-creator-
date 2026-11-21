'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { clientIp } from '@/lib/auth/ip';
import { safeNext } from '@/lib/auth/staff';
import { logAudit } from '@/lib/audit';

export type FormState = { error?: string };

const GENERIC = 'That email or password is not right.';
const TOO_MANY = 'Too many attempts. Try again in 15 minutes.';
const BUSY = 'Something went wrong. Please try again.';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') || undefined,
  });
  if (!parsed.success) return { error: GENERIC };
  const { email, password } = parsed.data;
  const next = safeNext(parsed.data.next);

  const admin = createAdminClient();
  const ip = await clientIp();
  const { data: allowed, error: limitErr } = await admin.rpc('login_allowed', { email, ip });
  if (limitErr) return { error: BUSY };
  if (allowed === false) return { error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await admin.rpc('record_login_attempt', { email, ip, success: false });
    return { error: GENERIC };
  }

  // Must be an active staff member with a role; otherwise treated exactly like a wrong password.
  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', data.user.id).maybeSingle();
  if (!profile || !profile.is_active || (profile.role !== 'owner' && profile.role !== 'worker')) {
    await supabase.auth.signOut();
    await admin.rpc('record_login_attempt', { email, ip, success: false });
    return { error: GENERIC };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    // The attempt is recorded as a success only after the code is verified (see verifyCodeAction).
    redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }

  await admin.rpc('record_login_attempt', { email, ip, success: true });
  await logAudit('auth.login', 'profile', data.user.id, { label: email });
  redirect(next);
}

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/), next: z.string().max(500).optional() });

export async function verifyCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || !user.email) redirect('/login');

  const parsed = codeSchema.safeParse({ code: formData.get('code'), next: formData.get('next') || undefined });
  if (!parsed.success) return { error: 'Enter the 6-digit code from your authenticator app.' };
  const next = safeNext(parsed.data.next);
  const email = user.email.toLowerCase();

  const admin = createAdminClient();
  const ip = await clientIp();
  const { data: allowed, error: limitErr } = await admin.rpc('login_allowed', { email, ip });
  if (limitErr) return { error: BUSY };
  if (allowed === false) return { error: TOO_MANY };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === 'verified');
  if (!factor) redirect(next);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
  if (error) {
    await admin.rpc('record_login_attempt', { email, ip, success: false });
    return { error: 'That code is not right. Try the current code.' };
  }
  await admin.rpc('record_login_attempt', { email, ip, success: true });
  await logAudit('auth.login', 'profile', user.id, { label: email, mfa: true });
  redirect(next);
}
