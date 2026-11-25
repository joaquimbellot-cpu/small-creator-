import { describe, expect, it } from 'vitest';
import { cleanCell, classifyRows, csvSafeCell, parseCsvText, SAMPLE_CSV, toCsv, CSV_COLUMNS } from './csv';
import { detectedMatters, filterDefs, filtersToParams, filtersToRpc, parseFilters, viewQuery } from './filters';
import {
  isHttpsUrl, normalizeLinkedIn, normalizeWebsite, parseCompanySize, parseCountry, parseNiches, parseRelationship, parseUsdToCents,
  validateContact, validateImportRow, validateSponsor,
} from './schema';
import { chipsFromParams, removeChip } from '../lists/query';

const UUID = '3f2b8c1e-5d4a-4b6f-9a7e-0c1d2e3f4a5b';
const FULL = `q=kit&industry=Software,Education&niches=tech,gaming&target=10000-50000&budget=250-1000&active=yes&detected=1&count=3&last=90&rel=partner,talks&size=11-50&country=US,GB&contact=1&tag=${UUID}&sort=budget&dir=asc&view=cards&page=3&open=${UUID}`;

describe('filters', () => {
  it('every key round-trips', () => {
    const f = parseFilters(FULL);
    expect(f.q).toBe('kit');
    expect(f.industry).toEqual(['Software', 'Education']);
    expect(f.niches).toEqual(['tech', 'gaming']);
    expect(f.target).toEqual([10000, 50000]);
    expect(f.budget).toEqual([250, 1000]);
    expect(f.active).toBe('yes');
    expect(f.detected).toBe(true);
    expect(f.count).toBe(3);
    expect(f.last).toBe(90);
    expect(f.rel).toEqual(['partner', 'talks']);
    expect(f.size).toEqual(['11-50']);
    expect(f.country).toEqual(['US', 'GB']);
    expect(f.contact).toBe(true);
    expect(f.tag).toEqual([UUID]);
    expect(f.sort).toBe('budget');
    expect(f.dir).toBe('asc');
    expect(f.view).toBe('cards');
    expect(f.page).toBe(3);
    expect(f.open).toBe(UUID);
    const again = parseFilters(filtersToParams(f));
    expect(again).toEqual(f);
    expect(filtersToParams(again).toString()).toBe(filtersToParams(f).toString());
  });

  it('best match keeps the creator, and falls back to name without one', () => {
    expect(parseFilters(`sort=match&for=${UUID}`)).toMatchObject({ sort: 'match', for: UUID });
    expect(parseFilters('sort=match').sort).toBe('name');
    expect(parseFilters(`sort=count&for=${UUID}`).for).toBeNull();
    expect(filtersToParams(parseFilters(`sort=match&for=${UUID}`)).toString()).toBe(`sort=match&for=${UUID}`);
  });

  it('bad values are dropped', () => {
    const f = parseFilters('niches=tech,nope&rel=partner,x&size=5&country=usa,us,U1&target=abc&budget=-&active=maybe&count=2&last=45&tag=1,2&sort=drop&dir=up&view=grid&page=-4&open=zzz&for=1&contact=0&detected=yes');
    expect(f.niches).toEqual(['tech']);
    expect(f.rel).toEqual(['partner']);
    expect(f.size).toEqual([]);
    expect(f.country).toEqual([]);
    expect(f.target).toBeNull();
    expect(f.budget).toBeNull();
    expect(f.active).toBeNull();
    expect(f.count).toBeNull();
    expect(f.last).toBeNull();
    expect(f.tag).toEqual([]);
    expect(f.sort).toBe('name');
    expect(f.dir).toBeNull();
    expect(f.view).toBe('table');
    expect(f.page).toBe(1);
    expect(f.open).toBeNull();
    expect(f.for).toBeNull();
    expect(f.contact).toBe(false);
    expect(f.detected).toBe(false);
    expect(filtersToParams(f).toString()).toBe('niches=tech&rel=partner');
    expect(filtersToParams(parseFilters('niches=x&page=0')).toString()).toBe('');
  });

  it('limits sizes and lengths', () => {
    expect(parseFilters('target=1-99999999999').target).toBeNull();
    expect(parseFilters('budget=1-999999999999').budget).toBeNull();
    expect(parseFilters(`q=${'a'.repeat(300)}`).q).toHaveLength(100);
    expect(parseFilters('target=50000-10000').target).toEqual([10000, 50000]);
    expect(parseFilters('page=99999999').page).toBe(1);
  });

  it('works with the Next searchParams object', () => {
    const f = parseFilters({ niches: ['tech', 'gaming'], q: 'x', page: '2' });
    expect(f.niches).toEqual(['tech', 'gaming']);
    expect(f.page).toBe(2);
  });

  it('builds the database object with only what is on', () => {
    expect(filtersToRpc(parseFilters(''))).toEqual({});
    const o = filtersToRpc(parseFilters(FULL));
    expect(o).toMatchObject({ q: 'kit', target_min: 10000, target_max: 50000, budget_min: 250, budget_max: 1000, active: 'yes', detected: 'true', count: 3, last: 90, contact: 'true' });
    expect(filtersToRpc(parseFilters('target=100000-'))).toEqual({ target_min: 100000 });
  });

  it('a saved view keeps filters but not the page or the open panel', () => {
    expect(viewQuery(FULL)).not.toMatch(/page=|open=/);
    expect(viewQuery(FULL)).toContain('niches=tech%2Cgaming');
  });

  it('makes one chip per value and the detected chip only matters next to its three filters', () => {
    const p = new URLSearchParams(FULL);
    const chips = chipsFromParams(p, filterDefs(() => 'Pays fast'));
    expect(chips.map((c) => c.label)).toEqual(expect.arrayContaining([
      'Search: "kit"', 'Industry: Software', 'Niche: Tech and gadgets', 'Target size: 10k to 50k', 'Budget: $250 to $1,000',
      'Currently active', 'Contact status: In talks', 'Location: United Kingdom', 'Has a contact person', 'Tag: Pays fast',
    ]));
    expect(removeChip(p, chips.find((c) => c.id === 'niches:gaming')!, filterDefs()).get('niches')).toBe('tech');
    expect(detectedMatters(new URLSearchParams('detected=1'))).toBe(false);
    expect(detectedMatters(new URLSearchParams('detected=1&last=30'))).toBe(true);
  });
});

