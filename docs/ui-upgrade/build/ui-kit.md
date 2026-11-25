# UI kit for list pages

Built by the UI kit agent. You cannot change these files; if you need a change, say so in your report.
Import everything from `@/components/ui` and `@/lib/lists`. Look: hairlines, 8px corners, no shadows, no icons, tokens only.
Client components (they need `'use client'` in the page part that uses them): `FilterRail`, `FilterRailButton`, `FacetGroup`, `CheckList`, `RadioList`, `Segmented`, `RangeSlider`, `Chips`, `SidePanel`, `ToastProvider` / `useToast`, `Menu`, `useListNav`. All others work in server components.

## 1. Page skeleton for a list page

The page (server component) reads `searchParams`, queries rows and counts, and hands them to one client component that owns the filters.

```tsx
// app/(company)/creators/page.tsx  (server)
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  await requireStaff();
  const sp = await searchParams;
  const { rows, total, counts } = await loadCreators(sp);       // your own query
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Creators</h1><p className="page-lead">...</p></div>
        <div className="list-row"><LinkButton href="/creators/import" variant="ghost">Import</LinkButton></div>
      </div>
      <CreatorsList rows={rows} total={total} counts={counts} />
    </>
  );
}
```

```tsx
// CreatorsList.tsx  (client)
'use client';
const FILTERS: FilterDef[] = [ { key: 'q', label: 'Search' }, { key: 'subs', label: 'Subscribers', kind: 'range' }, ... ];

export function CreatorsList({ rows, total, counts }: Props) {
  const nav = useListNav();
  const chips = chipsFromParams(nav.params, FILTERS);
  const view = nav.get('view') ?? 'table';
  return (
    <div className="list-layout">                                   {/* 280px rail + results; one column under 900px */}
      <FilterRail activeCount={chips.length} onClearAll={() => nav.replaceAll(clearFilters(nav.params, FILTERS))}
        search={<SearchBox label="Search" value={nav.get('q') ?? ''} onChange={(v) => nav.set('q', v)} placeholder="Name, channel or email" />}>
        <FacetGroup id="creators.subs" label="Subscribers" on={nav.has('subs')} defaultOpen>
          <RangeSlider label="Subscribers" minLabel="Fewest subscribers" maxLabel="Most subscribers"
            value={parseRange(nav.get('subs')) ?? [null, null]} onChange={(a, b) => nav.set('subs', formatRange(a, b))} presets={SUBS_PRESETS} />
        </FacetGroup>
        <FacetGroup id="creators.niche" label="Niche" on={nav.getAll('niche').length > 0}>
          <CheckList label="Niche" options={nicheOptions /* {value,label,count} */} selected={nav.getAll('niche')} onToggle={(v) => nav.toggle('niche', v)} />
        </FacetGroup>
      </FilterRail>

      <div className="list-results" aria-busy={nav.isPending}>
        <div className="list-tools">                                {/* toolbar */}
          <FilterRailButton count={chips.length} />                 {/* only visible under 900px */}
          <div className="list-count" role="status" aria-live="polite">{rows.length} of {total} creators</div>
          <CompactSelect label="Sort by" value={nav.get('sort') ?? 'name'} onChange={(v) => nav.set('sort', v)} options={SORTS} />
          <Segmented inline label="View" options={TABLE_CARDS} value={view} onChange={(v) => nav.set('view', v === 'table' ? null : v)} />
          <Menu label="Saved views">{({ close }) => (<>...<MenuItem onSelect={close}>View name</MenuItem></>)}</Menu>
        </div>
        <Chips items={chips} onRemove={(c) => nav.replaceAll(removeChip(nav.params, c, FILTERS))} onClearAll={() => nav.replaceAll(clearFilters(nav.params, FILTERS))} />
        <div className="list-bulk">...selection bar when rows are ticked...</div>
        <div className="list-body">                                  {/* dims while pending (see below) */}
          {nav.isPending ? <SkeletonRows rows={8} columns={5} /> :
            rows.length === 0 ? <EmptyState title="No creators match all of these filters" action={...}>...</EmptyState> :
            view === 'cards' ? <CardGrid>{rows.map(r => <Card key={r.id}>...</Card>)}</CardGrid> :
            <Table clickable label="Creators">...</Table>}
          <Pagination page={page} pageSize={25} total={total} hrefFor={(p) => `?${withPage(nav.params, p)}`} />
        </div>
      </div>
      <SidePanel open={!!openId} onClose={() => nav.set('open', null)} label={name} position={{ index, total: rows.length }} ... fullPageHref={`/creators/${openId}`}>...</SidePanel>
    </div>
  );
}
```

