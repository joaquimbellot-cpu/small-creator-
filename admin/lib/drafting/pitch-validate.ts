// Checks a pitch draft before it is saved: Claude's answer and the mock. Returns a short message, or null when it is fine.
// A draft that names a sponsor, date or number that is not in the facts it was given must never be saved.
// The general checks (length, placeholders, links, unsubscribe line) are the ones every draft gets (draftProblem).
import { COMMON_WORDS } from './common-words';
import { invitedNameAfterCue, moneyProblem, promiseProblem, wordNumberProblem } from './pitch-claims';
import { hasDomain, hasEmail, hasLink, hasPhone, readable } from './pitch-safety';
import { draftProblem } from './validate';
import type { PitchFacts } from './pitch-types';

export const PITCH_BODY_WORD_LIMIT = 190; // the prompt asks for about 150

// Words that may start with a capital in the middle of a sentence without being a company or person.
const COMMON = new Set([
  'smallfold', 'youtube', 'i', 'hi', 'hello', 'dear', 'thanks', 'thank', 'best', 'warmly', 'regards', 'american', 'hey', 'cheers', 'kind',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);
const MONTH = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s: string | null | undefined) => (s ?? '').split(/[^A-Za-z0-9À-ɏ]+/).filter(Boolean).map((w) => w.toLowerCase());

/** Every name that is allowed to appear in the draft, whole (for names) and as words (for the capital-letter check). */
function allowed(f: PitchFacts) {
  const names = [f.sponsor.name, f.creator.channelName, ...f.pastSponsors.map((p) => p.name)].filter((n): n is string => !!n && n.trim().length > 0);
  const tokens = new Set<string>(COMMON);
  for (const n of [...names, f.creator.firstName, f.contactFirstName, f.creator.niche, f.sponsor.industry, ...f.sponsor.targetNiches, ...f.pastSponsors.map((p) => p.month)]) {
    for (const w of words(n)) tokens.add(w);
  }
  return { names, tokens };
}

function allowedNumbers(f: PitchFacts): number[] {
  const n: number[] = [1000, 50000, 2, f.similarChannels, f.pastSponsors.length];
  for (const v of [f.creator.subscribers, f.creator.avgViews, f.sponsor.targetMinSubs, f.sponsor.targetMaxSubs]) if (v !== null) n.push(v);
  for (const p of f.pastSponsors) { const y = /\d{4}/.exec(p.month); if (y) n.push(Number(y[0])); }
  return n;
}

