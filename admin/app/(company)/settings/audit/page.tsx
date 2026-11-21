import type { Metadata } from 'next';
import { EmptyState, Pagination, Select, Table, Button } from '@/components/ui';
import { requireOwner } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';
import { describeAction, describeDetails, describeRecord, type AuditRow } from './format';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE_SIZE = 50;
const KNOWN = ['auth.login', 'auth.logout', 'user.invited', 'user.removed', 'creator.viewed', 'creator.created', 'creator.updated', 'creator.deleted', 'creators.imported', 'creators.exported', 'email.status_changed', 'deal.created', 'deal.updated', 'deal.deleted', 'settings.updated', 'suppression.created', 'suppression.deleted'];

function one(v: string | string[] | undefined) {
  return typeof v === 'string' ? v : undefined;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOwner();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(one(sp.page) ?? '1', 10) || 1);
  const action = one(sp.action)?.slice(0, 100);
  const actor = /^[0-9a-f-]{36}$/i.test(one(sp.actor) ?? '') ? one(sp.actor) : undefined;

  const supabase = await createClient();
  const [{ data: people }, { data: recent }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email'),
    supabase.from('audit_log').select('action').order('created_at', { ascending: false }).limit(1000),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name || String(p.email)]));
  const actions = Array.from(new Set([...KNOWN, ...(recent ?? []).map((r) => r.action)])).sort();

  let q = supabase.from('audit_log').select('id, actor_id, action, entity_type, entity_id, details, created_at', { count: 'exact' });
  if (action) q = q.eq('action', action);
  if (actor) q = q.eq('actor_id', actor);
  const { data, count } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as AuditRow[];

  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (action) u.set('action', action);
    if (actor) u.set('actor', actor);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return `/settings/audit${s ? `?${s}` : ''}`;
  };
  const fmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Read-only. Lines are written by the system and cannot be edited or deleted. Times are UTC.</p>
      <form method="get" className="toolbar">
        <Select label="Action" name="action" defaultValue={action ?? ''}>
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{describeAction(a)} ({a})</option>)}
        </Select>
        <Select label="Person" name="actor" defaultValue={actor ?? ''}>
          <option value="">Everyone</option>
          {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name || String(p.email)}</option>)}
        </Select>
        <Button type="submit" variant="ghost">Filter</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No lines match">Try a different filter.</EmptyState>
      ) : (
        <>
          <Table label="Audit log">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt.format(new Date(r.created_at))}</td>
                  <td>{r.actor_id ? names.get(r.actor_id) ?? 'Removed user' : 'System'}</td>
                  <td>{describeAction(r.action)}</td>
                  <td>{describeRecord(r)}</td>
                  <td className="muted">{describeDetails(r)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={hrefFor} />
        </>
      )}
    </>
  );
}
