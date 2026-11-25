import { describe, expect, it } from 'vitest';
import { bandOf, linkSchema, matchSortArg, parseMatchRows, pickSuggestions, pickerQuerySchema, rankMatches, type Match } from './index';

const ID = '00000000-0000-0000-0000-000000007701';
const row = (over: Record<string, unknown> = {}) => ({
  brand_id: ID, total: 84, band: 'Strong', suggestable: true, blocked: null, open_stage: null, recent_on: null,
  reasons: [{ points: 40, text: 'Same niche.', unconfirmed: false }, { points: 4, text: 'Possibly sponsored 1 similar channel.', unconfirmed: true }], ...over,
});
const m = (id: string, total: number, over: Partial<Match> = {}): Match => ({
  otherId: id, total, band: bandOf(total), reasons: [{ points: total, text: 'x', unconfirmed: false }], blocked: null, openStage: null, recentOn: null, suggestable: true, ...over,
});

describe('bandOf', () => {
  it('uses 70 and 40 as the edges', () => {
    expect([100, 70].map(bandOf)).toEqual(['Strong', 'Strong']);
    expect([69, 40].map(bandOf)).toEqual(['Possible', 'Possible']);
    expect([39, 0].map(bandOf)).toEqual(['Weak', 'Weak']);
  });
});

describe('parseMatchRows', () => {
  it('reads a sponsor row and a creator row', () => {
    const a = parseMatchRows([row(), row({ brand_id: undefined, creator_id: ID })]);
    expect(a).toHaveLength(2);
    expect(a[0].otherId).toBe(ID);
    expect(a[0].reasons[1].unconfirmed).toBe(true);
  });
  it('drops rows that do not fit, and non-arrays', () => {
    expect(parseMatchRows([row({ total: 'x' }), row({ open_stage: 'nope' }), row({ brand_id: undefined }), row({ reasons: [{ points: 1 }] })])).toEqual([]);
    expect(parseMatchRows(null)).toEqual([]);
    expect(parseMatchRows({})).toEqual([]);
  });
  it('accepts numbers sent as text (bigint columns)', () => {
    expect(parseMatchRows([row({ total: '55' })])[0].total).toBe(55);
  });
});

describe('suggestions', () => {
  it('keeps suggestable pairs of 40 or more, best first, at most five', () => {
    const list = [m('a', 90), m('b', 39), m('c', 70, { suggestable: false }), m('d', 41), m('e', 80), m('f', 60), m('g', 55), m('h', 45), m('i', 44)];
    expect(pickSuggestions(list).map((x) => x.otherId)).toEqual(['a', 'e', 'f', 'g', 'h']);
  });
  it('puts blocked pairs last when ranking', () => {
    expect(rankMatches([m('a', 99, { blocked: 'The creator is marked Do not contact.' }), m('b', 10)]).map((x) => x.otherId)).toEqual(['b', 'a']);
  });
});

describe('schemas', () => {
  it('checks the link input', () => {
    expect(linkSchema.safeParse({ creatorId: ID, brandId: ID, stage: 'matched' }).success).toBe(true);
    expect(linkSchema.safeParse({ creatorId: ID, brandId: ID, stage: 'paid' }).success).toBe(false);
    expect(linkSchema.safeParse({ creatorId: 'x', brandId: ID, stage: 'matched' }).success).toBe(false);
  });
  it('limits the picker query', () => {
    expect(pickerQuerySchema.safeParse({ kind: 'creator', q: 'a'.repeat(101) }).success).toBe(false);
    expect(pickerQuerySchema.parse({ kind: 'brand' }).q).toBe('');
  });
  it('writes the sort argument', () => {
    expect(matchSortArg(ID)).toBe(`match:${ID}`);
  });
});
