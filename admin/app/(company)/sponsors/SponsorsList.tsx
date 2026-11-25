'use client';
// The sponsors list: filter rail, toolbar, chips, bulk bar, table or cards, side panel. The server page does the
// querying and passes rows, totals and the count beside every option; this component owns the page address.
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ANY_YES_NO, Badge, Button, Card, CardGrid, CheckList, Checkbox, Chips, CompactSelect, EmptyState, FacetGroup, FilterRail, FilterRailButton, KeyValue,
  Notice, Pagination, RadioList, SearchBox, Segmented, SidePanel, SkeletonCards, SkeletonRows, Table, TABLE_CARDS, cardLinkClass, cardRaiseClass, cardTitleClass,
  tableCell, useToast,
} from '@/components/ui';
import { clearFilters, chipsFromParams, removeChip, useListNav, type ChipItem } from '@/lib/lists';
import {
  BUDGET_BANDS, COMPANY_SIZES, COMPANY_SIZE_LABEL, COUNT_OPTIONS, LAST_OPTIONS, NICHES, PAGE_SIZE, RELATIONSHIPS, RELATIONSHIP_LABEL, RELATIONSHIP_TONE,
  SORT_OPTIONS, TARGET_BANDS, countryName, type FacetCounts, type SponsorRow,
} from '@/lib/sponsors/constants';
import { detectedMatters, filterDefs, filtersToParams, parseFilters } from '@/lib/sponsors/filters';
import { formatBudget, formatDate, formatTarget, nicheNames, placeText, relativeDays, sponsoredText } from '@/lib/sponsors/format';
import type { SavedView, Tag } from '@/lib/sponsors/queries';
import { ForPicker } from '@/components/matching/ForPicker';
import { MatchCell } from '@/components/matching/MatchCell';
import { addTagToSponsors } from './actions';
import { SavedViews } from './SavedViews';
import { SponsorDialog } from './SponsorDialog';
import s from './sponsors.module.css';

export type Relax = { chipId: string; label: string; n: number };

type Props = {
  rows: SponsorRow[];
  total: number;
  all: number;
  page: number;
  counts: FacetCounts;
  industries: string[];
  countries: string[];
  tags: Tag[];
  views: SavedView[];
  now: string;
  loadFailed: boolean;
  relax: Relax[];
  openId: string | null;
  panel: ReactNode;
};

