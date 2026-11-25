// Money, promise and number-in-words checks for a pitch draft. Pure text rules, no facts needed except the allowed numbers.
// A rule-based check cannot know whether a claim is true: it only catches the common shapes of an invented amount or a promise.
import { COMMON_WORDS } from './common-words';

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, dozen: 12,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const BIG: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const isNumWord = (w: string) => w in UNITS || w in TENS || w === 'hundred' || w in BIG;

const CURRENCY_WORD = /^(?:dollars?|euros?|pounds?|bucks?|quid|cents?|grand|usd|gbp|eur|cad|aud)$/;

/** Numbers written in words ("forty thousand", "five hundred", "a thousand"), with the word that follows each one. */
export function numberWords(text: string): { value: number; raw: string; next: string }[] {
  const words = [...text.toLowerCase().matchAll(/[a-z]+/g)].map((m) => ({ w: m[0], at: m.index ?? 0 }));
  const out: { value: number; raw: string; next: string }[] = [];
  for (let i = 0; i < words.length; i++) {
    const article = (words[i].w === 'a' || words[i].w === 'an') && i + 1 < words.length && (words[i + 1].w === 'hundred' || words[i + 1].w in BIG);
    if (!article && !isNumWord(words[i].w)) continue;
    // the run: number words joined by a space, a hyphen or "and"
    let j = i + (article ? 1 : 0);
    let total = 0;
    let cur = 0;
    let end = j;
    for (; j < words.length; j++) {
      const w = words[j].w;
      if (w === 'and' && j + 1 < words.length && isNumWord(words[j + 1].w)) continue;
      if (!isNumWord(w)) break;
      if (w in UNITS) cur += UNITS[w];
      else if (w in TENS) cur += TENS[w];
      else if (w === 'hundred') cur = (cur || 1) * 100;
      else { total += (cur || 1) * BIG[w]; cur = 0; }
      end = j + 1;
    }
    const raw = words.slice(i, end).map((x) => x.w).join(' ');
    out.push({ value: total + cur, raw, next: words[end]?.w ?? '' });
    i = end - 1;
  }
  return out;
}

/** A number written in words that is not in the facts (above 20), or any written number followed by a currency word. */
export function wordNumberProblem(text: string, allowed: number[]): string | null {
  for (const n of numberWords(text)) {
    if (CURRENCY_WORD.test(n.next)) return 'The draft mentions a price, budget or commission. A pitch states no amounts.';
    if (n.value > 20 && !allowed.includes(n.value)) return `The draft states a number (${n.raw}) that is not in the facts it was given.`;
  }
  if (/\b(?:hundreds|thousands|millions|billions)\b/i.test(text)) return 'The draft states a large number without giving it. A pitch uses only the numbers in the facts.';
  return null;
}

const MONEY_WORDS = /\b(?:dollars?|euros?|bucks?|quid|usd|gbp|compensation|money|cash|salary|salaries|wages?|stipend|bonus(?:es)?|remuneration|income|profits?|paychecks?)\b/i;

/** Amounts and shares of money that the plain "$500" check does not see. */
export function moneyProblem(text: string): string | null {
  if (MONEY_WORDS.test(text)
    || /(?:\d[\d,.]*\s?[kKmM]?|\b(?:a|an|some|few|several|many)\b)\s+(?:pounds?|cents?)\b/i.test(text)
    // "2k per video", "5k a month": an amount with a period of time or a unit of work after it ("1,800 views per video" is not one)
    || /\d[\d,.]*\s?[kKmM]?\s*(?:per|a|each|every|for each|for a|for one)\s+(?:video|post|integration|sponsorship|mention|episode|month|week|deal|short|reel|spot|slot)\b/i.test(text)) {
    return 'The draft mentions money (a price, an amount, pay or earnings). A pitch states no money terms.';
  }
  if (/\d\s?%|\bper\s?cent\b|\bpercent(?:age|ages)?\b|\b(?:revenue|profit)\s+shar\w+|\b(?:your|a)\s+cut\b|\bshare of (?:the |your )?(?:revenue|sales|profit|earnings)/i.test(text)) {
    return 'The draft states a percentage or a share of earnings. A pitch states no money terms.';
  }
  return null;
}

/** Promise wording: a guarantee, a certain result, a claim that the creator will earn or double something. */
export function promiseProblem(text: string): string | null {
  const t = text.normalize('NFKC');
  const squeezed = t.toLowerCase().replace(/[^a-z]/g, '');
  if (
    /\bg[\W_]*u?[\W_]*a[\W_]*r[\W_]*[ae]?[\W_]*n[\W_]*t[\W_]*(?:ee?|ie|y)/i.test(t)
    || squeezed.includes('guarantee') || squeezed.includes('riskfree')
    || /\brisk[\s-]*free\b|\bno[\s-]risk\b|\bwithout (?:any )?risk\b|\bzero[\s-]risk\b/i.test(t)
    || /\bpromis(?:e|es|ed|ing)\b|\bassured\b|\bsure[\s-]?fire\b|\bsure thing\b|\bfool[\s-]?proof\b|\bcan(?:'|’)?t fail\b|\bcannot fail\b|\b(?:is|are|will be)\s+(?:sure|certain|bound) to\b|\bmoney[\s-]back\b|\bget rich\b/i.test(t)
    || /\byou(?:(?:'|’)ll|\s+will|\s+are going to|\s+can expect to)\s+(?:earn|make|get paid|gain|grow|boost|double|triple|profit|see (?:more|growth|results|a rise|an increase))/i.test(t)
    || /\b(?:double|triple|quadruple|multiply|10x|5x|3x|2x)\s+(?:your|the|its|their)\b/i.test(t)
    || /\b(?:boost|lift|increase|raise|skyrocket|multiply|drive|grow)\s+(?:your|the|their)\s+(?:sales|revenue|income|earnings|conversions?|subscribers|views|numbers|growth)\b/i.test(t)
    || /\b(?:proven|instant|overnight|immediate|quick|fast)\s+(?:results?|growth|success|income|returns?)\b/i.test(t)
    || /\b(?:will|would)\s+(?:definitely|certainly|surely|absolutely)\b/i.test(t)
    || /\b100\s?%/.test(t)
  ) return 'The draft makes a promise about results or earnings. A pitch promises nothing.';
  return null;
}

/** A lower-case word right after "worked with", "partnered with", "brands like" ... that is not an ordinary word or a given name. */
export function invitedNameAfterCue(text: string, tokens: Set<string>): string | null {
  const t = text.toLowerCase();
  const re = /\b(?:worked with|working with|work with|partnered with|partnering with|partner with|collaborated with|sponsored by|(?:sponsors?|brands?|companies|clients?|partners?|names?) like|such as|including|alongside)\s+((?:[a-z][a-z0-9'’-]*)(?:\s*(?:,|&|\band\b|\bor\b)\s*[a-z][a-z0-9'’-]*)*)/g;
  for (const m of t.matchAll(re)) {
    for (const w of m[1].split(/\s*(?:,|&|\band\b|\bor\b)\s*/)) {
      const word = w.trim();
      if (!word) continue;
      const base = word.split(/['’]/)[0];
      if (!tokens.has(word) && !tokens.has(base) && !COMMON_WORDS.has(word) && !COMMON_WORDS.has(base)) return word;
    }
  }
  return null;
}
