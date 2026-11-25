'use client';
// Two-handle range on one track, built from two native range inputs (so arrow keys, Home, End and PageUp/Down work).
// Optional log scale. Two number fields accept "10k" and "1.5M". Preset buttons. Handles can touch but never cross.
//
//   <RangeSlider
//     label="Subscribers" minLabel="Fewest subscribers" maxLabel="Most subscribers"
//     value={parseRange(nav.get('subs')) ?? [null, null]}
//     onChange={(min, max) => nav.set('subs', formatRange(min, max))}
//     presets={SUBS_PRESETS}
//   />
//
// value / onChange use null for "no limit". Top of the track means "no upper limit" (openEnded, default).
// onChange fires while dragging and when a field or preset is committed; onCommit fires only on release, Enter, blur and preset.
import { useId, useState } from 'react';
import { formatFull, formatShort, makeScale, parseShortNumber, type ScaleKind } from '@/lib/lists/numbers';
import k from './kit.module.css';

export type RangePreset = { label: string; min: number | null; max: number | null };
type Bound = number | null;

/** Subscriber presets of the approved prototype. */
export const SUBS_PRESETS: RangePreset[] = [
  { label: '1k to 10k', min: 1000, max: 10000 },
  { label: '10k to 50k', min: 10000, max: 50000 },
  { label: '50k to 100k', min: 50000, max: 100000 },
  { label: '100k and above', min: 100000, max: null },
];

const GAP = 3; // slider steps the two handles keep apart, so they never sit on top of each other

