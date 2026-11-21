'use client';
import { useActionState } from 'react';
import { submitKeepingValues } from '@/lib/email/submit';
import { Button, Input, Notice, Textarea } from '@/components/ui';
import { saveSendingAction, type SendingState } from './actions';

export type Sending = {
  daily_send_limit: number; min_seconds_between_sends: number; test_mode: boolean;
  test_email: string | null; sender_name: string; sender_postal_address: string | null;
};

export function SendingForm({ s }: { s: Sending }) {
  const [state, action, pending] = useActionState<SendingState, FormData>(saveSendingAction, {});
  return (
    <form onSubmit={submitKeepingValues(action)} style={{ maxWidth: 560 }}>
      <Input label="Daily limit" name="daily_send_limit" type="number" min={1} max={500} defaultValue={s.daily_send_limit} required hint="Emails per day, 1 to 500. Gmail allows about 500 a day." />
      <Input label="Seconds between sends" name="min_seconds_between_sends" type="number" min={2} max={120} defaultValue={s.min_seconds_between_sends} required hint="2 to 120." />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0' }}>
        <input type="checkbox" name="test_mode" defaultChecked={s.test_mode} /> Test mode (every email goes to the test address, with [TEST] in the subject)
      </label>
      <Input label="Test address" name="test_email" type="email" defaultValue={s.test_email ?? ''} />
      <Input label="Sender name" name="sender_name" defaultValue={s.sender_name} required maxLength={200} />
      <Textarea label="Sender postal address" name="sender_postal_address" rows={3} defaultValue={s.sender_postal_address ?? ''} maxLength={500} hint="Shown at the bottom of every email. Required to turn test mode off. A PO box is fine." />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.saved ? <Notice tone="success">Saved.</Notice> : null}
      <Button type="submit" loading={pending}>Save</Button>
    </form>
  );
}
