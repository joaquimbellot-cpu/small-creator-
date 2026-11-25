'use client';
// The interactive part of SponsorshipHistory: the timeline, the add / edit form, confirm with a note, reject and restore.
import Link from 'next/link';
import { useEffect, useId, useState, useTransition } from 'react';
import { Button, Input, Notice, SourceBadge, Timeline, TimelineItem, useToast } from '@/components/ui';
import { addSponsorship, confirmSponsorship, listParties, rejectSponsorship, restoreSponsorship, updateSponsorship } from '@/lib/sponsorships/actions';
import { fmtDate, plural, sourceSentence } from '@/lib/sponsorships/format';
import { cleanVideoUrl } from '@/lib/sponsorships/schemas';
import type { HistoryRecord, PartyOption, SponsorshipSide } from '@/lib/sponsorships/types';
import s from './sponsorships.module.css';

type Props = { side: SponsorshipSide; ownerId: string; records: HistoryRecord[] };
type Editing = { kind: 'add' } | { kind: 'edit'; id: string } | null;

export function HistoryClient({ side, ownerId, records }: Props) {
  const toast = useToast();
  const headId = useId();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [, startTransition] = useTransition();

  const live = records.filter((r) => !r.rejected);
  const rejected = records.filter((r) => r.rejected);
  const confirmed = live.filter((r) => r.label === 'confirmed').length;
  const editRecord = editing?.kind === 'edit' ? records.find((r) => r.id === editing.id) ?? null : null;

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>, undo?: { id: string }) {
    startTransition(async () => {
      const r = await action();
      if (!r.ok) { toast(r.error ?? 'Could not save. Please try again.'); return; }
      toast(r.message ?? 'Saved.', undo ? { label: 'Undo', onClick: () => run(() => restoreSponsorship({ id: undo.id })) } : undefined);
    });
  }

  function who(r: HistoryRecord) {
    if (side === 'creator') {
      if (r.brandId && r.brandName) return <span className={s.who}><Link href={`/sponsors/${r.brandId}`}><strong>{r.brandName}</strong></Link></span>;
      if (r.brandName) return <><strong>{r.brandName}</strong> <span className="muted">not in the sponsor list</span></>;
      return <strong>Brand not named</strong>;
    }
    return (
      <>
        <span className={s.who}><Link href={`/creators/${r.creatorId}`}><strong>{r.creatorName}</strong></Link></span>
        {r.creatorChannel || r.creatorSubscribers != null ? (
          <span className="muted"> {[r.creatorChannel, r.creatorSubscribers != null ? `${r.creatorSubscribers.toLocaleString('en-US')} subscribers` : null].filter(Boolean).join(' · ')}</span>
        ) : null}
      </>
    );
  }

  function video(r: HistoryRecord) {
    if (!r.videoTitle && !r.videoUrl) return 'No video recorded.';
    return (
      <>
        {r.videoTitle ? <>Video: “{r.videoTitle}”</> : 'Video'}
        {r.videoUrl && cleanVideoUrl(r.videoUrl) ? <> · <a href={cleanVideoUrl(r.videoUrl)!} target="_blank" rel="noopener noreferrer">Watch on YouTube</a></> : null}
      </>
    );
  }

  return (
    <section className="panel-sec" aria-labelledby={headId}>
      <div className="panel-sec__head">
        <div>
          <h3 id={headId}>{side === 'creator' ? 'Sponsorship history' : 'Creators they sponsored'}</h3>
          <p className={s.sub}>{confirmed} confirmed, {live.length - confirmed} detected and not verified</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setConfirmingId(null); setEditing({ kind: 'add' }); }} disabled={editing?.kind === 'add'}>Add a record</Button>
      </div>

      {editing ? (
        <RecordForm key={editing.kind === 'edit' ? editing.id : 'add'} side={side} ownerId={ownerId} record={editRecord} onDone={() => setEditing(null)} />
      ) : null}

      {live.length ? (
        <Timeline label={side === 'creator' ? 'Sponsorship records' : 'Creators this sponsor backed'}>
          {live.map((r) => (
            <TimelineItem key={r.id} date={fmtDate(r.sponsoredOn)} dashed={r.label === 'detected'} title={who(r)} badge={<SourceBadge source={r.label} />}
              lines={[video(r)]} note={sourceSentence(r)}
              actions={confirmingId === r.id ? undefined : (
                <>
                  {r.label === 'detected' ? (
                    <>
                      <Button size="sm" onClick={() => { setEditing(null); setConfirmingId(r.id); }}>Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => rejectSponsorship({ id: r.id }), { id: r.id })}>Reject</Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => { setConfirmingId(null); setEditing({ kind: 'edit', id: r.id }); }}>Edit</Button>
                </>
              )}>
              {confirmingId === r.id ? (
                <ConfirmForm id={r.id} onDone={() => setConfirmingId(null)} />
              ) : null}
            </TimelineItem>
          ))}
        </Timeline>
      ) : (
        <p className="muted">No sponsorships found yet. That is not proof there were none: spoken ads leave no trace in a description. Add a record when you know of one.</p>
      )}

      {rejected.length ? (
        <>
          <button type="button" className={s.linkBtn} aria-expanded={showRejected} onClick={() => setShowRejected((v) => !v)}>
            {showRejected ? 'Hide' : 'Show'} {plural(rejected.length, 'rejected record')}
          </button>
          {showRejected ? (
            <ul className={s.rejected}>
              {rejected.map((r) => (
                <li key={r.id}>
                  {fmtDate(r.sponsoredOn)} · {side === 'creator' ? (r.brandName ?? 'Brand not named') : r.creatorName} · rejected, kept so it is not detected again.{' '}
                  <button type="button" onClick={() => run(() => restoreSponsorship({ id: r.id }))}>Restore<span className="sr-only"> the record from {fmtDate(r.sponsoredOn)}</span></button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ConfirmForm({ id, onDone }: { id: string; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  function save() {
    if (!note.trim()) { setError('Say how you checked it.'); return; }
    if (note.replace(/\s/g, '').length < 5) { setError('Say how you checked it, in at least 5 characters.'); return; }
    setError('');
    start(async () => {
      const r = await confirmSponsorship({ id, note });
      if (!r.ok) { setError(r.error); return; }
      toast(r.message);
      onDone();
    });
  }
  return (
    <div className={`tile ${s.confirm}`}>
      <Input label="How did you check it?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} required autoFocus error={error || undefined}
        placeholder="For example: watched the video, ad read at 0:45" hint="Needed, so the next person knows why this is confirmed."
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
      <div className={s.row}>
        <Button size="sm" onClick={save} loading={pending}>Confirm record</Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Cancel</Button>
      </div>
    </div>
  );
}

function RecordForm({ side, ownerId, record, onDone }: { side: SponsorshipSide; ownerId: string; record: HistoryRecord | null; onDone: () => void }) {
  const toast = useToast();
  const listId = useId();
  const otherLabel = side === 'creator' ? 'Sponsor' : 'Creator';
  const initialOther = record ? (side === 'creator' ? record.brandName ?? '' : record.creatorChannel ? `${record.creatorName} (${record.creatorChannel})` : record.creatorName) : '';
  const [options, setOptions] = useState<PartyOption[] | null>(null);
  const [other, setOther] = useState(initialOther);
  const [date, setDate] = useState(record?.sponsoredOn ?? '');
  const [title, setTitle] = useState(record?.videoTitle ?? '');
  const [url, setUrl] = useState(record?.videoUrl ?? '');
  const [note, setNote] = useState(record?.label === 'confirmed' ? record.evidenceNote ?? '' : '');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  // The person's own calendar day is the limit of the date picker.
  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    let live = true;
    listParties(side).then((o) => { if (live) setOptions(o); }).catch(() => { if (live) setOptions([]); });
    return () => { live = false; };
  }, [side]);

  const typed = other.trim();
  const match = options?.find((o) => o.label.toLowerCase() === typed.toLowerCase()) ?? null;
  const isNewBrand = side === 'creator' && options !== null && typed !== '' && !match;

  function save(createBrand = false) {
    setError('');
    if (!typed && !(side === 'creator' && record && !record.brandId)) { setError(side === 'creator' ? 'Choose the sponsor, or type its name.' : 'Choose the creator from the list.'); return; }
    if (side === 'brand' && !match) { setError(typed ? `No creator called “${typed}” yet. Add the creator first, then come back.` : 'Choose the creator from the list.'); return; }
    if (isNewBrand && !createBrand) { setError(`No sponsor called “${typed}” yet. Use “Add ${typed} as a new sponsor”, or pick one from the list.`); return; }
    const common = { id: record?.id, date, videoTitle: title, videoUrl: url, note };
    const payload = side === 'creator'
      ? { ...common, creatorId: ownerId, brandId: match?.id ?? null, brandName: match ? '' : typed, createBrand: !match && createBrand }
      : { ...common, creatorId: match!.id, brandId: ownerId };
    start(async () => {
      const r = await (record ? updateSponsorship(payload) : addSponsorship(payload));
      if (!r.ok) { setError(r.error); return; }
      toast(r.message);
      onDone();
    });
  }

  return (
    <div className={`tile ${s.form}`} role="group" aria-label={record ? 'Edit this record' : 'Add a sponsorship record'}>
      <h4>{record ? 'Edit this record' : 'Add a sponsorship record'}</h4>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className={s.two}>
        <div>
          <Input label={otherLabel} list={listId} value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} autoComplete="off" autoFocus
            placeholder={side === 'creator' ? 'Start typing a sponsor' : 'Start typing a creator'}
            />
          <datalist id={listId}>{(options ?? []).map((o) => <option key={o.id} value={o.label} />)}</datalist>
          {isNewBrand ? (
            <div role="status" className={s.newParty}>
              <p className={`muted ${s.small}`} style={{ margin: 0 }}>No sponsor called “{typed}” yet.</p>
              <Button size="sm" variant="ghost" onClick={() => save(true)} loading={pending}>Add {typed} as a new sponsor</Button>
            </div>
          ) : null}
          {side === 'brand' && options !== null && typed !== '' && !match ? (
            <p role="status" className={`muted ${s.small}`} style={{ margin: 0 }}>
              No creator called “{typed}” yet. <Link href="/creators?new=1">Add the creator first</Link>, then come back.
            </p>
          ) : null}
        </div>
        <Input label="Date of the video" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} required />
        <Input label="Video title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Optional" />
        <Input label="Video link" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} inputMode="url" placeholder="https://www.youtube.com/watch?v=…" hint="Optional. A youtube.com or youtu.be link." />
      </div>
      {record?.label === 'detected' ? null : (
        <Input label="How do you know?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="For example: creator told us by email" />
      )}
      <p className={`muted ${s.small}`} style={{ margin: 0 }}>
        {record?.label === 'detected'
          ? 'Saving keeps this record as Detected. Use Confirm when someone has checked it.'
          : 'A record you enter yourself is saved as Confirmed, with your name and today’s date.'}
      </p>
      <div className={s.row}>
        <Button size="sm" onClick={() => save()} loading={pending} disabled={isNewBrand}>Save record</Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Cancel</Button>
      </div>
    </div>
  );
}
