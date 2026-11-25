// Server-side reads of the match score: thin wrappers over match_for_creator / match_for_brand (database functions, so row
// level security applies) that check the rows with zod. Never import this from a client component.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMatchRows, type Match } from './index';

type Db = Pick<SupabaseClient, 'rpc'>;

/** Every sponsor scored for one creator (or only `ids`). Throws when the database call fails. */
export async function matchesForCreator(db: Db, creatorId: string, ids?: string[]): Promise<Match[]> {
  const { data, error } = await db.rpc('match_for_creator', { p_creator: creatorId, p_ids: ids ?? null });
  if (error) throw error;
  return parseMatchRows(data);
}

/** Every creator scored for one sponsor (or only `ids`). */
export async function matchesForBrand(db: Db, brandId: string, ids?: string[]): Promise<Match[]> {
  const { data, error } = await db.rpc('match_for_brand', { p_brand: brandId, p_ids: ids ?? null });
  if (error) throw error;
  return parseMatchRows(data);
}

/** The score of one pair (null when either side does not exist or cannot be read). */
export async function matchForPair(db: Db, creatorId: string, brandId: string): Promise<Match | null> {
  return (await matchesForCreator(db, creatorId, [brandId]))[0] ?? null;
}

/** Like escape for ilike: % _ \ are plain characters; the text goes in double quotes so , ( ) . : cannot end the filter value. */
export function nameFilter(columns: string[], q: string): string | null {
  const term = q.trim().slice(0, 100);
  if (!term) return null;
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_');
  const quoted = `"${`%${like}%`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(',');
}
