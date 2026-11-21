'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { loginAction, type FormState } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action}>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next ?? ''} />
      <Input label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Input label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" loading={pending} style={{ width: '100%' }}>Log in</Button>
      <p className="auth__links"><Link href="/forgot-password">Forgot your password?</Link></p>
    </form>
  );
}
