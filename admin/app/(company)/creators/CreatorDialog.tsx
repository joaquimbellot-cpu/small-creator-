'use client';
// The pop-up: view (loads from the API, which logs "viewed"), edit and add.
import { useActionState, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, ConfirmButton, Input, LinkButton, Modal, Notice, Select, Textarea } from '@/components/ui';
import { STATUSES, STATUS_LABEL, STATUS_TONE, formatUsd, type CreatorSummary } from '@/lib/creators/constants';
import { saveCreator, type SaveState } from './actions';
import { NO_KEY, RefreshResults, callRefresh, type RefreshResponse } from './RefreshResults';
import s from './creators.module.css';

type Props = {
  mode: 'view' | 'edit' | 'new';
  creatorId?: string;
  editInitial?: Record<string, string> | null;
  listHref: string; // the list without ?creator
  viewHref: string;
  editHref: string;
  back: string; // list query string, kept after saving
  isOwner: boolean;
  youtubeEnabled: boolean;
};

const dateTime = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC' : null);
const dateOnly = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : 'Never');

export function CreatorDialog(p: Props) {
  const router = useRouter();
  const close = () => router.push(p.listHref);
  const title = p.mode === 'new' ? 'Add creator' : p.mode === 'edit' ? 'Edit creator' : 'Creator';
  return (
    <Modal open onClose={close} title={title} wide>
      {p.mode === 'view' && p.creatorId ? <View {...p} creatorId={p.creatorId} onDeleted={close} /> : <Form {...p} />}
    </Modal>
  );
}

function View({ creatorId, editHref, isOwner, youtubeEnabled, onDeleted }: Props & { creatorId: string; onDeleted: () => void }) {
  const router = useRouter();
  const [c, setC] = useState<CreatorSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<RefreshResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const ctl = new AbortController();
    setC(null); setError('');
    fetch(`/api/creators/${creatorId}`, { signal: ctl.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 404 ? 'This creator no longer exists.' : json.error || 'Could not load this creator.');
        setC(json.creator);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctl.abort();
  }, [creatorId]);

  const refresh = useCallback(async () => {
    if (!youtubeEnabled) { setResponse({ ok: false, error: NO_KEY }); return; }
    setBusy(true);
    const r = await callRefresh([creatorId]);
    setResponse(r);
    setBusy(false);
    if (r.ok) {
      const x = r.results[0];
      const now = new Date().toISOString();
      if (x?.status === 'updated') setC((cur) => cur && { ...cur, subscribers: x.subscribers ?? cur.subscribers, subscribers_hidden: false, subscribers_checked_at: now });
      if (x?.status === 'hidden') setC((cur) => cur && { ...cur, subscribers_hidden: true, subscribers_checked_at: now });
      router.refresh();
    }
  }, [creatorId, youtubeEnabled, router]);

  async function remove() {
    setDeleteError('');
    try {
      const res = await fetch(`/api/creators/${creatorId}`, { method: 'DELETE' });
      if (res.ok) { router.refresh(); onDeleted(); return; }
      const json = await res.json().catch(() => ({}));
      setDeleteError(json.error || 'Could not delete.');
    } catch {
      setDeleteError('Could not reach the server.');
    }
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!c) return <p className="muted" role="status">Loading…</p>;

  const checked = dateTime(c.subscribers_checked_at);
  return (
    <>
      <dl className={s.dl}>
        <dt>Name</dt><dd><strong>{c.full_name}</strong></dd>
        <dt>YouTube</dt>
        <dd>{c.channel_url
          ? c.channel_url.startsWith('https://')
            ? <a href={c.channel_url} target="_blank" rel="noopener noreferrer">{c.channel_name || c.channel_url}</a>
            : (c.channel_name || c.channel_url)
          : '—'}</dd>
        <dt>Email</dt><dd>{c.email}</dd>
        <dt>Phone</dt><dd>{c.phone || '—'}</dd>
        <dt>Subscribers</dt>
        <dd>
          {c.subscribers_hidden ? 'Hidden by the channel' : c.subscribers == null ? '—' : c.subscribers.toLocaleString('en-US')}
          {c.subscribers_hidden && c.subscribers != null ? ` (last known: ${c.subscribers.toLocaleString('en-US')})` : ''}
          <span className="muted">{checked ? ` · checked ${checked}` : ' · never checked'}</span>
        </dd>
        <dt>Niche</dt><dd>{c.niche || '—'}</dd>
        <dt>Status</dt><dd><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></dd>
        <dt>Deals</dt><dd>{c.deal_count}</dd>
        <dt>Earned through us</dt><dd>{formatUsd(c.total_earned_cents)}</dd>
        <dt>Last contacted</dt><dd>{dateOnly(c.last_contacted_at)}</dd>
        <dt>Notes</dt><dd className={s.notes}>{c.notes || '—'}</dd>
      </dl>
      {response ? <div className={s.stack}><RefreshResults response={response} /></div> : null}
      {deleteError ? <div className={s.stack}><Notice tone="error">{deleteError}</Notice></div> : null}
      <div className={s.actions}>
        <LinkButton href={editHref}>Edit</LinkButton>
        {c.status !== 'do_not_contact' ? (
          <LinkButton variant="ghost" href={`/emails/compose?creators=${c.id}`}>Email this creator</LinkButton>
        ) : null}
        <Button variant="ghost" loading={busy} onClick={refresh}>Refresh subscribers</Button>
        {isOwner ? (
          <ConfirmButton size="md" title={`Delete ${c.full_name}?`} message="This removes the creator and their emails for good. It cannot be undone." confirmLabel="Delete creator" onConfirm={remove}>Delete</ConfirmButton>
        ) : null}
      </div>
    </>
  );
}

