// What the search route accepts: one text of 1 to 100 characters (trimmed). Longer or empty is a 400.
import { z } from 'zod';

export const MAX_QUERY = 100;
export const searchQuery = z.object({ q: z.string().trim().min(1).max(MAX_QUERY) });

// The row the database function returns (no email, phone, note or contact person: see 20261125001000_search.sql).
export type SearchRow = {
  kind: 'creator' | 'sponsor' | 'deal';
  id: string;
  name: string;
  channel: string | null;
  subscribers: number | null;
  industry: string | null;
  stage: string | null;
  other_name: string | null;
};
