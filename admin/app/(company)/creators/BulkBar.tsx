'use client';
// What you can do with the ticked creators: add to a list, add a tag, start outreach drafts, change status,
// refresh subscribers. The ticks live in the list (they survive page and filter changes); at most 200 at a time.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmButton, Input, LinkButton, Modal, Notice, Select, useToast } from '@/components/ui';
import { MAX_BULK_IDS, STATUSES, STATUS_LABEL, type CreatorStatus } from '@/lib/creators/constants';
import { addTag, addToList, type ActionResult } from './list-actions';
import type { Named } from './CreatorsFilters';
import { NO_KEY, RefreshResults, callRefresh, type RefreshResponse } from './RefreshResults';
import s from './creators.module.css';

const NEW = '__new';

function PickDialog({ kind, options, ids, onClose, onDone }: {
  kind: 'list' | 'tag'; options: Named[]; ids: string[]; onClose: () => void; onDone: (message: string) => void;
}) {
  const [pick, setPick] = useState(options[0]?.id ?? NEW);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const noun = kind === 'list' ? 'list' : 'tag';
  const creating = pick === NEW;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    let r: ActionResult;
    try {
      const base = { ids };
      r = kind === 'list'
        ? await addToList(creating ? { ...base, newName: name } : { ...base, listId: pick })
        : await addTag(creating ? { ...base, newName: name } : { ...base, tagId: pick });
    } catch {
      r = { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
    setBusy(false);
    if (r.ok) onDone(r.message); else setError(r.error);
  }

  return (
    <Modal
      open onClose={onClose} title={kind === 'list' ? `Add ${ids.length} to a list` : `Add a tag to ${ids.length}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => submit()}>{kind === 'list' ? 'Add to list' : 'Add tag'}</Button></>}
    >
      <form onSubmit={submit} className={s.pickRow}>
        <Select label={`Which ${noun}`} value={pick} onChange={(e) => setPick(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value={NEW}>{kind === 'list' ? 'A new list…' : 'A new tag…'}</option>
        </Select>
        {creating ? <Input label={`Name of the new ${noun}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-autofocus /> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function BulkBar({ ids, onClear, lists, tags, youtubeEnabled }: {
  ids: string[]; onClear: () => void; lists: Named[]; tags: Named[]; youtubeEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'list' | 'tag' | null>(null);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<RefreshResponse | null>(null);
  const [statusTo, setStatusTo] = useState<CreatorStatus | ''>('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const n = ids.length;

  async function refresh() {
    if (!youtubeEnabled) { setResponse({ ok: false, error: NO_KEY }); return; }
    setBusy(true);
    setResponse(await callRefresh(ids));
    setBusy(false);
    router.refresh();
  }

  // The server skips (and counts) creators a worker may not take off "do not contact".
  async function changeStatus() {
    if (!statusTo || n === 0) return;
    setStatusBusy(true);
    setStatusNote(null);
    try {
      const res = await fetch('/api/creators/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status: statusTo }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusNote({ tone: 'error', text: json.error || 'The status could not be changed. Try again.' });
      } else {
        const parts = [`Changed ${json.changed} ${json.changed === 1 ? 'creator' : 'creators'} to ${STATUS_LABEL[statusTo]}.`];
        if (json.unchanged) parts.push(`${json.unchanged} already had that status.`);
        if (json.ownerOnly) parts.push(`${json.ownerOnly} not changed: only the owner can take a creator off Do not contact.`);
        if (json.notFound) parts.push(`${json.notFound} no longer exist.`);
        setStatusNote({ tone: json.ownerOnly ? 'error' : 'success', text: parts.join(' ') });
        onClear();
        setStatusTo('');
        router.refresh();
      }
    } catch {
      setStatusNote({ tone: 'error', text: 'The status could not be changed. Check your connection and try again.' });
    }
    setStatusBusy(false);
  }

  const statusMessage = statusTo === 'do_not_contact'
    ? 'They will be blocked from every email, and their addresses go on the suppression list. Only the owner can undo this.'
    : 'Each change is saved in the audit log.';

  return (
    <>
      {n > 0 ? (
        <div className="list-bulk" role="region" aria-label="Actions for ticked creators">
          <strong>{n} selected</strong>
          <Button size="sm" variant="ghost" onClick={() => setDialog('list')}>Add to a list</Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog('tag')}>Add a tag</Button>
          <LinkButton size="sm" href={`/emails/compose?creators=${ids.join(',')}`}>Start outreach drafts</LinkButton>
          <span className={s.statusPickRow}>
            <select className={s.statusPick} aria-label="Change status to" value={statusTo} onChange={(e) => setStatusTo(e.target.value as CreatorStatus | '')}>
              <option value="">Change status to…</option>
              {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </select>
            <ConfirmButton
              variant="primary" disabled={!statusTo || statusBusy}
              title={statusTo ? `Change ${n} ${n === 1 ? 'creator' : 'creators'} to ${STATUS_LABEL[statusTo]}?` : 'Change status'}
              message={statusMessage} confirmLabel="Yes, change" onConfirm={changeStatus}
            >
              {statusBusy ? 'Changing…' : 'Change status'}
            </ConfirmButton>
          </span>
          <Button size="sm" variant="ghost" loading={busy} onClick={refresh}>Refresh subscribers</Button>
          <Button size="sm" variant="ghost" onClick={onClear}>Clear selection</Button>
          {n >= MAX_BULK_IDS ? <span className="muted">At most {MAX_BULK_IDS} at a time.</span> : null}
        </div>
      ) : null}
      {statusNote ? <div className={s.bulkNote}><Notice tone={statusNote.tone}>{statusNote.text}</Notice></div> : null}
      {response ? <div className={s.bulkNote}><RefreshResults response={response} /></div> : null}
      {dialog ? (
        <PickDialog
          kind={dialog} ids={ids} options={dialog === 'list' ? lists : tags}
          onClose={() => setDialog(null)}
          onDone={(message) => { setDialog(null); toast(message); router.refresh(); }}
        />
      ) : null}
    </>
  );
}
