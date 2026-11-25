// Server-side reads for Sponsors. Everything goes through the user's Supabase client, so RLS applies.
// Other agents may call searchSponsors() (a brand picker) and getSponsorBasics().
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { filtersToRpc, type Filters } from './filters';
import { PAGE_SIZE, type FacetCounts, type SponsorRow } from './constants';

type Db = SupabaseClient;

export type ListResult = { rows: SponsorRow[]; total: number };

export async function loadList(db: Db, f: Filters, page = f.page): Promise<ListResult> {
  const { data, error } = await db.rpc('sponsors_list', {
    p: filtersToRpc(f), p_sort: f.sort, p_dir: f.dir, p_for: f.for, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as (SponsorRow & { total: number })[];
  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows.length ? Number(rows[0].total) : 0 };
}

export async function countSponsors(db: Db, f: Filters): Promise<number> {
  const { data, error } = await db.rpc('sponsors_count', { p: filtersToRpc(f) });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function loadFacets(db: Db, f: Filters): Promise<FacetCounts> {
  const { data, error } = await db.rpc('sponsor_facets', { p: filtersToRpc(f) });
  if (error) throw error;
  const out: FacetCounts = {};
  for (const r of (data ?? []) as { facet: string; value: string; n: number }[]) (out[r.facet] ??= {})[r.value] = Number(r.n);
  return out;
}

export async function totalSponsors(db: Db): Promise<number> {
  const { count, error } = await db.from('brands').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export type Tag = { id: string; name: string };
export async function loadTags(db: Db): Promise<Tag[]> {
  const { data, error } = await db.from('tags').select('id, name').eq('scope', 'brand').order('name');
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id as string, name: String(t.name) }));
}

export type SavedView = { id: string; name: string; query: string; is_shared: boolean; mine: boolean };
export async function loadViews(db: Db, userId: string): Promise<SavedView[]> {
  const { data, error } = await db.from('saved_views').select('id, owner_id, name, query, is_shared').eq('scope', 'sponsors').order('name');
  if (error) throw error;
  return (data ?? []).map((v) => ({ id: v.id, name: v.name, query: v.query, is_shared: v.is_shared, mine: v.owner_id === userId }));
}

/** Find sponsors by name for a picker: `searchSponsors(supabase, 'acme')`. At most `limit` (default 8) rows, A to Z. */
export async function searchSponsors(db: Db, q: string, limit = 8): Promise<{ id: string; name: string; industry: string | null }[]> {
  const like = q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`);
  let query = db.from('brands').select('id, name, industry').order('name').limit(Math.min(Math.max(limit, 1), 50));
  if (like) query = query.ilike('name', `%${like}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((b) => ({ id: b.id as string, name: String(b.name), industry: (b.industry as string | null) ?? null }));
}

/** One sponsor's name and relationship, for another agent's page. null when it does not exist. */
export async function getSponsorBasics(db: Db, id: string): Promise<{ id: string; name: string; relationship: string } | null> {
  const { data, error } = await db.from('brands').select('id, name, relationship').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, name: String(data.name), relationship: data.relationship as string } : null;
}
