// Who is logged in. For server components and server actions.
//   getCurrentStaff()  -> Staff | null   (null: not logged in, or no profile / no role / inactive)
//   requireStaff()     -> Staff          (redirects to /login, /login/2fa or signs out as needed)
//   requireOwner()     -> Staff          (owner only; a worker is sent to /overview)
// Staff = { id, email, fullName, role: 'owner' | 'worker', mfaRequired }
// Always call requireStaff()/requireOwner() INSIDE every server action and page, not only in a layout.
import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'owner' | 'worker';
export type Staff = { id: string; email: string; fullName: string; role: Role; mfaRequired: boolean };

type Result = { staff: Staff | null; reason: 'anonymous' | 'no_access' | 'mfa' | 'ok' };

const load = cache(async (): Promise<Result> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { staff: null, reason: 'anonymous' };
  // With a verified 2FA factor, the database treats an aal1 session as "not staff" (RLS), so the
  // profile cannot even be read yet. Check the assurance level first and send the user to the 2FA step.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') return { staff: null, reason: 'mfa' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile || !profile.is_active || (profile.role !== 'owner' && profile.role !== 'worker')) {
    return { staff: null, reason: 'no_access' };
  }
  return {
    reason: 'ok',
    staff: {
      id: profile.id,
      email: String(profile.email || data.user.email || ''),
      fullName: profile.full_name || String(profile.email).split('@')[0],
      role: profile.role,
      mfaRequired: false,
    },
  };
});

export async function getCurrentStaff(): Promise<Staff | null> {
  return (await load()).staff;
}

export async function requireStaff(): Promise<Staff> {
  const { staff, reason } = await load();
  if (!staff) {
    // A signed-in user without access is signed out by the route handler (cookies cannot be changed while rendering).
    redirect(reason === 'no_access' ? '/auth/signout?reason=no_access' : reason === 'mfa' ? '/login/2fa' : '/login');
  }
  if (staff.mfaRequired) redirect('/login/2fa');
  return staff;
}

export async function requireOwner(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== 'owner') redirect('/overview');
  return staff;
}

export { safeNext } from './safe-next';
