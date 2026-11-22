// Validation for the public Apply and Contact forms (zod 4). Every field is trimmed and capped.
// Both schemas ignore fields they do not know (`_subject`, `_gotcha` are handled by the route).
import { z } from 'zod';
import { validateCreator } from '@/lib/creators/schema';

const name = z.string().trim().min(1).max(200);
const email = z.string().trim().max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

// The Apply form creates a creator, so what is stored follows the same validateCreator as the staff form and
// CSV import: whatever comes in here can always be edited later. The website accepts a little more than that
// (a bare @handle, a phone with dots, a long answer about the channel), and a real applicant must never see
// "did not send" for that. So the text is fitted, not refused: a short niche with the full answer in the notes,
// a bare @handle turned into a link, and anything that still does not fit (a non-channel YouTube link, an odd
// phone) kept in the notes instead of its column, so only a real channel link is ever shown as a link.
// "12,500", "12 500", "12.500" and "12500" are all fine for subscribers.
const applicationRaw = z.object({
  name: z.string().trim().min(1).max(300),
  email,
  phone: z.string().trim().max(100).optional(),
  channel: z.string().trim().min(1).max(500),
  topic: z.string().trim().min(1).max(2000),
  subscribers: z.string().trim().min(1).max(20),
});

const NICHE_MAX = 120;

/** The first part of the answer, cut at a word, at most NICHE_MAX characters. */
function shortNiche(topic: string): string {
  const one = topic.replace(/\s+/g, ' ');
  if (one.length <= NICHE_MAX) return one;
  const cut = one.slice(0, NICHE_MAX - 1);
  return (cut.replace(/\s+\S*$/, '') || cut) + '…';
}

export const applicationSchema = applicationRaw.transform((v, ctx) => {
  const subscribers = /^\d{1,3}(?:\.\d{3})+$/.test(v.subscribers) ? v.subscribers.replace(/\./g, '') : v.subscribers;
  const channel = /^@[^\s/]+$/.test(v.channel) ? `https://www.youtube.com/${v.channel}` : v.channel;
  const phone = v.phone ? v.phone.replace(/[./]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const niche = shortNiche(v.topic);
  const base = { name: v.name.slice(0, 120), email: v.email, niche, subscribers };

  const notes: string[] = [];
  if (niche !== v.topic.replace(/\s+/g, ' ')) notes.push(`About the channel (from the website): ${v.topic}`);

  // Each optional part is kept only if it passes on its own; otherwise it goes into the notes.
  const fits = (extra: Record<string, string>) => validateCreator({ ...base, ...extra }).ok;
  const channelOk = fits({ channel_url: channel });
  if (!channelOk) notes.push(`Channel link given on the website (not a channel link): ${v.channel}`);
  const phoneOk = phone !== '' && fits({ phone });
  if (phone !== '' && !phoneOk) notes.push(`Phone given on the website: ${v.phone}`);

  const r = validateCreator({ ...base, channel_url: channelOk ? channel : '', phone: phoneOk ? phone : '' });
  if (!r.ok || r.data.subscribers === null) {
    ctx.issues.push({ code: 'custom', message: 'invalid', input: v });
    return z.NEVER;
  }
  const d = r.data;
  return {
    name: d.full_name, email: d.email, phone: d.phone ?? null, channel: d.channel_url, niche: d.niche,
    notes: notes.length ? notes.join('\n').slice(0, 2000) : null, subscribers: d.subscribers,
  };
});

// The website's brand inquiry form: company, promote, budget, name, email, phone (optional).
export const contactSchema = z.object({
  company: z.string().trim().min(1).max(200),
  promote: z.string().trim().min(1).max(2000),
  budget: z.string().trim().min(1).max(100),
  name,
  email,
  phone: optional(50),
});

export const messageIdSchema = z.guid();
export const filterSchema = z.enum(['open', 'handled', 'all']);
export type Filter = z.infer<typeof filterSchema>;
