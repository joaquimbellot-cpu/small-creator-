// Applies the list filters to a creator_summaries query. Used by the list page and the CSV export.
// The query builder is typed loosely on purpose: its generic types are too deep for the compiler when chained here.
import 'server-only';
import { searchFilter, SORT_COLUMN, type Filters } from './filters';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function applyFilters(query: any, f: Filters): any {
  let q = query;
  const or = searchFilter(f.q);
  if (or) q = q.or(or);
  if (f.status) q = q.eq('status', f.status);
  q = q.order(SORT_COLUMN[f.sort], { ascending: f.dir === 'asc', nullsFirst: false });
  return f.sort === 'name' ? q.order('id', { ascending: true }) : q.order('full_name', { ascending: true }).order('id', { ascending: true });
}
