// Shared constants for Sponsors (the brands table). Safe to import in client and server code.
export const PAGE_SIZE = 25;
export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_BULK = 200;

export const RELATIONSHIPS = ['prospect', 'contacted', 'talks', 'partner', 'past', 'do_not_contact'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  prospect: 'Prospect', contacted: 'Contacted', talks: 'In talks', partner: 'Partner', past: 'Past partner', do_not_contact: 'Do not contact',
};
export const RELATIONSHIP_TONE: Record<Relationship, 'neutral' | 'accent' | 'good' | 'warn' | 'bad'> = {
  prospect: 'neutral', contacted: 'accent', talks: 'accent', partner: 'good', past: 'warn', do_not_contact: 'bad',
};

// Same twelve niches as the `niches` table (reference data; slugs are the keys).
export const NICHES: { slug: string; name: string }[] = [
  { slug: 'tech', name: 'Tech and gadgets' }, { slug: 'gaming', name: 'Gaming' }, { slug: 'diy', name: 'Woodworking and DIY' },
  { slug: 'cooking', name: 'Cooking and food' }, { slug: 'fitness', name: 'Fitness and health' }, { slug: 'finance', name: 'Personal finance' },
  { slug: 'travel', name: 'Travel' }, { slug: 'education', name: 'Education and science' }, { slug: 'beauty', name: 'Beauty and style' },
  { slug: 'music', name: 'Music and audio' }, { slug: 'photo', name: 'Photo and film' }, { slug: 'outdoors', name: 'Outdoors' },
];
export const NICHE_SLUGS = NICHES.map((n) => n.slug);
export const nicheName = (slug: string) => NICHES.find((n) => n.slug === slug)?.name ?? slug;

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
export const COMPANY_SIZE_LABEL: Record<string, string> = {
  '1-10': '1 to 10', '11-50': '11 to 50', '51-200': '51 to 200', '201-1000': '201 to 1,000', '1000+': 'Over 1,000',
};

// The bands in the filter rail. The values are the page-address values (`target=1000-10000`, `budget=250-1000` in dollars)
// and the same bands are written in sql in sponsor_facets(): change both together.
export const TARGET_BANDS = [
  { value: '1000-10000', label: '1k to 10k' }, { value: '10000-50000', label: '10k to 50k' },
  { value: '50000-100000', label: '50k to 100k' }, { value: '100000-', label: '100k and above' },
];
export const BUDGET_BANDS = [
  { value: '0-250', label: 'Under $250' }, { value: '250-1000', label: '$250 to $1,000' },
  { value: '1000-5000', label: '$1,000 to $5,000' }, { value: '5000-', label: '$5,000 and above' },
];
export const COUNT_OPTIONS = [{ value: '1', label: '1 or more' }, { value: '3', label: '3 or more' }, { value: '5', label: '5 or more' }];
export const LAST_OPTIONS = [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '180', label: 'Last 180 days' }];

export const SORT_KEYS = ['name', 'count', 'last', 'budget', 'match'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
// "Best match for a creator" (sort=match&for=<creator id>) is parsed and passed to the database already; the
// Matching agent adds the option to this list (and the "For" creator picker) in wave 3.
export const SORT_OPTIONS: { value: Exclude<SortKey, 'match'>; label: string }[] = [
  { value: 'name', label: 'Name, A to Z' }, { value: 'count', label: 'Most creators sponsored' },
  { value: 'last', label: 'Most recent sponsorship' }, { value: 'budget', label: 'Budget, high to low' },
];

// Two-letter codes offered in the forms. Names come from Intl.DisplayNames (same on server and browser).
export const COUNTRY_CODES = [
  'US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'DE', 'FR', 'ES', 'IT', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'GR', 'RO', 'HU',
  'UA', 'TR', 'IL', 'AE', 'SA', 'EG', 'ZA', 'NG', 'KE', 'IN', 'PK', 'BD', 'SG', 'MY', 'ID', 'PH', 'TH', 'VN', 'HK', 'TW', 'KR', 'JP', 'CN',
  'MX', 'BR', 'AR', 'CL', 'CO', 'PE',
];
let names: Intl.DisplayNames | null = null;
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** One row of the list (what sponsors_list returns, without the total). */
export type SponsorRow = {
  id: string; name: string; website: string | null; industry: string | null; country: string | null; company_size: string | null;
  relationship: Relationship; target_niches: string[]; target_min_subs: number | null; target_max_subs: number | null;
  budget_min_cents: number | null; budget_max_cents: number | null; last_contacted_at: string | null;
  sponsorship_count: number; detected_sponsorship_count: number; last_sponsorship_at: string | null; last_detected_sponsorship_at: string | null;
  contact_count: number; deal_count: number; tag_ids: string[]; tag_names: string[]; eff_count: number; eff_last: string | null;
};

/** Counts beside the options: facet -> option value -> number of sponsors. */
export type FacetCounts = Record<string, Record<string, number>>;

export const FACET_KEYS = ['industry', 'niches', 'target', 'budget', 'active', 'count', 'last', 'rel', 'size', 'country', 'contact', 'tag'] as const;

// Deal stages as shown in a sponsor's Deals section (own copy so this page does not depend on the deals code).
export const DEAL_STAGE_LABEL: Record<string, string> = {
  matched: 'Matched', contacted: 'Contacted', replied: 'Replied', negotiating: 'Negotiating', signed: 'Signed', completed: 'Completed', paid: 'Paid',
};
