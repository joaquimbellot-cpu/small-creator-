// URL query params of the list page <-> a typed filter. Also used by the export so both see the same rows.
import { STATUSES, PAGE_SIZE, type CreatorStatus } from './constants';

export const SORTS = ['name', 'subscribers', 'last_contacted', 'added'] as const;
export type SortKey = (typeof SORTS)[number];
export const SORT_COLUMN: Record<SortKey, string> = { name: 'full_name', subscribers: 'subscribers', last_contacted: 'last_contacted_at', added: 'created_at' };

export type Filters = { q: string; status: CreatorStatus | ''; sort: SortKey; dir: 'asc' | 'desc'; page: number };
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function parseFilters(p: Params): Filters {
  const status = one(p.status);
  const sort = one(p.sort);
  const page = Math.floor(Number(one(p.page)));
  return {
    q: one(p.q).trim().slice(0, 100),
    status: (STATUSES as readonly string[]).includes(status) ? (status as CreatorStatus) : '',
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : 'added',
    dir: one(p.dir) === 'asc' ? 'asc' : one(p.dir) === 'desc' ? 'desc' : sort === 'name' ? 'asc' : 'desc',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

/** Query string for links (omits defaults and empty values). */
export function filtersToQuery(f: Partial<Filters> & { creator?: string; edit?: boolean; isNew?: boolean }): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.status) sp.set('status', f.status);
  if (f.sort && f.sort !== 'added') sp.set('sort', f.sort);
  if (f.dir && (f.sort !== 'added' || f.dir !== 'desc')) sp.set('dir', f.dir);
  if (f.page && f.page > 1) sp.set('page', String(f.page));
  if (f.creator) sp.set('creator', f.creator);
  if (f.edit) sp.set('edit', '1');
  if (f.isNew) sp.set('new', '1');
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * PostgREST .or() filter for the search box. User text is put in double quotes (so , ( ) . : cannot end the value),
 * and % _ \ are escaped for ILIKE. "*" would be read by PostgREST as a wildcard, so it becomes a single-character "_".
 */
export function searchFilter(q: string): string | null {
  const term = q.trim().slice(0, 100);
  if (!term) return null;
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
  const quoted = `"${`%${like}%`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return ['full_name', 'email', 'channel_name'].map((c) => `${c}.ilike.${quoted}`).join(',');
}

export { PAGE_SIZE };
