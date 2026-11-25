// Pure helpers that turn a page address (query string) into filter chips and back.
// The creators and sponsors lists share them. Everything here works on URLSearchParams, so it is easy to test.
import { describeRange, parseRange } from './numbers';

export type ParamsLike = URLSearchParams | string | Record<string, string | string[] | undefined> | null | undefined;

/** One filter, as a page describes it. Only `key` is needed to count and clear it. */
export type FilterDef = {
  /** Address key, for example `niche`. */
  key: string;
  /** Text before the value in a chip, for example "Niche". Empty for a free-text search. */
  label?: string;
  /** `list` is comma-separated (`niche=tech,gaming`), `range` is `min-max`, `flag` is `1`. Default `single`. */
  kind?: 'single' | 'list' | 'range' | 'flag';
  /** Readable text for one stored value (a niche slug to its name). Default: the value itself. */
  valueLabel?: (value: string) => string;
  /** Replaces the whole chip text, for example for `sponsored=yes` -> "Has sponsors". */
  chipLabel?: (value: string) => string | null;
  /** Range text formatter. Default `formatShort`. */
  format?: (n: number) => string;
  /** Other keys that only make sense together with this one (`detected` with `sponsored`). Cleared with it. */
  also?: string[];
};

export type ChipItem = {
  /** Stable id: `key` or `key:value`. */
  id: string;
  key: string;
  /** Set for one value of a list. */
  value?: string;
  /** Text shown in the chip. */
  label: string;
};

/** Address keys that never count as filters. */
export const NON_FILTER_KEYS = ['page', 'sort', 'dir', 'view', 'open', 'for'] as const;

export function toParams(input: ParamsLike): URLSearchParams {
  if (!input) return new URLSearchParams();
  if (typeof input === 'string') return new URLSearchParams(input);
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(input)) {
    if (v == null) continue;
    for (const one of Array.isArray(v) ? v : [v]) p.append(k, one);
  }
  return p;
}

/** `niche=tech,gaming` -> ['tech', 'gaming']. Empty and repeated values are dropped. */
export function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(new Set(raw.split(',').map((x) => x.trim()).filter(Boolean)));
}

export function joinList(values: string[]): string | null {
  const v = Array.from(new Set(values.map((x) => x.replace(/,/g, '').trim()).filter(Boolean)));
  return v.length ? v.join(',') : null;
}

export function getList(params: ParamsLike, key: string): string[] {
  const p = toParams(params);
  return p.getAll(key).flatMap(splitList).filter((v, i, a) => a.indexOf(v) === i);
}

/** Add the value to the list if it is missing, remove it if it is there. Returns the new comma text or null. */
export function toggleInList(current: string[], value: string): string | null {
  return joinList(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
}

/** Does this key hold a value that counts as a filter? */
export function isActive(params: ParamsLike, def: FilterDef): boolean {
  const p = toParams(params);
  const raw = p.get(def.key);
  if (raw == null || raw === '') return false;
  if (def.kind === 'range') return parseRange(raw) != null;
  return true;
}

/** Number of filters that are on (a list counts once per value, so "Filters (n)" matches the chips). */
export function countActive(params: ParamsLike, defs: FilterDef[]): number {
  return chipsFromParams(params, defs).length;
}

/** The chips for the filters in the address, in the order of `defs`. */
export function chipsFromParams(params: ParamsLike, defs: FilterDef[]): ChipItem[] {
  const p = toParams(params);
  const out: ChipItem[] = [];
  for (const def of defs) {
    const kind = def.kind ?? 'single';
    const pre = def.label ? `${def.label}: ` : '';
    if (kind === 'list') {
      for (const v of getList(p, def.key)) {
        out.push({ id: `${def.key}:${v}`, key: def.key, value: v, label: def.chipLabel?.(v) ?? pre + (def.valueLabel?.(v) ?? v) });
      }
      continue;
    }
    const raw = p.get(def.key);
    if (raw == null || raw === '') continue;
    if (kind === 'range') {
      const r = parseRange(raw);
      if (!r) continue;
      out.push({ id: def.key, key: def.key, label: pre + describeRange(r[0], r[1], def.format) });
    } else if (kind === 'flag') {
      if (raw !== '1') continue;
      out.push({ id: def.key, key: def.key, label: def.chipLabel?.(raw) ?? (def.label ?? def.key) });
    } else {
      out.push({ id: def.key, key: def.key, label: def.chipLabel?.(raw) ?? pre + (def.valueLabel?.(raw) ?? raw) });
    }
  }
  return out;
}

/** The address without this chip. `page` is always dropped, as it is after any filter change. */
export function removeChip(params: ParamsLike, chip: ChipItem, defs: FilterDef[] = []): URLSearchParams {
  const p = toParams(params);
  if (chip.value != null) {
    const next = joinList(getList(p, chip.key).filter((v) => v !== chip.value));
    p.delete(chip.key);
    if (next) p.set(chip.key, next);
  } else {
    p.delete(chip.key);
    for (const k of defs.find((d) => d.key === chip.key)?.also ?? []) p.delete(k);
  }
  p.delete('page');
  return p;
}

/** The address with every filter removed. Sort, view and `open` stay, `page` goes. */
export function clearFilters(params: ParamsLike, defs: FilterDef[]): URLSearchParams {
  const p = toParams(params);
  for (const d of defs) {
    p.delete(d.key);
    for (const k of d.also ?? []) p.delete(k);
  }
  p.delete('page');
  return p;
}

/** Sorted, `page` and `open` removed: use it to compare two filter states or as the key of a saved view. */
export function canonicalQuery(params: ParamsLike, drop: string[] = ['page', 'open']): string {
  const p = toParams(params);
  for (const k of drop) p.delete(k);
  const entries = Array.from(p.entries()).sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return new URLSearchParams(entries).toString();
}

/** Build `?a=1&b=2` (or an empty string) from an object; empty values are left out. */
export function buildQuery(values: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
