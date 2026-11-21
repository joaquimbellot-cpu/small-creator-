import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/staff';
import { TwoFactorForm } from './TwoFactorForm';

export const metadata: Metadata = { title: 'Two-step check' };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const next = safeNext(typeof sp.next === 'string' ? sp.next : undefined);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') redirect(next);
  return (
    <>
      <h1 className="auth__title">Two-step check</h1>
      <p className="auth__sub" style={{ marginTop: -16 }}>Enter the 6-digit code from your authenticator app.</p>
      <TwoFactorForm next={next} />
    </>
  );
}
