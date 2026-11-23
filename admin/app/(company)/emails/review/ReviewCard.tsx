'use client';
// One draft or approved email: edit, approve, back to draft, discard. Never sends.
import { useActionState } from 'react';
import { submitKeepingValues } from '@/lib/email/submit';
import { Badge, Button, ConfirmButton, Input, Notice, Textarea } from '@/components/ui';
import { backToDraftAction, discardAction, editAction, type EditState } from './actions';

export type ReviewEmail = { id: string; subject: string; body: string; status: 'draft' | 'approved'; creator: string; to_email: string; drafter: string; byClaude: boolean };

export function ReviewCard({ email, footer }: { email: ReviewEmail; footer: string }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editAction, {});
  const approved = email.status === 'approved';
  return (
    <article className="tile" style={{ marginBottom: 16 }} aria-label={`Email to ${email.creator}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong>{email.creator}</strong> <span className="muted">· {email.to_email} · drafted by {email.drafter}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {email.byClaude ? <Badge tone="accent">Written by Claude</Badge> : null}
          <Badge tone={approved ? 'good' : 'warn'}>{approved ? 'Approved' : 'Draft'}</Badge>
        </div>
      </div>

      <form onSubmit={submitKeepingValues(action)}>
        <input type="hidden" name="id" value={email.id} />
        <Input label="Subject" name="subject" defaultValue={email.subject} maxLength={120} required />
        <Textarea label="Body" name="body" defaultValue={email.body} rows={10} maxLength={4000} required />
        <div className="label">Added by the server when sent</div>
        <pre className="muted" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '4px 0 16px' }}>{footer}</pre>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="submit" name="intent" value="save" variant="ghost" loading={pending}>Save</Button>
          {!approved ? <Button type="submit" name="intent" value="approve" loading={pending}>Approve</Button> : null}
        </div>
      </form>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {approved ? (
          <form action={backToDraftAction} className="inline-form">
            <input type="hidden" name="id" value={email.id} />
            <Button type="submit" variant="ghost" size="sm">Back to draft</Button>
          </form>
        ) : null}
        <form action={discardAction} className="inline-form">
          <input type="hidden" name="id" value={email.id} />
          <ConfirmButton title="Discard this draft?" message={`The draft to ${email.creator} will be deleted. This cannot be undone.`} confirmLabel="Discard">Discard</ConfirmButton>
        </form>
      </div>
    </article>
  );
}
