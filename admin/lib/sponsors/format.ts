// Text for sponsor numbers and dates. Fixed locales, so the server and the browser print the same text.
import { formatShort } from '../lists/numbers';
import { COMPANY_SIZE_LABEL, countryName, nicheName, type Relationship, type SponsorRow } from './constants';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** "12 Oct 2026" from an ISO date or time; "" when empty. */
export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '');

/** "Today", "3 days ago", "2 months ago", "Never". `now` is passed in so the server and the browser agree. */
export function relativeDays(iso: string | null | undefined, now: string | number | Date): string {
  if (!iso) return 'Never';
  const days = Math.floor((new Date(now).getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 31) return `${days} days ago`;
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.floor(days / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}

export const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** "1k to 40k", "from 1k", "up to 40k" or "Not set". */
export function formatTarget(min: number | null, max: number | null, full = false): string {
  const f = full ? (n: number) => n.toLocaleString('en-US') : formatShort;
  if (min != null && max != null) return `${f(min)} to ${f(max)}`;
  if (min != null) return `from ${f(min)}`;
  if (max != null) return `up to ${f(max)}`;
  return 'Not set';
}

/** "$150 to $800", "from $150", "up to $800" or "Not set". */
export function formatBudget(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${usd(min)} to ${usd(max)}`;
  if (min != null) return `from ${usd(min)}`;
  if (max != null) return `up to ${usd(max)}`;
  return 'Not set';
}

export const nicheNames = (slugs: string[]) => slugs.map(nicheName);
export const companySizeText = (size: string | null) => (size ? `${COMPANY_SIZE_LABEL[size] ?? size} people` : '');
export const placeText = (industry: string | null, country: string | null) => [industry, countryName(country)].filter(Boolean).join(' · ');

/** "4 creators", "2 detected": the confirmed count first, detected ones apart. */
export function sponsoredText(r: Pick<SponsorRow, 'sponsorship_count' | 'detected_sponsorship_count'>) {
  const c = r.sponsorship_count;
  const d = r.detected_sponsorship_count;
  return { confirmed: `${c} creator${c === 1 ? '' : 's'}`, detected: d > 0 ? `${d} detected` : '', none: c === 0 && d === 0 };
}

export type SponsorFormValues = {
  id?: string; name: string; website: string; industry: string; country: string; company_size: string; niches: string[];
  target_min_subs: string; target_max_subs: string; budget_min: string; budget_max: string; relationship: Relationship | string; notes: string;
};
const num = (n: number | null | undefined) => (n == null ? '' : String(n));
const dollars = (c: number | null | undefined) => (c == null ? '' : String(c / 100));

export function toFormValues(b: {
  id: string; name: string; website: string | null; industry: string | null; country: string | null; company_size: string | null;
  target_niches: string[] | null; target_min_subs: number | null; target_max_subs: number | null; budget_min_cents: number | null;
  budget_max_cents: number | null; relationship: string; notes: string | null;
}): SponsorFormValues {
  return {
    id: b.id, name: b.name, website: b.website ?? '', industry: b.industry ?? '', country: b.country ?? '', company_size: b.company_size ?? '',
    niches: b.target_niches ?? [], target_min_subs: num(b.target_min_subs), target_max_subs: num(b.target_max_subs),
    budget_min: dollars(b.budget_min_cents), budget_max: dollars(b.budget_max_cents), relationship: b.relationship, notes: b.notes ?? '',
  };
}
