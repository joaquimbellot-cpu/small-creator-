'use client';
// Saved views of the sponsors list: apply, save the current filters under a name, delete your own, copy the link.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Menu, MenuItem, MenuRule, useToast } from '@/components/ui';
import type { SavedView } from '@/lib/sponsors/queries';
import { viewQuery } from '@/lib/sponsors/filters';
import { deleteView, saveView } from './actions';
import s from './sponsors.module.css';

export function SavedViews({ views, params, onApply }: { views: SavedView[]; params: URLSearchParams; onApply: (query: string) => void }) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  async function copy() {
    const url = `${window.location.origin}/sponsors${viewQuery(params) ? `?${viewQuery(params)}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch {
      toast('Could not copy the link. Copy it from the address bar.');
    }
  }

  return (
    <Menu label="Saved views">
      {({ close }) => (
        <div className={s.popBody}>
          {views.length === 0 ? <p className={s.muted} style={{ margin: 0 }}>No saved views yet.</p> : null}
          {views.map((v) => (
            <div key={v.id} className={s.viewRow}>
              <MenuItem onSelect={() => { onApply(v.query); close(); }}>{v.name} <span className={s.muted}>{v.mine ? (v.is_shared ? 'Mine, shared' : 'Mine') : 'Shared'}</span></MenuItem>
              {v.mine ? (
                <Button variant="ghost" size="sm" aria-label={`Delete view ${v.name}`} disabled={pending}
                  onClick={() => start(async () => { const r = await deleteView(v.id); if (r.ok) { toast(r.message ?? 'View deleted.'); router.refresh(); } else setError(r.error); })}>Delete</Button>
              ) : null}
            </div>
          ))}
          <MenuRule />
          <MenuItem onSelect={() => { void copy(); close(); }}>Copy link to these filters</MenuItem>
          <MenuRule />
          <label className="sr-only" htmlFor="view-name">Name for this view</label>
          <input id="view-name" className={s.nameInput} value={name} maxLength={100} placeholder="Name this view" onChange={(e) => setName(e.target.value)} />
          <Checkbox label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {error ? <p role="alert" className={s.small} style={{ margin: 0 }}>{error}</p> : null}
          <div>
            <Button size="sm" loading={pending} disabled={!name.trim()}
              onClick={() => start(async () => {
                setError('');
                const r = await saveView(name, params.toString(), shared);
                if (r.ok) { toast(r.message ?? 'View saved.'); setName(''); setShared(false); close(); router.refresh(); } else setError(r.error);
              })}>Save view</Button>
          </div>
        </div>
      )}
    </Menu>
  );
}