export function SponsorsList({ rows, total, all, page, counts, industries, countries, tags, views, now, loadFailed, relax, openId, panel }: Props) {
  const nav = useListNav();
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tagName, setTagName] = useState('');
  const [busy, startBulk] = useTransition();
  const [bulkError, setBulkError] = useState('');

  const rowKey = rows.map((r) => r.id).join(',');
  useEffect(() => { setSel(new Set()); }, [rowKey]);

  // Chips and filters come from the cleaned address, so a value we ignore never shows as a chip.
  const clean = useMemo(() => filtersToParams(parseFilters(nav.params)), [nav.params]);
  const f = useMemo(() => parseFilters(nav.params), [nav.params]);
  const defs = useMemo(() => filterDefs((id) => tags.find((t) => t.id === id)?.name ?? 'Unknown tag'), [tags]);
  const chips = useMemo(
    () => chipsFromParams(clean, defs).filter((c) => c.key !== 'detected' || detectedMatters(clean)),
    [clean, defs],
  );
  const clearAll = () => nav.replaceAll(clearFilters(nav.params, defs));
  const view = f.view;
  // Best match is chosen first and the creator second, so the address may say sort=match with no `for` yet (the server then sorts by name).
  const sortValue = nav.get('sort') === 'match' ? 'match' : f.sort;
  const showMatch = rows.some((r) => r.match);

  const opt = (facet: string, value: string, label: string) => ({ value, label, count: counts[facet]?.[value] ?? 0 });
  const countOf = (facet: string, value: string) => counts[facet]?.[value] ?? 0;

  const sorts = SORT_OPTIONS.map((o) => ({ value: o.value as string, label: `Sort: ${o.label}` }));

  const idx = openId ? rows.findIndex((r) => r.id === openId) : -1;
  const openRow = idx >= 0 ? rows[idx] : null;
  const withOpen = (id: string) => { const p = new URLSearchParams(nav.params); p.set('open', id); return `?${p.toString()}`; };
  const open = (id: string) => nav.set('open', id);
  const hrefForPage = (p: number) => { const q = new URLSearchParams(nav.params); q.delete('open'); if (p > 1) q.set('page', String(p)); else q.delete('page'); const t = q.toString(); return t ? `?${t}` : '?'; };

  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function applyView(query: string) {
    nav.replaceAll(filtersToParams(parseFilters(query)));
  }

  function addTag() {
    setBulkError('');
    startBulk(async () => {
      const r = await addTagToSponsors([...sel], tagName);
      if (r.ok) { toast(r.message ?? 'Tag added.'); setTagName(''); setSel(new Set()); router.refresh(); } else setBulkError(r.error);
    });
  }

  const nameLink = (r: SponsorRow) => (
    <a
      href={withOpen(r.id)} className={s.nameLink}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); open(r.id); }}
    >{r.name}</a>
  );

  const sponsoredCell = (r: SponsorRow) => {
    const t = sponsoredText(r);
    if (t.none) return <span className={s.muted}>None found</span>;
    return (
      <>
        {t.confirmed}{t.detected ? <span className={s.muted}> + {t.detected}</span> : null}
        <span className={s.sub}>{r.last_sponsorship_at ? `Last: ${formatDate(r.last_sponsorship_at)}` : 'No confirmed date'}</span>
      </>
    );
  };

  const niches = (r: SponsorRow) => {
    const names = nicheNames(r.target_niches);
    return names.length ? <>{names.slice(0, 2).join(', ')}{names.length > 2 ? <span className={s.muted}> +{names.length - 2}</span> : null}</> : <span className={s.muted}>Not set</span>;
  };

  const countText = total === all ? `${all} sponsor${all === 1 ? '' : 's'}` : `${total} of ${all} sponsor${all === 1 ? '' : 's'}`;

  return (
    <div className="list-layout">
      <FilterRail
        activeCount={chips.length}
        onClearAll={clearAll}
        search={<SearchBox label="Search" value={nav.get('q') ?? ''} onChange={(v) => nav.set('q', v)} placeholder="Name, industry or website" />}
      >
        <FacetGroup id="sponsors.industry" label="Industry" on={nav.getAll('industry').length > 0} defaultOpen>
          <CheckList label="Industry" searchable={industries.length > 8} searchLabel="Find an industry" searchPlaceholder="Find an industry"
            options={industries.map((i) => opt('industry', i, i))} selected={nav.getAll('industry')} onToggle={(v) => nav.toggle('industry', v)} />
        </FacetGroup>
        <FacetGroup id="sponsors.niches" label="Niches they sponsor" on={nav.getAll('niches').length > 0} defaultOpen>
          <CheckList label="Niches they sponsor" options={NICHES.map((n) => opt('niches', n.slug, n.name))} selected={nav.getAll('niches')} onToggle={(v) => nav.toggle('niches', v)} />
        </FacetGroup>
        <FacetGroup id="sponsors.target" label="Target creator size" on={nav.has('target')} defaultOpen>
          <RadioList label="Target creator size" name="target" value={nav.get('target')} onChange={(v) => nav.set('target', v)}
            options={TARGET_BANDS.map((b) => opt('target', b.value, b.label))} hint="Subscribers. A sponsor matches when its target range overlaps." />
        </FacetGroup>
        <FacetGroup id="sponsors.budget" label="Typical budget per creator" on={nav.has('budget')} defaultOpen>
          <RadioList label="Typical budget per creator" name="budget" value={nav.get('budget')} onChange={(v) => nav.set('budget', v)}
            options={BUDGET_BANDS.map((b) => opt('budget', b.value, b.label))} />
        </FacetGroup>
        <FacetGroup id="sponsors.active" label="Currently active" on={nav.has('active')} defaultOpen>
          <Segmented label="Currently active" name="active" value={nav.get('active') ?? ''} onChange={(v) => nav.set('active', v || null)}
            options={ANY_YES_NO.map((o) => (o.value ? { ...o, count: countOf('active', o.value) } : o))} />
          <p className={`${s.small} ${s.muted}`} style={{ margin: '8px 0 0' }}>Active means a sponsorship in the last 90 days.</p>
          <Checkbox label="Count detected records too" hint="(not verified)" checked={nav.get('detected') === '1'} onChange={(e) => nav.set('detected', e.target.checked ? '1' : null)} />
        </FacetGroup>
        <FacetGroup id="sponsors.count" label="Creators sponsored" on={nav.has('count')} defaultOpen>
          <RadioList label="Creators sponsored" name="count" value={nav.get('count')} onChange={(v) => nav.set('count', v)} options={COUNT_OPTIONS.map((o) => opt('count', o.value, o.label))} />
        </FacetGroup>
        <FacetGroup id="sponsors.last" label="Last sponsorship" on={nav.has('last')}>
          <RadioList label="Last sponsorship" name="last" value={nav.get('last')} onChange={(v) => nav.set('last', v)} options={LAST_OPTIONS.map((o) => opt('last', o.value, o.label))} />
        </FacetGroup>
        <FacetGroup id="sponsors.rel" label="Our contact status" on={nav.getAll('rel').length > 0} defaultOpen>
          <CheckList label="Our contact status" options={RELATIONSHIPS.map((r) => opt('rel', r, RELATIONSHIP_LABEL[r]))} selected={nav.getAll('rel')} onToggle={(v) => nav.toggle('rel', v)} />
        </FacetGroup>
        <FacetGroup id="sponsors.size" label="Company size (people)" on={nav.getAll('size').length > 0}>
          <CheckList label="Company size" options={COMPANY_SIZES.map((c) => opt('size', c, COMPANY_SIZE_LABEL[c]))} selected={nav.getAll('size')} onToggle={(v) => nav.toggle('size', v)} />
        </FacetGroup>
        <FacetGroup id="sponsors.country" label="Location" on={nav.getAll('country').length > 0}>
          <CheckList label="Location" searchable={countries.length > 8} searchLabel="Find a country" searchPlaceholder="Find a country"
            options={countries.map((c) => opt('country', c, countryName(c)))} selected={nav.getAll('country')} onToggle={(v) => nav.toggle('country', v)} />
        </FacetGroup>
        <FacetGroup id="sponsors.contact" label="Has a contact person" on={nav.get('contact') === '1'}>
          <CheckList label="Has a contact person" options={[opt('contact', '1', 'Only sponsors with a contact person')]} selected={nav.get('contact') === '1' ? ['1'] : []}
            onToggle={() => nav.set('contact', nav.get('contact') === '1' ? null : '1')} />
        </FacetGroup>
        <FacetGroup id="sponsors.tag" label="Tag" on={nav.getAll('tag').length > 0}>
          <CheckList label="Tag" emptyText="No tags yet. Select sponsors and use Add a tag." options={tags.map((t) => opt('tag', t.id, t.name))} selected={nav.getAll('tag')} onToggle={(v) => nav.toggle('tag', v)} />
        </FacetGroup>
      </FilterRail>

      <div className="list-results" aria-busy={nav.isPending}>
        <div className="list-tools">
          <FilterRailButton count={chips.length} />
          <div className="list-count" role="status" aria-live="polite">{loadFailed ? 'Sponsors' : countText}</div>
          <CompactSelect label="Sort by" value={sortValue} onChange={(v) => nav.setMany({ sort: v === 'name' ? null : v, for: v === 'match' ? nav.get('for') : null })} options={sorts} />
          {sortValue === 'match' ? <ForPicker kind="creator" valueId={nav.get('for')} onChange={(id) => nav.set('for', id)} /> : null}
          <Segmented inline label="View" options={TABLE_CARDS} value={view} name="view" onChange={(v) => nav.set('view', v === 'table' ? null : v)} />
          <SavedViews views={views} params={nav.params} onApply={applyView} />
        </div>

        <Chips items={chips} onRemove={(c) => nav.replaceAll(removeChip(nav.params, c, defs))} onClearAll={clearAll} />

        {sel.size > 0 ? (
          <div className="list-bulk" role="region" aria-label="Selected sponsors">
            <strong>{sel.size} selected</strong>
            <div className={s.bulkTag}>
              <label className="sr-only" htmlFor="bulk-tag">Tag name</label>
              <input id="bulk-tag" list="bulk-tag-list" value={tagName} maxLength={60} placeholder="Tag name" onChange={(e) => setTagName(e.target.value)} />
              <datalist id="bulk-tag-list">{tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
              <Button size="sm" loading={busy} disabled={!tagName.trim()} onClick={addTag}>Add a tag</Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>Clear selection</Button>
            {bulkError ? <span role="alert">{bulkError}</span> : null}
          </div>
        ) : null}

        <div className="list-body">
          {loadFailed ? (
            <Notice tone="error" title="The sponsors could not be loaded. ">Check your connection, then try again. Your filters are kept.{' '}
              <Button size="sm" onClick={() => router.refresh()}>Try again</Button></Notice>
          ) : nav.isPending ? (
            view === 'cards' ? <SkeletonCards count={6} /> : <SkeletonRows rows={8} columns={7} />
          ) : all === 0 ? (
            <EmptyState title="No sponsors yet" action={<span className="list-row" style={{ justifyContent: 'center' }}><SponsorDialog mode="add" label="Add the first sponsor" /><Link href="/sponsors/import">Import a CSV file</Link></span>}>
              Add one by hand or import a CSV file.
            </EmptyState>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No sponsors match all of these filters"
              action={
                <span className="list-row" style={{ justifyContent: 'center' }}>
                  {relax.map((x) => {
                    const chip = chips.find((c) => c.id === x.chipId);
                    return chip ? <Button key={x.chipId} variant="ghost" size="sm" onClick={() => nav.replaceAll(removeChip(nav.params, chip as ChipItem, defs))}>Remove “{x.label}” ({x.n})</Button> : null;
                  })}
                  <Button size="sm" onClick={clearAll}>Clear all filters</Button>
                </span>
              }
            >{relax.length ? 'Removing one filter brings results back:' : 'Try clearing the filters.'}</EmptyState>
          ) : view === 'cards' ? (
            <CardGrid label="Sponsors">
              {rows.map((r) => (
                <Card key={r.id}>
                  <div className={s.cardTop}>
                    <Badge tone={RELATIONSHIP_TONE[r.relationship]}>{RELATIONSHIP_LABEL[r.relationship]}</Badge>
                    <span className={cardRaiseClass}><Checkbox aria-label={`Select ${r.name}`} label="" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></span>
                  </div>
                  <h3 className={cardTitleClass}>
                    <a href={withOpen(r.id)} className={cardLinkClass} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); open(r.id); }}>{r.name}</a>
                  </h3>
                  <p className={`${s.muted} ${s.small}`} style={{ margin: 0 }}>{placeText(r.industry, r.country)}</p>
                  <KeyValue label="Target size">{formatTarget(r.target_min_subs, r.target_max_subs)}</KeyValue>
                  <KeyValue label="Budget">{formatBudget(r.budget_min_cents, r.budget_max_cents)}</KeyValue>
                  <KeyValue label="Creators sponsored">{sponsoredText(r).none ? 'None found' : `${r.sponsorship_count} confirmed`}</KeyValue>
                  {r.match ? <div className={cardRaiseClass}><MatchCell match={r.match} /></div> : null}
                </Card>
              ))}
            </CardGrid>
          ) : (
            <Table clickable label="Sponsors">
              <thead>
                <tr>
                  <th className={s.checkCell}><input type="checkbox" checked={allOnPage} onChange={() => setSel(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all on this page" /></th>
                  <th>Sponsor</th>{showMatch ? <th>Match</th> : null}<th>Niches</th><th className={tableCell.num}>Target size</th><th className={tableCell.num}>Budget per creator</th>
                  <th>Creators sponsored</th><th>Contact status</th><th>Last contacted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={(e) => { if ((e.target as HTMLElement).closest('a,button,input,label')) return; open(r.id); }}>
                    <td className={s.checkCell}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} /></td>
                    <td className={s.nameCell}>{nameLink(r)}<span className={s.sub}>{placeText(r.industry, r.country)}</span></td>
                    {showMatch ? <td>{r.match ? <MatchCell match={r.match} /> : null}</td> : null}
                    <td>{niches(r)}</td>
                    <td className={`${tableCell.num} ${s.nowrap}`}>{formatTarget(r.target_min_subs, r.target_max_subs)}</td>
                    <td className={`${tableCell.num} ${s.nowrap}`}>{formatBudget(r.budget_min_cents, r.budget_max_cents)}</td>
                    <td className={s.spCell}>{sponsoredCell(r)}</td>
                    <td><Badge tone={RELATIONSHIP_TONE[r.relationship]}>{RELATIONSHIP_LABEL[r.relationship]}</Badge></td>
                    <td className={s.nowrap}>{relativeDays(r.last_contacted_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {!loadFailed && rows.length > 0 ? <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefForPage} /> : null}
        </div>
      </div>

      <SidePanel
        open={!!openId}
        onClose={() => nav.set('open', null)}
        label={openRow?.name ?? 'Sponsor'}
        position={idx >= 0 ? { index: idx + 1, total: rows.length } : undefined}
        onPrevious={idx > 0 ? () => open(rows[idx - 1].id) : undefined}
        onNext={idx >= 0 && idx < rows.length - 1 ? () => open(rows[idx + 1].id) : undefined}
        fullPageHref={openId ? `/sponsors/${openId}` : undefined}
        scrollKey={openId ?? ''}
      >
        {panel}
      </SidePanel>
    </div>
  );
}

