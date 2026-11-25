// Checks a pitch draft before it is saved: Claude's answer and the mock. Returns a short message, or null when it is fine.
// A draft that names a sponsor, date or number that is not in the facts it was given must never be saved.
// The general checks (length, placeholders, links, unsubscribe line) are the ones every draft gets (draftProblem).
import { draftProblem } from './validate';
import type { PitchFacts } from './pitch-types';

export const PITCH_BODY_WORD_LIMIT = 190; // the prompt asks for about 150

// Words that may start with a capital in the middle of a sentence without being a company or person.
const COMMON = new Set(['smallfold', 'youtube', 'i', 'hi', 'hello', 'dear', 'thanks', 'thank', 'best', 'warmly', 'regards', 'american']);
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

/** Capitalised words in the middle of a sentence that are not in the facts: likely an invented company or person. */
function unknownProperNouns(text: string, tokens: Set<string>): string[] {
  const out: string[] = [];
  const re = /[A-Z][A-Za-z0-9À-ɏ'’-]*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index).trimEnd();
    const last = before.slice(-1);
    const w = m[0].replace(/['’]s$/i, '').replace(/['’-]+$/, '').toLowerCase();
    if (before === '' || /[.!?:\n—–"“(\-*]/.test(last) || text.slice(before.length, m.index).includes('\n')) {
      // A sentence starts with a capital anyway. Two unknown capitalised words in a row ("Zentora Labs") are still a name.
      const next = /^[ \t]+([A-Z][A-Za-z0-9\u00C0-\u024F'’-]*)/.exec(text.slice(m.index + m[0].length));
      const nw = (next?.[1] ?? '').replace(/['’]s$/i, '').replace(/['’-]+$/, '').toLowerCase();
      if (next && !tokens.has(w) && !tokens.has(nw)) out.push(`${m[0]} ${next[1]}`);
      continue;
    }
    if (!tokens.has(w) && !/^i['’](m|d|ll|ve)$/.test(w)) out.push(m[0]);
  }
  return out;
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
  let rest = both;
  for (const n of [...names].sort((a, b) => b.length - a.length)) rest = rest.replace(new RegExp(esc(n), 'gi'), ' ');
  for (const k of opts.knownNames ?? []) {
    const name = k.trim();
    if (name.length < 3) continue;
    if (new RegExp(`(?<![A-Za-z0-9])${esc(name)}(?![A-Za-z0-9])`, 'i').test(rest)) return 'The draft names a sponsor that is not in the confirmed facts.';
  }
  const odd = unknownProperNouns(rest, tokens);
  if (odd.length) return `The draft names "${odd[0]}", which is not in the facts it was given.`;

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
  return null;
}
