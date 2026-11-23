import { describe, expect, it } from 'vitest';
import { addDealSchema, dollarsToCents } from './schemas';

describe('dollarsToCents', () => {
  it.each([
    ['1,250.5', 125050], ['$300', 30000], ['0.05', 5], ['12', 1200], ['1,000', 100000], ['  99.99 ', 9999], ['0', 0],
  ])('reads %s', (raw, cents) => expect(dollarsToCents(raw)).toBe(cents));
  it.each(['1e5', '1,2,3', '12,34', ',100', '1,000,', '1.234', '-5', 'abc', '', '$', '123456789', '1.', '1,0000'])('rejects %j', (raw) => {
    expect(dollarsToCents(raw)).toBeNull();
  });
});

describe('addDealSchema', () => {
  const ok = { creator_id: '11111111-2222-4333-8444-555555555555', brand_name: ' Acme ', stage: 'contacted', amount: '1,250.50' };
  it('parses a valid deal into cents', () => {
    const r = addDealSchema.safeParse(ok);
    expect(r.success && r.data).toMatchObject({ brand_name: 'Acme', amount: 125050 });
  });
  it.each([{ amount: '0' }, { amount: '1,2,3' }, { amount: '10,000,001' }, { brand_name: ' ' }, { stage: 'nope' }, { creator_id: 'x' }])('rejects %j', (bad) => {
    expect(addDealSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
  });
});
