'use client';
// "Link a creator and a sponsor": both sides as searchable pickers, the score with its reasons for the chosen pair, the fair
// price, an optional expected amount and the starting stage. "Create link" is a server action that makes a deal.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Input, Modal, Notice, ScoreReasons, Select, useToast } from '@/components/ui';
import { STAGE_LABEL, formatUsd } from '@/lib/deals/format';
import { createLinkAction, pairInfoAction, partyNameAction, type PairInfo } from './actions';
import { PartyPicker, type Party } from './PartyPicker';
import m from './matching.module.css';

export function LinkDialog({ open, onClose, creatorId, brandId }: { open: boolean; onClose: () => void; creatorId?: string; brandId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [creator, setCreator] = useState<Party | null>(null);
  const [brand, setBrand] = useState<Party | null>(null);
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<'matched' | 'contacted'>('matched');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  

  // Start fresh each time it opens; look up the names of a side that came pre-chosen.
  useEffect(() => {
    if (!open) return;
    setCreator(null); setBrand(null); setInfo(null); setAmount(''); setStage('matched'); setError(''); setInfoError('');
    let live = true;
    if (creatorId) partyNameAction({ kind: 'creator', id: creatorId }).then((r) => { if (live && r) setCreator({ id: creatorId, name: r.name }); }).catch(() => {});
    if (brandId) partyNameAction({ kind: 'brand', id: brandId }).then((r) => { if (live && r) setBrand({ id: brandId, name: r.name }); }).catch(() => {});
    return () => { live = false; };
  }, [open, creatorId, brandId]);

  // The score, blocks and fair price for the chosen pair.
  useEffect(() => {
    setInfo(null); setInfoError(''); setError('');
    if (!open || !creator || !brand) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    pairInfoAction({ creatorId: creator.id, brandId: brand.id })
      .then((r) => { if (!live) return; setLoading(false); if (r.ok) setInfo(r.info); else setInfoError(r.error); })
      .catch(() => { if (live) { setLoading(false); setInfoError('The score could not be worked out. Try again.'); } });
    return () => { live = false; };
  }, [open, creator, brand]);

  const mt = info?.match ?? null;
  const blocked = mt?.blocked ?? null;
  const dup = mt?.openStage ?? null;
  const canCreate = !!creator && !!brand && !!info && !blocked && !dup && !busy;

  async function create() {
    if (!creator || !brand || !canCreate) return;
    setBusy(true); setError('');
    const r = await createLinkAction({ creatorId: creator.id, brandId: brand.id, stage, amount }).catch(() => ({ ok: false as const, error: 'Could not reach the server. Try again.' }));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onClose();
    toast(`${creator.name} is now linked with ${brand.name}. ${r.message}`, { label: 'View on the board', onClick: () => router.push('/deals') });
    router.refresh();
  }

  return (
    <Modal
      open={open} onClose={onClose} title="Link a creator and a sponsor" wide
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={create} disabled={!canCreate} loading={busy}>Create link</Button>
      </>}
    >
      <div className={m.stack}>
        <div className={m.two}>
          <PartyPicker kind="creator" label="Creator" value={creator} otherId={brand?.id} onChange={setCreator} autoFocus={!creatorId} />
          <PartyPicker kind="brand" label="Sponsor" value={brand} otherId={creator?.id} onChange={setBrand} />
        </div>

        {!creator || !brand ? (
          <p className="muted">Pick both sides. The lists are ordered by match score once one side is chosen.</p>
        ) : loading ? (
          <p className="muted" role="status">Working out the score…</p>
        ) : infoError ? (
          <Notice tone="error">{infoError}</Notice>
        ) : info ? (
          <>
            {mt ? (
              <div className={m.sug}>
                <div className={m.sugHead}><span className={m.sugName}>{info.creatorName} with {info.brandName}</span></div>
                <ScoreReasons total={mt.total} reasons={mt.reasons} />
              </div>
            ) : null}
            {blocked ? <Notice tone="error">{blocked} This pair cannot be linked.</Notice> : null}
            {dup ? <Notice tone="warn">These two already have an open deal at “{STAGE_LABEL[dup]}”. Move that one on the Deals board instead.</Notice> : null}
            {mt?.recentOn && !blocked && !dup ? <Notice tone="info">{info.creatorName} has a confirmed sponsorship with {info.brandName} from the last 180 days, so this pair is not suggested. You can still link it.</Notice> : null}
            {!blocked ? (
              info.price ? (
                <Notice tone="info">
                  <span className={m.priceLine}>
                    <span>Fair price for a 60-second integration: <span className={m.em}>{formatUsd(info.price.low * 100)} to {formatUsd(info.price.high * 100)}</span>. Suggested asking price: <span className={m.em}>{formatUsd(info.price.ask * 100)}</span>.</span>
                    <button type="button" className={m.linkBtn} onClick={() => { setAmount(String(info.price!.ask)); }}>Use {formatUsd(info.price.ask * 100)}</button>
                    <Link href={`/creators/calculator?creator=${creator.id}&brand=${brand.id}`} prefetch={false}>Open the calculator</Link>
                  </span>
                </Notice>
              ) : (
                <p className="muted">{info.priceNote} <Link href={`/creators/calculator?creator=${creator.id}&brand=${brand.id}`} prefetch={false}>Open the calculator</Link></p>
              )
            ) : null}
          </>
        ) : null}

        <div className={m.two}>
          <Input label="Expected amount (USD)" inputMode="decimal" placeholder="Optional" value={amount} onChange={(e) => setAmount(e.target.value)} hint="You can set it later." />
          <Select label="Starting stage" value={stage} onChange={(e) => setStage(e.target.value as 'matched' | 'contacted')}>
            <option value="matched">Matched (not contacted yet)</option>
            <option value="contacted">Contacted</option>
          </Select>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Modal>
  );
}
