// Loads creators for compose, with the reason they are blocked (if any).
// A blocked creator can be shown but never selected or drafted. The database enforces it too.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Blocked = 'do_not_contact' | 'suppressed' | null;
export type ComposeCreator = {
  id: string;
  full_name: string;
  email: string;
  channel_name: string | null;
  channel_url: string | null;
  niche: string | null;
  subscribers: number | null;
  subscribers_hidden: boolean;
  blocked: Blocked;
};

// Notes, phone etc. are not selected at all.
const COLUMNS = 'id, full_name, email, channel_name, channel_url, niche, subscribers, subscribers_hidden, status';

type Row = Omit<ComposeCreator, 'blocked'> & { status: string };

async function withBlocked(supabase: SupabaseClient, rows: Row[]): Promise<ComposeCreator[]> {
  const { data: sup } = await supabase.from('suppression_list').select('email').in('email', rows.map((r) => r.email));
  const suppressed = new Set((sup ?? []).map((s) => String(s.email).toLowerCase()));
  return rows.map(({ status, ...c }) => ({
    ...c,
    blocked: status === 'do_not_contact' ? 'do_not_contact' : suppressed.has(c.email.toLowerCase()) ? 'suppressed' : null,
  }));
}

export async function creatorsByIds(supabase: SupabaseClient, ids: string[]): Promise<ComposeCreator[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.from('creators').select(COLUMNS).in('id', ids);
  return withBlocked(supabase, (data ?? []) as Row[]);
}

export async function searchCreators(supabase: SupabaseClient, q: string): Promise<ComposeCreator[]> {
  // Remove characters that have a meaning in PostgREST filters.
  const term = q.replace(/[%,()*\\]/g, ' ').trim();
  let query = supabase.from('creators').select(COLUMNS).order('full_name').limit(20);
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,channel_name.ilike.%${term}%`);
  const { data } = await query;
  return withBlocked(supabase, (data ?? []) as Row[]);
}