Global classes (in `globals.css`): `list-layout`, `list-results`, `list-tools`, `list-count`, `list-grow`, `list-row`, `list-bulk`, `list-body` (inside `list-results[aria-busy=true]` it dims), `panel-sec`, `panel-sec__head`, `panel-head`, `dl` (with `dt`, `dd`), `person`. Existing: `page-head`, `page-title`, `page-lead`, `toolbar`, `tile`, `muted`, `label`, `subnav`, `sr-only`.

Notes:
- Counts per option come from the server (your query); pass them as `count`. A count of 0 dims the option but it stays usable.
- While `nav.isPending` is true, either show `SkeletonRows` / `SkeletonCards` or keep the old rows (dimmed by `aria-busy`). Do not put `aria-live` on anything that changes while dragging; keep it on the count line only.
- The panel opens from `?open=<id>`: a row click calls `nav.set('open', id)`. Previous / Next call `nav.set('open', neighbourId)`. `open` is not removed by filter changes (only `page` is).
- Tabs / sub-navigation: use `<NavLinks className="subnav" items=... />` (already covers it); no new component.

## 2. `@/lib/lists`

Pure functions (also usable on the server; tests in `lib/lists/*.test.ts`):

| Export | What it does |
|---|---|
| `parseShortNumber(s)` | `"10k"` 10000, `"1.5M"` 1500000, `"12,500"`, `"$3k"`; null for anything else |
| `formatShort(n)` | `12500` "13k", `1500` "1.5k", `1e6` "1M" |
| `formatFull(n)` | `12500` "12,500" (fixed `en-US`, same on server and browser) |
| `niceNumber(v)` | round to 2 significant digits |
| `makeScale(min, max, 'log' \| 'linear')` | `{ toValue(t 0..100), toPosition(v) }`, the slider mapping |
| `parseRange("10000-50000")` | `[10000, 50000]`; `"10000-"` `[10000, null]`; null if bad; swaps if reversed |
| `formatRange(min, max)` | `"10000-50000"`, or null when both are null |
| `describeRange(min, max, fmt?)` | "10k to 50k", "100k and above", "up to 5k" |
| `toParams(x)` | string, URLSearchParams or Next `searchParams` object to `URLSearchParams` |
| `splitList("a,b")`, `joinList([...])`, `getList(params, key)`, `toggleInList(list, v)` | comma lists |
| `isActive(params, def)`, `countActive(params, defs)` | is a filter on / how many (same number as chips) |
| `chipsFromParams(params, defs)` | `ChipItem[] = { id, key, value?, label }`, one per value of a list |
| `removeChip(params, chip, defs)` | new `URLSearchParams` without that chip (and its `also` keys); drops `page` |
| `clearFilters(params, defs)` | new `URLSearchParams` without any filter; keeps `sort`, `dir`, `view`, `open`; drops `page` |
| `canonicalQuery(params, drop?)` | sorted query string without `page` and `open`; use as the key of a saved view |
| `buildQuery({a: 1, b: null})` | `"?a=1"` |

`FilterDef = { key, label?, kind?: 'single' \| 'list' \| 'range' \| 'flag', valueLabel?(v), chipLabel?(v), format?(n), also?: string[] }`.
`list` is `niche=tech,gaming`; `range` is `subs=10000-50000`; `flag` is `email=1`. `also` lists keys cleared together (`sponsored` with `also: ['detected']`).
For chip text: `valueLabel` turns a slug or id into a name ("Niche: Tech"); `chipLabel` replaces the whole text ("Has sponsors").

