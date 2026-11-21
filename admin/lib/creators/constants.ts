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
export type ListRow = Pick<CreatorSummary, 'id' | 'full_name' | 'email' | 'status' | 'subscribers' | 'subscribers_hidden' | 'last_contacted_at' | 'created_at'>;

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
