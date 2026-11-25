import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { Badge, Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/env';
import { buildFooter } from '@/lib/email/footer';
import { formatWhen } from '@/lib/deals/format';
import { EmailAction } from './EmailActions';
import { PitchFacts } from '../review/ReviewCard';
import { STATUS_LABEL, STATUS_TONE } from '../status';

export const metadata: Metadata = { title: 'Email' };

type Person = { full_name: string } | null;
const when = (t: string | null) => (t ? `${formatWhen(t)} UTC` : '—');

export default async function EmailDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('emails')
    .select('id, subject, body, status, is_test, source, to_email, error, created_at, approved_at, sent_at, replied_at, recipient_kind, pitch_facts, creators(full_name), brands(id, name), brand_contacts(full_name), drafter:profiles!emails_drafted_by_fkey(full_name), approver:profiles!emails_approved_by_fkey(full_name), sender:profiles!emails_sent_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();
  // A failed query is not the same as a missing email.
  if (error) {
    return (
      <>
        <p><Link href="/emails">← All emails</Link></p>
        <Notice tone="error">This email could not be loaded. Refresh the page to try again.</Notice>
      </>
    );
  }
  if (!data) notFound();
  const e = data as unknown as typeof data & { creators: Person; drafter: Person; approver: Person; sender: Person; recipient_kind: string; brands: { id: string; name: string } | null; brand_contacts: Person; pitch_facts: { used?: string[]; left_out?: string[] } | null };
  const toContact = e.recipient_kind === 'brand_contact';
  // The address on this page is personal data: one audit line per real view, written after the response (the page does not wait).
  // A contact person's address is logged as contact.viewed, a creator's as creator.viewed. Skipped for prefetches and for
  // refreshes caused by this page's own buttons. It reuses this request's client (cookies() is not allowed inside after()).
  const h = await headers();
  if (!h.get('next-action') && !h.get('next-router-prefetch')) {
    const action = toContact ? 'contact.viewed' : 'creator.viewed';
    after(async () => {
      try {
        const { error: auditError } = await supabase.rpc('log_audit', { action, entity_type: 'email', entity_id: e.id, details: { kind: e.recipient_kind } });
        if (auditError) console.error('audit write failed', action, auditError.code);
      } catch (err) {
        console.error('audit write failed', action, err instanceof Error ? err.message : err);
      }
    });
  }
  const { data: settings } = await supabase.from('settings').select('sender_postal_address').eq('id', 1).single();
  const footer = buildFooter(settings?.sender_postal_address, `${siteUrl()}/unsubscribe/<personal link>`);

  return (
    <>
      <p><Link href="/emails">← All emails</Link></p>
      <h2>{e.subject || '(no subject)'}</h2>
      <p className="muted">Times are UTC.</p>
      <p>
        <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{STATUS_LABEL[e.status] ?? e.status}</Badge> {e.is_test ? <Badge>test</Badge> : null}{' '}
        {e.source === 'claude' ? <><Badge tone="accent">Written by Claude</Badge>{' '}</> : null}
        {e.brands ? <><Badge tone="accent">Pitch</Badge>{' '}</> : null}
        <span className="muted">
          {e.is_test ? 'Would go to' : 'To'} {toContact ? `${e.brand_contacts?.full_name ?? 'the contact person'} at ${e.brands?.name}, about ${e.creators?.full_name}` : e.creators?.full_name} ({e.to_email})
        </span>
        {e.brands ? <span className="muted"> · Sponsor: <Link href={`/sponsors/${e.brands.id}`}>{e.brands.name}</Link></span> : null}
      </p>
      {e.is_test ? <Notice tone="info" title="Test">Delivered to the test address, not to the creator. The address above is only where a real send would go.</Notice> : null}
      {toContact && e.brands ? <p className="muted">If {e.brand_contacts?.full_name ?? 'the contact person'} opts out, only this address is blocked. Other contacts at {e.brands.name} can still be written to.</p> : null}
      {e.error ? <Notice tone="error" title="Error">{e.error}</Notice> : null}

      <div className="split">
        <div className="tile">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{e.subject ? `${e.is_test ? '[TEST] ' : ''}${e.subject}\n\n` : ''}{e.body}{'\n\n'}{footer}</pre>
        </div>
        <dl>
          <dt className="label">Drafted by</dt><dd>{e.drafter?.full_name || '—'} · {when(e.created_at)}</dd>
          <dt className="label">Approved by</dt><dd>{e.approver?.full_name || '—'} · {when(e.approved_at)}</dd>
          <dt className="label">Sent by</dt><dd>{e.sender?.full_name || '—'} · {when(e.sent_at)}</dd>
          <dt className="label">Replied</dt><dd>{when(e.replied_at)}</dd>
        </dl>
      </div>

      {e.brands && (e.pitch_facts?.used?.length || e.pitch_facts?.left_out?.length) ? <PitchFacts used={(e.pitch_facts.used ?? []).map(String)} leftOut={(e.pitch_facts.left_out ?? []).map(String)} /> : null}

      <div style={{ display: 'flex', gap: 8 }}>
        {e.status === 'sent' ? (
          <EmailAction id={e.id} kind="replied" />
        ) : null}
        {e.status === 'failed' ? (
          <EmailAction id={e.id} kind="retry" />
        ) : null}
        {e.status === 'draft' || e.status === 'approved' ? <Link href="/emails/review">Open in Review</Link> : null}
      </div>
    </>
  );
}
