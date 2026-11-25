// The page address of the Creators list <-> a typed filter. Used by the list page, the side panel links, saved views
// and the CSV export, so all of them see the same rows. Bad values are ignored, never an error.
// Address keys (build plan, section 4): q, subs, sponsored, detected, recent, by, niche, status, contacted, views, lang,
// country, email, tag, list, sort, dir, view, page, open, for.
import { CONTACTED_OPTIONS, NICHE_SLUGS, NICHES, PAGE_SIZE, STATUSES, STATUS_LABEL, type CreatorStatus } from './constants';
import { formatRange, formatShort, parseRange } from '../lists/numbers';
import type { FilterDef } from '../lists/query';

/** "match" (best match for a sponsor, `sort=match&for=<brand id>`) is parsed and kept, but the database falls back to subscribers until the Matching agent adds it. */
export const SORTS = ['subscribers', 'sponsored', 'last_contacted', 'name', 'added', 'match'] as const;
export type SortKey = (typeof SORTS)[number];
export const DEFAULT_SORT: SortKey = 'subscribers';
export const MAX_LIST_VALUES = 50;

export type Contacted = '' | (typeof CONTACTED_OPTIONS)[number]['value'];
export type Filters = {
  q: string;
  subs: [number | null, number | null] | null;
  sponsored: '' | 'yes' | 'no';
  detected: boolean;
  recent: 30 | 90 | 180 | null;
  by: string[];
  niche: string[];
  status: CreatorStatus[];
  contacted: Contacted;
  views: number | null;
  lang: string[];
  country: string[];
  email: boolean;
  tag: string[];
  list: string[];
  sort: SortKey;
  dir: 'asc' | 'desc';
  view: 'table' | 'cards';
  page: number;
  /** Creator shown in the side panel. */
  open: string;
  /** Sponsor to rank against when sort is "match". */
  for: string;
};
type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/i;
const get = (p: Params, k: string): string => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};
const items = (raw: string, ok: (v: string) => string | null): string[] => {
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const v = ok(part.trim());
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= MAX_LIST_VALUES) break;
  }
  return out;
};
const uuid = (v: string) => (UUID.test(v) ? v.toLowerCase() : null);
const isUuid = (v: string) => UUID.test(v);

function normLang(v: string): string | null {
  if (!LANG.test(v)) return null;
  const [base, region] = v.split('-');
  return region ? `${base.toLowerCase()}-${region.length === 2 ? region.toUpperCase() : region[0].toUpperCase() + region.slice(1).toLowerCase()}` : base.toLowerCase();
}

export function parseFilters(p: Params): Filters {
  const sort = get(p, 'sort');
  const dir = get(p, 'dir');
  const page = Math.floor(Number(get(p, 'page')));
  const sortKey: SortKey = (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : DEFAULT_SORT;
  const range = parseRange(get(p, 'subs'));
  const subs = range ? ([clampNum(range[0]), clampNum(range[1])] as [number | null, number | null]) : null;
  const views = Math.floor(Number(get(p, 'views')));
  const recent = Number(get(p, 'recent'));
  const contacted = get(p, 'contacted');
  // Old links: ?creator=<id> (without edit=1 or new=1) now opens the side panel.
  const legacyView = get(p, 'edit') !== '1' && get(p, 'new') !== '1' ? get(p, 'creator') : '';
  return {
    q: get(p, 'q').trim().slice(0, 100),
    subs: subs && (subs[0] != null || subs[1] != null) ? subs : null,
    sponsored: get(p, 'sponsored') === 'yes' ? 'yes' : get(p, 'sponsored') === 'no' ? 'no' : '',
    detected: get(p, 'detected') === '1',
    recent: recent === 30 || recent === 90 || recent === 180 ? recent : null,
    by: items(get(p, 'by'), uuid),
    niche: items(get(p, 'niche'), (v) => ((NICHE_SLUGS as string[]).includes(v) ? v : null)),
    status: items(get(p, 'status'), (v) => ((STATUSES as readonly string[]).includes(v) ? v : null)) as CreatorStatus[],
    contacted: CONTACTED_OPTIONS.some((o) => o.value === contacted) ? (contacted as Contacted) : '',
    views: Number.isFinite(views) && views >= 1 && views <= 100_000_000 ? views : null,
    lang: items(get(p, 'lang'), normLang),
    country: items(get(p, 'country'), (v) => (/^[a-z]{2}$/i.test(v) ? v.toUpperCase() : null)),
    email: get(p, 'email') === '1',
    tag: items(get(p, 'tag'), uuid),
    list: items(get(p, 'list'), uuid),
    sort: sortKey,
    dir: dir === 'asc' ? 'asc' : dir === 'desc' ? 'desc' : sortKey === 'name' ? 'asc' : 'desc',
    view: get(p, 'view') === 'cards' ? 'cards' : 'table',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100000) : 1,
    open: uuid(get(p, 'open')) ?? uuid(legacyView) ?? '',
    for: uuid(get(p, 'for')) ?? '',
  };
}

function clampNum(n: number | null): number | null {
  return n == null ? null : Math.min(Math.max(Math.floor(n), 0), 2_000_000_000);
}

