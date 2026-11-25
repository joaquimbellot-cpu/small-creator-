// Page-address filters of /sponsors: read, check and write them. Bad values are ignored, never an error.
// Address keys (docs/ui-upgrade/05-build-plan.md section 4): q, industry, niches, target=min-max, budget=min-max (dollars),
// active=yes|no, detected=1, count=1|3|5, last=30|90|180, rel, size, country, contact=1, tag, sort, dir, view=cards,
// page, open, for (creator id, with sort=match).
import { formatRange, formatShort, parseRange } from '../lists/numbers';
import { joinList, splitList, toParams, type FilterDef, type ParamsLike } from '../lists/query';
import {
  COMPANY_SIZES, COMPANY_SIZE_LABEL, NICHE_SLUGS, RELATIONSHIPS, RELATIONSHIP_LABEL, SORT_KEYS, nicheName, countryName,
  type SortKey,
} from './constants';

export type Filters = {
  q: string;
  industry: string[];
  niches: string[];
  target: [number | null, number | null] | null;
  budget: [number | null, number | null] | null;
  active: 'yes' | 'no' | null;
  detected: boolean;
  count: 1 | 3 | 5 | null;
  last: 30 | 90 | 180 | null;
  rel: string[];
  size: string[];
  country: string[];
  contact: boolean;
  tag: string[];
  sort: SortKey;
  dir: 'asc' | 'desc' | null;
  view: 'table' | 'cards';
  page: number;
  open: string | null;
  for: string | null;
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NUMBER = 2_000_000_000;

type SP = ParamsLike;

function limitedList(p: URLSearchParams, key: string, ok: (v: string) => boolean, max = 50): string[] {
  const out: string[] = [];
  for (const raw of p.getAll(key)) for (const v of splitList(raw)) if (ok(v) && !out.includes(v) && out.length < max) out.push(v);
  return out;
}

function checkedRange(raw: string | null, max: number): [number | null, number | null] | null {
  const r = parseRange(raw);
  if (!r) return null;
  if (r.some((n) => n != null && (!Number.isSafeInteger(n) || n < 0 || n > max))) return null;
  return r;
}

export function parseFilters(input: SP): Filters {
  const p = toParams(input);
  const one = (k: string) => p.get(k)?.trim() || null;
  const sort = one('sort') as SortKey | null;
  const dir = one('dir');
  const page = Number(one('page'));
  const open = one('open');
  const forId = one('for');
  const f: Filters = {
    q: (one('q') ?? '').slice(0, 100),
    industry: limitedList(p, 'industry', (v) => v.length <= 200),
    niches: limitedList(p, 'niches', (v) => NICHE_SLUGS.includes(v)),
    target: checkedRange(p.get('target'), MAX_NUMBER),
    budget: checkedRange(p.get('budget'), 100_000_000),
    active: one('active') === 'yes' ? 'yes' : one('active') === 'no' ? 'no' : null,
    detected: one('detected') === '1',
    count: one('count') === '1' ? 1 : one('count') === '3' ? 3 : one('count') === '5' ? 5 : null,
    last: one('last') === '30' ? 30 : one('last') === '90' ? 90 : one('last') === '180' ? 180 : null,
    rel: limitedList(p, 'rel', (v) => (RELATIONSHIPS as readonly string[]).includes(v)),
    size: limitedList(p, 'size', (v) => (COMPANY_SIZES as readonly string[]).includes(v)),
    country: limitedList(p, 'country', (v) => /^[A-Z]{2}$/.test(v)),
    contact: one('contact') === '1',
    tag: limitedList(p, 'tag', (v) => UUID_RE.test(v)),
    sort: sort && (SORT_KEYS as readonly string[]).includes(sort) ? sort : 'name',
    dir: dir === 'asc' || dir === 'desc' ? dir : null,
    view: one('view') === 'cards' ? 'cards' : 'table',
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
    open: open && UUID_RE.test(open) ? open : null,
    for: forId && UUID_RE.test(forId) ? forId : null,
  };
  // "Best match" needs a creator to match against; without one the list stays in name order.
  if (f.sort === 'match' && !f.for) f.sort = 'name';
  if (f.sort !== 'match') f.for = null;
  return f;
}

/** The address for these filters: canonical order, nothing that is off or default. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  const list = (k: string, v: string[]) => { const j = joinList(v); if (j) p.set(k, j); };
  list('industry', f.industry);
  list('niches', f.niches);
  if (f.target) p.set('target', formatRange(f.target[0], f.target[1])!);
  if (f.budget) p.set('budget', formatRange(f.budget[0], f.budget[1])!);
  if (f.active) p.set('active', f.active);
  if (f.detected) p.set('detected', '1');
  if (f.count) p.set('count', String(f.count));
  if (f.last) p.set('last', String(f.last));
  list('rel', f.rel);
  list('size', f.size);
  list('country', f.country);
  if (f.contact) p.set('contact', '1');
  list('tag', f.tag);
  if (f.sort !== 'name') p.set('sort', f.sort);
  if (f.dir) p.set('dir', f.dir);
  if (f.sort === 'match' && f.for) p.set('for', f.for);
  if (f.view === 'cards') p.set('view', 'cards');
  if (f.page > 1) p.set('page', String(f.page));
  if (f.open) p.set('open', f.open);
  return p;
}

/** Same filters, no page and no open panel: the key of a saved view and what "Copy link" shares. */
export function viewQuery(input: SP): string {
  const f = parseFilters(input);
  f.page = 1;
  f.open = null;
  return filtersToParams(f).toString();
}

/** The filter object the database functions read (see sponsor_args in the migration). */
export function filtersToRpc(f: Filters): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (f.q) o.q = f.q;
  if (f.industry.length) o.industry = f.industry;
  if (f.niches.length) o.niches = f.niches;
  if (f.target) { if (f.target[0] != null) o.target_min = f.target[0]; if (f.target[1] != null) o.target_max = f.target[1]; }
  if (f.budget) { if (f.budget[0] != null) o.budget_min = f.budget[0]; if (f.budget[1] != null) o.budget_max = f.budget[1]; }
  if (f.active) o.active = f.active;
  if (f.detected) o.detected = 'true';
  if (f.count) o.count = f.count;
  if (f.last) o.last = f.last;
  if (f.rel.length) o.rel = f.rel;
  if (f.size.length) o.size = f.size;
  if (f.country.length) o.country = f.country;
  if (f.contact) o.contact = 'true';
  if (f.tag.length) o.tag = f.tag;
  return o;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Chip definitions, in the order of the rail. `tagName` turns a tag id into its name. */
export function filterDefs(tagName: (id: string) => string = (id) => id): FilterDef[] {
  return [
    { key: 'q', label: 'Search', chipLabel: (v) => `Search: "${v}"` },
    { key: 'industry', label: 'Industry', kind: 'list' },
    { key: 'niches', label: 'Niche', kind: 'list', valueLabel: nicheName },
    { key: 'target', label: 'Target size', kind: 'range', format: formatShort },
    { key: 'budget', label: 'Budget', kind: 'range', format: usd },
    { key: 'active', label: 'Active', chipLabel: (v) => (v === 'yes' ? 'Currently active' : 'Not currently active') },
    { key: 'detected', label: 'Counting detected records', kind: 'flag' },
    { key: 'count', label: 'Creators sponsored', chipLabel: (v) => `${v} or more creators sponsored` },
    { key: 'last', label: 'Last sponsorship', chipLabel: (v) => `Sponsored in the last ${v} days` },
    { key: 'rel', label: 'Contact status', kind: 'list', valueLabel: (v) => RELATIONSHIP_LABEL[v as keyof typeof RELATIONSHIP_LABEL] ?? v },
    { key: 'size', label: 'Company size', kind: 'list', valueLabel: (v) => COMPANY_SIZE_LABEL[v] ?? v },
    { key: 'country', label: 'Location', kind: 'list', valueLabel: (v) => countryName(v) },
    { key: 'contact', label: 'Has a contact person', kind: 'flag' },
    { key: 'tag', label: 'Tag', kind: 'list', valueLabel: tagName },
  ];
}
export const FILTER_KEYS = filterDefs().map((d) => d.key);

/** "Counting detected records" only means something next to Active, Creators sponsored or Last sponsorship. */
export const detectedMatters = (p: URLSearchParams) => !!(p.get('active') || p.get('count') || p.get('last'));
