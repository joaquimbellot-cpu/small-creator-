// Checks a draft before it is saved. Used for Claude's output, mock output and manual edits.
import type { Draft } from './types';

export const MAX_SUBJECT = 120;
export const MAX_BODY = 4000;
export const PLACEHOLDERS = ['first_name', 'channel_name', 'niche', 'subscribers'] as const;

/** Returns an error message, or null when the draft is fine. */
export function draftProblem(d: { subject?: unknown; body?: unknown }): string | null {
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
  return null;
}

export function cleanDraft(d: Draft): Draft {
  return { subject: d.subject.replace(/\s+/g, ' ').trim(), body: d.body.trim() };
}
