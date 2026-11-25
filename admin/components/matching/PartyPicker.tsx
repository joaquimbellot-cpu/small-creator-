'use client';
// A searchable picker for a creator or a sponsor. It never holds the whole list: every keystroke asks the server
// (searchPartiesAction) for at most 20 names, ordered by score once the other side is chosen. No email addresses.
import { useEffect, useId, useRef, useState } from 'react';
import { searchPartiesAction } from './actions';
import type { PickerOption } from '@/lib/matching';
import m from './matching.module.css';

export type Party = { id: string; name: string };

export function PartyPicker({ kind, label, value, otherId, onChange, small, placeholder, autoFocus, hint }: {
  kind: 'creator' | 'brand';
  label: string;
  value: Party | null;
  /** The other side's id, when chosen: names are then ordered by match score. */
  otherId?: string | null;
  onChange: (party: Party | null) => void;
  small?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  hint?: string;
}) {
  const uid = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  // Follow a choice made from outside (the page address, or "Clear").
  useEffect(() => { if (value) setText(value.name); }, [value?.id, value?.name]);

  // Ask the server while the list is open. A short pause after typing; answers that arrive late are ignored.
  const query = value && text === value.name ? '' : text;
  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setState('loading');
    const t = setTimeout(async () => {
      const r = await searchPartiesAction({ kind, q: query, other: otherId ?? undefined }).catch(() => null);
      if (mine !== seq.current) return;
      if (!r || !r.ok) { setState('error'); setOptions([]); return; }
      setOptions(r.options); setState('idle'); setActive(r.options.length ? 0 : -1);
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, query, kind, otherId, attempt]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function choose(o: PickerOption) {
    setText(o.name); setOpen(false);
    onChange({ id: o.id, name: o.name });
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && active >= 0 && options[active]) { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  }

  const listId = `${uid}-list`;
  return (
    <div className={m.picker} ref={box}>
      <label className={m.pickerLabel} htmlFor={`${uid}-in`}>{label}</label>
      <input
        id={`${uid}-in`} className={`${m.pickerInput} ${small ? m.pickerInputSm : ''}`} type="text" role="combobox" autoComplete="off" autoFocus={autoFocus}
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && active >= 0 ? `${uid}-o${active}` : undefined}
        placeholder={placeholder ?? (kind === 'creator' ? 'Search creators by name' : 'Search sponsors by name')}
        value={text} maxLength={100}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (value) onChange(null); }}
        onKeyDown={onKey}
      />
      {hint ? <div className={m.hint}>{hint}</div> : null}
      {open ? (
        <ul id={listId} role="listbox" aria-label={label} className={m.list}>
          {state === 'loading' && options.length === 0 ? <li className={m.empty} role="presentation">Searching…</li> : null}
          {state === 'error' ? (
            <li className={m.empty} role="presentation">
              The list could not be loaded. <button type="button" className={m.linkBtn} onMouseDown={(e) => { e.preventDefault(); setAttempt((n) => n + 1); }}>Try again</button>
            </li>
          ) : null}
          {state === 'idle' && options.length === 0 ? <li className={m.empty} role="presentation">No match for that name.</li> : null}
          {options.map((o, i) => (
            <li key={o.id} id={`${uid}-o${i}`} role="option" aria-selected={i === active} className={m.option}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
              <span>
                <span className={m.optionName}>{o.name}</span>
                {o.hint ? <span className={m.optionHint}>{o.hint}</span> : null}
              </span>
              {o.total != null ? <span className={m.optionScore}>{o.blocked ? 'Cannot be linked' : `${o.band} ${o.total}`}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
