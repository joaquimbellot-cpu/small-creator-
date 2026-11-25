// Shared display helpers for the Overview and Deals pages. Plain functions only (used in server and client code).
// Money is stored in cents (USD). Dates are shown in UTC so the server and the browser agree.

import { dateFormatter } from '../lists/dates';

export const STAGES = ['matched', 'contacted', 'replied', 'negotiating', 'signed', 'completed', 'paid'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  matched: 'Matched',
  contacted: 'Contacted',
  replied: 'Replied',
  negotiating: 'Negotiating',
  signed: 'Signed',
  completed: 'Completed',
  paid: 'Paid',
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const count = new Intl.NumberFormat('en-US');
const when = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' });
const month = dateFormatter({ month: 'short' });

/** 219000 -> "$2,190.00". Null or undefined counts as zero. */
export function formatUsd(cents: number | string | null | undefined): string {
  return usd.format(Number(cents ?? 0) / 100);
}

/** An amount that may be empty: 219000 -> "$2,190.00", null -> the words for "not set" ("Amount not set" by default). */
export function formatAmount(cents: number | string | null | undefined, empty = 'Amount not set'): string {
  return cents == null || cents === '' ? empty : usd.format(Number(cents) / 100);
}

/** "Today", "1 day", "5 days", "3 weeks", "2 months" since an ISO time (UTC days, so server and browser agree). */
export function timeInStage(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '–';
  const days = Math.max(0, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(new Date(iso).getUTCFullYear(), new Date(iso).getUTCMonth(), new Date(iso).getUTCDate())) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
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
