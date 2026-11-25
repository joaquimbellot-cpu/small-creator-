'use client';
// The Creators list: filter rail, toolbar, chips, selection, table or cards, and the side panel.
// The server (page.tsx) sends the rows and every count; this component only writes to the page address (useListNav)
// and keeps the ticked creators in the browser, so they survive a page or filter change.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button, Chips, EmptyState, FilterRailButton, LinkButton, Notice, Pagination, SidePanel, SkeletonCards, SkeletonRows, useToast,
} from '@/components/ui';
import { MAX_BULK_IDS, PAGE_SIZE, type ListRow } from '@/lib/creators/constants';
import { creatorFilterDefs, parseFilters } from '@/lib/creators/filters';
import { chipsFromParams, removeChip, clearFilters } from '@/lib/lists/query';
import { useListNav, type ListNav } from '@/lib/lists/useListNav';
import { rowLinkToFocus } from '@/lib/lists/focus';
import { BulkBar } from './BulkBar';
import { CreatorsFilters, type Named, type OptionNames } from './CreatorsFilters';
import { CreatorsCards, CreatorsRows } from './CreatorsTable';
import { CreatorsToolbar, type SavedView } from './CreatorsToolbar';
import s from './creators.module.css';

export type RelaxOption = { id: string; label: string; query: string; n: number };
const STORE = 'creators.selection';