describe('schema', () => {
  const ok = { name: ' Acme Tools ', website: 'acme.example.test', industry: 'Tools', country: 'us', company_size: '11 to 50', niches: ['tech', 'diy'], target_min_subs: '5k', target_max_subs: '50,000', budget_min: '$200', budget_max: '1,000', relationship: 'In talks', notes: ' hi ' };

  it('accepts a good sponsor and converts units', () => {
    const r = validateSponsor(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({
      name: 'Acme Tools', website: 'https://acme.example.test', industry: 'Tools', country: 'US', company_size: '11-50', target_niches: ['tech', 'diy'],
      target_min_subs: 5000, target_max_subs: 50000, budget_min_cents: 20000, budget_max_cents: 100000, relationship: 'talks', notes: 'hi',
    });
  });

  it('only needs a name; empty fields become null and the status starts as a prospect', () => {
    const r = validateSponsor({ name: 'X' });
    expect(r).toEqual({ ok: true, data: expect.objectContaining({ website: null, target_niches: [], budget_min_cents: null, relationship: 'prospect', notes: null }) });
    expect(validateSponsor({ name: '  ' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  });

  it('refuses wrong values with a plain message', () => {
    const r = validateSponsor({ ...ok, website: 'javascript:alert(1)', country: 'Atlantis', company_size: '7', niches: ['tech', 'bogus'], target_min_subs: '60k', target_max_subs: '5k', budget_min: '1,000', budget_max: '5', relationship: 'friend' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['budget_max', 'company_size', 'country', 'niches', 'relationship', 'target_max_subs', 'website']);
    expect(validateSponsor({ ...ok, target_min_subs: 'lots' })).toMatchObject({ ok: false, errors: { target_min_subs: expect.stringContaining('5k') } });
    expect(validateSponsor({ ...ok, name: 'a'.repeat(201) }).ok).toBe(false);
    expect(validateSponsor({ ...ok, notes: 'a'.repeat(5001) }).ok).toBe(false);
  });

  it('reads money, websites, LinkedIn, statuses, sizes, countries and niches', () => {
    expect(parseUsdToCents('$1,250.50')).toBe(125050);
    expect(parseUsdToCents('1.5k')).toBe(150000);
    expect(parseUsdToCents('abc')).toBeNull();
    expect(parseUsdToCents('-5')).toBeNull();
    expect(normalizeWebsite('https://a.example.test/x/')).toBe('https://a.example.test/x');
    expect(normalizeWebsite('http://a.example.test')).toBeNull();
    expect(normalizeWebsite('a b.example.test')).toBeNull();
    expect(normalizeWebsite('https://user:pw@a.example.test')).toBeNull();
    expect(normalizeWebsite('localhost')).toBeNull();
    expect(isHttpsUrl('https://a.example.test')).toBe(true);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(normalizeLinkedIn('https://www.linkedin.com/in/x')).toBe('https://www.linkedin.com/in/x');
    expect(normalizeLinkedIn('linkedin.com/in/x')).toBe('https://linkedin.com/in/x');
    expect(normalizeLinkedIn('https://linkedin.com.evil.test/in/x')).toBeNull();
    expect(normalizeLinkedIn('http://www.linkedin.com/in/x')).toBeNull();
    expect(normalizeLinkedIn('https://evil.test/linkedin.com/')).toBeNull();
    expect(parseRelationship('Past partner')).toBe('past');
    expect(parseRelationship('do not contact')).toBe('do_not_contact');
    expect(parseRelationship('nope')).toBeNull();
    expect(parseCompanySize('Over 1,000')).toBe('1000+');
    expect(parseCompanySize('201 to 1,000')).toBe('201-1000');
    expect(parseCompanySize('12')).toBeNull();
    expect(parseCountry('United Kingdom')).toBe('GB');
    expect(parseCountry('zz')).toBeNull();
    expect(parseNiches('Tech and gadgets; diy | gaming').slugs).toEqual(['tech', 'diy', 'gaming']);
    expect(parseNiches('tech,zzz').unknown).toEqual(['zzz']);
  });

  it('checks a contact person (LinkedIn must be https on linkedin.com)', () => {
    expect(validateContact({ full_name: 'Sam', email: 'sam@example.test', linkedin_url: 'https://www.linkedin.com/in/sam', phone: '+1 555 0100' }).ok).toBe(true);
    const bad = validateContact({ full_name: '', email: 'not an email', linkedin_url: 'https://evil.test/in/sam', phone: 'call me' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['email', 'full_name', 'linkedin_url', 'phone']);
  });
});

describe('csv', () => {
  it('guards leading formula characters on export, not phone numbers', () => {
    expect(csvSafeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvSafeCell('+cmd')).toBe("'+cmd");
    expect(csvSafeCell('-1')).toBe("'-1");
    expect(csvSafeCell('@x')).toBe("'@x");
    expect(csvSafeCell('+1 555 0100')).toBe('+1 555 0100');
    expect(csvSafeCell('plain')).toBe('plain');
    expect(toCsv(['a', 'b'], [['=1', 'x,"y"']])).toBe('a,b\r\n\'=1,"x,""y"""\r\n');
  });

  it('strips leading formula characters on import', () => {
    expect(cleanCell('=cmd|calc')).toBe('cmd|calc');
    expect(cleanCell("'=1+1")).toBe('1+1');
    expect(cleanCell('  @home')).toBe('home');
    expect(cleanCell('+1 555 0100', 'contact_phone')).toBe('+1 555 0100');
    expect(cleanCell('+cmd', 'contact_phone')).toBe('cmd');
  });

  it('reads the sample file: two new rows', () => {
    const p = parseCsvText(SAMPLE_CSV);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.rows).toHaveLength(2);
    const rows = classifyRows(p.rows, new Set(), p.badRows);
    expect(rows.map((r) => r.status)).toEqual(['new', 'new']);
    expect(rows[0].data?.contact?.email).toBe('sam.sample@example.test');
    expect(rows[1].data?.sponsor).toMatchObject({ target_niches: ['outdoors', 'travel'], budget_min_cents: 50000, budget_max_cents: 250000, website: 'https://trail-sample.example.test' });
    expect(rows[1].data?.contact).toBeNull();
  });

  it('marks duplicates (database or earlier line, any letter case) and errors', () => {
    const csv = ['name,website,niches,relationship', 'Acme,,tech,', 'ACME,,,', 'Existing One,,,', ',https://x.example.test,,', 'Bad,javascript:x,,', 'Odd,,zzz,', 'Wrong,,,nobody'].join('\n');
    const p = parseCsvText(csv);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const rows = classifyRows(p.rows, new Set(['existing one']), p.badRows);
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'duplicate', 'error', 'error', 'error', 'error']);
    expect(rows[1].reason).toMatch(/line 2/);
  });

  it('rejects a file without a name column, an empty file, too many rows and ragged rows', () => {
    expect(parseCsvText('email\nx').ok).toBe(false);
    expect(parseCsvText('name\n').ok).toBe(false);
    expect(parseCsvText(['name', ...Array.from({ length: 2001 }, (_, i) => `n${i}`)].join('\n')).ok).toBe(false);
    const p = parseCsvText('name,notes\nA,hello, world\nB,fine');
    expect(p.ok && p.badRows.has(0)).toBe(true);
    expect(classifyRows((p as { rows: Record<string, string>[] }).rows, new Set(), (p as { badRows: Set<number> }).badRows)[0].status).toBe('error');
  });

  it('strips formulas from imported cells', () => {
    const r = validateImportRow({ name: 'X' });
    expect(r.ok).toBe(true);
    const p = parseCsvText('name,notes\n=HYPERLINK("x"),+cmd');
    if (!p.ok) throw new Error('parse');
    const rows = classifyRows(p.rows, new Set());
    expect(rows[0].status).toBe('new');
    expect(rows[0].data?.sponsor.name).toBe('HYPERLINK("x")');
    expect(rows[0].data?.sponsor.notes).toBe('cmd');
  });

  it('the export columns are the import columns', () => {
    expect(CSV_COLUMNS).toHaveLength(17);
    expect(SAMPLE_CSV.split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
  });
});