function Form({ mode, creatorId, editInitial, viewHref, listHref, back }: Props) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCreator, null);
  const router = useRouter();
  const v = state?.values ?? editInitial ?? {};
  const e = state?.errors ?? {};
  return (
    <form action={action} noValidate>
      {creatorId ? <input type="hidden" name="id" value={creatorId} /> : null}
      <input type="hidden" name="back" value={back} />
      <div className={s.formGrid}>
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <div className={s.two}>
          <Input name="name" label="Name" required maxLength={120} defaultValue={v.name ?? ''} error={e.name} data-autofocus />
          <Input name="email" label="Email" type="email" required maxLength={320} defaultValue={v.email ?? ''} error={e.email} />
        </div>
        <div className={s.two}>
          <Input name="phone" label="Phone (optional)" maxLength={30} defaultValue={v.phone ?? ''} error={e.phone} />
          <Input name="niche" label="Niche (optional)" maxLength={120} defaultValue={v.niche ?? ''} error={e.niche} />
        </div>
        <Input name="channel_url" label="YouTube channel link" placeholder="https://www.youtube.com/@name" maxLength={500} defaultValue={v.channel_url ?? ''} error={e.channel_url}
          hint="Formats: youtube.com/@handle, /channel/UC…, /c/name or /user/name." />
        <div className={s.two}>
          <Input name="subscribers" label="Subscribers (optional)" inputMode="numeric" defaultValue={v.subscribers ?? ''} error={e.subscribers}
            hint="Smallfold works with channels of 1,000 to 50,000 subscribers. Other numbers are allowed." />
          <Select name="status" label="Status" defaultValue={v.status || 'new'} error={e.status}>
            {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </Select>
        </div>
        <Textarea name="notes" label="Notes (optional)" rows={4} maxLength={2000} defaultValue={v.notes ?? ''} error={e.notes} />
        <div className={s.actions}>
          <Button type="submit" loading={pending}>{mode === 'new' ? 'Add creator' : 'Save changes'}</Button>
          <Button variant="ghost" onClick={() => router.push(mode === 'edit' ? viewHref : listHref)}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
