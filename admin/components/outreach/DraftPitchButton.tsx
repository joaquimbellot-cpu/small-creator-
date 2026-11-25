'use client';
// "Draft pitch with Claude" for a creator, a sponsor, or a pair. Opens a dialog; "Write the draft" saves an editable draft
// in Emails, Review (never approved, never sent). The slot's props are fixed by docs/ui-upgrade/05-build-plan.md section 6.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button, Modal, Notice, Select } from '@/components/ui';
import { draftPitchAction, pairInfoAction, searchCreatorsAction, searchSponsorsAction, type PairInfo, type PickItem, type PitchResult } from './actions';
import s from './outreach.module.css';

type Picked = { id: string; name: string } | null;

export function DraftPitchButton({ creatorId, brandId, size = 'sm', label = 'Draft pitch with Claude' }: { creatorId?: string; brandId?: string; size?: 'md' | 'sm'; label?: string }) {
  const [open, setOpen] = useState(false);
  const [creator, setCreator] = useState<Picked>(creatorId ? { id: creatorId, name: '' } : null);
  const [brand, setBrand] = useState<Picked>(brandId ? { id: brandId, name: '' } : null);
  const [info, setInfo] = useState<(PairInfo & { error?: string }) | null>(null);
  const [to, setTo] = useState<'creator' | 'sponsor'>('creator');
  const [contactId, setContactId] = useState('');
  const [result, setResult] = useState<PitchResult | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setResult(null);
    // keep fixed sides, forget picked ones
    if (!creatorId) setCreator(null);
    if (!brandId) setBrand(null);
    setInfo(null);
    setTo('creator');
    setContactId('');
  };

  // Names, blocks and contact people for the chosen pair (no addresses come back).
  useEffect(() => {
    if (!open || (!creator && !brand)) return;
    let live = true;
    pairInfoAction({ creatorId: creator?.id, brandId: brand?.id }).then((r) => {
      if (!live) return;
      setInfo(r);
      const only = r.sponsor?.contacts.filter((k) => k.hasEmail && !k.suppressed) ?? [];
      setContactId((cur) => (r.sponsor?.contacts.some((k) => k.id === cur) ? cur : only.length === 1 ? only[0].id : ''));
    });
    return () => { live = false; };
  }, [open, creator, brand]);

  const cName = info?.creator?.name || creator?.name || '';
  const sName = info?.sponsor?.name || brand?.name || '';
  const both = !!creator && !!brand && info?.creator?.id === creator.id && info?.sponsor?.id === brand.id;
  const cBlocked = !!info?.creator?.blocked;
  const sBlocked = !!info?.sponsor?.blocked;
  const contacts = info?.sponsor?.contacts ?? [];
  const chosen = contacts.find((k) => k.id === contactId);

  let problem: string | null = null;
  if (both) {
    if (cBlocked) problem = `${cName} is marked Do not contact. No pitch can be drafted.`;
    else if (sBlocked) problem = `${sName} is marked Do not contact. No pitch can be drafted.`;
    else if (to === 'creator' && !info!.creator!.hasEmail) problem = `${cName} has no email address on file, so a draft to the creator cannot be made.`;
    else if (to === 'creator' && info!.creator!.suppressed) problem = 'This address is on the opt-out list. No pitch can be drafted.';
    else if (to === 'sponsor' && contacts.length === 0) problem = `${sName} has no contact person yet. Add one on the sponsor page.`;
    else if (to === 'sponsor' && chosen && !chosen.hasEmail) problem = `${chosen.name} has no email address on file.`;
    else if (to === 'sponsor' && chosen?.suppressed) problem = 'This address is on the opt-out list. No pitch can be drafted.';
  }
  const needContact = both && to === 'sponsor' && contacts.length > 1 && !contactId;
  const canWrite = both && !problem && !needContact && !pending && !(to === 'sponsor' && contacts.length === 0);

  function write() {
    if (!creator || !brand) return;
    setResult(null);
    start(async () => setResult(await draftPitchAction({ creatorId: creator.id, brandId: brand.id, to, contactId: to === 'sponsor' && contactId ? contactId : undefined })));
  }

  return (
    <>
      <Button variant="ghost" size={size} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={close} title="Draft pitch with Claude" wide
        footer={
          <>
            <Button variant="ghost" onClick={close}>Close</Button>
            <Button onClick={write} disabled={!canWrite} loading={pending}>{result?.ok ? 'Write another draft' : 'Write the draft'}</Button>
          </>
        }>
        <div className={s.stack}>
          <div className={s.two}>
            {creatorId ? <Fixed label="Creator" name={cName || 'Loading…'} /> : <Picker label="Creator" value={creator} onPick={(p) => { setCreator(p); setResult(null); }} search={searchCreatorsAction} />}
            {brandId ? <Fixed label="Sponsor" name={sName || 'Loading…'} /> : <Picker label="Sponsor" value={brand} onPick={(p) => { setBrand(p); setResult(null); setContactId(''); }} search={searchSponsorsAction} />}
          </div>

          <fieldset className={s.radios}>
            <legend>The email goes to</legend>
            <label className={s.radio}><input type="radio" name="pitch-to" value="creator" checked={to === 'creator'} onChange={() => { setTo('creator'); setResult(null); }} /> The creator</label>
            <label className={s.radio}><input type="radio" name="pitch-to" value="sponsor" checked={to === 'sponsor'} onChange={() => { setTo('sponsor'); setResult(null); }} /> The sponsor&apos;s contact</label>
          </fieldset>

          {to === 'sponsor' && contacts.length > 1 ? (
            <Select label="Contact person" value={contactId} onChange={(e) => { setContactId(e.target.value); setResult(null); }}>
              <option value="">Choose a contact person</option>
              {contacts.map((k) => <option key={k.id} value={k.id}>{k.name}{k.role ? `, ${k.role}` : ''}{!k.hasEmail ? ' (no email address)' : k.suppressed ? ' (opted out)' : ''}</option>)}
            </Select>
          ) : null}
          {to === 'sponsor' && contacts.length === 1 ? <p className={s.note}>Contact person: {contacts[0].name}{contacts[0].role ? `, ${contacts[0].role}` : ''}</p> : null}

          {info?.error ? <Notice tone="error">{info.error}</Notice> : null}
          {problem ? <Notice tone="error">{problem}</Notice> : null}
          {!both && !info?.error ? <p className={s.note}>Pick both sides. Claude writes from confirmed facts only.</p> : null}
          {result && !result.ok ? <Notice tone="error">{result.error}</Notice> : null}

          {result?.ok ? (
            <>
              {result.mock ? <Notice tone="info">Practice draft: no Claude call was made, so check the wording.</Notice> : null}
              <div>
                <div className="label">Subject</div>
                <p style={{ margin: '4px 0 12px', fontWeight: 600, overflowWrap: 'anywhere' }}>{result.subject}</p>
                <div className="label">Email</div>
                <pre className={s.draft}>{result.body}</pre>
              </div>
              <div className={s.facts}>
                <div><div className={`label ${s.factsUsed}`}>Facts used</div><ul>{result.used.map((u) => <li key={u}>{u}</li>)}</ul></div>
                <div><div className={`label ${s.factsLeft}`}>Left out</div><ul>{result.leftOut.map((u) => <li key={u}>{u}</li>)}</ul></div>
              </div>
              <p className={s.note}>Nothing is sent from here. The draft waits in Emails, Review, and only the owner&apos;s click on Send sends it.</p>
              <div className={s.row}>
                <Link href="/emails/review">Open the draft in Review</Link>
                <Link href={`/emails/${result.emailId}`}>Open the email</Link>
              </div>
            </>
          ) : (
            <p className={s.note}>Nothing is sent from here. The draft waits in Emails, Review, and only the owner&apos;s click on Send sends it.</p>
          )}
        </div>
      </Modal>
    </>
  );
}

