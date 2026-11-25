import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Button, EmptyState, Input, Notice, Pagination, Select, Table } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/deals/format';
import { STATUS_LABEL, STATUS_TONE } from './status';

export const metadata: Metadata = { title: 'Email log' };

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['draft', 'approved', 'sending', 'sent', 'failed', 'replied'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = { id: string; subject: string; status: string; is_test: boolean; to_email: string; created_at: string; sent_at: string | null; recipient_kind: string; creators: { full_name: string } | null; brands: { id: string; name: string } | null; brand_contacts: { full_name: string } | null };

export default async function EmailLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  // creators!inner makes the creator-name filter work; the "creator" box takes a name, or an id from a link.
  let query = supabase
    .from('emails')
    .select('id, subject, status, is_test, to_email, created_at, sent_at, recipient_kind, creators!inner(full_name), brands(id, name), brand_contacts(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (sp.status && STATUSES.includes(sp.status)) query = query.eq('status', sp.status);
  if (sp.kind === 'test') query = query.eq('is_test', true);
  if (sp.kind === 'real') query = query.eq('is_test', false);
  if (sp.from && DATE.test(sp.from)) query = query.gte('created_at', sp.from);
  if (sp.to && DATE.test(sp.to)) query = query.lt('created_at', new Date(new Date(sp.to).getTime() + 86400000).toISOString().slice(0, 10));
  const creator = (sp.creator ?? '').trim();
  if (UUID.test(creator)) query = query.eq('creator_id', creator);
  else if (creator) query = query.ilike('creators.full_name', `%${creator.replace(/[%,()*\\]/g, ' ')}%`);
  const { data, count, error } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const hrefFor = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    q.set('page', String(p));
    return `?${q}`;
  };

  return (
    <>
      <form className="toolbar" method="get">
        <Select label="Status" name="status" defaultValue={sp.status ?? ''}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select label="Type" name="kind" defaultValue={sp.kind ?? ''}>
          <option value="">Test and real</option>
          <option value="real">Real</option>
          <option value="test">Test</option>
        </Select>
        <Input label="Creator" name="creator" defaultValue={creator} />
        <Input label="From" name="from" type="date" defaultValue={sp.from ?? ''} />
        <Input label="To" name="to" type="date" defaultValue={sp.to ?? ''} />
        <Button type="submit" variant="ghost">Filter</Button>
      </form>

      {error ? (
        <Notice tone="error">The email log could not be loaded. Refresh the page to try again.</Notice>
      ) : rows.length === 0 ? (
        <EmptyState title="No emails found">Try other filters.</EmptyState>
      ) : (
        <Table label="Emails">
          <thead><tr><th>Creator</th><th>Sponsor</th><th>Subject</th><th>Status</th><th>Date (UTC)</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/emails/${r.id}`}>{r.creators?.full_name ?? r.to_email}</Link>
                  {r.recipient_kind === 'brand_contact' ? <span className="muted"> · goes to {r.brand_contacts?.full_name ?? 'the contact person'}</span> : null}
                </td>
                <td>{r.brands ? <Link href={`/sponsors/${r.brands.id}`}>{r.brands.name}</Link> : <span className="muted">–</span>}</td>
                <td>{r.subject || <span className="muted">(no subject)</span>}</td>
                <td>
                  <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>{' '}
                  {r.is_test ? <span title="Test: sent to the test address"><Badge>Test</Badge></span> : null}
                </td>
                <td>{formatWhen(r.sent_at ?? r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} />
    </>
  );
}
