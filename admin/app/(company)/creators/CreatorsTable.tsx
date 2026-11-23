'use client';
// The list: checkbox selection, bulk actions, click a row to open the pop-up.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, ConfirmButton, LinkButton, Notice, SortLink, Table, tableCell } from '@/components/ui';
import { formatWhen } from '@/lib/deals/format';
import { STATUSES, STATUS_LABEL, STATUS_TONE, type CreatorStatus, type ListRow } from '@/lib/creators/constants';
import { NO_KEY, RefreshResults, callRefresh, type RefreshResponse } from './RefreshResults';
import s from './creators.module.css';

export type Row = ListRow & { href: string };
export type SortCol = { href: string; active: 'asc' | 'desc' | false };

export function CreatorsTable({ rows, sorts, youtubeEnabled }: { rows: Row[]; sorts: Record<'name' | 'subscribers' | 'last_contacted' | 'added', SortCol>; youtubeEnabled: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<RefreshResponse | null>(null);
  const [statusTo, setStatusTo] = useState<CreatorStatus | ''>('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);

  function toggle(id: string, on: boolean) {
    setSelected((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n; });
  }

  async function refresh() {
    if (!youtubeEnabled) { setResponse({ ok: false, error: NO_KEY }); return; }
    setBusy(true);
    setResponse(await callRefresh(ids));
    setBusy(false);
    router.refresh();
  }

  // Changes the status of every selected creator, then reloads the list. The server skips (and counts) creators a
  // worker may not take off "do not contact".
  async function changeStatus() {
    if (!statusTo || ids.length === 0) return;
    setStatusBusy(true);
    setStatusNote(null);
    try {
      const res = await fetch('/api/creators/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: statusTo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusNote({ tone: 'error', text: json.error || 'The status could not be changed. Try again.' });
      } else {
        const label = STATUS_LABEL[statusTo];
        const parts = [`Changed ${json.changed} ${json.changed === 1 ? 'creator' : 'creators'} to ${label}.`];
        if (json.unchanged) parts.push(`${json.unchanged} already had that status.`);
        if (json.ownerOnly) parts.push(`${json.ownerOnly} not changed: only the owner can take a creator off Do not contact.`);
        if (json.notFound) parts.push(`${json.notFound} no longer exist.`);
        setStatusNote({ tone: json.ownerOnly ? 'error' : 'success', text: parts.join(' ') });
        setSelected(new Set());
        setStatusTo('');
        router.refresh();
      }
    } catch {
      setStatusNote({ tone: 'error', text: 'The status could not be changed. Check your connection and try again.' });
    }
    setStatusBusy(false);
  }

  const n = ids.length;
  const statusMessage = statusTo === 'do_not_contact'
    ? 'They will be blocked from every email, and their addresses go on the suppression list. Only the owner can undo this.'
    : 'Each change is saved in the audit log.';

  return (
    <>
      <div className={s.bar}>
        <span aria-live="polite">{ids.length === 0 ? 'Select creators to act on them.' : `${ids.length} selected`}</span>
        <Button size="sm" variant="ghost" disabled={ids.length === 0 || ids.length > 200} loading={busy} onClick={refresh}>Refresh subscribers</Button>
        {ids.length > 0
          ? <LinkButton size="sm" variant="ghost" href={`/emails/compose?creators=${ids.join(',')}`}>Email selected</LinkButton>
          : <Button size="sm" variant="ghost" disabled>Email selected</Button>}
        <select
          className={s.statusPick}
          aria-label="Change status to"
          value={statusTo}
          onChange={(e) => setStatusTo(e.target.value as CreatorStatus | '')}
          disabled={n === 0}
        >
          <option value="">Change status to…</option>
          {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
        </select>
        <ConfirmButton
          variant="primary"
          disabled={n === 0 || n > 200 || !statusTo || statusBusy}
          title={statusTo ? `Change ${n} ${n === 1 ? 'creator' : 'creators'} to ${STATUS_LABEL[statusTo]}?` : 'Change status'}
          message={statusMessage}
          confirmLabel="Yes, change"
          onConfirm={changeStatus}
        >
          {statusBusy ? 'Changing…' : 'Change status'}
        </ConfirmButton>
        {ids.length > 200 ? <span>Select at most 200 at a time.</span> : null}
      </div>
      {statusNote ? <div className={s.stack}><Notice tone={statusNote.tone}>{statusNote.text}</Notice></div> : null}
      {response ? <div className={s.stack}><RefreshResults response={response} /></div> : null}
      {!youtubeEnabled && !response ? <p className="muted" style={{ marginTop: 0 }}>Subscriber refresh is off. {NO_KEY}.</p> : null}
      <Table clickable label="Creators">
        <thead>
          <tr>
            <th className={s.checkCell}>
              <input type="checkbox" aria-label="Select all on this page" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
            </th>
            <th><SortLink href={sorts.name.href} active={sorts.name.active}>Name</SortLink></th>
            <th>Status</th>
            <th className={tableCell.num}><SortLink href={sorts.subscribers.href} active={sorts.subscribers.active}>Subscribers</SortLink></th>
            <th><SortLink href={sorts.last_contacted.href} active={sorts.last_contacted.active}>Last contacted</SortLink></th>
            <th><SortLink href={sorts.added.href} active={sorts.added.active}>Added</SortLink></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a,input,button')) router.push(r.href); }}>
              <td className={s.checkCell}>
                <input type="checkbox" aria-label={`Select ${r.full_name}`} checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
              </td>
              <td>
                <Link href={r.href} prefetch={false} className={s.nameLink}>{r.full_name}</Link>
                <span className={s.sub}>{r.email}</span>
              </td>
              <td><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
              <td className={tableCell.num}>{r.subscribers_hidden ? 'Hidden' : r.subscribers == null ? '—' : r.subscribers.toLocaleString('en-US')}</td>
              <td>{formatWhen(r.last_contacted_at)}</td>
              <td>{formatWhen(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