export function RangeSlider({
  label, minLabel = 'Lowest value', maxLabel = 'Highest value', value, onChange, onCommit,
  min = 1000, max = 1000000, scale = 'log', ticks, presets, formatField = formatFull, format = formatShort, hint = 'You can type 10k or 1.5M.', unit,
}: {
  /** Names the group, for example "Subscribers". */
  label: string;
  /** Accessible names of the two handles. */
  minLabel?: string;
  maxLabel?: string;
  /** Current limits; null = no limit. */
  value: [Bound, Bound];
  onChange: (min: Bound, max: Bound) => void;
  onCommit?: (min: Bound, max: Bound) => void;
  /** Track runs from `min` to `max`. The very left (lower) and very right (upper) mean "no limit". */
  min?: number;
  max?: number;
  scale?: ScaleKind;
  /** Labels under the track. Default: 1k, 10k, 100k, 1M+ */
  ticks?: string[];
  presets?: RangePreset[];
  /** Text in the number fields. */
  formatField?: (n: number) => string;
  /** Text for the screen-reader value of a handle. */
  format?: (n: number) => string;
  hint?: string;
  /** Spoken after the value, for example "subscribers". */
  unit?: string;
}) {
  const sc = makeScale(min, max, scale);
  const id = useId();
  const fieldText = (n: Bound) => (n == null ? '' : formatField(n));
  const key = `${value[0] ?? ''}|${value[1] ?? ''}`;

  const [seen, setSeen] = useState(key);
  const [vals, setVals] = useState<[Bound, Bound]>(value);
  const [ta, setTa] = useState(value[0] == null ? 0 : sc.toPosition(value[0]));
  const [tb, setTb] = useState(value[1] == null ? 100 : sc.toPosition(value[1]));
  const [fa, setFa] = useState(fieldText(value[0]));
  const [fb, setFb] = useState(fieldText(value[1]));
  const [error, setError] = useState('');

  // The page changed the value (a chip was removed, Clear all): follow it. Our own emits do not trigger this.
  if (seen !== key) {
    setSeen(key);
    setVals(value);
    setTa(value[0] == null ? 0 : sc.toPosition(value[0]));
    setTb(value[1] == null ? 100 : sc.toPosition(value[1]));
    setFa(fieldText(value[0]));
    setFb(fieldText(value[1]));
    setError('');
  }

  const emit = (a: Bound, b: Bound, commit: boolean) => {
    setSeen(`${a ?? ''}|${b ?? ''}`);
    onChange(a, b);
    if (commit) onCommit?.(a, b);
  };

  // Handle moved. The handle that moved sets its own value; the other keeps the exact value it had.
  const move = (which: 'a' | 'b', raw: number) => {
    let a = ta, b = tb;
    if (which === 'a') a = Math.min(raw, b - GAP); else b = Math.max(raw, a + GAP);
    a = Math.max(0, a); b = Math.min(100, b);
    const next: [Bound, Bound] = [...vals];
    if (which === 'a') next[0] = a <= 0 ? null : sc.toValue(a); else next[1] = b >= 100 ? null : sc.toValue(b);
    setTa(a); setTb(b); setVals(next);
    setFa(fieldText(next[0])); setFb(fieldText(next[1]));
    setError('');
    emit(next[0], next[1], false);
  };

  const commitHandles = () => onCommit?.(vals[0], vals[1]);

  const commitFields = () => {
    const a = fa.trim() === '' ? null : parseShortNumber(fa);
    const b = fb.trim() === '' ? null : parseShortNumber(fb);
    // A refused entry never reaches the address: the fields go back to the last good pair, so fields, handles and address agree (B-6).
    const refuse = (msg: string) => { setError(msg); setFa(fieldText(vals[0])); setFb(fieldText(vals[1])); };
    if ((fa.trim() !== '' && a == null) || (fb.trim() !== '' && b == null)) { refuse('Enter a number such as 10000, 10k or 1.5M.'); return; }
    if (a != null && b != null && a > b) { refuse('"From" cannot be above "To". The last good range is kept.'); return; }
    setError('');
    setVals([a, b]);
    setTa(a == null ? 0 : Math.min(sc.toPosition(a), 100 - GAP));
    setTb(b == null ? 100 : Math.max(sc.toPosition(b), GAP));
    setFa(fieldText(a)); setFb(fieldText(b));
    if (a !== vals[0] || b !== vals[1]) emit(a, b, true);
  };

  const applyPreset = (p: RangePreset, on: boolean) => {
    const a = on ? null : p.min, b = on ? null : p.max;
    setError('');
    setVals([a, b]);
    setTa(a == null ? 0 : sc.toPosition(a));
    setTb(b == null ? 100 : sc.toPosition(b));
    setFa(fieldText(a)); setFb(fieldText(b));
    emit(a, b, true);
  };

  const text = (n: Bound, side: 'a' | 'b') => (n == null ? (side === 'a' ? 'no lower limit' : 'no upper limit') : format(n));
  const spoken = (n: Bound, side: 'a' | 'b') => `${text(n, side)}${n != null && unit ? ' ' + unit : ''}`;
  const ticksShown = ticks ?? (scale === 'log' && min === 1000 && max === 1000000 ? ['1k', '10k', '100k', '1M+'] : [format(min), format(max) + '+']);

  return (
    <div role="group" aria-label={label}>
      <div className={k.dual}>
        <div className={k.dualTrack} />
        <div className={k.dualFill} style={{ left: `calc(11px + (100% - 22px) * ${ta / 100})`, width: `calc((100% - 22px) * ${(tb - ta) / 100})` }} />
        <input
          type="range" min={0} max={100} step={1} value={ta} aria-label={minLabel} aria-valuetext={spoken(vals[0], 'a')}
          className={ta > 50 ? k.thumbTop : undefined}
          onChange={(e) => move('a', Number(e.target.value))}
          onPointerUp={commitHandles} onKeyUp={commitHandles} onBlur={commitHandles}
        />
        <input
          type="range" min={0} max={100} step={1} value={tb} aria-label={maxLabel} aria-valuetext={spoken(vals[1], 'b')}
          className={ta > 50 ? undefined : k.thumbTop}
          onChange={(e) => move('b', Number(e.target.value))}
          onPointerUp={commitHandles} onKeyUp={commitHandles} onBlur={commitHandles}
        />
      </div>
      <div className={k.scale} aria-hidden="true">{ticksShown.map((t) => <span key={t}>{t}</span>)}</div>
      <div className={k.minmax}>
        <div className={k.fieldSm}>
          <label className={k.labelText} htmlFor={`${id}-from`}>From</label>
          <input id={`${id}-from`} className={k.controlSm} inputMode="text" autoComplete="off" placeholder="Any" value={fa}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => { setFa(e.target.value); setError(''); }} onBlur={commitFields} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFields(); } }} />
        </div>
        <span className={k.minmaxTo} aria-hidden="true">to</span>
        <div className={k.fieldSm}>
          <label className={k.labelText} htmlFor={`${id}-to`}>To</label>
          <input id={`${id}-to`} className={k.controlSm} inputMode="text" autoComplete="off" placeholder="Any" value={fb}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
            onChange={(e) => { setFb(e.target.value); setError(''); }} onBlur={commitFields} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFields(); } }} />
        </div>
      </div>
      {error ? <p id={`${id}-err`} className={k.rangeError} role="alert">{error}</p> : null}
      {presets?.length ? (
        <div className={k.presets}>
          {presets.map((p) => {
            const on = vals[0] === p.min && vals[1] === p.max;
            return <button key={p.label} type="button" className={k.pre} aria-pressed={on} onClick={() => applyPreset(p, on)}>{p.label}</button>;
          })}
        </div>
      ) : null}
      {hint ? <p className={`${k.noMatch}`}>{hint}</p> : null}
    </div>
  );
}
