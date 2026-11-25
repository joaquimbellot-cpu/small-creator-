// Fixed lists behind the creator form, the CSV import and the profile. The niche list mirrors the `niches` table (12 rows,
// seeded by the migration); it is repeated here so the client form needs no query. Keep the two in step.
export const NICHES = [
  { slug: 'tech', name: 'Tech and gadgets' },
  { slug: 'gaming', name: 'Gaming' },
  { slug: 'diy', name: 'Woodworking and DIY' },
  { slug: 'cooking', name: 'Cooking and food' },
  { slug: 'fitness', name: 'Fitness and health' },
  { slug: 'finance', name: 'Personal finance' },
  { slug: 'travel', name: 'Travel' },
  { slug: 'education', name: 'Education and science' },
  { slug: 'beauty', name: 'Beauty and style' },
  { slug: 'music', name: 'Music and audio' },
  { slug: 'photo', name: 'Photo and film' },
  { slug: 'outdoors', name: 'Outdoors' },
] as const;
export const NICHE_SLUGS: readonly string[] = NICHES.map((n) => n.slug);
export const nicheName = (slug: string | null | undefined): string | null => NICHES.find((n) => n.slug === slug)?.name ?? null;

// A short list for the form; "Other" lets the person type any 2-letter code.
export const COUNTRIES = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'NZ', name: 'New Zealand' }, { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' }, { code: 'SE', name: 'Sweden' }, { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' }, { code: 'IN', name: 'India' }, { code: 'JP', name: 'Japan' },
] as const;
const EXTRA_COUNTRY_NAMES: Record<string, string> = {};
export const countryName = (code: string | null | undefined): string | null =>
  code ? COUNTRIES.find((c) => c.code === code)?.name ?? EXTRA_COUNTRY_NAMES[code] ?? code : null;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', nl: 'Dutch', sv: 'Swedish', hi: 'Hindi', ja: 'Japanese',
};
export const languageName = (code: string | null | undefined): string | null => (code ? LANGUAGE_NAMES[code.split('-')[0]] ? `${LANGUAGE_NAMES[code.split('-')[0]]}${code.includes('-') ? ` (${code})` : ''}` : code : null);
