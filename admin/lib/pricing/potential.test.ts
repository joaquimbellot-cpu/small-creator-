import { describe, expect, it } from 'vitest';
import { sponsorshipPotential } from './potential';

const base = { subscribers: null, avgViews: null, nicheSlug: null, engagementRate: null, audienceCountries: null };

describe('sponsorshipPotential', () => {
  it('uses the calculator when average views are known', () => {
    // 20,000 views, gaming: CPM 6 to 15 gives 120 to 300 for one integration; geography +10% (65% in the four countries), engagement +10% (8%)
    const p = sponsorshipPotential({ subscribers: 50000, avgViews: 20000, nicheSlug: 'gaming', engagementRate: 8, audienceCountries: 'US 40%, UK 15%, AU 10%' });
    expect(p.kind).toBe('views');
    if (p.kind !== 'views') return;
    expect(p.low).toBeCloseTo(145.2, 1);
    expect(p.high).toBeCloseTo(363, 1);
    expect(p.basis).toBe('good');
    expect(p.missing).toEqual([]);
    expect(p.ask).toBeGreaterThan(p.low);
    expect(p.ask).toBeLessThan(p.high);
  });

  it('says what was not adjusted for, and calls the basis fair', () => {
    const p = sponsorshipPotential({ ...base, subscribers: 22000, avgViews: 7190 });
    expect(p.kind).toBe('views');
    if (p.kind !== 'views') return;
    expect(p.basis).toBe('fair');
    expect(p.missing).toEqual(['the niche from the list', 'the engagement rate', 'the audience countries']);
    // no niche slug means the lifestyle / general rate: 15 to 30 per 1,000 views
    expect(p.low).toBeCloseTo(107.85, 2);
    expect(p.high).toBeCloseTo(215.7, 2);
  });

  it('falls back to a rough guess from subscribers alone', () => {
    const p = sponsorshipPotential({ ...base, subscribers: 5070, nicheSlug: 'tech' });
    expect(p).toMatchObject({ kind: 'subscribers', basis: 'rough' });
    if (p.kind !== 'subscribers') return;
    expect(p.low).toBeCloseTo(50.7, 2);
    expect(p.high).toBeCloseTo(126.75, 2);
    expect(p.ask).toBe(90);
  });

  it('treats zero or missing views as not known', () => {
    expect(sponsorshipPotential({ ...base, subscribers: 4000, avgViews: 0 }).kind).toBe('subscribers');
  });

  it('cannot estimate with neither figure', () => {
    expect(sponsorshipPotential(base)).toEqual({ kind: 'none', missing: ['the average views', 'the subscriber count'] });
  });

  it('cannot estimate from a handful of subscribers', () => {
    expect(sponsorshipPotential({ ...base, subscribers: 40 })).toEqual({ kind: 'none', missing: ['the average views'] });
  });
});
