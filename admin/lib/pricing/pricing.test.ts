import { describe, expect, it } from 'vitest';
import { defaultPriceInput, exclusivityPercent, formatMoney, parseAudience, priceSponsorship, usagePercent } from './index';

const case1 = () =>
  defaultPriceInput({
    niche: 'gaming', views: 20000, subs: 50000, eng: 8, aud: 'US 40%, UK 15%, AU 10%',
    format: 'ded', usage: 3, excl: 30, wide: false, margin: 20,
  });
const near = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 2));

describe('hand-checked case', () => {
  const r = priceSponsorship(case1())!;
  it('base and steps', () => {
    near(r.base, [120, 210, 300]);
    near(r.steps[0].v, [240, 525, 900]);
    near(r.steps[1].v, [264, 577.5, 990]);
    near(r.steps[2].v, [290.4, 635.25, 1089]);
    near(r.steps[3].v, [363, 794.0625, 1361.25]);
    near(r.steps[4].v, [399.3, 873.4725, 1497.375]);
  });
  it('split and ask', () => {
    expect(r.payout[1]).toBeCloseTo(698.78, 2);
    expect(r.cut[1]).toBeCloseTo(174.69, 2);
    expect(r.eff[1]).toBeCloseTo(43.67, 2);
    expect(r.ask).toBe(850);
    expect(r.flags).toEqual([]);
  });
});

describe('inputs', () => {
  it('no views gives no result', () => {
    expect(priceSponsorship({ ...case1(), views: null })).toBeNull();
    expect(priceSponsorship({ ...case1(), views: 0 })).toBeNull();
  });
  it('missing engagement is flagged and changes nothing', () => {
    const r = priceSponsorship({ ...case1(), eng: null })!;
    expect(r.flags.some((f) => f.includes('engagement rate is missing'))).toBe(true);
    near(r.steps[2].v, r.steps[1].v);
  });
  it('missing audience is flagged', () => {
    const r = priceSponsorship({ ...case1(), aud: '' })!;
    expect(r.flags.some((f) => f.includes('audience countries are missing'))).toBe(true);
    near(r.steps[1].v, r.steps[0].v);
  });
  it('audience under 50% and over 100% are ignored with a flag', () => {
    const lo = priceSponsorship({ ...case1(), aud: 'US 30%' })!;
    expect(lo.flags.some((f) => f.includes('only 30%'))).toBe(true);
    near(lo.steps[1].v, lo.steps[0].v);
    const hi = priceSponsorship({ ...case1(), aud: 'US 80%, UK 40%' })!;
    expect(hi.flags.some((f) => f.includes('add up to 120%'))).toBe(true);
    near(hi.steps[1].v, hi.steps[0].v);
  });
  it('own CPM is used when valid, ignored with a flag when not', () => {
    const ok = priceSponsorship({ ...case1(), own: true, cpmLo: 10, cpmHi: 20 })!;
    near(ok.cpm, [10, 15, 20]);
    expect(ok.flags).toEqual([]);
    const bad = priceSponsorship({ ...case1(), own: true, cpmLo: 20, cpmHi: 10 })!;
    near(bad.cpm, [6, 10.5, 15]);
    expect(bad.flags.some((f) => f.includes('own CPM'))).toBe(true);
    const zero = priceSponsorship({ ...case1(), own: true, cpmLo: 0, cpmHi: 10 })!;
    near(zero.cpm, [6, 10.5, 15]);
  });
  it('a Short is priced at 0.3 to 0.5 of the base', () => {
    const r = priceSponsorship({ ...case1(), format: 'short' })!;
    near(r.steps[0].v, [36, 84, 150]);
  });
  it('margin missing or out of range uses 20 with a flag; above 50 warns', () => {
    for (const m of [null, -1, 101]) {
      const r = priceSponsorship({ ...case1(), margin: m })!;
      expect(r.margin).toBe(20);
      expect(r.flags.some((f) => f.includes('margin is missing'))).toBe(true);
    }
    const hi = priceSponsorship({ ...case1(), margin: 60 })!;
    expect(hi.margin).toBe(60);
    expect(hi.flags.some((f) => f.includes('less than half'))).toBe(true);
    expect(priceSponsorship({ ...case1(), margin: 0 })!.cut[1]).toBe(0);
  });
  it('missing subscribers skips the flat-rate check', () => {
    const r = priceSponsorship({ ...case1(), subs: null })!;
    expect(r.flags.some((f) => f.includes('subscriber count is missing'))).toBe(true);
  });
});

describe('boundaries', () => {
  it('usage rights', () => {
    expect(usagePercent(0)).toBe(0);
    expect(usagePercent(1)).toBe(20);
    expect(usagePercent(12)).toBe(50);
    expect(usagePercent(24)).toBe(50);
  });
  it('exclusivity', () => {
    expect(exclusivityPercent(0, false)).toBe(0);
    expect(exclusivityPercent(1, false)).toBe(10);
    expect(exclusivityPercent(30, false)).toBe(10);
    expect(exclusivityPercent(180, false)).toBe(30);
    expect(exclusivityPercent(400, false)).toBe(30);
    expect(exclusivityPercent(30, true)).toBe(15);
    expect(exclusivityPercent(180, true)).toBe(30);
  });
  it('geography and engagement thresholds', () => {
    const geo = (aud: string) => priceSponsorship({ ...case1(), aud, format: 'int' })!.steps[1].label;
    expect(geo('US 70%')).toContain('+20%');
    expect(geo('US 50%')).toContain('+10%');
    expect(geo('US 30%, DE 30%')).toContain('no change');
    expect(geo('US 15%, DE 40%')).toContain('−15%');
    expect(geo('US 10%, DE 50%')).toContain('−30%');
    const eng = (e: number) => priceSponsorship({ ...case1(), eng: e })!.steps[2].label;
    expect(eng(10)).toContain('+20%');
    expect(eng(7)).toContain('+10%');
    expect(eng(2)).toContain('no change');
    expect(eng(1)).toContain('−10%');
    expect(eng(0.5)).toContain('−20%');
  });
});

describe('context and helpers', () => {
  it('sponsor budget and own deals add checks', () => {
    const r = priceSponsorship(case1(), {
      sponsor: { name: 'Acme', budgetMinUsd: 2000, budgetMaxUsd: 5000 },
      pastDeals: [{ amountUsd: 500, subscribers: 40000 }, { amountUsd: 900, subscribers: 60000 }, { amountUsd: 700, subscribers: 50000 }, { amountUsd: 9000, subscribers: 900000 }],
    })!;
    expect(r.checks.some((c) => c.text.includes('Acme usually pays') && c.text.includes('below'))).toBe(true);
    expect(r.checks.some((c) => c.text.includes('3 deals'))).toBe(true);
  });
  it('shows AUD in texts', () => {
    const r = priceSponsorship(case1(), { currency: 'AUD', rate: 2, sponsor: { name: 'Acme', budgetMinUsd: 100, budgetMaxUsd: 200 } })!;
    expect(r.checks.some((c) => c.text.includes('A$200'))).toBe(true);
    expect(formatMoney(100, 'AUD', 1.5)).toBe('A$150');
    expect(formatMoney(1234.5)).toBe('$1,235');
  });
  it('parses audience', () => {
    expect(parseAudience('US 40%, UK 15%, AU 10%')).toEqual({ total: 65, t1: 65 });
    expect(parseAudience('nothing')).toBeNull();
  });
});
