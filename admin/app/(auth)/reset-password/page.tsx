import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/forgot-password?error=expired');
  return (
    <>
      <h1 className="auth__title">Set a new password</h1>
      <p className="auth__sub" style={{ marginTop: -16 }}>Passwords need at least 12 characters.</p>
      <ResetForm />
    </>
  );
}
