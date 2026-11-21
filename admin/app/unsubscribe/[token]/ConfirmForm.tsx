'use client';
import { useActionState } from 'react';
import { Button, Notice } from '@/components/ui';
import { confirmUnsubscribeAction, type UnsubscribeState } from './actions';

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(confirmUnsubscribeAction, {});
  if (state.result === 'done') return <Notice tone="success">You are unsubscribed. We will not email you again.</Notice>;
  if (state.result === 'test') return <Notice tone="info">This was a test email, so nothing was changed.</Notice>;
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      {state.result === 'invalid' ? <Notice tone="error">This link is not valid.</Notice> : null}
      {state.result === 'error' ? <Notice tone="error">Something went wrong. Please try again.</Notice> : null}
      <Button type="submit" loading={pending}>Yes, unsubscribe me</Button>
    </form>
  );
}
