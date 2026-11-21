import type { Metadata } from 'next';
import { Notice } from '@/components/ui';
import { verifyToken } from '@/lib/email/token';
import { ConfirmForm } from './ConfirmForm';

export const metadata: Metadata = { title: 'Unsubscribe' };

// Opening this page never unsubscribes anyone: mail scanners open links. A click on the button does.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Same neutral wording for a wrong, old or made-up link.
  if (!verifyToken(token)) {
    return (
      <>
        <h1 className="auth__title">Unsubscribe</h1>
        <Notice tone="info">This link is not valid. If you would rather not hear from us, reply to the email with the word “unsubscribe”.</Notice>
      </>
    );
  }
  return (
    <>
      <h1 className="auth__title">Unsubscribe</h1>
      <p>Do you want to stop receiving emails from Smallfold? One click confirms it.</p>
      <ConfirmForm token={token} />
    </>
  );
}