`useListNav(delay = 250)` returns:

| Member | |
|---|---|
| `params` | `URLSearchParams`, the optimistic address (already includes changes not yet sent) |
| `get(key)`, `getAll(key)`, `has(key)` | read; `getAll` splits the comma list |
| `set(key, value \| null)` | `null` or `''` removes the key |
| `toggle(key, value)` | add or remove one value in the comma list |
| `setMany({a: '1', b: null})` | several keys; `page` removed unless you pass `page` |
| `clear(keys)` | remove keys |
| `replaceAll(params)` | replace the whole query, for `removeChip` / `clearFilters` |
| `isPending` | true from the send until the server has answered |

Every change removes `page`. Rapid changes become one `router.replace(url, { scroll: false })` after about 250 ms inside `useTransition`. Controls read `nav.get(...)` and so show the new state at once. Needs a dynamic page (they all call `requireStaff()`), as `useSearchParams` does.

## 3. Components

### Filter rail
- `FilterRail` props: `activeCount: number`, `onClearAll: () => void`, `search?: ReactNode`, `children` (facet groups), `title? = 'Filters'`. Above 900px a column with a "Clear all" link when `activeCount > 0`. Under 900px it is hidden until `FilterRailButton` is pressed, then a left drawer with a "Done" button, dark veil, Esc, focus trap, focus returned to the button, page scroll locked.
- `FilterRailButton` props: `count?: number`. Shows "Filters (n)". Visible only under 900px; put it first in `list-tools`. It shares state with `FilterRail` (no provider; one rail per page).
- `FacetGroup` props: `id` (unique per page, e.g. `"creators.niche"`, for remembering open/closed), `label`, `on?` (dot, and starts open), `defaultOpen?`, `children`. Native `<details>`.
- `CheckList` props: `label`, `options: { value, label, count? }[]`, `selected: string[]`, `onToggle(value)`, `searchable?`, `searchLabel?`, `searchPlaceholder?`, `scrollAfter? = 7`, `emptyText?`. More than 7 options scroll in a box. Zero-count options are dimmed, not disabled.
- `RadioList` props: `label`, `name`, `options`, `value: string \| null`, `onChange(value \| null)` (`null` = Any), `anyLabel? = 'Any'`, `hint?`, `children?` (extra rows under it, e.g. `<Checkbox label="Count detected records too" .../>`).
- `Segmented` props: `label`, `options`, `value`, `onChange(value)`, `name?`, `inline?`. Ready-made option lists: `ANY_YES_NO` (values `''`, `yes`, `no`), `TABLE_CARDS` (`table`, `cards`).
- `Checkbox` props: native input props (no `type`) plus `label: ReactNode`, `hint?`.
- `SearchBox` props: `label`, `value`, `onChange(value)`, `placeholder?`, `id?`. `CompactSelect` props: `label` (screen readers only), `value`, `onChange(value)`, `options: { value, label }[]`.

```tsx
<FacetGroup id="creators.sponsored" label="Has sponsorships" on={nav.has('sponsored')}>
  <Segmented label="Has sponsorships" options={ANY_YES_NO} value={nav.get('sponsored') ?? ''} onChange={(v) => nav.set('sponsored', v || null)} />
  <Checkbox label="Count detected records too" hint="(not verified)" checked={nav.get('detected') === '1'} onChange={(e) => nav.set('detected', e.target.checked ? '1' : null)} />
</FacetGroup>
```

### RangeSlider
Props: `label`, `minLabel?`, `maxLabel?` (names of the handles), `value: [number \| null, number \| null]`, `onChange(min, max)`, `onCommit?(min, max)`, `min? = 1000`, `max? = 1000000`, `scale? = 'log' \| 'linear'`, `ticks?: string[]`, `presets?: { label, min, max }[]`, `formatField?`, `format?`, `hint?`, `unit?`.
`null` means no limit; the left end of the track is "no lower limit", the right end "no upper limit". `onChange` fires while dragging (keyboard or pointer) and on commit of the fields and presets; `onCommit` only on release, Enter, blur and presets. The number fields accept `10k`, `1.5M`, `12,500`; "From above To" shows an inline error and changes nothing. The handles keep 3 steps apart, so they never cross. Typing a value outside the track (2M) is kept as typed. A pressed preset can be pressed again to clear. `SUBS_PRESETS` has the four subscriber presets of the prototype. For budgets use `min={500} max={50000} ticks={[...]} presets={...}` with `formatField` for dollars.

