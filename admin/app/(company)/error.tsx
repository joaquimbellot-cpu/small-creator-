'use client';
// Shown inside the shell when a page or action throws, so the navigation stays and the person can try again.
import { useEffect } from 'react';
import { Button, LinkButton } from '@/components/ui';

export default function CompanyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('page error', error.digest ?? '');
  }, [error]);
  return (
    <div className="state" role="alert">
      <h1 className="state__title">Something went wrong</h1>
      <p className="state__text">Something went wrong. Your last change may not have been saved. Try again, or go back to the Overview.</p>
      <div className="state__actions">
        <Button onClick={() => reset()}>Try again</Button>
        <LinkButton href="/overview" variant="ghost">Back to the Overview</LinkButton>
      </div>
    </div>
  );
}