function numberOk(raw: string, ok: number[]): boolean {
  const m = /^(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?$/.exec(raw.trim());
  if (!m) return false;
  const base = Number(m[1].replace(/,/g, ''));
  if (Number.isNaN(base)) return false;
  const abbreviated = !!m[2];
  const v = base * (abbreviated ? (m[2].toLowerCase() === 'k' ? 1000 : 1_000_000) : 1);
  // "4.2k" for 4,213 is a fair way of saying the same fact; "4,250" for 4,213 is not.
  return ok.some((a) => (abbreviated ? Math.abs(v - a) <= a * 0.05 : v === a));
}

const CAP = 'A-ZÀ-ÖØ-Þ';
const WORD = `[${CAP}][A-Za-z0-9À-ɏ'’-]*`;
const norm = (w: string) => w.replace(/['’]s$/i, '').replace(/['’-]+$/, '').replace(/’/g, "'").toLowerCase();

/** An ordinary English word (see common-words.ts). A contraction is judged by the part before the apostrophe: "we're" -> "we". */
const ordinary = (w0: string): boolean => {
  const w = w0.replace(/’/g, "'");
  if (COMMON_WORDS.has(w) || COMMON_WORDS.has(w.split("'")[0]) || COMMON_WORDS.has(w.replace(/'/g, ''))) return true;
  // plural and simple endings: "details" -> "detail", "stories" -> "story", "noted" -> "note", "starting" -> "start", "clearly" -> "clear"
  const stems = [w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y'), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ly$/, ''), w.replace(/er$/, ''), w.replace(/ers$/, '')];
  return stems.some((x) => x.length >= 3 && x !== w && COMMON_WORDS.has(x));
};

/**
 * Capitalised words that are not in the facts: a likely invented company or person.
 * Mid-sentence, any capitalised word that is not allowed is suspect. At the start of a sentence or a subject a capital is normal,
 * so the word is fine when it is an ordinary English word (a list of about 1,900, common-words.ts), a word from the facts, or a
 * word the draft also writes in lower case; anything else (an invented one-word brand such as "Zentora has ...") is suspect.
 * In the subject a capitalised ordinary word is fine anywhere (Title Case). A capital that follows a letter or digit ("1M") is a suffix.
 */
function unknownProperNouns(text: string, tokens: Set<string>, lowerSeen: Set<string>, isSubject: boolean): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?<![A-Za-z0-9À-ɏ'’])${WORD}`, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index).trimEnd();
    const gap = text.slice(before.length, m.index);
    const last = before.slice(-1);
    const w = norm(m[0]);
    if (tokens.has(w) || /^i'(m|d|ll|ve)$/.test(w)) continue;
    const starts = before === '' || /[.!?:\n—–"“(*]/.test(last) || gap.includes('\n') || (last === '-' && /(^|\s)$/.test(before.slice(0, -1)));
    if (!starts) {
      if (isSubject && ordinary(w)) continue;
      out.push(m[0]);
      continue;
    }
    if (ordinary(w) || lowerSeen.has(w)) continue;
    const next = new RegExp(`^[ \\t]+(${WORD})`).exec(text.slice(m.index + m[0].length));
    const nw = next ? norm(next[1]) : '';
    out.push(next && !tokens.has(nw) && !ordinary(nw) ? `${m[0]} ${next[1]}` : m[0]);
  }
  return out;
}

/** Takes the channel link (with or without https:// and www., with or without a closing slash) out of the text. */
function withoutChannelLink(text: string, url: string | null): string {
  const key = (url ?? '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  if (!key) return text;
  return text.replace(new RegExp(`(?:https?://)?(?:www\\.)?${esc(key)}/*`, 'gi'), ' ');
}

export function pitchProblem(
  d: { subject?: unknown; body?: unknown },
  f: PitchFacts,
  opts: { knownNames?: string[] } = {},
): string | null {
  const general = draftProblem(d, { allowedUrls: [f.creator.channelUrl] });
  if (general) return general;
  const subject = String(d.subject).trim();
  const body = String(d.body).trim();
  const both = `${subject}\n${body}`;

  // Whole-draft checks, before any name is taken out: a hostile value that Claude copies word for word is examined here.
  // The one allowed link is the channel link given in the facts.
  // The text is also read the way a person reads it: "(at)", "[dot]", full-width characters and hidden characters are folded first.
  const scan = withoutChannelLink(both, f.creator.channelUrl);
  if (hasEmail(scan)) return 'The draft contains an email address. A pitch never includes one.';
  if (hasLink(scan) || hasDomain(scan)) return 'The draft contains a web address. Only the creator\u2019s own channel link is allowed.';
  if (hasPhone(scan)) return 'The draft contains a phone number. A pitch never includes one.';

  if (body.split(/\s+/).length > PITCH_BODY_WORD_LIMIT) return `The body is longer than ${PITCH_BODY_WORD_LIMIT} words.`;
  // Money: no amount in any currency, and no talk of prices, budgets or commission.
  if (/[$£€¥]\s?\d/.test(both) || /\d\s?(?:USD|AUD|CAD|EUR|GBP|dollars?|euros?|pounds?|bucks)\b/i.test(both)
      || /\b(?:commission|budget|pricing|prices?)\b/i.test(both)) {
    return 'The draft mentions a price, budget or commission. A pitch states no amounts.';
  }

  // The greeting: the right first name, and no other person.
  const firstLine = body.split('\n')[0];
  const expected = f.direction === 'to_creator' ? f.creator.firstName : f.contactFirstName;
  if (expected && !new RegExp(`\\b${esc(expected)}\\b`, 'i').test(firstLine)) return `The draft does not greet ${expected} by first name.`;

  // Names: every company or person in the draft is one we gave. Remove the allowed names first (a known name may sit
  // inside an allowed one), then look for any other known sponsor name, then for unexplained capitalised names.
  const { names, tokens } = allowed(f);
  const sortedNames = [...names].sort((a, b) => b.length - a.length);
  const strip = (t: string) => sortedNames.reduce((r, n) => r.replace(new RegExp(`(?<![A-Za-z0-9À-ɏ])${esc(n.trim())}(?![A-Za-z0-9À-ɏ])`, 'gi'), ' '), t);
  const restSubject = strip(subject);
  const restBody = strip(body);
  const rest = `${restSubject}\n${restBody}`;
  for (const k of opts.knownNames ?? []) {
    const name = k.trim();
    if (name.length < 3) continue;
    if (new RegExp(`(?<![A-Za-z0-9])${esc(name)}(?![A-Za-z0-9])`, 'i').test(rest)) return 'The draft names a sponsor that is not in the confirmed facts.';
  }
  const lowerSeen = new Set((rest.match(/(?<![A-Za-z0-9À-ɏ])[a-zà-ÿ][a-zà-ÿ'’-]*/g) ?? []).map(norm));
  const odd = [...unknownProperNouns(restSubject, tokens, lowerSeen, true), ...unknownProperNouns(restBody, tokens, lowerSeen, false)];
  if (odd.length) return `The draft names "${odd[0]}", which is not in the facts it was given.`;
  const lowerName = invitedNameAfterCue(rest, tokens);
  if (lowerName) return `The draft names "${lowerName}", which is not in the facts it was given.`;

  // Amounts and shares written in words or symbols, percentages of earnings.
  const readableRest = readable(rest);
  const money = moneyProblem(readableRest);
  if (money) return money;

  // Talk of fees, pay or earnings is a money promise too (checked after the names so an invented sponsor is named first).
  if (/\b(?:fees?|rates?|pay|pays|paid|paying|payments?|payouts?|earn(?:s|ed|ing|ings)?|revenue)\b/i.test(rest)) {
    return 'The draft talks about fees, pay or earnings. A pitch states no money terms.';
  }

  // Dates and numbers: only those in the facts.
  const forNumbers = rest.replace(/(?:https?:\/\/|www\.)\S+/gi, ' ');
  const ok = allowedNumbers(f);
  const months = new Set(f.pastSponsors.map((p) => p.month.slice(0, 3).toLowerCase()));
  for (const m of both.matchAll(MONTH)) {
    // "may" and "march" are also ordinary words: only a capital letter makes a month name a date
    if (m[0][0] !== m[0][0].toUpperCase()) continue;
    if (!months.has(m[0].slice(0, 3).toLowerCase())) return `The draft names a month (${m[0]}) that is not in the facts it was given.`;
  }
  for (const m of forNumbers.matchAll(/\d[\d,]*(?:\.\d+)?\s?[kKmM]?(?![A-Za-z])/g)) {
    const raw = m[0].replace(/,+$/, '');
    if (!numberOk(raw, ok)) return `The draft states a number (${raw.trim()}) that is not in the facts it was given.`;
  }
  const inWords = wordNumberProblem(rest, ok);
  if (inWords) return inWords;

  // Promises last, so that an invented number or name is reported first.
  return promiseProblem(rest);
}
