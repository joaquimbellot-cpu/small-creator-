export { priceSponsorship, pct, usagePercent, exclusivityPercent } from './calculate';
export { parseAudience } from './audience';
export { commissionUsd } from './commission';
export { CPM_GROUPS, FORMATS, EXTRAS, cpmGroupForNiche } from './constants';
export { formatMoney, formatCount, shortCount, plural, tidy, parseCount, parseDecimal } from './format';
export { sponsorshipPotential, PER_1000_SUBSCRIBERS, MIN_SUBSCRIBERS_FOR_GUESS, type Potential, type PotentialInput } from './potential';
export type * from './types';

import type { PriceInput } from './types';

/** Starting values: a 60-second integration, margin 20, nothing else known. */
export function defaultPriceInput(over: Partial<PriceInput> = {}): PriceInput {
  return {
    name: '', niche: 'life', own: false, cpmLo: null, cpmHi: null, subs: null, views: null, eng: null, aud: '',
    format: 'int', usage: 0, excl: 0, wide: false, extras: { link: true, pin: false, post: false }, margin: 20, ...over,
  };
}
