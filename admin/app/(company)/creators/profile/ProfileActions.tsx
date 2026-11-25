'use client';
// Refresh subscribers and Delete (owner only). Both use the existing API routes and keep their messages.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ConfirmButton, Notice } from '@/components/ui';
import { NO_KEY, RefreshResults, callRefresh, type RefreshResponse } from '../RefreshResults';
import { refreshCreatorView } from './actions';
import s from './profile.module.css';

export function ProfileActions({ creatorId, name, isOwner, youtubeEnabled }: { creatorId: string; name: string; isOwner: boolean; youtubeEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<RefreshResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  async function refresh() {
    if (!youtubeEnabled) { setResponse({ ok: false, error: NO_KEY }); return; }
    setBusy(true);
    const r = await callRefresh([creatorId]);
    setResponse(r);
    setBusy(false);
    if (r.ok) await refreshCreatorView(creatorId); // an action, so the new numbers show without a second "viewed" line
  }

  async function remove() {
    setDeleteError('');
    try {
      const res = await fetch(`/api/creators/${creatorId}`, { method: 'DELETE' });
      if (res.ok) { router.push('/creators'); return; }
      const json = await res.json().catch(() => ({}));
      setDeleteError(json.error || 'Could not delete.');
    } catch {
      setDeleteError('Could not reach the server.');
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" loading={busy} onClick={refresh}>Refresh subscribers</Button>
      {isOwner ? (
        <ConfirmButton title={`Delete ${name}?`} message="This removes the creator and their emails for good. It cannot be undone." confirmLabel="Delete creator" onConfirm={remove}>Delete</ConfirmButton>
      ) : null}
      {response || deleteError ? (
        <div className={s.stack} style={{ flexBasis: '100%' }}>
          {response ? <RefreshResults response={response} /> : null}
          {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
        </div>
      ) : null}
    </>
  );
}
