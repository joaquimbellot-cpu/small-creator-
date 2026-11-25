import { describe, expect, it } from 'vitest';
import { addRecent, cleanRecent, loadRecent, MAX_RECENT, RECENT_KEY } from './recent';
import { groupResults, shortCount, stageLabel } from './results';
import { searchQuery, type SearchRow } from './schema';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const row = (o: Partial<SearchRow>): SearchRow => ({ kind: 'creator', id: id(1), name: 'Ada', channel: null, subscribers: null, industry: null, stage: null, other_name: null, ...o });
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('searchQuery', () => {
  it('trims and accepts 1 to 100 characters', () => {
    expect(searchQuery.parse({ q: '  ada ' }).q).toBe('ada');
    expect(searchQuery.safeParse({ q: 'x'.repeat(100) }).success).toBe(true);
  });
  it('refuses empty, blank, too long and missing', () => {
    for (const q of ['', '   ', 'x'.repeat(101)]) expect(searchQuery.safeParse({ q }).success).toBe(false);
    expect(searchQuery.safeParse({}).success).toBe(false);
  });
});

describe('groupResults', () => {
  it('links and describes each kind, in the order Creators, Sponsors, Deals', () => {
    const g = groupResults([
      row({ kind: 'deal', id: id(3), name: 'Ada', other_name: 'Acme', stage: 'negotiating' }),
      row({ kind: 'sponsor', id: id(2), name: 'Acme', industry: 'Software' }),
      row({ kind: 'creator', id: id(1), name: 'Ada', channel: 'Ada Codes', subscribers: 12500 }),
    ]);
    expect(g.map((x) => x.label)).toEqual(['Creators', 'Sponsors', 'Deals']);
    expect(g[0].items[0]).toMatchObject({ title: 'Ada', meta: 'Ada Codes · 13k subscribers', href: `/creators/${id(1)}` });
    expect(g[1].items[0]).toMatchObject({ meta: 'Software', href: `/sponsors/${id(2)}` });
    expect(g[2].items[0]).toMatchObject({ title: 'Ada with Acme', meta: 'Negotiating', href: '/deals' });
  });
  it('keeps at most 6 of a kind and drops empty groups and bad ids', () => {
    const many = Array.from({ length: 9 }, (_, i) => row({ id: id(i + 1), name: `C${i}` }));
    const g = groupResults([...many, row({ id: 'not-an-id' })]);
    expect(g).toHaveLength(1);
    expect(g[0].items).toHaveLength(6);
    expect(groupResults([])).toEqual([]);
  });
  it('never puts an unexpected field into an item', () => {
    const dirty = { ...row({ name: 'Ada' }), email: 'a@example.test', phone: '1' } as SearchRow;
    expect(JSON.stringify(groupResults([dirty]))).not.toMatch(/example\.test|phone/);
  });
});

describe('labels', () => {
  it('stage and short counts', () => {
    expect(stageLabel('matched')).toBe('Matched');
    expect(stageLabel(null)).toBe('');
    expect([999, 1500, 12500, 1_500_000].map(shortCount)).toEqual(['999', '1.5k', '13k', '1.5M']);
  });
});

describe('recently opened', () => {
  it('keeps the newest first, no duplicates, at most 6', () => {
    const s = memory();
    for (let i = 1; i <= 8; i++) addRecent(s, { href: `/creators/${id(i)}`, title: `C${i}`, meta: '' });
    addRecent(s, { href: `/creators/${id(5)}`, title: 'C5', meta: '' });
    const list = loadRecent(s);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].title).toBe('C5');
    expect(new Set(list.map((x) => x.href)).size).toBe(MAX_RECENT);
  });
  it('ignores damaged storage and foreign links', () => {
    const s = memory();
    s.setItem(RECENT_KEY, '{oops');
    expect(loadRecent(s)).toEqual([]);
    expect(cleanRecent([{ href: 'https://evil.example/x', title: 'x' }, { href: '/creators/abc', title: 'x' }, 5, null])).toEqual([]);
    expect(loadRecent(null)).toEqual([]);
  });
  it('survives a storage that refuses writes', () => {
    const s = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(addRecent(s, { href: `/sponsors/${id(1)}`, title: 'A', meta: '' })).toHaveLength(1);
  });
});
