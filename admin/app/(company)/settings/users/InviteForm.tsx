'use client';
import { useActionState } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { inviteWorkerAction, type UserFormState } from './actions';

export function InviteForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(inviteWorkerAction, {});
  return (
    <form action={action} className="tile">
      <h2 style={{ fontSize: '1.375rem', marginBottom: 16 }}>Invite a worker</h2>
      <p className="muted" style={{ marginTop: 0 }}>They get an email with a link to choose a password. Workers can edit creators, deals and emails, but cannot delete, export, or open Settings.</p>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      <Input label="Email" name="email" type="email" required />
      <Input label="Name (optional)" name="full_name" maxLength={200} />
      <Button type="submit" loading={pending}>Send invite</Button>
    </form>
  );
}
