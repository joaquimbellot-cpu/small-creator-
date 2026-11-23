'use client';
// Shown inside the sign-in card when a sign-in page throws.
import { useEffect } from 'react';
import { Button, LinkButton } from '@/components/ui';

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('page error', error.digest ?? '');
  }, [error]);
  return (
    <div role="alert">
      <h1 className="auth__title">Something went wrong</h1>
      <p className="auth__sub">Nothing was changed. Try again, or go back to the sign-in page.</p>
      <div className="state__actions">
        <Button onClick={() => reset()}>Try again</Button>
        <LinkButton href="/login" variant="ghost">Back to sign in</LinkButton>
      </div>
    </div>
  );
}
