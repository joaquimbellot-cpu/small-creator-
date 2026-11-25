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

export const LINK_RE = /(?:h[tx]{2}ps?\s*:\s*\/\/|\bwww\b|mailto:|ftp:\/\/)/i;
// A bare domain: labels joined by dots, ending in ANY letters-first label of 2 or more characters ("example.com", "samplays.club",
// "shop.attacker.test", "x.museum"). No list of endings, so a new ending cannot slip through. Single letters ("e.g.", "i.e.", "U.S.")
// and numbers ("4.2k", "v2.0") are not domains, because the last label must start with a letter and be 2 characters or more.
export const DOMAIN_RE = /(?<![A-Za-z0-9@-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9](?![A-Za-z0-9-])/i;
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

const HIDDEN_ALL = new RegExp(HIDDEN.source, 'g');

/**
 * The text as a reader would see it: look-alike characters folded (full-width "＠" and "．"), hidden characters removed,
 * "(at)" "[dot]" "{.}" written back as "@" and ".", a space in front of a dot closed up ("samplays . club").
 */
export function readable(text: string): string {
  return text
    .normalize('NFKC')
    .replace(HIDDEN_ALL, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''))
    .replace(/\s*[([{<]\s*(?:\.|dot)\s*[)\]}>]\s*/gi, '.')
    .replace(/\s*[([{<]\s*(?:@|at)\s*[)\]}>]\s*/gi, '@')
    .replace(/[\u2024\u2027\u3002\uff61\ufe52\u00b7\u2219]/g, '.')
    .replace(/([A-Za-z0-9])\s+\.\s*(?=[a-z]{2})/g, '$1.');
}

/** True when the text spells an address out in words ("sam at samplays dot com", "samplays DOT club", "write to sam at gmail"). */
export function hasSpelledAddress(text: string): boolean {
  const t = readable(text);
  if (/\bDOT\b/.test(t)) return true;
  if (/\bat\b[^.\n]{1,60}\bdot\b|\b(?:gmail|googlemail|hotmail|yahoo|icloud|protonmail|aol)\b|\bat\s+outlook\b/i.test(t)) return true;
  // lower-case "samplays dot club": a pitch never needs the word "dot" (only "polka dot" is left alone)
  for (const m of t.matchAll(/\b([a-z0-9-]+) dot ([a-z]{2,10})\b/g)) if (m[1] !== 'polka') return true;
  return false;
}

export const hasEmail = (t: string) => readable(t).includes('@') || hasSpelledAddress(t);
export const hasLink = (t: string) => LINK_RE.test(readable(t));
export const hasDomain = (t: string) => DOMAIN_RE.test(readable(t));

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
