// Shared display helpers for the Overview and Deals pages. Plain functions only (used in server and client code).
// Money is stored in cents (USD). Dates are shown in UTC so the server and the browser agree.

export const STAGES = ['contacted', 'replied', 'negotiating', 'signed', 'completed', 'paid'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  contacted: 'Contacted',
  replied: 'Replied',
  negotiating: 'Negotiating',
  signed: 'Signed',
  completed: 'Completed',
  paid: 'Paid',
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('en-US');
const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' });
const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

/** 219000 -> "$2,190.00". Null or undefined counts as zero. */
export function formatUsd(cents: number | string | null | undefined): string {
  return usd.format(Number(cents ?? 0) / 100);
}

export function formatCount(n: number | string | null | undefined): string {
  return count.format(Number(n ?? 0));
}

/** ISO timestamp -> "21 Nov 2026, 14:05" (UTC). */
export function formatWhen(iso: string | null | undefined): string {
  return iso ? when.format(new Date(iso)) : '–';
}

/** A week start date ("2026-11-16") -> day and month for chart labels. */
export function weekLabel(weekStart: string): { day: string; month: string } {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return { day: day.format(d), month: month.format(d) };
}
