'use client';
// The left filter rail of the Creators list, in the order of the spec. Every control writes to the page address
// through useListNav (no Apply button); the number beside an option comes from the server.
import { useMemo } from 'react';
import {
  Checkbox, CheckList, FacetGroup, FilterRail, RadioList, RangeSlider, SearchBox, SUBS_PRESETS, type FacetOption,
} from '@/components/ui';
import { CONTACTED_OPTIONS, NICHES, RECENT_OPTIONS, STATUSES, STATUS_LABEL, VIEWS_OPTIONS } from '@/lib/creators/constants';
import { formatRange, parseRange } from '@/lib/lists/numbers';
import type { ListNav } from '@/lib/lists/useListNav';

export type Named = { id: string; name: string };
export type OptionNames = { brands: Named[]; tags: Named[]; lists: Named[]; langs: Record<string, string>; countries: Record<string, string> };

type Counts = Record<string, Record<string, number>>;

export function CreatorsFilters({ nav, counts, names, chipCount, onClearAll }: {
  nav: ListNav; counts: Counts; names: OptionNames; chipCount: number; onClearAll: () => void;
}) {
  const c = (facet: string, value: string) => counts[facet]?.[value] ?? 0;
  const detected = nav.get('detected') === '1';

  const opts = useMemo(() => ({
    by: names.brands.map((b) => ({ value: b.id, label: b.name })),
    niche: Object.entries(NICHES).map(([value, label]) => ({ value, label })),
    status: STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
    tag: names.tags.map((t) => ({ value: t.id, label: t.name })),
    list: names.lists.map((l) => ({ value: l.id, label: l.name })),
    // Languages and countries come from the data itself (the options that exist), named in plain English.
    lang: Object.keys(names.langs).sort((a, b) => names.langs[a].localeCompare(names.langs[b])).map((value) => ({ value, label: names.langs[value] })),
    country: Object.keys(names.countries).sort((a, b) => names.countries[a].localeCompare(names.countries[b])).map((value) => ({ value, label: names.countries[value] })),
  }), [names]);
  const withCount = (facet: string, list: FacetOption[]): FacetOption[] => list.map((o) => ({ ...o, count: c(facet, o.value) }));

  const subs = parseRange(nav.get('subs')) ?? [null, null];
  const q = nav.get('q') ?? '';

  return (
    <FilterRail
      activeCount={chipCount}
      onClearAll={onClearAll}
      search={<SearchBox label="Search" value={q} onChange={(v) => nav.set('q', v.slice(0, 100))} placeholder="Name, channel or email" maxLength={100} />}
    >
      <FacetGroup id="creators.subs" label="Subscribers" on={nav.has('subs')} defaultOpen>
        <RangeSlider
          label="Subscribers" minLabel="Fewest subscribers" maxLabel="Most subscribers" unit="subscribers"
          value={[subs[0], subs[1]]} onChange={(a, b) => nav.set('subs', formatRange(a, b))} presets={SUBS_PRESETS}
        />
      </FacetGroup>

      <FacetGroup id="creators.sponsored" label="Has done sponsorships" on={nav.has('sponsored') || detected} defaultOpen>
        <RadioList
          label="Has done sponsorships" name="creators-sponsored" value={nav.get('sponsored')} onChange={(v) => nav.set('sponsored', v)}
          options={[{ value: 'yes', label: 'Yes', count: c('sponsored', 'yes') }, { value: 'no', label: 'No', count: c('sponsored', 'no') }]}
        >
          <Checkbox
            label="Count detected records too" hint="(not verified)" checked={detected}
            onChange={(e) => nav.set('detected', e.target.checked ? '1' : null)}
          />
        </RadioList>
      </FacetGroup>

      <FacetGroup id="creators.recent" label="Sponsored recently" on={nav.has('recent')} defaultOpen>
        <RadioList
          label="Sponsored recently" name="creators-recent" value={nav.get('recent')} onChange={(v) => nav.set('recent', v)}
          options={RECENT_OPTIONS.map((d) => ({ value: String(d), label: `Last ${d} days`, count: c('recent', String(d)) }))}
        />
      </FacetGroup>

      <FacetGroup id="creators.by" label="Sponsored by" on={nav.has('by')} defaultOpen>
        <CheckList
          label="Sponsored by" searchable searchLabel="Find a sponsor in this list" searchPlaceholder="Find a sponsor" emptyText="No sponsor has a sponsorship record yet."
          options={withCount('by', opts.by)} selected={nav.getAll('by')} onToggle={(v) => nav.toggle('by', v)}
        />
      </FacetGroup>

      <FacetGroup id="creators.niche" label="Niche" on={nav.has('niche')} defaultOpen>
        <CheckList label="Niche" options={withCount('niche', opts.niche)} selected={nav.getAll('niche')} onToggle={(v) => nav.toggle('niche', v)} />
      </FacetGroup>

      <FacetGroup id="creators.status" label="Pipeline status" on={nav.has('status')} defaultOpen>
        <CheckList label="Pipeline status" options={withCount('status', opts.status)} selected={nav.getAll('status')} onToggle={(v) => nav.toggle('status', v)} />
      </FacetGroup>

      <FacetGroup id="creators.contacted" label="Last contacted" on={nav.has('contacted')}>
        <RadioList
          label="Last contacted" name="creators-contacted" value={nav.get('contacted')} onChange={(v) => nav.set('contacted', v)}
          options={CONTACTED_OPTIONS.map((o) => ({ value: o.value, label: o.label, count: c('contacted', o.value) }))}
        />
      </FacetGroup>

      <FacetGroup id="creators.views" label="Average views" on={nav.has('views')}>
        <RadioList
          label="Average views" name="creators-views" value={nav.get('views')} onChange={(v) => nav.set('views', v)}
          options={VIEWS_OPTIONS.map((o) => ({ value: o.value, label: o.label, count: c('views', o.value) }))}
        />
      </FacetGroup>

      <FacetGroup id="creators.lang" label="Language" on={nav.has('lang')}>
        <CheckList label="Language" options={withCount('lang', opts.lang)} selected={nav.getAll('lang')} onToggle={(v) => nav.toggle('lang', v)} emptyText="No creator has a language yet." />
      </FacetGroup>

      <FacetGroup id="creators.country" label="Country" on={nav.has('country')}>
        <CheckList label="Country" options={withCount('country', opts.country)} selected={nav.getAll('country')} onToggle={(v) => nav.toggle('country', v)} emptyText="No creator has a country yet." />
      </FacetGroup>

      <FacetGroup id="creators.email" label="Has an email address" on={nav.get('email') === '1'}>
        <Checkbox
          label="Only creators with an email address" hint={`(${c('email', '1')})`}
          checked={nav.get('email') === '1'} onChange={(e) => nav.set('email', e.target.checked ? '1' : null)}
        />
      </FacetGroup>

      <FacetGroup id="creators.tag" label="Tag" on={nav.has('tag')}>
        <CheckList label="Tag" options={withCount('tag', opts.tag)} selected={nav.getAll('tag')} onToggle={(v) => nav.toggle('tag', v)} emptyText="No tags yet. Add one to ticked creators from the list." />
      </FacetGroup>

      <FacetGroup id="creators.list" label="List" on={nav.has('list')}>
        <CheckList label="List" options={withCount('list', opts.list)} selected={nav.getAll('list')} onToggle={(v) => nav.toggle('list', v)} emptyText="No lists yet. Add ticked creators to a new list from the list." />
      </FacetGroup>
    </FilterRail>
  );
}
