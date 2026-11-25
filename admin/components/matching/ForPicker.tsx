'use client';
// The "For" picker of the "Best match" sort: choose the sponsor (on the Creators list) or the creator (on the Sponsors list)
// to rank against. The search runs on the server (20 names at most); the choice goes to the page address as `for`.
import { useEffect, useState } from 'react';
import { partyNameAction } from './actions';
import { PartyPicker, type Party } from './PartyPicker';
import m from './matching.module.css';

export function ForPicker({ kind, valueId, onChange }: { kind: 'creator' | 'brand'; valueId: string | null; onChange: (id: string | null) => void }) {
  const [party, setParty] = useState<Party | null>(null);
  // The id may come from the address: look its name up once.
  useEffect(() => {
    if (!valueId) { setParty(null); return; }
    if (party?.id === valueId) return;
    let live = true;
    partyNameAction({ kind, id: valueId }).then((r) => { if (live) setParty(r ? { id: valueId, name: r.name } : null); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueId, kind]);
  const label = kind === 'brand' ? 'For sponsor' : 'For creator';
  return (
    <div className={m.forBox}>
      <PartyPicker
        small kind={kind} label={label} value={party}
        placeholder={kind === 'brand' ? 'Choose a sponsor' : 'Choose a creator'}
        onChange={(p) => { setParty(p); onChange(p?.id ?? null); }}
      />
    </div>
  );
}
