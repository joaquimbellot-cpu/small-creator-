// Shared by the facts builder (cleans stored text before it reaches Claude) and the validator (checks Claude's answer).
// Text that strangers or third parties control (public Apply form, YouTube, CSV imports) is data, never instructions.
import { cleanText } from '../assistant/untrusted';

// Control, zero-width and bidirectional characters: they can hide text or fake a line break.
// eslint-disable-next-line no-control-regex -- the point is to match control characters
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

/** One clean line: no control or hidden characters, no angle brackets, whitespace collapsed, cut to `max`. */
export function scrub(v: string | null | undefined, max = 80): string {
  return cleanText((v ?? '').replace(HIDDEN, ' '), max);
}

export const LINK_RE = /(?:https?:\/\/|www\.|mailto:|ftp:\/\/)/i;
// A bare domain such as "example.com" or "shop.example.io" (the last part is a known ending or any two letters).
export const DOMAIN_RE = /(?<![A-Za-z0-9-])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|io|co|app|dev|ai|me|xyz|info|biz|shop|store|online|site|tv|[a-z]{2})(?![A-Za-z0-9-])/i;
const PHONE_RE = /(?<![\w.])\+?\(?\d[\d\s().-]{5,}\d(?!\w)/g;

/** A phone-like number: a "+" or separators with at least 7 digits, or 10 or more digits in a row. */
export function hasPhone(text: string): boolean {
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, '').length;
    const plain = /^\d+$/.test(m[0]);
    if (digits >= 10 || (digits >= 7 && !plain)) return true;
  }
  return false;
}

export const hasEmail = (t: string) => t.includes('@');
export const hasLink = (t: string) => LINK_RE.test(t);
export const hasDomain = (t: string) => DOMAIN_RE.test(t);

// Words that read as an order to the writer. Stored names and niches never need them.
const INSTRUCTION_RE = new RegExp(
  [
    String.raw`\b(?:ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(?:instructions?|rules?|prompts?|previous|above|earlier|all)\b`,
    String.raw`\b(?:system|developer)\s+(?:prompt|message|instructions?)\b`,
    String.raw`\b(?:new|updated)\s+instructions?\b`,
    String.raw`\byou\s+(?:must|should|are\s+now|will)\b`,
    String.raw`\b(?:pretend|act\s+as|roleplay|jailbreak)\b`,
    String.raw`\b(?:tell|ask|have)\s+(?:them|the\s+(?:creator|sponsor|reader|contact))\b`,
    String.raw`\b(?:reply|respond|write|send|email|contact|visit|click|call|text|dm)\s+(?:to|at|me|us|them|this|here)\b`,
    String.raw`\b(?:instead|rather)\b[^.]{0,20}\b(?:write|say|mention|include)\b`,
  ].join('|'),
  'i',
);
export const looksLikeInstruction = (t: string) => INSTRUCTION_RE.test(t);

/** Why a stored value must not reach the prompt, or null when it is fine. Links are not allowed anywhere but the channel link. */
export function unsafeReason(v: string): string | null {
  if (hasEmail(v)) return 'an email address';
  if (hasLink(v) || hasDomain(v)) return 'a web address';
  if (hasPhone(v)) return 'a phone number';
  if (looksLikeInstruction(v)) return 'wording that reads as an instruction';
  return null;
}

/** A name or short phrase for the prompt: cleaned, and null when it is empty or unsafe. */
export function safeText(v: string | null | undefined, max = 80): string | null {
  const t = scrub(v, max);
  return t && !unsafeReason(t) ? t : null;
}

/** A channel link: http(s), no credentials, no spaces, at most 200 characters. Anything else is dropped. */
export function safeChannelUrl(v: string | null | undefined): string | null {
  const t = scrub(v, 200);
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return t;
  } catch {
    return null;
  }
}

/** A first name: letters, apostrophes and hyphens only, at most 40 characters. */
export function safeFirstName(full: string | null | undefined): string {
  const word = scrub(full, 120).split(' ')[0] ?? '';
  return word.replace(/[^\p{L}'’-]/gu, '').slice(0, 40);
}

/** Free-text niche (used only when there is no niche from the fixed list). */
export function safeNiche(v: string | null | undefined): string | null {
  const t = scrub(v, 40);
  return /^[\p{L}\p{N} &/-]{1,40}$/u.test(t) && !unsafeReason(t) ? t : null;
}
