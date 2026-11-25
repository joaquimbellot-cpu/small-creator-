// GET /api/search?q=... : the search box in the top bar. Staff only (owner or worker). One database function runs as the
// user, so row security applies. The reply holds names, ids and one line of public context, never a contact detail,
// so no audit line is written.
import { apiHandler, ApiError } from '@/lib/api/handler';
import { searchQuery, type SearchRow } from '@/lib/search/schema';
import { groupResults } from '@/lib/search/results';

export const GET = apiHandler({ query: searchQuery }, async ({ supabase, query }) => {
  const { data, error } = await supabase.rpc('global_search', { p_q: query.q });
  if (error) {
    console.error('search failed', error.code);
    throw new ApiError(500, 'Search is not working right now.');
  }
  return { groups: groupResults((data ?? []) as SearchRow[]) };
});
