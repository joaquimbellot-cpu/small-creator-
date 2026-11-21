import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, EmptyState, Notice } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/supabase/env';
import { buildFooter } from '@/lib/email/footer';
import { ReviewCard, type ReviewEmail } from './ReviewCard';
import { SendBar } from './SendBar';

export const metadata: Metadata = { title: 'Review' };

type Row = {
  id: string; subject: string; body: string; status: 'draft' | 'approved'; to_email: string;
  creators: { full_name: string } | null; drafter: { full_name: string } | null;
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const who = sp.who === 'all' ? 'all' : 'mine';
  const supabase = await createClient();

  let query = supabase
    .from('emails')
    .select('id, subject, body, status, to_email, creators(full_name), drafter:profiles!emails_drafted_by_fkey(full_name)')
    .in('status', ['draft', 'approved'])
    .order('created_at', { ascending: false })
    .limit(100);
  if (who === 'mine') query = query.eq('drafted_by', staff.id);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const { data: settings } = await supabase.from('settings').select('test_mode, test_email, min_seconds_between_sends, sender_postal_address').eq('id', 1).single();
  const footer = buildFooter(settings?.sender_postal_address, `${siteUrl()}/unsubscribe/<personal link>`);
  const approvedIds = rows.filter((r) => r.status === 'approved').map((r) => r.id);

  return (
    <>
      {sp.drafted ? (
        <Notice tone={sp.failed ? 'warn' : 'success'}>
          {sp.drafted} {sp.drafted === '1' ? 'draft' : 'drafts'} saved{sp.mock === '1' ? ' (mock drafts: no Claude call was made, check the wording)' : ''}.
          {sp.failed ? ` Not drafted: ${sp.failed}.` : ''}
        </Notice>
      ) : null}
      <SendBar ids={approvedIds} testMode={settings?.test_mode ?? true} testEmail={settings?.test_email ?? ''} delaySeconds={settings?.min_seconds_between_sends ?? 5} />
      <div className="toolbar">
        <Link href="/emails/review">{who === 'mine' ? <strong>My drafts</strong> : 'My drafts'}</Link>
        <Link href="/emails/review?who=all">{who === 'all' ? <strong>All staff</strong> : 'All staff'}</Link>
        <Badge>{rows.length} listed</Badge>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to review">Drafts you create on the Compose page appear here.</EmptyState>
      ) : (
        rows.map((r) => {
          const email: ReviewEmail = {
            id: r.id, subject: r.subject, body: r.body, status: r.status, to_email: r.to_email,
            creator: r.creators?.full_name ?? 'Unknown creator', drafter: r.drafter?.full_name || 'someone',
          };
          return <ReviewCard key={r.id} email={email} footer={footer} />;
        })
      )}
    </>
  );
}
