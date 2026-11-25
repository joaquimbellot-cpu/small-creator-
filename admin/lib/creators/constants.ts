export const STATUSES = ['new', 'contacted', 'replied', 'active', 'inactive', 'do_not_contact'] as const;
export type CreatorStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<CreatorStatus, string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied', active: 'Active', inactive: 'Inactive', do_not_contact: 'Do not contact',
};
export const STATUS_TONE: Record<CreatorStatus, 'neutral' | 'accent' | 'good' | 'warn' | 'bad'> = {
  new: 'neutral', contacted: 'accent', replied: 'good', active: 'good', inactive: 'warn', do_not_contact: 'bad',
};
export const PAGE_SIZE = 25;
export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_REFRESH_IDS = 200;

export type CreatorSummary = {
  id: string; full_name: string; email: string; phone: string | null; channel_url: string | null; youtube_channel_id: string | null;
  channel_name: string | null; niche: string | null; subscribers: number | null; subscribers_hidden: boolean;
  subscribers_checked_at: string | null; status: CreatorStatus; notes: string | null; created_at: string; updated_at: string;
  deal_count: number; total_earned_cents: number; last_contacted_at: string | null;
};

/** The fixed list of niches (slug -> name). The same 12 rows are in the `niches` table; the list page uses this copy so it needs no query. */
export const NICHES = {
  tech: 'Tech and gadgets', gaming: 'Gaming', diy: 'Woodworking and DIY', cooking: 'Cooking and food', fitness: 'Fitness and health',
  finance: 'Personal finance', travel: 'Travel', education: 'Education and science', beauty: 'Beauty and style', music: 'Music and audio',
  photo: 'Photo and film', outdoors: 'Outdoors',
} as const;
export type NicheSlug = keyof typeof NICHES;
export const NICHE_SLUGS = Object.keys(NICHES) as NicheSlug[];

export const CONTACTED_OPTIONS = [
  { value: 'never', label: 'Never contacted' }, { value: 'in30', label: 'In the last 30 days' },
  { value: 'over30', label: 'Over 30 days ago' }, { value: 'over90', label: 'Over 90 days ago' },
] as const;
export const VIEWS_OPTIONS = [
  { value: '1000', label: '1k or more' }, { value: '5000', label: '5k or more' }, { value: '10000', label: '10k or more' }, { value: '25000', label: '25k or more' },
] as const;
export const RECENT_OPTIONS = [30, 90, 180] as const;
export const MAX_BULK_IDS = 200;

/** One row of the list, as `creators_list()` returns it. No email address: the list never shows one. */
export type ListRow = {
  id: string; full_name: string; channel_name: string | null; niche_slug: string | null; country: string | null; language: string | null;
  subscribers: number | null; subscribers_hidden: boolean; avg_views: number | null; status: CreatorStatus;
  last_contacted_at: string | null; created_at: string; sponsorship_count: number; last_sponsorship_at: string | null;
  detected_sponsorship_count: number; last_detected_sponsorship_at: string | null; has_email: boolean;
  /** Only with sort=match&for=<sponsor id>: the score of this creator for that sponsor, with its reasons. */
  match?: { total: number; reasons: { points: number; text: string; unconfirmed: boolean }[]; blocked: string | null };
};

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
