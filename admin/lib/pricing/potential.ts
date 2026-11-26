// "Sponsorship potential" for a creator's profile: what one 60-second integration could be worth, and how sure we are.
// Three honest outcomes: an estimate from average views (the calculator's own method), a rough guess from the
// subscriber count alone, or "cannot be estimated" when neither figure is on file. Money is in US dollars.
import { priceSponsorship } from './calculate';
import { cpmGroupForNiche } from './constants';
import { tidy } from './format';

export type PotentialInput = {
  subscribers: number | null;
  avgViews: number | null;
  nicheSlug?: string | null;
  /** percent, null when not known */
  engagementRate: number | null;
  audienceCountries: string | null;
};

export type Potential =
  | { kind: 'views'; low: number; high: number; ask: number; basis: 'good' | 'fair'; missing: string[] }
  | { kind: 'subscribers'; low: number; high: number; ask: number; basis: 'rough' }
  | { kind: 'none'; missing: string[] };

/** Rule of thumb for a 60-second integration when only the subscriber count is known: $10 to $25 per 1,000 subscribers. */
export const PER_1000_SUBSCRIBERS = { low: 10, high: 25 } as const;
/** Below this many subscribers a guess from subscribers alone is a few dollars and means nothing. */
export const MIN_SUBSCRIBERS_FOR_GUESS = 100;

export function sponsorshipPotential(c: PotentialInput): Potential {
  if (c.avgViews != null && c.avgViews > 0) {
    const result = priceSponsorship({
      niche: cpmGroupForNiche(c.nicheSlug ?? ''), own: false, cpmLo: null, cpmHi: null, subs: c.subscribers, views: c.avgViews,
      eng: c.engagementRate, aud: c.audienceCountries ?? '', format: 'int', usage: 0, excl: 0, wide: false,
      extras: { link: true, pin: false, post: false }, margin: 20,
    });
    if (result) {
      const missing = [
        c.nicheSlug ? null : 'the niche from the list',
        c.engagementRate == null ? 'the engagement rate' : null,
        c.audienceCountries && c.audienceCountries.trim() ? null : 'the audience countries',
      ].filter((x): x is string => x !== null);
      return { kind: 'views', low: result.price[0], high: result.price[2], ask: result.ask, basis: missing.length ? 'fair' : 'good', missing };
    }
  }
  if (c.subscribers != null && c.subscribers >= MIN_SUBSCRIBERS_FOR_GUESS) {
    const low = (c.subscribers / 1000) * PER_1000_SUBSCRIBERS.low;
    const high = (c.subscribers / 1000) * PER_1000_SUBSCRIBERS.high;
    return { kind: 'subscribers', low, high, ask: tidy((low + high) / 2), basis: 'rough' };
  }
  const missing = ['the average views'];
  if (c.subscribers == null) missing.push('the subscriber count');
  return { kind: 'none', missing };
}
