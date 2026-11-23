// Checks a draft before it is saved. Used for Claude's output, mock output and manual edits.
import type { Draft } from './types';

export const MAX_SUBJECT = 120;
export const MAX_BODY = 4000;
export const PLACEHOLDERS = ['first_name', 'channel_name', 'niche', 'subscribers'] as const;

export const MAX_WORDS = 220; // the prompt asks for under 200

// Amounts the prompt itself allows (the commission steps: under $500, $500 to $1,999, $2,000 or more).
const ALLOWED_AMOUNTS = new Set(['500', '1999', '1,999', '2000', '2,000']);

const urlKey = (u: string) => u.trim().replace(/[).,;:!?'"]+$/, '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();

/**
 * Returns an error message, or null when the draft is fine. Used for Claude's output, mock output, template drafts and manual edits.
 * `allowedUrls`: links the body may contain (the creator's own channel link). Any other link is refused.
 */
export function draftProblem(d: { subject?: unknown; body?: unknown }, opts: { allowedUrls?: (string | null | undefined)[] } = {}): string | null {
  if (typeof d.subject !== 'string' || typeof d.body !== 'string') return 'The draft has no subject or body.';
  const subject = d.subject.trim();
  const body = d.body.trim();
  if (!subject) return 'The subject is empty.';
  if (!body) return 'The body is empty.';
  // A line break in a subject could be read as an extra email header.
  if (/[\r\n]/.test(subject)) return 'The subject must be on one line.';
  if (subject.length > MAX_SUBJECT) return `The subject is longer than ${MAX_SUBJECT} characters.`;
  if (body.length > MAX_BODY) return `The body is longer than ${MAX_BODY} characters.`;
  if (subject.includes('{{') || body.includes('{{')) return 'The draft still contains a {{placeholder}}.';
  const both = `${subject}\n${body}`;
  if (/\[[^\]\n]+\]|<[^>\n]+>|%\w+%/.test(both)) return 'The draft still contains a placeholder such as [Name] or <name>, or HTML.';
  const allowed = new Set((opts.allowedUrls ?? []).filter((u): u is string => !!u).map(urlKey));
  for (const m of both.match(/(?:https?:\/\/|www\.|mailto:)\S+/gi) ?? []) {
    if (!allowed.has(urlKey(m))) return 'The draft contains a link. Only the creator\u2019s own channel link is allowed.';
  }
  for (const m of both.matchAll(/[$\u00a3\u20ac]\s?(\d[\d,]*)(?:\.\d+)?/g)) {
    if (!ALLOWED_AMOUNTS.has(m[1])) return 'The draft names a price or amount. Smallfold does not promise amounts in a first email.';
  }
  if (/\d\s?(?:USD|AUD|EUR|GBP|dollars)\b/i.test(both)) return 'The draft names a price or amount. Smallfold does not promise amounts in a first email.';
  if (/unsubscribe/i.test(both) || /^\s*(?:--|\u2014\u2014)/m.test(body)) return 'The draft has an unsubscribe line or a signature. The server adds those.';
  if (body.split(/\s+/).length > MAX_WORDS) return `The body is longer than ${MAX_WORDS} words.`;
  return null;
}

export function cleanDraft(d: Draft): Draft {
  return { subject: d.subject.replace(/\s+/g, ' ').trim(), body: d.body.trim() };
}
