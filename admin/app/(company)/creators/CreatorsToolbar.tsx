'use client';
// Above the results: sort, cards or table, saved views and "Copy link".
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Checkbox, CompactSelect, ConfirmButton, Input, Menu, MenuItem, MenuRule, Segmented, useToast } from '@/components/ui';
import { cleanQuery, DEFAULT_SORT, type SortKey } from '@/lib/creators/filters';
import type { ListNav } from '@/lib/lists/useListNav';
import { ForPicker } from '@/components/matching/ForPicker';
import { deleteView, saveView } from './list-actions';
import s from './creators.module.css';

// Cards first: they are the default view of this list (the Sponsors list keeps TABLE_CARDS).
const CARDS_TABLE = [{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }];

export type SavedView = { id: string; owner_id: string; name: string; query: string; is_shared: boolean };

/** Sort choices as "sort:direction". "Best match for a sponsor" is `sort=match&for=<brand id>`. */
export const SORT_CHOICES: { value: string; label: string; sort: SortKey; dir: 'asc' | 'desc' }[] = [
  { value: 'subscribers:desc', label: 'Sort: Subscribers, high to low', sort: 'subscribers', dir: 'desc' },
  { value: 'subscribers:asc', label: 'Sort: Subscribers, low to high', sort: 'subscribers', dir: 'asc' },
  { value: 'sponsored:desc', label: 'Sort: Most recent sponsorship', sort: 'sponsored', dir: 'desc' },
  { value: 'last_contacted:desc', label: 'Sort: Last contacted', sort: 'last_contacted', dir: 'desc' },
  { value: 'name:asc', label: 'Sort: Name, A to Z', sort: 'name', dir: 'asc' },
  { value: 'added:desc', label: 'Sort: Recently added', sort: 'added', dir: 'desc' },
  { value: 'match:desc', label: 'Sort: Best match for a sponsor', sort: 'match', dir: 'desc' },
];

export function CreatorsToolbar({ nav, sort, dir, view, savedViews, staffId }: {
  nav: ListNav; sort: SortKey; dir: 'asc' | 'desc'; view: 'table' | 'cards'; savedViews: SavedView[]; staffId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = SORT_CHOICES.some((c) => c.value === `${sort}:${dir}`) ? `${sort}:${dir}` : SORT_CHOICES.find((c) => c.sort === sort)?.value ?? `${DEFAULT_SORT}:desc`;
  function onSort(value: string) {
    const c = SORT_CHOICES.find((x) => x.value === value);
    if (!c) return;
    // Defaults are left out of the address (see filtersToQuery).
    nav.setMany({ sort: c.sort === DEFAULT_SORT ? null : c.sort, dir: c.dir === (c.sort === 'name' ? 'asc' : 'desc') ? null : c.dir, for: c.sort === 'match' ? nav.get('for') : null });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${nav.params.toString() ? `?${nav.params.toString()}` : ''}`);
      toast('Link copied.');
    } catch {
      toast('Could not copy the link. Copy it from the address bar.');
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await saveView({ name, query: nav.params.toString(), shared }).catch(() => ({ ok: false as const, error: 'Could not reach the server. Try again.' }));
    setBusy(false);
    if (r.ok) { setName(''); setShared(false); toast(r.message); router.refresh(); } else setError(r.error);
  }

  async function remove(v: SavedView) {
    const r = await deleteView(v.id).catch(() => ({ ok: false as const, error: 'Could not reach the server. Try again.' }));
    if (r.ok) { toast(`Deleted "${v.name}".`); router.refresh(); } else toast(r.error);
  }

  return (
    <>
      <CompactSelect label="Sort by" value={current} onChange={onSort} options={SORT_CHOICES.map((c) => ({ value: c.value, label: c.label }))} />
      {sort === 'match' ? <ForPicker kind="brand" valueId={nav.get('for')} onChange={(id) => nav.set('for', id)} /> : null}
      <Segmented inline label="View" options={CARDS_TABLE} value={view} onChange={(v) => nav.set('view', v === 'cards' ? null : v)} />
      <Menu label="Saved views">
        {({ close }) => (
          <>
            {savedViews.length === 0 ? <p className={`muted ${s.viewForm}`}>No saved views yet.</p> : savedViews.map((v) => (
              <div key={v.id} className={s.viewRow}>
                <MenuItem onSelect={() => { nav.replaceAll(new URLSearchParams(cleanQuery(v.query))); close(); }}>
                  {v.name}<span className={s.viewMeta}>{v.owner_id === staffId ? (v.is_shared ? 'Mine, shared' : 'Mine') : 'Shared'}</span>
                </MenuItem>
                {v.owner_id === staffId ? (
                  <ConfirmButton title={`Delete the view "${v.name}"?`} message="The saved view is removed for everyone it was shared with. The filters on the page stay as they are." confirmLabel="Delete view" onConfirm={() => remove(v)}>Delete</ConfirmButton>
                ) : null}
              </div>
            ))}
            <MenuRule />
            <MenuItem onSelect={() => { void copyLink(); close(); }}>Copy link to these filters</MenuItem>
            <MenuRule />
            <form className={s.viewForm} onSubmit={save}>
              <Input label="Name for this view" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="For example: UK tech" autoComplete="off" />
              <Checkbox label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              {error ? <p role="alert" className="muted">{error}</p> : null}
              <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>Save current view</Button>
            </form>
          </>
        )}
      </Menu>
      <Button variant="ghost" size="sm" onClick={copyLink}>Copy link</Button>
    </>
  );
}
