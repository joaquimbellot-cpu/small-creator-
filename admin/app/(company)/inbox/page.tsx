import type { Metadata } from 'next';
import Link from 'next/link';
import { after } from 'next/server';
import { Badge, Button, EmptyState, Notice, Pagination, Select, Table, tableCell } from '@/components/ui';
import { requireStaff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/deals/format';
import { filterSchema } from '@/lib/forms/schemas';

export const metadata: Metadata = { title: 'Inbox' };

const PAGE_SIZE = 25;

function one(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : undefined;
}

type Row = { id: string; name: string; email: string; topic: string | null; message: string; created_at: string; handled_at: string | null };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(one(sp.page) ?? '1', 10) || 1);
  const parsed = filterSchema.safeParse(one(sp.show));
  const show = parsed.success ? parsed.data : 'open';

  const supabase = await createClient();
  let q = supabase.from('contact_messages').select('id, name, email, topic, message, created_at, handled_at', { count: 'exact' });
  if (show === 'open') q = q.is('handled_at', null);
  if (show === 'handled') q = q.not('handled_at', 'is', null);
  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .order('id')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Row[];
  // The list shows sender emails: one audit line per page view.
  // Written after the response, so the page does not wait for it. It reuses this request's client:
  // logAudit() would call cookies() again, which is not allowed inside after().
  if (!error) {
    after(async () => {
      try {
        const { error: auditError } = await supabase.rpc('log_audit', { action: 'contact.viewed', entity_type: 'contact_message', entity_id: null, details: { list: true, count: rows.length } });
        if (auditError) console.error('audit write failed contact.viewed', auditError.code);
      } catch (e) {
        console.error('audit write failed contact.viewed', e instanceof Error ? e.message : e);
      }
    });
  }

  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (show !== 'open') u.set('show', show);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return `/inbox${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <div className="page-head"><h1 className="page-title">Inbox</h1></div>
      <form method="get" className="toolbar">
        <Select label="Show" name="show" defaultValue={show}>
          <option value="open">Not handled</option>
          <option value="handled">Handled</option>
          <option value="all">All messages</option>
        </Select>
        <Button type="submit" variant="ghost">Filter</Button>
      </form>

      {error ? <Notice tone="error">The inbox could not be loaded. Refresh the page to try again.</Notice> : rows.length === 0 ? (
        <EmptyState title={show === 'open' ? 'Nothing waiting' : 'No messages here'}>
          {show === 'open' ? 'Every message has been handled. New ones from the website contact form appear here.' : 'Try another filter.'}
        </EmptyState>
      ) : (
        <Table label="Messages">
          <thead>
            <tr><th>From</th><th>Message</th><th>Received (UTC)</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/inbox/${m.id}`}>{m.name}</Link>
                  <div className="muted">{m.email}</div>
                </td>
                <td>{m.topic ? <strong>{m.topic}. </strong> : null}{m.message.length > 120 ? `${m.message.slice(0, 120)}…` : m.message}</td>
                <td className={tableCell.num}>{formatWhen(m.created_at)}</td>
                <td>{m.handled_at ? <Badge tone="good">Handled</Badge> : <Badge tone="warn">New</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {rows.length > 0 || page > 1 ? <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} /> : null}
    </>
  );
}
