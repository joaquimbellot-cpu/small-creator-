import { describe, expect, it } from 'vitest';
import { buildQuery, canonicalQuery, chipsFromParams, clearFilters, countActive, getList, isActive, joinList, removeChip, splitList, toParams, toggleInList, type FilterDef } from './query';

const NICHES: Record<string, string> = { tech: 'Tech', gaming: 'Gaming' };
const defs: FilterDef[] = [
  { key: 'q', label: 'Search' },
  { key: 'subs', label: 'Subscribers', kind: 'range' },
  { key: 'sponsored', chipLabel: (v) => (v === 'yes' ? 'Has sponsors' : 'No sponsors'), also: ['detected'] },
  { key: 'detected', kind: 'flag', label: 'Count detected records' },
  { key: 'niche', label: 'Niche', kind: 'list', valueLabel: (v) => NICHES[v] ?? v },
];

describe('lists in the address', () => {
  it('splits and joins', () => {
    expect(splitList('a, b,,a')).toEqual(['a', 'b']);
    expect(splitList(null)).toEqual([]);
    expect(joinList(['a', 'b', 'a'])).toBe('a,b');
    expect(joinList([])).toBeNull();
    expect(joinList(['a,b'])).toBe('ab');
  });
  it('toggles', () => {
    expect(toggleInList(['a'], 'b')).toBe('a,b');
    expect(toggleInList(['a', 'b'], 'a')).toBe('b');
    expect(toggleInList(['a'], 'a')).toBeNull();
  });
  it('getList reads repeated keys too', () => {
    expect(getList('niche=tech,gaming&niche=diy', 'niche')).toEqual(['tech', 'gaming', 'diy']);
  });
  it('toParams accepts Next searchParams objects', () => {
    expect(toParams({ a: '1', b: ['2', '3'], c: undefined }).toString()).toBe('a=1&b=2&b=3');
  });
});

describe('chipsFromParams', () => {
  it('builds one chip per value in the order of the definitions', () => {
    const chips = chipsFromParams('niche=tech,gaming&q=bike&subs=10000-50000&sponsored=yes&detected=1', defs);
    expect(chips.map((c) => c.label)).toEqual([
      'Search: bike', 'Subscribers: 10k to 50k', 'Has sponsors', 'Count detected records', 'Niche: Tech', 'Niche: Gaming',
    ]);
    expect(chips.map((c) => c.id)).toEqual(['q', 'subs', 'sponsored', 'detected', 'niche:tech', 'niche:gaming']);
  });
  it('ignores empty, unknown and invalid values', () => {
    expect(chipsFromParams('q=&subs=abc&detected=0&sort=subs&page=3&zzz=1', defs)).toEqual([]);
  });
  it('counts', () => {
    expect(countActive('niche=tech,gaming&q=x&page=2&sort=name', defs)).toBe(3);
    expect(isActive('subs=1-', defs[1])).toBe(true);
    expect(isActive('subs=x', defs[1])).toBe(false);
  });
});

describe('removeChip and clearFilters', () => {
  it('removes one value of a list and the page', () => {
    const chip = chipsFromParams('niche=tech,gaming&page=4', defs).find((c) => c.id === 'niche:tech')!;
    expect(removeChip('niche=tech,gaming&page=4', chip, defs).toString()).toBe('niche=gaming');
  });
  it('removes the key when the last value goes', () => {
    const chip = chipsFromParams('niche=tech', defs)[0];
    expect(removeChip('niche=tech&sort=name', chip, defs).toString()).toBe('sort=name');
  });
  it('removes keys that belong together', () => {
    const chip = chipsFromParams('sponsored=yes&detected=1&q=x', defs).find((c) => c.key === 'sponsored')!;
    expect(removeChip('sponsored=yes&detected=1&q=x', chip, defs).toString()).toBe('q=x');
  });
  it('clears filters but keeps sort, view and open', () => {
    expect(clearFilters('q=x&niche=tech&sort=subs&dir=desc&view=cards&open=5&page=2', defs).toString()).toBe('sort=subs&dir=desc&view=cards&open=5');
  });
});

describe('canonicalQuery and buildQuery', () => {
  it('sorts and drops page and open', () => {
    expect(canonicalQuery('z=1&a=2&page=3&open=9')).toBe('a=2&z=1');
    expect(canonicalQuery('b=1&a=1')).toBe(canonicalQuery('a=1&b=1'));
  });
  it('builds', () => {
    expect(buildQuery({ a: 1, b: '', c: null, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(buildQuery({})).toBe('');
  });
});
