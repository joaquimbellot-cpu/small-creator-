import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState, Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/env';
import { buildFooter } from '@/lib/email/footer';
import { ReviewCard, type ReviewEmail } from './ReviewCard';
import { SendBar, type SendItem } from './SendBar';

export const metadata: Metadata = { title: 'Review' };

// Fixed texts for the failure codes that Compose puts in the address. Anything else in the address is ignored.
const FAILURE_TEXT: Record<string, string> = {
  down: 'Claude could not be reached or took too long. Try again in a minute.',
  refused: 'Claude did not return a draft.',
  checks: 'the draft broke a rule (a link, a price, a placeholder or too many words)',
  blocked: 'the creator or the sponsor is marked do not contact, or the address has opted out',
  save: 'the draft could not be saved',
  late: 'the run ran out of time. Run it again for these',
};
function failureNotes(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? '').split(',').slice(0, 10)) {
    const m = /^([a-z]+)-(\d{1,3})$/.exec(part);
    if (m && FAILURE_TEXT[m[1]]) out.push(`${m[2]} not drafted: ${FAILURE_TEXT[m[1]]}`);
  }
  return out;
}

type Row = {
  id: string; subject: string; body: string; status: 'draft' | 'approved'; to_email: string; source: string; approved_at: string | null;
  creators: { full_name: string } | null; drafter: { full_name: string } | null;
  // set on pitch drafts only
  brand_id: string | null; recipient_kind: 'creator' | 'brand_contact'; pitch_facts: { used?: string[]; left_out?: string[] } | null;
  brands: { name: string } | null; brand_contacts: { full_name: string } | null;
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const who = sp.who === 'all' ? 'all' : 'mine';
  const supabase = await createClient();

  let query = supabase
    .from('emails')
    .select('id, subject, body, status, to_email, source, approved_at, brand_id, recipient_kind, pitch_facts, creators(full_name), brands(name), brand_contacts(full_name), drafter:profiles!emails_drafted_by_fkey(full_name)')
    .in('status', ['draft', 'approved'])
    .order('created_at', { ascending: false })
    .limit(100);
  if (who === 'mine') query = query.eq('drafted_by', staff.id);
  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Row[];
  const drafted = /^\d{1,3}$/.test(sp.drafted ?? '') ? sp.drafted : undefined;
  const notes = failureNotes(sp.failed);

  const { data: settings } = await supabase.from('settings').select('test_mode, test_email, min_seconds_between_sends, sender_postal_address').eq('id', 1).single();
  const footer = buildFooter(settings?.sender_postal_address, `${siteUrl()}/unsubscribe/<personal link>`);
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const approvedItems: SendItem[] = rows.filter((r) => r.status === 'approved').map((r) => ({
    id: r.id, to: r.to_email, subject: r.subject, stale: !!r.approved_at && new Date(r.approved_at).getTime() < dayAgo,
  }));

  return (
    <>
      {drafted ? (
        <Notice tone={notes.length ? 'warn' : 'success'}>
          {drafted} {drafted === '1' ? 'draft' : 'drafts'} saved{sp.mock === '1' ? ' (mock drafts: no Claude call was made, check the wording)' : ''}.
          {notes.length ? ` ${notes.join('; ')}.` : ''}
        </Notice>
      ) : null}
      {error ? <Notice tone="error">Could not load the drafts. Refresh to try again.</Notice> : null}
      <SendBar items={approvedItems} testMode={settings?.test_mode ?? true} testEmail={settings?.test_email ?? ''} delaySeconds={settings?.min_seconds_between_sends ?? 5} />
      <div className="toolbar">
        <Link href="/emails/review">{who === 'mine' ? <strong>My drafts</strong> : 'My drafts'}</Link>
        <Link href="/emails/review?who=all">{who === 'all' ? <strong>All staff</strong> : 'All staff'}</Link>
        <Badge>{rows.length} listed</Badge>
      </div>
      {error ? null : rows.length === 0 ? (
        <EmptyState title="Nothing to review">Drafts you create on the Compose page appear here.</EmptyState>
      ) : (
        rows.map((r) => {
          const email: ReviewEmail = {
            id: r.id, subject: r.subject, body: r.body, status: r.status, to_email: r.to_email, byClaude: r.source === 'claude',
            creator: r.creators?.full_name ?? 'Unknown creator', drafter: r.drafter?.full_name || 'someone',
            sponsor: r.brands?.name ?? null,
            toContact: r.recipient_kind === 'brand_contact' ? (r.brand_contacts?.full_name ?? 'the contact person') : null,
            factsUsed: Array.isArray(r.pitch_facts?.used) ? r.pitch_facts.used.slice(0, 20).map(String) : [],
            leftOut: Array.isArray(r.pitch_facts?.left_out) ? r.pitch_facts.left_out.slice(0, 20).map(String) : [],
          };
          return <ReviewCard key={r.id} email={email} footer={footer} />;
        })
      )}
    </>
  );
}