function Fixed({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={s.picked}><strong>{name}</strong></div>
    </div>
  );
}

function Picker({ label, value, onPick, search }: {
  label: string;
  value: Picked;
  onPick: (p: Picked) => void;
  search: (q: string) => Promise<{ items: PickItem[]; error?: string }>;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickItem[]>([]);
  const [err, setErr] = useState('');
  const run = useRef(0);
  const id = `pitch-pick-${label.toLowerCase()}`;
  const find = useCallback(async (text: string) => {
    const n = ++run.current;
    const r = await search(text);
    if (n !== run.current) return; // a newer search started
    setItems(r.items);
    setErr(r.error ?? '');
  }, [search]);
  // Searching happens on the server, after a short pause in typing. At most 20 names come back.
  useEffect(() => {
    if (value) return;
    const t = setTimeout(() => { void find(q); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, value, find]);

  if (value) {
    return (
      <div>
        <div className="label">{label}</div>
        <div className={s.picked}><strong>{value.name}</strong><Button variant="ghost" size="sm" onClick={() => { onPick(null); setQ(''); }}>Change</Button></div>
      </div>
    );
  }
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search for a ${label.toLowerCase()}`}
        style={{ width: '100%', minHeight: 44, padding: '0 12px', font: 'inherit', background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }} />
      {err ? <p className={s.note} role="alert">{err}</p> : null}
      <ul className={s.pickList} aria-label={`${label} results`}>
        {items.length === 0 ? <li className={s.note} style={{ padding: 12 }}>{q ? 'No match.' : 'Loading…'}</li> : items.map((it) => (
          <li key={it.id}><button type="button" className={s.pickBtn} onClick={() => onPick({ id: it.id, name: it.name })}><span>{it.name}</span><span>{it.detail}</span></button></li>
        ))}
      </ul>
    </div>
  );
}
