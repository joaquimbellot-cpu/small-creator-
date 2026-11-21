import { describe, expect, it } from 'vitest';
import { classifyRows, csvSafeCell, parseCsvText, toCsv } from './csv';
import { parseFilters, searchFilter, filtersToQuery } from './filters';
import { validateCreator } from './schema';

describe('validateCreator', () => {
  const ok = { name: 'Maya', email: 'maya@example.test', status: 'new' };
  it('accepts a minimal creator and cleans values', () => {
    const r = validateCreator({ ...ok, phone: '+1 (555) 010-0100', subscribers: '12,500', channel_url: 'youtube.com/@maya' });
    expect(r.ok && r.data).toMatchObject({ subscribers: 12500, channel_url: 'https://youtube.com/@maya', phone: '+1 (555) 010-0100', status: 'new' });
  });
  it('allows subscribers outside 1,000-50,000', () => {
    expect(validateCreator({ ...ok, subscribers: '5' }).ok).toBe(true);
  });
  it.each([
    [{ name: '' }, 'name'], [{ name: 'x'.repeat(121) }, 'name'], [{ email: 'nope' }, 'email'], [{ phone: 'abc' }, 'phone'],
    [{ phone: '1'.repeat(31) }, 'phone'], [{ channel_url: 'https://example.com/@x' }, 'channel_url'], [{ subscribers: '100000001' }, 'subscribers'],
    [{ subscribers: '-1' }, 'subscribers'], [{ subscribers: '1.5' }, 'subscribers'], [{ status: 'weird' }, 'status'], [{ notes: 'n'.repeat(2001) }, 'notes'], [{ niche: 'n'.repeat(121) }, 'niche'],
  ])('rejects %j', (bad, field) => {
    const r = validateCreator({ ...ok, ...bad });
    expect(!r.ok && field in r.errors).toBe(true);
  });
});

describe('searchFilter', () => {
  it('quotes and escapes user input', () => {
    expect(searchFilter('')).toBeNull();
    const f = searchFilter('a,b)(%_"x')!;
    // every clause value is one double-quoted string, with " and \ escaped
    expect(f.split(',full_name').length).toBeGreaterThan(0);
    expect(f).toContain('full_name.ilike."%a,b)(\\\\%\\\\_\\"x%"');
    expect(f).toContain('email.ilike.');
    expect(f).toContain('channel_name.ilike.');
  });
});

describe('filters', () => {
  it('parses safely', () => {
    expect(parseFilters({ q: ' x ', status: 'bogus', sort: 'nope', page: '-3' })).toEqual({ q: 'x', status: '', sort: 'added', dir: 'desc', page: 1 });
    expect(parseFilters({ sort: 'name' }).dir).toBe('asc');
    expect(filtersToQuery({ q: 'a b', status: 'new', sort: 'subscribers', dir: 'asc', page: 2 })).toBe('?q=a+b&status=new&sort=subscribers&dir=asc&page=2');
  });
});

describe('csv', () => {
  it('protects against formula injection', () => {
    for (const c of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) expect(csvSafeCell(c)).toBe(`'${c}`);
    expect(csvSafeCell('plain')).toBe('plain');
    expect(toCsv(['a', 'b'], [['=cmd', 'x,"y"']])).toBe('a,b\r\n\'=cmd,"x,""y"""\r\n');
  });
  it('parses case-insensitive headers and flags rows', () => {
    const p = parseCsvText('﻿Name,EMAIL,Channel_URL,Subscribers\nA,a@x.test,https://youtube.com/@a,10\nB,A@x.test,,\nC,c@x.test,https://youtube.com/@A,\nD,bad,,\nE,e@x.test,,\nF,f@x.test,,zz\n');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const rows = classifyRows(p.rows, { emails: new Set(['e@x.test']), channels: new Set() });
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'duplicate', 'error', 'duplicate', 'error']);
    expect(rows[1].reason).toMatch(/line 2/);
    expect(rows[2].reason).toMatch(/channel/);
  });
  it('needs name and email columns and limits rows', () => {
    expect(parseCsvText('foo,bar\n1,2').ok).toBe(false);
    const big = 'name,email\n' + Array.from({ length: 2001 }, (_, i) => `n${i},n${i}@x.test`).join('\n');
    expect(parseCsvText(big).ok).toBe(false);
  });
});
