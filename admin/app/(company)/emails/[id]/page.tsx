import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/env';
import { buildFooter } from '@/lib/email/footer';
import { markRepliedAction, retryAction } from '../actions';
import { STATUS_TONE } from '../status';

export const metadata: Metadata = { title: 'Email' };

type Person = { full_name: string } | null;
const when = (t: string | null) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—');

export default async function EmailDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from('emails')
    .select('id, subject, body, status, is_test, to_email, error, created_at, approved_at, sent_at, replied_at, creators(full_name), drafter:profiles!emails_drafted_by_fkey(full_name), approver:profiles!emails_approved_by_fkey(full_name), sender:profiles!emails_sent_by_fkey(full_name)')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const e = data as unknown as typeof data & { creators: Person; drafter: Person; approver: Person; sender: Person };
  const { data: settings } = await supabase.from('settings').select('sender_postal_address').eq('id', 1).single();
  const footer = buildFooter(settings?.sender_postal_address, `${siteUrl()}/unsubscribe/<personal link>`);

  return (
    <>
      <p><Link href="/emails">← All emails</Link></p>
      <h2>{e.subject || '(no subject)'}</h2>
      <p>
        <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{e.status}</Badge> {e.is_test ? <Badge>test</Badge> : null}{' '}
        <span className="muted">{e.is_test ? 'Would go to' : 'To'} {e.creators?.full_name} ({e.to_email})</span>
      </p>
      {e.is_test ? <Notice tone="info" title="Test">Delivered to the test address, not to the creator. The address above is only where a real send would go.</Notice> : null}
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

      <div style={{ display: 'flex', gap: 8 }}>
        {e.status === 'sent' ? (
          <form action={markRepliedAction}><input type="hidden" name="id" value={e.id} /><Button type="submit">Mark as replied</Button></form>
        ) : null}
        {e.status === 'failed' ? (
          <form action={retryAction}><input type="hidden" name="id" value={e.id} /><Button type="submit">Retry (back to draft)</Button></form>
        ) : null}
        {e.status === 'draft' || e.status === 'approved' ? <Link href="/emails/review">Open in Review</Link> : null}
      </div>
    </>
  );
}
