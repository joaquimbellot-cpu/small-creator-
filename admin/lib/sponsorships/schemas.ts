// Input rules for the sponsorship actions. Pure (no server code), so the browser form and the tests use the same rules.
import { z } from 'zod';

export const VIDEO_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
const VIDEO_MESSAGE = 'Use a link that starts with https:// and is on youtube.com or youtu.be.';

/** Returns the cleaned link, '' when empty, or null when it is not an https YouTube link. */
export function cleanVideoUrl(raw: string): string | null {
  const v = raw.trim();
  if (v === '') return '';
  if (v.length > 500) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !VIDEO_HOSTS.includes(u.hostname.toLowerCase())) return null;
  return u.toString();
}

/** Today as YYYY-MM-DD in UTC. */
export const todayUtc = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/** A real calendar date typed as YYYY-MM-DD. */
export function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * The date of a video cannot be in the future. People in time zones ahead of UTC see "tomorrow" for part of their day,
 * so one day of slack is allowed on the server (the form's own limit is the person's local date).
 */
export function isFutureDate(v: string, now: Date = new Date()): boolean {
  const limit = new Date(`${todayUtc(now)}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 1);
  return new Date(`${v}T00:00:00Z`).getTime() > limit.getTime();
}

const uuid = z.guid('That record could not be found. Refresh the page.');
const optionalText = (max: number, what: string) => z.string().trim().max(max, `${what} must be ${max} characters or fewer.`).optional().default('');

/** Add or edit. brandId (an existing sponsor) or brandName (typed; created when new). `now` is only for tests. */
export function recordSchema(now: Date = new Date()) {
  return z.object({
    id: uuid.optional(),
    creatorId: uuid,
    brandId: uuid.nullish(),
    brandName: optionalText(200, 'The sponsor name'),
    /** True only when the person pressed "Add <name> as a new sponsor". Without it a typed name that matches no sponsor is refused. */
    createBrand: z.boolean().optional().default(false),
    date: z.string().trim().min(1, 'Pick the date of the video.')
      .refine(isRealDate, 'Enter the date as day, month and year.')
      .refine((v) => !isRealDate(v) || !isFutureDate(v, now), 'The date cannot be in the future.'),
    videoTitle: optionalText(300, 'The video title'),
    videoUrl: z.string().trim().optional().default('').refine((v) => cleanVideoUrl(v) !== null, VIDEO_MESSAGE),
    note: optionalText(2000, 'The note'),
  });
}
export type RecordInput = z.infer<ReturnType<typeof recordSchema>>;

export const confirmSchema = z.object({
  id: uuid,
  note: z.string().trim().min(1, 'Say how you checked it.').max(2000, 'The note must be 2000 characters or fewer.'),
});
export const idSchema = z.object({ id: uuid });
export const sideSchema = z.enum(['creator', 'brand']);

/** First error message of a failed parse, in plain words. */
export const firstError = (e: z.ZodError): string => e.issues[0]?.message ?? 'Check the form and try again.';
