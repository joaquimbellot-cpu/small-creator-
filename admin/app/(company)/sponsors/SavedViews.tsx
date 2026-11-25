'use client';
// Saved views of the sponsors list: apply, save the current filters under a name, delete your own, copy the link.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, ConfirmButton, Menu, MenuItem, MenuRule, useToast } from '@/components/ui';
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
              <MenuItem onSelect={() => { onApply(v.query); close(); }}>{v.name}<span className={s.muted}> {v.mine ? (v.is_shared ? 'Mine, shared' : 'Mine') : 'Shared'}</span></MenuItem>
              {v.mine ? (
                <ConfirmButton title={`Delete the view "${v.name}"?`} message="The saved view is removed for everyone it was shared with. The filters on the page stay as they are." confirmLabel="Delete view" disabled={pending}
                  onConfirm={() => start(async () => { const r = await deleteView(v.id); if (r.ok) { toast(`Deleted "${v.name}".`); router.refresh(); } else setError(r.error); })}>Delete</ConfirmButton>
              ) : null}
            </div>
          ))}
          <MenuRule />
          <MenuItem onSelect={() => { void copy(); close(); }}>Copy link to these filters</MenuItem>
          <MenuRule />
          <label className={s.small} htmlFor="view-name">Name for this view</label>
          <input id="view-name" className={s.nameInput} value={name} maxLength={100} placeholder="For example: UK tech" onChange={(e) => setName(e.target.value)} />
          <Checkbox label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {error ? <p role="alert" className={s.small} style={{ margin: 0 }}>{error}</p> : null}
          <div>
            <Button size="sm" loading={pending} disabled={!name.trim()}
              onClick={() => start(async () => {
                setError('');
                const r = await saveView(name, params.toString(), shared);
                if (r.ok) { toast(r.message ?? 'Saved view created.'); setName(''); setShared(false); close(); router.refresh(); } else setError(r.error);
              })}>Save current view</Button>
          </div>
        </div>
      )}
    </Menu>
  );
}
