// Loads the Creators list from the database functions of migration 20261125000500 (rows and facet counts are worked
// out in SQL, with row level security, never in the browser). Used by the list page and the CSV export.
// The filters are validated by parseFilters() first and go to the database as typed arguments, never as SQL text.
import 'server-only';
import { PAGE_SIZE, type ListRow } from './constants';
import { filtersToQuery, toRpcArgs, type Filters } from './filters';
import { creatorFilterDefs } from './filters';
import { chipsFromParams, removeChip } from '../lists/query';
import { parseFilters } from './filters';

// The query builder is typed loosely on purpose: its generic types are too deep for the compiler when chained here.
type Client = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>; from: (t: string) => any };

export type Facets = { total: number; all: number; counts: Record<string, Record<string, number>> };
export type ListPage = { rows: ListRow[]; total: number };

/** One page of rows. `total` is the number of matching creators (0 when the page is past the end: use the facets total then). */
export async function loadPage(supabase: Client, f: Filters): Promise<ListPage> {
  const { data, error } = await supabase.rpc('creators_list', {
    ...toRpcArgs(f), p_sort: f.sort, p_dir: f.dir, p_limit: PAGE_SIZE, p_offset: (f.page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as (ListRow & { total: number })[];
  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows.length ? Number(rows[0].total) : 0 };
}

/** The number beside every option, and the totals. */
export async function loadFacets(supabase: Client, f: Filters): Promise<Facets> {
  const { data, error } = await supabase.rpc('creators_facets', toRpcArgs(f));
  if (error) throw error;
  const out: Facets = { total: 0, all: 0, counts: {} };
  for (const r of (data ?? []) as { facet: string; value: string; n: number | string }[]) {
    const n = Number(r.n);
    if (r.facet === '_total') out.total = n;
    else if (r.facet === '_all') out.all = n;
    else (out.counts[r.facet] ??= {})[r.value] = n;
  }
  return out;
}

export type Relax = { id: string; label: string; query: string; n: number };

/** Up to three filters (chips) whose removal brings results back, with the number each would give. */
export async function loadRelax(supabase: Client, f: Filters, names: Parameters<typeof creatorFilterDefs>[0]): Promise<Relax[]> {
  const defs = creatorFilterDefs(names, f.detected);
  const params = new URLSearchParams(filtersToQuery({ ...f, page: 1, open: '' }).replace(/^\?/, ''));
  const chips = chipsFromParams(params, defs).filter((c) => c.key !== 'detected').slice(0, 24);
  const results = await Promise.all(chips.map(async (chip) => {
    const next = removeChip(params, chip, defs);
    const g = parseFilters(next);
    const { data, error } = await supabase.rpc('creators_list', { ...toRpcArgs(g), p_limit: 1 });
    if (error) return null;
    const n = data?.length ? Number((data as { total: number }[])[0].total) : 0;
    return { id: chip.id, label: chip.label, query: next.toString(), n };
  }));
  return results.filter((r): r is Relax => !!r && r.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
}

/** Everything the rail needs to name its options (small tables: sponsors that have records, creator tags, creator lists). */
export async function loadOptionNames(supabase: Client) {
  const [brands, tags, lists] = await Promise.all([
    supabase.from('brands').select('id, name').or('sponsorship_count.gt.0,detected_sponsorship_count.gt.0').order('name').limit(500),
    supabase.from('tags').select('id, name').eq('scope', 'creator').order('name').limit(500),
    supabase.from('lists').select('id, name').eq('kind', 'creators').order('name').limit(500),
  ]);
  if (brands.error) throw brands.error;
  if (tags.error) throw tags.error;
  if (lists.error) throw lists.error;
  type Named = { id: string; name: string };
  return { brands: (brands.data ?? []) as Named[], tags: (tags.data ?? []) as Named[], lists: (lists.data ?? []) as Named[] };
}