/** Query string for links (omits defaults and empty values). `creator`, `edit` and `isNew` are for the add and edit dialog. */
export function filtersToQuery(f: Partial<Filters> & { creator?: string; edit?: boolean; isNew?: boolean }): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  const subs = f.subs ? formatRange(f.subs[0], f.subs[1]) : null;
  if (subs) sp.set('subs', subs);
  if (f.sponsored) sp.set('sponsored', f.sponsored);
  if (f.detected) sp.set('detected', '1');
  if (f.recent) sp.set('recent', String(f.recent));
  if (f.by?.length) sp.set('by', f.by.join(','));
  if (f.niche?.length) sp.set('niche', f.niche.join(','));
  if (f.status?.length) sp.set('status', f.status.join(','));
  if (f.contacted) sp.set('contacted', f.contacted);
  if (f.views) sp.set('views', String(f.views));
  if (f.lang?.length) sp.set('lang', f.lang.join(','));
  if (f.country?.length) sp.set('country', f.country.join(','));
  if (f.email) sp.set('email', '1');
  if (f.tag?.length) sp.set('tag', f.tag.join(','));
  if (f.list?.length) sp.set('list', f.list.join(','));
  const sort = f.sort ?? DEFAULT_SORT;
  if (sort !== DEFAULT_SORT) sp.set('sort', sort);
  const dirDefault = sort === 'name' ? 'asc' : 'desc';
  if (f.dir && f.dir !== dirDefault) sp.set('dir', f.dir);
  if (f.view === 'cards') sp.set('view', 'cards');
  if (f.page && f.page > 1) sp.set('page', String(f.page));
  if (f.open) sp.set('open', f.open);
  if (f.for && sort === 'match') sp.set('for', f.for);
  if (f.creator) sp.set('creator', f.creator);
  if (f.edit) sp.set('edit', '1');
  if (f.isNew) sp.set('new', '1');
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** The filters as the typed arguments of the SQL functions (creators_list, creators_facets, creators_match_ids, creators_export). */
export function toRpcArgs(f: Filters) {
  return {
    p_q: f.q || null,
    p_subs_min: f.subs?.[0] ?? null,
    p_subs_max: f.subs?.[1] ?? null,
    p_sponsored: f.sponsored || null,
    p_detected: f.detected,
    p_recent: f.recent,
    p_by: f.by.length ? f.by : null,
    p_niche: f.niche.length ? f.niche : null,
    p_status: f.status.length ? f.status : null,
    p_contacted: f.contacted || null,
    p_views: f.views,
    p_lang: f.lang.length ? f.lang : null,
    p_country: f.country.length ? f.country : null,
    p_email: f.email,
    p_tag: f.tag.length ? f.tag : null,
    p_list: f.list.length ? f.list : null,
  };
}

/** The part of a saved view or a shared link that matters: filters, sort and view, without page and panel. */
export function cleanQuery(query: string): string {
  const f = parseFilters(new URLSearchParams(query.replace(/^\?/, '')));
  return filtersToQuery({ ...f, page: 1, open: '' }).replace(/^\?/, '');
}

/** The filters that are on, as the kit's chip definitions. `names` turns ids into names. */
export type NameLookup = { brands: Record<string, string>; tags: Record<string, string>; lists: Record<string, string>; langs?: (code: string) => string; countries?: (code: string) => string };
export function creatorFilterDefs(names: NameLookup, detected = false): FilterDef[] {
  const inc = detected ? ' (detected records counted)' : '';
  return [
    { key: 'q', label: 'Search', valueLabel: (v) => `"${v}"` },
    { key: 'subs', label: 'Subscribers', kind: 'range', format: formatShort },
    { key: 'sponsored', kind: 'single', also: ['detected'], chipLabel: (v) => (v === 'yes' ? 'Has done sponsorships' : 'Has no sponsorships') + inc },
    { key: 'detected', kind: 'flag', label: 'Count detected records too' }, // never shown as a chip of its own
    { key: 'recent', kind: 'single', chipLabel: (v) => `Sponsored in the last ${v} days${inc}` },
    { key: 'by', label: 'Sponsored by', kind: 'list', valueLabel: (v) => names.brands[v] ?? 'Unknown sponsor' },
    { key: 'niche', label: 'Niche', kind: 'list', valueLabel: (v) => NICHES[v as keyof typeof NICHES] ?? v },
    { key: 'status', label: 'Status', kind: 'list', valueLabel: (v) => STATUS_LABEL[v as CreatorStatus] ?? v },
    { key: 'contacted', label: 'Last contacted', valueLabel: (v) => CONTACTED_OPTIONS.find((o) => o.value === v)?.label ?? v },
    { key: 'views', chipLabel: (v) => `Average views: ${formatShort(Number(v))} or more` },
    { key: 'lang', label: 'Language', kind: 'list', valueLabel: names.langs },
    { key: 'country', label: 'Country', kind: 'list', valueLabel: names.countries },
    { key: 'email', kind: 'flag', label: 'Has an email address' },
    { key: 'tag', label: 'Tag', kind: 'list', valueLabel: (v) => names.tags[v] ?? 'Unknown tag' },
    { key: 'list', label: 'List', kind: 'list', valueLabel: (v) => names.lists[v] ?? 'Unknown list' },
  ];
}

/**
 * PostgREST .or() filter for a search box (used by the email composer's creator picker).
 * User text is put in double quotes (so , ( ) . : cannot end the value), and % _ \ are escaped for ILIKE.
 * "*" would be read by PostgREST as a wildcard, so it becomes a single-character "_".
 */
export function searchFilter(q: string): string | null {
  const term = q.trim().slice(0, 100);
  if (!term) return null;
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
  const quoted = `"${`%${like}%`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return ['full_name', 'email', 'channel_name'].map((c) => `${c}.ilike.${quoted}`).join(',');
}

export { PAGE_SIZE, isUuid };
