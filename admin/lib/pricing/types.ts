// Types for the sponsorship price calculator. Money is in US dollars (numbers); formatting is in format.ts.

export type CpmGroupId = 'gaming' | 'life' | 'tech' | 'finance' | 'b2b';
export type FormatId = 'int' | 'ded' | 'short' | 'pre';
export type ExtraId = 'link' | 'pin' | 'post';

export type PriceInput = {
  name?: string;
  niche: CpmGroupId;
  /** true when the person typed their own CPM range */
  own: boolean;
  cpmLo: number | null;
  cpmHi: number | null;
  subs: number | null;
  views: number | null;
  /** engagement rate in percent, null when not known */
  eng: number | null;
  /** free text such as "US 40%, UK 15%, AU 10%" */
  aud: string;
  format: FormatId;
  /** months of usage rights, 0 for none */
  usage: number;
  /** days of exclusivity, 0 for none */
  excl: number;
  wide: boolean;
  extras: Record<ExtraId, boolean>;
  /** Smallfold's margin in percent */
  margin: number | null;
};

export type PriceContext = {
  /** the company's own past deals: amount in USD and the subscribers of the creator */
  pastDeals?: { amountUsd: number; subscribers: number }[];
  /** the chosen sponsor and its usual budget per creator, in USD */
  sponsor?: { name: string; budgetMinUsd: number; budgetMaxUsd: number } | null;
  /** how money is written inside the texts; the numbers stay in USD */
  currency?: Currency;
  rate?: number;
};

export type Currency = 'USD' | 'AUD';
export type Triple = [number, number, number];

export type PriceStep = { label: string; detail: string; v: Triple };
export type PriceCheck = { ok: boolean; text: string; tag?: string };

export type PriceResult = {
  cpm: Triple;
  base: Triple;
  steps: PriceStep[];
  price: Triple;
  payout: Triple;
  cut: Triple;
  /** effective CPM the brand pays */
  eff: Triple;
  /** the margin actually used (20 when the typed one was missing or out of range) */
  margin: number;
  /** recommended asking price (mid figure, rounded), USD */
  ask: number;
  reason: string;
  checks: PriceCheck[];
  flags: string[];
  assumptions: string[];
  better: string[];
};