### Chips
`Chips` props: `items: ChipItem[]`, `onRemove(chip)`, `onClearAll()`, `label? = 'Active filters'`. Renders nothing when empty. Each chip button is named "Remove filter <text>".

### Side panel
`SidePanel` props: `open`, `onClose`, `label` (dialog name), `children`, `position?: { index (from 1), total }`, `onPrevious?`, `onNext?`, `fullPageHref?`, `headerExtra?`, `scrollKey?`. Width `min(100%, 680px)`; full width on a phone. Header: close button on the left; "n of m", Previous, Next, extras and "Open full page" on the right. Focus goes to Close, Tab stays inside, Esc and a veil click close it, focus returns to the opener, body scroll is locked, the body scrolls. A confirm `Modal` opened from inside the panel closes first on Esc. Change `scrollKey` (record id) to scroll back to the top.
Inside it use `panel-head` (title), `dl`, `panel-sec` / `panel-sec__head`, `person`, `Timeline`, `ScoreReasons`.

### Timeline, badges, scores
- `Timeline` props: `children`, `label?`. `TimelineItem` props: `date`, `title`, `badge?`, `lines?: ReactNode[]`, `note?` (muted line), `actions?`, `dashed?` (detected, unchecked), `children?`.
- `SourceBadge` props: `source: 'confirmed' \| 'detected'`, `short?` (detected shows "Detected"). `Tag` props: `children`.
- `ScoreReasons` props: `total`, `reasons: { points, text, unconfirmed? }[]`, `band?`, `hideBand?`. Renders nothing when `reasons` is empty, so a score never shows alone. `unconfirmed` adds the Detected badge. `ScoreBand` props: `total`, `band?` gives only "Strong match · 82" (put it in a `<summary>` over `ScoreReasons hideBand`). `scoreBand(total)`: 70 and above Strong, 40 and above Possible, else Weak.

```tsx
<ScoreReasons total={82} reasons={[{ points: 40, text: 'Same niche: Tech' }, { points: 17, text: 'Backed a similar creator', unconfirmed: true }]} />
```

### Toast
`ToastProvider` is mounted in `AppShell`. `const toast = useToast(); toast('Saved.'); toast('Linked.', { label: 'View on the board', onClick })`. Bottom centre, each toast `role="status"`, removed after 6 seconds, at most 4 shown. Outside the provider `toast` does nothing.

### Menu
`Menu` props: `label`, `children` (node or `({ close }) => node`), `align? = 'right' \| 'left'`, `variant?`. Closes on outside click, Esc (focus back to the button) and when focus leaves. `MenuItem` props: `onSelect`, `children`. `MenuRule` is a divider.

### Loading and cards
- `SkeletonRows` props: `rows? = 8`, `columns? = 4`, `label?`. `SkeletonCards` props: `count? = 6`, `label?`. No motion under reduced motion.
- `CardGrid` props: `children`, `label?`. `Card` props: `children` (a `.tile`). `KeyValue` props: `label`, `children`. `cardTitleClass`, `cardLinkClass` (title link that makes the whole card clickable), `cardRaiseClass` (wrap a checkbox so it stays clickable above the link).

```tsx
<Card>
  <h3 className={cardTitleClass}><Link href={`?open=${r.id}`} className={cardLinkClass}>{r.name}</Link></h3>
  <KeyValue label="Subscribers">{formatFull(r.subs)}</KeyValue>
</Card>
```

## 4. Not changed
Existing components keep their look and props. In a table, number columns need the `tableCell.num` class from `Table.tsx` (a plain `"num"` string does nothing, the styles are module-scoped).
