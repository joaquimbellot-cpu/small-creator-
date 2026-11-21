// Validation for one creator (form and CSV rows). Everything arrives as text; the result is cleaned and typed.
import { z } from 'zod';
import { STATUSES, type CreatorStatus } from './constants';
import { parseChannelUrl, normalizeChannelUrl } from '../youtube/channel';

export const MAX_SUBSCRIBERS = 100_000_000;

export type CreatorInput = {
  full_name: string; email: string; phone: string | null; channel_url: string | null; niche: string | null;
  subscribers: number | null; status: CreatorStatus; notes: string | null;
};
export type CreatorField = 'name' | 'email' | 'phone' | 'channel_url' | 'niche' | 'subscribers' | 'status' | 'notes';

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
});

export type Validation = { ok: true; data: CreatorInput } | { ok: false; errors: Partial<Record<CreatorField, string>> };

/** raw: name, email, phone, channel_url, niche, subscribers, status, notes (text or missing). Empty status becomes "new". */
export function validateCreator(raw: Partial<Record<CreatorField, unknown>>): Validation {
  const subs = text(raw.subscribers).replace(/[,\s]/g, '');
  const input = {
    name: text(raw.name), email: text(raw.email), phone: text(raw.phone), channel_url: text(raw.channel_url),
    niche: text(raw.niche), subscribers: subs, status: text(raw.status).toLowerCase() || 'new', notes: text(raw.notes),
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
    },
  };
}
