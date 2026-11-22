// Validation for the public Apply and Contact forms (zod 4). Every field is trimmed and capped.
// Both schemas ignore fields they do not know (`_subject`, `_gotcha` are handled by the route).
import { z } from 'zod';
import { validateCreator } from '@/lib/creators/schema';

const name = z.string().trim().min(1).max(200);
const email = z.string().trim().max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

// The Apply form creates a creator, so name, phone, niche, subscribers and the channel link go through the same
// validateCreator as the staff form and CSV import: whatever comes in here can always be edited later.
// "12,500", "12 500", "12.500" and "12500" are all fine for subscribers.
const applicationRaw = z.object({
  name: z.string().trim().min(1),
  email,
  phone: z.string().trim().optional(),
  channel: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  subscribers: z.string().trim().min(1).max(20),
});

export const applicationSchema = applicationRaw.transform((v, ctx) => {
  const subscribers = /^\d{1,3}(?:\.\d{3})+$/.test(v.subscribers) ? v.subscribers.replace(/\./g, '') : v.subscribers;
  const r = validateCreator({ name: v.name, email: v.email, phone: v.phone, channel_url: v.channel, niche: v.topic, subscribers });
  if (!r.ok || !r.data.channel_url || r.data.subscribers === null) {
    ctx.issues.push({ code: 'custom', message: 'invalid', input: v });
    return z.NEVER;
  }
  const d = r.data;
  return { name: d.full_name, email: d.email, phone: d.phone ?? undefined, channel: d.channel_url, topic: d.niche ?? v.topic, subscribers: d.subscribers };
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
