'use client';
import { useActionState } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { verifyCodeAction } from '../actions';
import type { FormState } from '../actions';

export function TwoFactorForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyCodeAction, {});
  return (
    <>
    <form action={action}>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <Input label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
      <Button type="submit" loading={pending} style={{ width: '100%' }}>Verify</Button>
    </form>
    <form action="/auth/signout" method="post" className="auth__links"><button type="submit" className="auth__linkbtn">Use a different account</button></form>
    </>
  );
}
