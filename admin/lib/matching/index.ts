// The match score as the app sees it. The score itself is worked out in the database (match_pairs and its two wrappers in
// migration 20261125000800): this file holds the types, the band rule, the plain-English wording of a block, and the zod
// schemas that check what comes back and what the Link dialog sends. Pure functions; safe in server and client code.
import { z } from 'zod';
import { STAGES, type Stage } from '@/lib/deals/format';

export const MIN_SUGGEST = 40;
export const STRONG = 70;
export const MAX_SUGGESTIONS = 5;
export const PICKER_LIMIT = 20;
export const WEIGHTS = { niche: 40, size: 25, similar: 20, recency: 15 } as const;

export type Band = 'Strong' | 'Possible' | 'Weak';
/** 70 and above is Strong, 40 to 69 is Possible, below that is Weak (not suggested). Same rule as the database and the UI kit. */
export function bandOf(total: number): Band {
  return total >= STRONG ? 'Strong' : total >= MIN_SUGGEST ? 'Possible' : 'Weak';
}

export type Reason = { points: number; text: string; unconfirmed: boolean };
export type Match = {
  /** The other party: the sponsor when you asked for a creator, the creator when you asked for a sponsor. */
  otherId: string;
  total: number;
  band: Band;
  reasons: Reason[];
  /** Why the pair can never be linked (Do not contact, opted out), or null. */
  blocked: string | null;
  /** Stage of the open deal this pair already has, or null. */
  openStage: Stage | null;
  /** Date of a confirmed sponsorship in the last 180 days, or null. */
  recentOn: string | null;
  /** Clean enough to be suggested: not blocked, no open deal, no confirmed sponsorship in the last 180 days. */
  suggestable: boolean;
};

export const reasonSchema = z.object({
  points: z.coerce.number().int().min(0).max(100),
  text: z.string().min(1).max(500),
  unconfirmed: z.boolean().optional().default(false),
});

const rowSchema = z.object({
  brand_id: z.string().optional(),
  creator_id: z.string().optional(),
  total: z.coerce.number().int().min(0).max(100),
  band: z.enum(['Strong', 'Possible', 'Weak']),
  reasons: z.array(reasonSchema),
  blocked: z.string().nullable(),
  open_stage: z.enum(STAGES).nullable(),
  recent_on: z.string().nullable(),
  suggestable: z.boolean(),
});

/** Checks the rows of match_for_creator / match_for_brand. A row that does not fit is dropped, never shown half-built. */
export function parseMatchRows(data: unknown): Match[] {
  if (!Array.isArray(data)) return [];
  const out: Match[] = [];
  for (const raw of data) {
    const r = rowSchema.safeParse(raw);
    const otherId = r.success ? (r.data.brand_id ?? r.data.creator_id) : null;
    if (!r.success || !otherId) continue;
    out.push({
      otherId, total: r.data.total, band: r.data.band, reasons: r.data.reasons, blocked: r.data.blocked,
      openStage: r.data.open_stage, recentOn: r.data.recent_on, suggestable: r.data.suggestable,
    });
  }
  return out;
}

/** Best first; pairs that can never be linked go last. Ties keep a stable order by id. */
export function rankMatches(list: Match[]): Match[] {
  return [...list].sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.total - a.total || a.otherId.localeCompare(b.otherId));
}

/** What the Suggestions box shows: suggestable and 40 or more, best first, at most five. */
export function pickSuggestions(list: Match[], limit = MAX_SUGGESTIONS): Match[] {
  return rankMatches(list.filter((m) => m.suggestable && m.total >= MIN_SUGGEST)).slice(0, limit);
}

/** The page-address value that asks creators_list for "best match for this sponsor". The id rides in p_sort because the signature is fixed. */
export function matchSortArg(sponsorId: string): string {
  return `match:${sponsorId}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idSchema = z.string().regex(UUID, { error: 'Invalid id.' });

/** What the Link dialog sends. The amount is dollar text; empty means "not set yet". */
export const linkSchema = z.object({
  creatorId: idSchema,
  brandId: idSchema,
  stage: z.enum(['matched', 'contacted'], { error: 'Pick a starting stage.' }),
  amount: z.string().trim().max(20).optional().default(''),
});
export type LinkInput = z.input<typeof linkSchema>;

export const pickerQuerySchema = z.object({
  kind: z.enum(['creator', 'brand']),
  q: z.string().trim().max(100).default(''),
  /** The other side, already chosen: results are then ordered by score. */
  other: idSchema.optional(),
});

export const nameQuerySchema = z.object({ kind: z.enum(['creator', 'brand']), id: idSchema });

/** One line in a picker. No email address, ever. */
export type PickerOption = { id: string; name: string; hint: string; total?: number; band?: Band; blocked?: boolean };
