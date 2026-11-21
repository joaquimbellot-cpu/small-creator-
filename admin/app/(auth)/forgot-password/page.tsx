import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/ui';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Forgot password' };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="auth__title">Forgot your password?</h1>
      {sp.error === 'expired' ? <Notice tone="error">That link has expired or was already used. Request a new one.</Notice> : null}
      <ForgotForm />
      <p className="auth__links"><Link href="/login">Back to log in</Link></p>
    </>
  );
}
