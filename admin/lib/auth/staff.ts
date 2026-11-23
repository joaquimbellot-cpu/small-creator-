// Who is logged in. For server components and server actions.
//   getCurrentStaff()  -> Staff | null   (null: not logged in, or no profile / no role / inactive)
//   requireStaff()     -> Staff          (redirects to /login, /login/2fa or signs out as needed)
//   requireOwner()     -> Staff          (owner only; a worker is sent to /overview with a notice)
// Staff = { id, email, fullName, role: 'owner' | 'worker' }
// A database outage is not "no access": the person is sent to /login?error=busy.
// Always call requireStaff()/requireOwner() INSIDE every server action and page, not only in a layout.
import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'owner' | 'worker';
export type Staff = { id: string; email: string; fullName: string; role: Role };

type Result = { staff: Staff | null; reason: 'anonymous' | 'no_access' | 'mfa' | 'unavailable' | 'ok' };

const load = cache(async (): Promise<Result> => {
  const supabase = await createClient();
  // getClaims() verifies the token's signature on this server, so it costs no trip to the database. The profile
  // lookup below still asks the database on every request: a removed or deactivated person has no access at once.
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (error || !claims?.sub) return { staff: null, reason: 'anonymous' };
  const user = { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' };
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  // A failed lookup (database outage) must not look like "this account has no access".
  if (profileError) {
    console.error('staff: profile lookup failed', profileError.code);
    return { staff: null, reason: 'unavailable' };
  }
  if (!profile) {
    // With a verified 2FA factor, the database treats an aal1 session as "not staff" (RLS), so the profile cannot
    // even be read yet. Only then is it worth asking whether the person still has to do the 2FA step.
    if (claims.aal === 'aal1') {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') return { staff: null, reason: 'mfa' };
    }
    return { staff: null, reason: 'no_access' };
  }
  if (!profile.is_active || (profile.role !== 'owner' && profile.role !== 'worker')) {
    return { staff: null, reason: 'no_access' };
  }
  return {
    reason: 'ok',
    staff: {
      id: profile.id,
      email: String(profile.email || user.email || ''),
      fullName: profile.full_name || String(profile.email).split('@')[0],
      role: profile.role,
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
    redirect(
      reason === 'no_access' ? '/auth/signout?reason=no_access'
        : reason === 'mfa' ? '/login/2fa'
        : reason === 'unavailable' ? '/login?error=busy'
        : '/login',
    );
  }
  return staff;
}

export async function requireOwner(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== 'owner') redirect('/overview?notice=owner-only');
  return staff;
}

export { safeNext } from './safe-next';
