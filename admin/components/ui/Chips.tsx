'use client';
// Removable chips for the filters that are on, plus "Clear all". Renders nothing when there are none.
//   const chips = chipsFromParams(nav.params, FILTERS);
//   <Chips items={chips} onRemove={(c) => nav.setMany(paramsToObject(removeChip(nav.params, c, FILTERS)))} onClearAll={() => nav.clear(KEYS)} />
// (For a list chip, `nav.toggle(chip.key, chip.value)` removes that one value; for the others `nav.set(chip.key, null)`.)
import type { ChipItem } from '@/lib/lists/query';
import k from './kit.module.css';

export function Chips({ items, onRemove, onClearAll, label = 'Active filters' }: {
  items: ChipItem[];
  onRemove: (chip: ChipItem) => void;
  onClearAll: () => void;
  label?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={k.chips} role="group" aria-label={label}>
      {items.map((c) => (
        <span key={c.id} className={k.chip}>
          {c.label}
          <button type="button" onClick={() => onRemove(c)} aria-label={`Remove filter ${c.label}`}>×</button>
        </span>
      ))}
      <button type="button" className={`${k.link} ${k.small}`} onClick={onClearAll}>Clear all</button>
    </div>
  );
}
