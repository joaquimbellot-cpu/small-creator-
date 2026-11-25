'use client';
// Building blocks for the filter rail: FacetGroup, CheckList, RadioList, Segmented.
//
//   <FacetGroup id="creators.niche" label="Niche" on={niches.length > 0}>
//     <CheckList label="Niche" options={[{ value: 'tech', label: 'Tech', count: 12 }]} selected={niches} onToggle={(v) => nav.toggle('niche', v)} />
//   </FacetGroup>
//   <FacetGroup id="creators.sponsored" label="Has sponsorships" on={!!sponsored}>
//     <Segmented label="Has sponsorships" value={sponsored ?? ''} onChange={(v) => nav.set('sponsored', v || null)} options={ANY_YES_NO} />
//   </FacetGroup>
import { useId, useState, type ReactNode } from 'react';
import k from './kit.module.css';

// What is open stays open while the page is open, even if the rail is closed and opened again.
const openMemory = new Map<string, boolean>();

export function FacetGroup({ id, label, on, defaultOpen, children }: {
  /** Unique per page and facet, for example "creators.niche". Used to remember open or closed. */
  id: string;
  label: string;
  /** The facet has a value: shows a small dot, and the group starts open. */
  on?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => openMemory.get(id) ?? (defaultOpen ?? !!on));
  return (
    <details
      className={k.facet}
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        openMemory.set(id, next);
        setOpen(next);
      }}
    >
      <summary>
        <span className={k.facetLabel}>{label}</span>
        {on ? <span className={k.facetDot} title="Filter is on" role="img" aria-label="Filter is on" /> : null}
      </summary>
      <div className={k.facetBody}>{children}</div>
    </details>
  );
}

export type FacetOption = { value: string; label: string; /** Number of results this option would give. 0 dims it. */ count?: number };

export function CheckList({ label, options, selected, onToggle, searchable, searchLabel, searchPlaceholder, scrollAfter = 7, emptyText = 'Nothing to pick yet.' }: {
  /** Names the group for screen readers. */
  label: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Show a "find" box above the list. */
  searchable?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** More options than this and the list scrolls inside a box. Default 7. */
  scrollAfter?: number;
  emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const find = q.trim().toLowerCase();
  const shown = find ? options.filter((o) => o.label.toLowerCase().includes(find)) : options;
  const rows = shown.map((o) => {
    const on = selected.includes(o.value);
    return (
      <label key={o.value} className={`${k.opt} ${o.count === 0 && !on ? k.zero : ''}`}>
        <input type="checkbox" checked={on} onChange={() => onToggle(o.value)} />
        <span className={k.optText}>{o.label}</span>
        {o.count != null ? <span className={k.optCount}>{o.count}</span> : null}
      </label>
    );
  });
  const box = options.length > scrollAfter;
  const fid = useId();
  return (
    <div role="group" aria-label={label}>
      {searchable ? (
        <div className={`${k.fieldSm} ${k.listFind}`}>
          <label className={k.sr} htmlFor={fid}>{searchLabel ?? `Find in ${label.toLowerCase()}`}</label>
          <input id={fid} className={k.controlSm} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? 'Find'} autoComplete="off" />
        </div>
      ) : null}
      {options.length === 0 ? <p className={k.noMatch}>{emptyText}</p>
        : shown.length === 0 ? <p className={k.noMatch}>No match for “{q}”.</p>
        : box ? <div className={k.scroll} tabIndex={0} role="region" aria-label={`${label} options`}>{rows}</div> : rows}
    </div>
  );
}

export function RadioList({ label, name, options, value, onChange, anyLabel = 'Any', hint, children }: {
  label: string;
  /** Radio group name, unique on the page. */
  name: string;
  options: FacetOption[];
  /** Current value, or null / '' for "Any". */
  value: string | null | undefined;
  /** Called with the value, or null for "Any". */
  onChange: (value: string | null) => void;
  anyLabel?: string;
  hint?: ReactNode;
  /** Extra rows under the options, for example a Checkbox "Count detected records too". */
  children?: ReactNode;
}) {
  const cur = value ?? '';
  const all: FacetOption[] = [{ value: '', label: anyLabel }, ...options];
  return (
    <div role="radiogroup" aria-label={label}>
      {all.map((o) => (
        <label key={o.value || '__any'} className={`${k.opt} ${o.count === 0 && cur !== o.value ? k.zero : ''}`}>
          <input type="radio" name={name} checked={cur === o.value} onChange={() => onChange(o.value || null)} />
          <span className={k.optText}>{o.label}</span>
          {o.value && o.count != null ? <span className={k.optCount}>{o.count}</span> : null}
        </label>
      ))}
      {hint ? <p className={k.noMatch}>{hint}</p> : null}
      {children}
    </div>
  );
}

/** Any / Yes / No with an empty value for "Any". */
export const ANY_YES_NO: FacetOption[] = [{ value: '', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
export const TABLE_CARDS: FacetOption[] = [{ value: 'table', label: 'Table' }, { value: 'cards', label: 'Cards' }];

export function Segmented({ label, options, value, onChange, name, inline }: {
  label: string;
  options: FacetOption[];
  value: string;
  onChange: (value: string) => void;
  /** Radio group name. Default: made up. */
  name?: string;
  /** Shrink to its content (for a toolbar) instead of filling the row. */
  inline?: boolean;
}) {
  const auto = useId();
  const n = name ?? auto;
  return (
    <div className={`${k.seg} ${inline ? k.segInline : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value || '__any'}>
          <input type="radio" name={n} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}{o.count != null ? <> <small>{o.count}</small></> : null}</span>
        </label>
      ))}
    </div>
  );
}
