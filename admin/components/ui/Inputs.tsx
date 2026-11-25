// Compact controls for rails and toolbars (40px high), next to the big form controls in Field.tsx.
//   <SearchBox label="Search" value={nav.get('q') ?? ''} onChange={(v) => nav.set('q', v)} placeholder="Name, channel or email" />
//   <CompactSelect label="Sort by" value={sort} onChange={setSort} options={[{ value: 'name', label: 'Sort: Name' }]} />
import type { ComponentProps } from 'react';
import k from './kit.module.css';

export function SearchBox({ label, value, onChange, placeholder, id, ...rest }: Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'type'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fid = id ?? `search-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div className={k.fieldSm}>
      <label className={k.labelText} htmlFor={fid}>{label}</label>
      <input id={fid} className={k.controlSm} type="search" value={value} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

/** A select without a visible label (the label is read by screen readers). Sits well in `.list-tools`. */
export function CompactSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const fid = `sel-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <>
      <label className={k.sr} htmlFor={fid}>{label}</label>
      <select id={fid} className={k.controlSm} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </>
  );
}
