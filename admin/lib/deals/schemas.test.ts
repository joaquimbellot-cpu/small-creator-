import { describe, expect, it } from 'vitest';
import { formatAmount, STAGES, STAGE_LABEL, timeInStage } from './format';
import { addDealSchema, dollarsToCents, moveDealSchema, updateAmountSchema } from './schemas';

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

describe('updateAmountSchema', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  it('reads dollars as cents and an empty amount as not set', () => {
    expect(updateAmountSchema.parse({ id, amount: '$1,250.50' }).amount).toBe(125050);
    expect(updateAmountSchema.parse({ id, amount: '  ' }).amount).toBeNull();
  });
  it.each(['0', '-3', 'abc', '10,000,001', '1.234'])('rejects %j', (amount) => {
    expect(updateAmountSchema.safeParse({ id, amount }).success).toBe(false);
  });
  it('rejects a bad id', () => expect(updateAmountSchema.safeParse({ id: 'x', amount: '5' }).success).toBe(false));
});

describe('stages', () => {
  it('start with matched and all have a label', () => {
    expect(STAGES[0]).toBe('matched');
    for (const st of STAGES) expect(STAGE_LABEL[st]).toBeTruthy();
    expect(moveDealSchema.safeParse({ id: '11111111-2222-4333-8444-555555555555', stage: 'matched' }).success).toBe(true);
    expect(moveDealSchema.safeParse({ id: '11111111-2222-4333-8444-555555555555', stage: 'archived' }).success).toBe(false);
  });
});

describe('empty amounts and time in stage', () => {
  it('formats an empty amount in words', () => {
    expect(formatAmount(null)).toBe('Amount not set');
    expect(formatAmount(undefined, 'Not set')).toBe('Not set');
    expect(formatAmount(0)).toBe('$0.00');
    expect(formatAmount(125050)).toBe('$1,250.50');
  });
  it('counts days in a stage', () => {
    const now = new Date('2026-11-25T10:00:00Z');
    expect(timeInStage('2026-11-25T01:00:00Z', now)).toBe('Today');
    expect(timeInStage('2026-11-24T23:00:00Z', now)).toBe('1 day');
    expect(timeInStage('2026-11-20T00:00:00Z', now)).toBe('5 days');
    expect(timeInStage('2026-11-01T00:00:00Z', now)).toBe('3 weeks');
    expect(timeInStage('2026-08-01T00:00:00Z', now)).toBe('3 months');
    expect(timeInStage(null, now)).toBe('–');
  });
});
