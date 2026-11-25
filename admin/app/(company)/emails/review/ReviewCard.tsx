'use client';
// One draft or approved email: edit, approve, back to draft, discard. Never sends.
import { useActionState } from 'react';
import { submitKeepingValues } from '@/lib/email/submit';
import { Badge, Button, ConfirmButton, Input, Notice, Textarea } from '@/components/ui';
import { backToDraftAction, discardAction, editAction, type EditState } from './actions';

export type ReviewEmail = {
  id: string; subject: string; body: string; status: 'draft' | 'approved'; creator: string; to_email: string; drafter: string; byClaude: boolean;
  /** Pitch drafts only: the sponsor, the contact person when the email goes to one, and the facts shown under the draft. */
  sponsor?: string | null; toContact?: string | null; factsUsed?: string[]; leftOut?: string[];
};

export function ReviewCard({ email, footer }: { email: ReviewEmail; footer: string }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editAction, {});
  const approved = email.status === 'approved';
  return (
    <article className="tile" style={{ marginBottom: 16 }} aria-label={email.toContact ? `Email to ${email.toContact} about ${email.creator}` : `Email to ${email.creator}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {email.toContact ? (
            <><strong>{email.toContact}</strong> <span className="muted">at {email.sponsor}, about {email.creator} · {email.to_email} · drafted by {email.drafter}</span></>
          ) : (
            <><strong>{email.creator}</strong> <span className="muted">· {email.to_email} · drafted by {email.drafter}</span></>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {email.sponsor ? <Badge tone="accent">{`Pitch: ${email.sponsor}`}</Badge> : null}
          {email.byClaude ? <Badge tone="accent">Written by Claude</Badge> : null}
          <Badge tone={approved ? 'good' : 'warn'}>{approved ? 'Approved' : 'Draft'}</Badge>
        </div>
      </div>

      <form onSubmit={submitKeepingValues(action)}>
        <input type="hidden" name="id" value={email.id} />
        <Input label="Subject" name="subject" defaultValue={email.subject} maxLength={120} required />
        <Textarea label="Body" name="body" defaultValue={email.body} rows={10} maxLength={4000} required />
        {email.sponsor ? (
          <p className="muted" style={{ fontSize: '.875rem' }}>Facts you add by hand are not checked: you are responsible for them. Prices and details of other sponsors do not belong in a first email.</p>
        ) : null}
        {email.toContact ? (
          <p className="muted" style={{ fontSize: '.875rem' }}>If {email.toContact} opts out, only this address is blocked. Other contacts at {email.sponsor} can still be written to.</p>
        ) : null}
        <div className="label">Added by the server when sent</div>
        <pre className="muted" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '4px 0 16px' }}>{footer}</pre>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="submit" name="intent" value="save" variant="ghost" loading={pending}>Save</Button>
          {!approved ? <Button type="submit" name="intent" value="approve" loading={pending}>Approve</Button> : null}
        </div>
      </form>

      {email.sponsor && (email.factsUsed?.length || email.leftOut?.length) ? <PitchFacts used={email.factsUsed ?? []} leftOut={email.leftOut ?? []} /> : null}

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

/** "Facts used" and "Left out", as saved with the draft: plain sentences, no addresses. */
export function PitchFacts({ used, leftOut }: { used: string[]; leftOut: string[] }) {
  return (
    <>
    <p className="muted" style={{ margin: '8px 0 0' }}>This check catches common mistakes, not all of them. Read every name and number before you send.</p>
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Facts used and left out</summary>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div><div className="label">Facts used</div><ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{used.map((u) => <li key={u}>{u}</li>)}</ul></div>
        <div><div className="label">Left out</div><ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{leftOut.map((u) => <li key={u}>{u}</li>)}</ul></div>
      </div>
    </details>
    </>
  );
}
