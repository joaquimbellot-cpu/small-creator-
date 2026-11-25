// Checks a pitch draft before it is saved: Claude's answer and the mock. Returns a short message, or null when it is fine.
// A draft that names a sponsor, date or number that is not in the facts it was given must never be saved.
// The general checks (length, placeholders, links, unsubscribe line) are the ones every draft gets (draftProblem).
import { hasDomain, hasEmail, hasLink, hasPhone } from './pitch-safety';
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
// Ordinary words that may begin a sentence. Any other capitalised word at the start of a sentence must be a name from the facts
// (or a word the draft also uses in lower case): an invented one-word brand is caught there.
const STARTERS = new Set((
  'a about above after again all also although always an and another any are as at because been before being both but by can could did do does each either even every few for from had has have he her here his how however if in instead into is it its just let like looking made many may might more most much must my no not now of on once one only or other our out over please quick quite rather really see she should since so some such than that the their them then there these they this those though three through thus to too two under until up us very want was we well were what when where whether which while who whom whose why will with without would yes yet you your ' +
  'happy hope hoping glad great good excited note thank thanks hi hello dear best warmly regards cheers kind sincerely ' +
  'reply replying write send share tell ask give get take make join joining match matching matched matches pick picked choose chosen know knowing think think thinking suggest suggested sponsors sponsor sponsored sponsorship sponsorships channels channel creators creator videos video viewers audience audiences brands brand partners partner partnership deals deal team people person ' +
  'if smallfold youtube free final today tomorrow soon next first second third last recent recently currently already often usually sometimes still ' +
  'based given having works working worked looks looked found finding feel feels fits fit suits suit might maybe perhaps possibly together ' +
  'it\'s that\'s we\'re we\'ll we\'ve you\'re you\'ll you\'ve they\'re there\'s here\'s i\'m i\'d i\'ll i\'ve don\'t doesn\'t didn\'t won\'t can\'t'
).split(/\s+/));
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

/**
 * Capitalised words that are not in the facts: a likely invented company or person.
 * Mid-sentence, any capitalised word that is not allowed is suspect. At the start of a sentence a capital is normal, so the word
 * must be an ordinary sentence starter, a word from the facts, or a word the draft also writes in lower case; anything else
 * (an invented one-word brand such as "Zentora has ...") is suspect too. A capital that follows a letter or digit ("1M") is a suffix, not a name.
 */
function unknownProperNouns(text: string, tokens: Set<string>): string[] {
  const out: string[] = [];
  const lowerSeen = new Set((text.match(/(?<![A-Za-z0-9À-ɏ])[a-zà-ÿ][a-zà-ÿ'’-]*/g) ?? []).map(norm));
  const re = new RegExp(`(?<![A-Za-z0-9À-ɏ'’])${WORD}`, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index).trimEnd();
    const gap = text.slice(before.length, m.index);
    const last = before.slice(-1);
    const w = norm(m[0]);
    if (tokens.has(w) || /^i'(m|d|ll|ve)$/.test(w)) continue;
    const starts = before === '' || /[.!?:\n—–"“(*]/.test(last) || gap.includes('\n') || (last === '-' && /(^|\s)$/.test(before.slice(0, -1)));
    if (!starts) { out.push(m[0]); continue; }
    if (STARTERS.has(w) || lowerSeen.has(w)) continue;
    const next = new RegExp(`^[ \\t]+(${WORD})`).exec(text.slice(m.index + m[0].length));
    const nw = next ? norm(next[1]) : '';
    out.push(next && !tokens.has(nw) && !STARTERS.has(nw) ? `${m[0]} ${next[1]}` : m[0]);
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
  let rest = both;
  for (const n of [...names].sort((a, b) => b.length - a.length)) rest = rest.replace(new RegExp(`(?<![A-Za-z0-9À-ɏ])${esc(n.trim())}(?![A-Za-z0-9À-ɏ])`, 'gi'), ' ');
  for (const k of opts.knownNames ?? []) {
    const name = k.trim();
    if (name.length < 3) continue;
    if (new RegExp(`(?<![A-Za-z0-9])${esc(name)}(?![A-Za-z0-9])`, 'i').test(rest)) return 'The draft names a sponsor that is not in the confirmed facts.';
  }
  const odd = unknownProperNouns(rest, tokens);
  if (odd.length) return `The draft names "${odd[0]}", which is not in the facts it was given.`;

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
  return null;
}