export function CreatorsList({ rows, total, all, counts, names, savedViews, staffId, youtubeEnabled, relax, panel, panelFor, openName, failed }: {
  rows: ListRow[]; total: number; all: number; counts: Record<string, Record<string, number>>;
  names: OptionNames; savedViews: SavedView[]; staffId: string; youtubeEnabled: boolean;
  relax: RelaxOption[]; panel: ReactNode; panelFor: string; openName: string; failed: boolean;
}) {
  const rawNav = useListNav();
  // A filter, sort or page change closes the side panel, so the same open profile is not rendered (and audited) again.
  // Only opening, closing and Previous / Next (below) use rawNav.
  const nav = useMemo<ListNav>(() => ({
    ...rawNav,
    set: (k, v) => { rawNav.set(k, v); if (k !== 'open') rawNav.clear(['open']); },
    toggle: (k, v) => { rawNav.toggle(k, v); rawNav.clear(['open']); },
    setMany: (v) => rawNav.setMany('open' in v ? v : { ...v, open: null }),
    clear: (keys) => rawNav.clear([...keys, 'open']),
    replaceAll: (next) => { const p = new URLSearchParams(next); p.delete('open'); rawNav.replaceAll(p); },
  }), [rawNav]);
  const router = useRouter();
  const toast = useToast();
  // The address as the controls see it (it already holds changes the server has not answered yet).
  const f = useMemo(() => parseFilters(nav.params), [nav.params]);
  const nameLookup = useMemo(() => ({
    brands: Object.fromEntries(names.brands.map((b) => [b.id, b.name])),
    tags: Object.fromEntries(names.tags.map((t) => [t.id, t.name])),
    lists: Object.fromEntries(names.lists.map((l) => [l.id, l.name])),
    langs: (c: string) => names.langs[c] ?? c,
    countries: (c: string) => names.countries[c] ?? c,
  }), [names]);
  const defs = useMemo(() => creatorFilterDefs(nameLookup, f.detected), [nameLookup, f.detected]);
  const chips = useMemo(() => chipsFromParams(nav.params, defs).filter((c) => c.key !== 'detected'), [nav.params, defs]);

  // ---- ticked creators (kept for the session; at most 200)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORE) ?? '[]');
      if (Array.isArray(raw)) setSelected(new Set(raw.filter((x): x is string => typeof x === 'string').slice(0, MAX_BULK_IDS)));
    } catch { /* storage can be blocked: the ticks then live only until the page is closed */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem(STORE, JSON.stringify([...selected])); } catch { /* ignore */ }
  }, [selected, loaded]);
  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((cur) => {
      if (on && !cur.has(id) && cur.size >= MAX_BULK_IDS) { toast(`You can pick up to ${MAX_BULK_IDS} creators at a time.`); return cur; }
      const n = new Set(cur);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }, [toast]);
  const toggleAll = useCallback((on: boolean) => {
    setSelected((cur) => {
      const n = new Set(cur);
      for (const r of rows) {
        if (!on) n.delete(r.id);
        else if (n.size < MAX_BULK_IDS) n.add(r.id);
        else { toast(`You can pick up to ${MAX_BULK_IDS} creators at a time.`); break; }
      }
      return n;
    });
  }, [rows, toast]);

  // ---- opening a creator in the side panel (the page number stays, so Previous and Next work on this page)
  const hrefFor = (id: string) => { const p = new URLSearchParams(nav.params); p.set('open', id); return `?${p.toString()}`; };
  const open = (id: string) => rawNav.setMany({ open: id, page: rawNav.get('page') });
  const close = () => rawNav.setMany({ open: null, page: rawNav.get('page') });
  const openId = f.open;
  const lastShown = useRef<string | null>(null); // for the focus return when the panel closes (B-2)
  if (openId) lastShown.current = openId;
  const index = rows.findIndex((r) => r.id === openId);
  const label = rows[index]?.full_name ?? (panelFor === openId ? openName : '') ?? '';

  const pending = nav.isPending;
  const hasFilters = chips.length > 0;
  const clearAll = () => nav.replaceAll(clearFilters(nav.params, defs));
  const onRemoveChip = (chip: (typeof chips)[number]) => {
    const next = removeChip(nav.params, chip, defs);
    // "Count detected records too" only means something with a sponsorship filter on.
    if (!next.get('sponsored') && !next.get('recent') && !next.get('by')) next.delete('detected');
    nav.replaceAll(next);
  };
  const rowProps = { rows, selected, onToggle: toggle, onToggleAll: toggleAll, hrefFor, onOpen: open, detected: f.detected };

  return (
    <div className="list-layout">
      <CreatorsFilters nav={nav} counts={counts} names={names} chipCount={chips.length} onClearAll={clearAll} />

      <div className="list-results" aria-busy={pending}>
        <div className="list-tools">
          <FilterRailButton count={chips.length} />
          <div className="list-count" role="status" aria-live="polite">
            {failed ? 'Creators' : total === all ? `${all} ${all === 1 ? 'creator' : 'creators'}` : `${total} of ${all} ${all === 1 ? 'creator' : 'creators'}`}
          </div>
          <CreatorsToolbar nav={nav} sort={f.sort} dir={f.dir} view={f.view} savedViews={savedViews} staffId={staffId} />
        </div>

        <Chips items={chips} onRemove={onRemoveChip} onClearAll={clearAll} />
        <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} lists={names.lists as Named[]} tags={names.tags as Named[]} youtubeEnabled={youtubeEnabled} />

        <div className="list-body">
          {failed ? (
            <Notice tone="error" title="The creators could not be loaded">
              Your filters are kept.
              <div style={{ marginTop: 'var(--s-3)' }}><Button size="sm" onClick={() => router.refresh()}>Try again</Button></div>
            </Notice>
          ) : pending ? (
            f.view === 'cards' ? <SkeletonCards count={6} /> : <SkeletonRows rows={8} columns={6} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={hasFilters ? 'No creators match all of these filters' : 'No creators yet'}
              action={hasFilters ? (
                <div className={s.relax}>
                  {relax.map((x) => (
                    <Button key={x.id} variant="ghost" size="sm" onClick={() => nav.replaceAll(new URLSearchParams(x.query))}>Remove “{x.label}” ({x.n})</Button>
                  ))}
                  <Button size="sm" onClick={clearAll}>Clear all filters</Button>
                </div>
              ) : <LinkButton href="/creators?new=1">Add the first creator</LinkButton>}
            >
              {hasFilters ? (relax.length ? 'Removing one filter brings results back:' : 'Try clearing the filters.') : 'Add one by hand or import a CSV file.'}
            </EmptyState>
          ) : f.view === 'cards' ? <CreatorsCards {...rowProps} /> : <CreatorsRows {...rowProps} />}
          {failed ? null : (
            <Pagination page={f.page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => { const q = new URLSearchParams(nav.params); q.delete('open'); if (p > 1) q.set('page', String(p)); else q.delete('page'); const t = q.toString(); return t ? `?${t}` : '?'; }} />
          )}
        </div>
      </div>

      <SidePanel
        open={!!openId} onClose={close} label={label || 'Creator'} scrollKey={openId}
        restoreFocus={() => rowLinkToFocus(lastShown.current)}
        position={index >= 0 ? { index: index + 1, total: rows.length } : undefined}
        onPrevious={index > 0 ? () => open(rows[index - 1].id) : undefined}
        onNext={index >= 0 && index < rows.length - 1 ? () => open(rows[index + 1].id) : undefined}
        fullPageHref={openId ? `/creators/${openId}` : undefined}
      >
        {openId && panelFor === openId ? panel : <p className={s.pending} role="status">Loading…</p>}
      </SidePanel>
    </div>
  );
}
