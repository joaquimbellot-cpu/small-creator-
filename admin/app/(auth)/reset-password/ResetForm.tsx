'use client';
import { useActionState } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { setPasswordAction, type ResetState } from './actions';

export function ResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(setPasswordAction, {});
  return (
    <form action={action}>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Input label="New password" name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus hint="At least 12 characters." />
      <Input label="Repeat the password" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      <Button type="submit" loading={pending} style={{ width: '100%' }}>Save password</Button>
    </form>
  );
}
