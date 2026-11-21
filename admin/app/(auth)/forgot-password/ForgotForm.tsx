'use client';
import { useActionState } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { forgotPasswordAction, type ForgotState } from './actions';

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});
  if (state.sent) return <Notice tone="success">If that address belongs to a Smallfold account, a reset link is on its way. It works once and expires soon.</Notice>;
  return (
    <form action={action}>
      <Input label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Button type="submit" loading={pending} style={{ width: '100%' }}>Send reset link</Button>
    </form>
  );
}
