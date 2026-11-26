import { describe, expect, it } from 'vitest';
import { classifyRows, csvSafeCell, parseCsvText, toCsv } from './csv';
import { chipsFromParams } from '../lists/query';
import { cleanQuery, creatorFilterDefs, filtersToQuery, parseFilters, searchFilter, toRpcArgs } from './filters';
import { validateCreator } from './schema';

describe('validateCreator', () => {
  const ok = { name: 'Maya', email: 'maya@example.test', status: 'new' };
  it('accepts a minimal creator and cleans values', () => {
    const r = validateCreator({ ...ok, phone: '+1 (555) 010-0100', subscribers: '12,500', channel_url: 'youtube.com/@maya' });
    expect(r.ok && r.data).toMatchObject({ subscribers: 12500, channel_url: 'https://youtube.com/@maya', phone: '+1 (555) 010-0100', status: 'new' });
  });
  it('stores an https link whatever scheme or case was typed, and refuses a bare @handle', () => {
    for (const v of ['http://youtube.com/@maya', 'https://youtube.com/@maya', 'HTTP://YOUTUBE.COM/@maya']) {
      const r = validateCreator({ ...ok, channel_url: v });
      expect(r.ok && r.data.channel_url).toMatch(/^https:\/\/youtube\.com\/@maya$/i);
    }
    expect(validateCreator({ ...ok, channel_url: '@maya' }).ok).toBe(false);
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

const A = '0cd3a800-b67f-b19b-35df-42d9cb84c454';
const B = '1199b0fc-4e20-7705-3f34-f769643a15bd';

describe('filters', () => {
  const defaults = {
    q: '', subs: null, sponsored: '', detected: false, recent: null, by: [], niche: [], status: [], contacted: '', views: null,
    lang: [], country: [], email: false, tag: [], list: [], sort: 'subscribers', dir: 'desc', view: 'cards', page: 1, open: '', for: '',
  };
  it('parses an empty address to the defaults', () => {
    expect(parseFilters({})).toEqual(defaults);
    expect(parseFilters(new URLSearchParams(''))).toEqual(defaults);
  });
  it('drops bad values instead of failing', () => {
    expect(parseFilters({
      q: ' x ', status: 'bogus', sort: 'nope', page: '-3', subs: 'abc', sponsored: 'maybe', recent: '45', by: 'not-a-uuid,,', niche: 'tech,unknown',
      contacted: 'someday', views: '-5', lang: 'english,en', country: 'USA,gb', email: 'yes', tag: 'x', list: 'y', view: 'grid', open: '123', for: 'z', dir: 'sideways',
    })).toEqual({ ...defaults, q: 'x', niche: ['tech'], lang: ['en'], country: ['GB'] });
    expect(parseFilters({ subs: '-' }).subs).toBeNull();
    expect(parseFilters({ views: 'abc' }).views).toBeNull();
    expect(parseFilters({ page: '999999999' }).page).toBe(100000);
  });
  it('reads every address key', () => {
    const f = parseFilters({
      q: 'maya', subs: '1000-10000', sponsored: 'yes', detected: '1', recent: '90', by: `${A},${B}`, niche: 'tech,gaming', status: 'new,contacted',
      contacted: 'over30', views: '5000', lang: 'en,pt-br', country: 'gb,US', email: '1', tag: A, list: B, sort: 'sponsored', dir: 'asc', view: 'table', page: '3', open: A,
    });
    expect(f).toEqual({
      q: 'maya', subs: [1000, 10000], sponsored: 'yes', detected: true, recent: 90, by: [A, B], niche: ['tech', 'gaming'], status: ['new', 'contacted'],
      contacted: 'over30', views: 5000, lang: ['en', 'pt-BR'], country: ['GB', 'US'], email: true, tag: [A], list: [B], sort: 'sponsored', dir: 'asc', view: 'table', page: 3, open: A, for: '',
    });
  });
  it('shows cards by default; view=table picks the table and view=cards (old links) is the default', () => {
    expect(parseFilters({}).view).toBe('cards');
    expect(parseFilters({ view: 'cards' }).view).toBe('cards');
    expect(parseFilters({ view: 'table' }).view).toBe('table');
    expect(parseFilters({ view: 'grid' }).view).toBe('cards');
    expect(parseFilters(new URLSearchParams('view=table')).view).toBe('table');
    expect(filtersToQuery({ view: 'cards' })).toBe('');
    expect(filtersToQuery({ view: 'table' })).toBe('?view=table');
    expect(filtersToQuery(parseFilters({ view: 'cards', sort: 'name' }))).toBe('?sort=name');
  });
  it('swaps a reversed range, keeps an open range, and ignores an empty one', () => {
    expect(parseFilters({ subs: '50000-1000' }).subs).toEqual([1000, 50000]);
    expect(parseFilters({ subs: '100000-' }).subs).toEqual([100000, null]);
    expect(parseFilters({ subs: '-5000' }).subs).toEqual([null, 5000]);
  });
  it('keeps "match" and its sponsor for the Matching agent', () => {
    const f = parseFilters({ sort: 'match', for: A });
    expect(f.sort).toBe('match');
    expect(f.for).toBe(A);
    expect(filtersToQuery(f)).toBe(`?sort=match&for=${A}`);
    expect(filtersToQuery({ ...f, sort: 'name' })).not.toContain('for=');
  });
  it('defaults the direction by sort, and omits defaults from the address', () => {
    expect(parseFilters({ sort: 'name' }).dir).toBe('asc');
    expect(parseFilters({ sort: 'added' }).dir).toBe('desc');
    expect(filtersToQuery(parseFilters({}))).toBe('');
    expect(filtersToQuery({ q: 'a b', status: ['new'], sort: 'subscribers', dir: 'asc', page: 2 })).toBe('?q=a+b&status=new&dir=asc&page=2');
    expect(filtersToQuery({ sort: 'name', dir: 'asc' })).toBe('?sort=name');
    expect(filtersToQuery({ sort: 'name', dir: 'desc' })).toBe('?sort=name&dir=desc');
  });
  it('round-trips every key', () => {
    const f = parseFilters({
      q: 'maya & co', subs: '1000-', sponsored: 'no', detected: '1', recent: '30', by: A, niche: 'tech', status: 'do_not_contact', contacted: 'never', views: '25000',
      lang: 'en-GB', country: 'GB', email: '1', tag: B, list: A, sort: 'last_contacted', dir: 'asc', view: 'table', page: '2', open: B,
    });
    const q = filtersToQuery(f);
    expect(parseFilters(new URLSearchParams(q))).toEqual(f);
    // every key is written once
    for (const k of ['q', 'subs', 'sponsored', 'detected', 'recent', 'by', 'niche', 'status', 'contacted', 'views', 'lang', 'country', 'email', 'tag', 'list', 'sort', 'dir', 'view', 'page', 'open']) {
      expect(new URLSearchParams(q).getAll(k)).toHaveLength(1);
    }
  });
  it('old links still work', () => {
    // ?creator=<id> used to open the pop-up; it now opens the side panel
    expect(parseFilters({ creator: A }).open).toBe(A);
    expect(parseFilters({ creator: A, edit: '1' }).open).toBe('');
    expect(parseFilters({ creator: A, new: '1' }).open).toBe('');
    expect(parseFilters({ open: B, creator: A }).open).toBe(B);
    // old sort names and a status filter
    expect(parseFilters({ sort: 'subscribers', dir: 'asc', status: 'active', q: 'x', page: '2' })).toMatchObject({ sort: 'subscribers', dir: 'asc', status: ['active'], q: 'x', page: 2 });
    expect(parseFilters({ sort: 'last_contacted' }).sort).toBe('last_contacted');
    expect(parseFilters({ sort: 'added', dir: 'desc' }).sort).toBe('added');
    expect(filtersToQuery({ ...parseFilters({}), creator: A, edit: true })).toBe(`?creator=${A}&edit=1`);
  });
  it('limits lists and removes duplicates', () => {
    const many = Array.from({ length: 80 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`).join(',');
    expect(parseFilters({ by: many }).by).toHaveLength(50);
    expect(parseFilters({ niche: 'tech,tech,gaming' }).niche).toEqual(['tech', 'gaming']);
  });
  it('turns the filters into typed SQL arguments', () => {
    expect(toRpcArgs(parseFilters({}))).toEqual({
      p_q: null, p_subs_min: null, p_subs_max: null, p_sponsored: null, p_detected: false, p_recent: null, p_by: null, p_niche: null, p_status: null,
      p_contacted: null, p_views: null, p_lang: null, p_country: null, p_email: false, p_tag: null, p_list: null,
    });
    expect(toRpcArgs(parseFilters({ subs: '5000-9000', niche: 'tech', sponsored: 'yes', detected: '1', recent: '30', by: A, views: '1000', email: '1' }))).toMatchObject({
      p_subs_min: 5000, p_subs_max: 9000, p_niche: ['tech'], p_sponsored: 'yes', p_detected: true, p_recent: 30, p_by: [A], p_views: 1000, p_email: true,
    });
  });
  it('cleans a saved view before it is stored or applied', () => {
    expect(cleanQuery(`?niche=tech,fake&page=4&open=${A}&sort=name&junk=1`)).toBe('niche=tech&sort=name');
    expect(cleanQuery('')).toBe('');
    expect(cleanQuery('sponsored=yes&detected=1&view=table')).toBe('sponsored=yes&detected=1&view=table');
    expect(cleanQuery('sponsored=yes&detected=1&view=cards')).toBe('sponsored=yes&detected=1');
  });
  it('writes chip text for the active filters', () => {
    const defs = creatorFilterDefs({ brands: { [A]: 'Acme' }, tags: {}, lists: {} }, true);
    const labels = chipsFromParams(new URLSearchParams(`q=ab&subs=10000-50000&sponsored=yes&detected=1&by=${A}&niche=tech&status=new&views=5000`), defs).filter((c) => c.key !== 'detected').map((c) => c.label);
    expect(labels).toEqual([
      'Search: "ab"', 'Subscribers: 10k to 50k', 'Has done sponsorships (detected records counted)', 'Sponsored by: Acme', 'Niche: Tech and gadgets', 'Status: New', 'Average views: 5k or more',
    ]);
  });
});

describe('csv', () => {
  it('protects against formula injection', () => {
    for (const c of ['=1+1', '+1+1', '+1x', '-1', '@SUM(A1)', '\tx', '\rx']) expect(csvSafeCell(c)).toBe(`'${c}`);
    expect(csvSafeCell('plain')).toBe('plain');
    expect(toCsv(['a', 'b'], [['=cmd', 'x,"y"']])).toBe('a,b\r\n\'=cmd,"x,""y"""\r\n');
  });
  it('leaves phone numbers alone and an export can be imported again', () => {
    expect(csvSafeCell('+1-555-0127')).toBe('+1-555-0127');
    expect(csvSafeCell('+1 (555) 010')).toBe('+1 (555) 010');
    const text = toCsv(['name', 'email', 'phone', 'notes'], [['A', 'a@x.test', '+1-555-0127', '=SUM(1)']]);
    const p = parseCsvText(text);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const [r] = classifyRows(p.rows, { emails: new Set(), channels: new Set() }, p.badRows);
    expect(r.status).toBe('new');
    expect(r.data).toMatchObject({ phone: '+1-555-0127', notes: '=SUM(1)' });
  });
  it('marks rows with the wrong number of columns as errors', () => {
    const p = parseCsvText('name,email,notes\nA,a@x.test,ok\nB,b@x.test\nC,c@x.test,one, two\n');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const rows = classifyRows(p.rows, { emails: new Set(), channels: new Set() }, p.badRows);
    expect(rows.map((r) => r.status)).toEqual(['new', 'error', 'error']);
    expect(rows[1].reason).toMatch(/columns/);
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

describe('new creator fields', () => {
  const ok = { name: 'Maya', email: 'maya@example.test', status: 'new' };
  it('accepts and cleans the optional fields', () => {
    const r = validateCreator({ ...ok, niche_slug: 'Tech', country: 'gb', language: 'PT-br', avg_views: '12,500', engagement_rate: '4.5%', audience_countries: 'US 40%', uploads_per_month: '6' });
    expect(r.ok && r.data).toMatchObject({ niche_slug: 'tech', country: 'GB', language: 'pt-BR', avg_views: 12500, engagement_rate: 4.5, audience_countries: 'US 40%', uploads_per_month: 6 });
  });
  it('leaves them empty when missing', () => {
    const r = validateCreator(ok);
    expect(r.ok && r.data).toMatchObject({ niche_slug: null, country: null, language: null, avg_views: null, engagement_rate: null, audience_countries: null, uploads_per_month: null });
  });
  it.each([
    [{ niche_slug: 'pottery' }, 'niche_slug'], [{ country: 'USA' }, 'country'], [{ language: 'english' }, 'language'], [{ avg_views: '-1' }, 'avg_views'],
    [{ avg_views: '1.5' }, 'avg_views'], [{ engagement_rate: '101' }, 'engagement_rate'], [{ engagement_rate: '4.555' }, 'engagement_rate'],
    [{ uploads_per_month: '301' }, 'uploads_per_month'], [{ audience_countries: 'x'.repeat(501) }, 'audience_countries'],
  ])('rejects %j', (bad, field) => {
    const r = validateCreator({ ...ok, ...bad });
    expect(!r.ok && field in r.errors).toBe(true);
  });
});

describe('CSV with the new columns', () => {
  const csv = (rows: string[]) => ['name,email,niche_slug,country,language,avg_views,engagement_rate,audience_countries', ...rows].join('\n');
  const none = { emails: new Set<string>(), channels: new Set<string>() };
  it('reports an unknown niche slug on its row', () => {
    const p = parseCsvText(csv(['A,a@example.test,tech,US,en,100,3.5,"US 50%"', 'B,b@example.test,pottery,,,,,']));
    if (!p.ok) throw new Error(p.error);
    const r = classifyRows(p.rows, none, p.badRows);
    expect(r[0]).toMatchObject({ status: 'new' });
    expect(r[1].status).toBe('error');
    expect(r[1].reason).toMatch(/Unknown niche/);
  });
  it('still imports a file without the new columns', () => {
    const p = parseCsvText('name,email\nA,a@example.test');
    if (!p.ok) throw new Error(p.error);
    const r = classifyRows(p.rows, none, p.badRows);
    expect(r[0].status).toBe('new');
    expect(r[0].data).toMatchObject({ niche_slug: null, avg_views: null });
  });
});
