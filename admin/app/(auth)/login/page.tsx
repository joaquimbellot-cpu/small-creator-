import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Notice } from '@/components/ui';
import { getCurrentStaff, safeNext } from '@/lib/auth/staff';
import { HashRedirect } from '@/app/auth/HashRedirect';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Log in' };

const MESSAGES: Record<string, string> = {
  no_access: 'This account does not have access to the back office.',
  busy: 'Something went wrong. Please try again.',
  link_invalid: 'That link is no longer valid. Request a new one.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const staff = await getCurrentStaff();
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  if (staff) redirect(safeNext(next));
  const error = typeof sp.error === 'string' ? MESSAGES[sp.error] : undefined;
  const notice = sp.notice === 'password_updated' ? 'Your password is updated. Log in with the new one.' : sp.notice === 'signed_out' ? 'You are logged out.' : undefined;
  return (
    <>
      <HashRedirect />
      <h1 className="auth__title">Log in</h1>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <LoginForm next={next} />
    </>
  );
}
