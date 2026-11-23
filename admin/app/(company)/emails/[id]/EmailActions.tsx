'use client';
// "Mark as replied" and "Retry" buttons for one email. A failure is shown instead of the click doing nothing.
import { useActionState } from 'react';
import { Button, Notice } from '@/components/ui';
import { markRepliedAction, retryAction, type EmailActionState } from '../actions';

export function EmailAction({ id, kind }: { id: string; kind: 'replied' | 'retry' }) {
  const [state, action, pending] = useActionState<EmailActionState, FormData>(kind === 'replied' ? markRepliedAction : retryAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" loading={pending}>{kind === 'replied' ? 'Mark as replied' : 'Retry (back to draft)'}</Button>
    </form>
  );
}
