// Validation for one creator (form and CSV rows). Everything arrives as text; the result is cleaned and typed.
import { z } from 'zod';
import { STATUSES, type CreatorStatus } from './constants';
import { parseChannelUrl, normalizeChannelUrl } from '../youtube/channel';
import { NICHE_SLUGS } from './profile-fields';

export const MAX_SUBSCRIBERS = 100_000_000;
export const MAX_AVG_VIEWS = 1_000_000_000;

export type CreatorInput = {
  full_name: string; email: string; phone: string | null; channel_url: string | null; niche: string | null;
  subscribers: number | null; status: CreatorStatus; notes: string | null;
  niche_slug: string | null; country: string | null; language: string | null; avg_views: number | null;
  engagement_rate: number | null; audience_countries: string | null; uploads_per_month: number | null;
};
export type CreatorField = 'name' | 'email' | 'phone' | 'channel_url' | 'niche' | 'subscribers' | 'status' | 'notes'
  | 'niche_slug' | 'country' | 'language' | 'avg_views' | 'engagement_rate' | 'audience_countries' | 'uploads_per_month';

/** "PT-br" and "pt_BR" become "pt-BR" (language in lower case, a 2-letter region in capitals). */
const normLanguage = (v: string) => {
  const m = /^([A-Za-z]{2,3})[-_]([A-Za-z]{2,4})$/.exec(v);
  if (!m) return v.toLowerCase();
  const r = m[2];
  return `${m[1].toLowerCase()}-${r.length === 2 ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1).toLowerCase()}`;
};
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

const schema = z.object({
  name: z.string().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  email: z.string().min(1, 'Email is required.').max(320, 'Email is too long.').pipe(z.email('Enter a valid email address.')),
  phone: z.string().max(30, 'Phone must be 30 characters or fewer.').regex(/^[0-9 +\-()[\]]*$/, 'Phone can only have digits, spaces, + - and brackets.'),
  channel_url: z.string().max(500, 'Channel link is too long.').refine((v) => v === '' || parseChannelUrl(v) !== null, 'Use a YouTube channel link like youtube.com/@name or youtube.com/channel/UC…'),
  niche: z.string().max(120, 'Niche must be 120 characters or fewer.'),
  subscribers: z.string().refine((v) => v === '' || (/^\d{1,9}$/.test(v) && Number(v) <= MAX_SUBSCRIBERS), 'Subscribers must be a whole number from 0 to 100,000,000.'),
  status: z.string().refine((v) => (STATUSES as readonly string[]).includes(v), 'Choose a valid status.'),
  notes: z.string().max(2000, 'Notes must be 2000 characters or fewer.'),
  // New optional fields (empty means "not known").
  niche_slug: z.string().refine((v) => v === '' || NICHE_SLUGS.includes(v), `Unknown niche. Use one of: ${NICHE_SLUGS.join(', ')}.`),
  country: z.string().refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'Country must be a 2-letter code such as US or GB.'),
  language: z.string().refine((v) => v === '' || /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v), 'Language must be a code such as en, es or pt-BR.'),
  avg_views: z.string().refine((v) => v === '' || (/^\d{1,10}$/.test(v) && Number(v) <= MAX_AVG_VIEWS), 'Average views must be a whole number from 0 to 1,000,000,000.'),
  engagement_rate: z.string().refine((v) => v === '' || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100), 'Engagement rate must be a percentage from 0 to 100, with up to 2 decimals.'),
  audience_countries: z.string().max(500, 'Audience countries must be 500 characters or fewer.'),
  uploads_per_month: z.string().refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 300), 'Uploads a month must be a whole number from 0 to 300.'),
});

export type Validation = { ok: true; data: CreatorInput } | { ok: false; errors: Partial<Record<CreatorField, string>> };

/** raw: name, email, phone, channel_url, niche, subscribers, status, notes and the optional niche_slug, country, language,
 *  avg_views, engagement_rate, audience_countries, uploads_per_month (text or missing). Empty status becomes "new". */
export function validateCreator(raw: Partial<Record<CreatorField, unknown>>): Validation {
  const subs = text(raw.subscribers).replace(/[,\s]/g, '');
  const input = {
    name: text(raw.name), email: text(raw.email), phone: text(raw.phone), channel_url: text(raw.channel_url),
    niche: text(raw.niche), subscribers: subs, status: text(raw.status).toLowerCase() || 'new', notes: text(raw.notes),
    niche_slug: text(raw.niche_slug).toLowerCase(), country: text(raw.country).toUpperCase(), language: normLanguage(text(raw.language)),
    avg_views: text(raw.avg_views).replace(/[,\s]/g, ''), engagement_rate: text(raw.engagement_rate).replace(/%$/, '').trim(),
    audience_countries: text(raw.audience_countries), uploads_per_month: text(raw.uploads_per_month).replace(/[,\s]/g, ''),
  };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<Record<CreatorField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as CreatorField;
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;
  return {
    ok: true,
    data: {
      full_name: d.name, email: d.email, phone: d.phone || null,
      channel_url: d.channel_url ? normalizeChannelUrl(d.channel_url) : null,
      niche: d.niche || null, subscribers: d.subscribers === '' ? null : Number(d.subscribers),
      status: d.status as CreatorStatus, notes: d.notes || null,
      niche_slug: d.niche_slug || null, country: d.country || null,
      language: d.language || null,
      avg_views: d.avg_views === '' ? null : Number(d.avg_views), engagement_rate: d.engagement_rate === '' ? null : Number(d.engagement_rate),
      audience_countries: d.audience_countries || null, uploads_per_month: d.uploads_per_month === '' ? null : Number(d.uploads_per_month),
    },
  };
}
