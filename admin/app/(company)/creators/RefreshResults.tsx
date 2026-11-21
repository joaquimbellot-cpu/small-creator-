'use client';
// Calls the refresh API and shows what happened per creator.
import { Notice } from '@/components/ui';

export type RefreshOutcome = { id: string; name: string; status: 'updated' | 'hidden' | 'not_found' | 'error'; subscribers?: number; message?: string };
export type RefreshResponse = { ok: true; results: RefreshOutcome[] } | { ok: false; error: string };

export const NO_KEY = 'Add a YouTube API key to turn this on';

export async function callRefresh(ids: string[]): Promise<RefreshResponse> {
  try {
    const res = await fetch('/api/creators/refresh-subscribers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: res.status === 503 ? NO_KEY : (json.error as string) || 'Could not refresh.' };
    return { ok: true, results: json.results as RefreshOutcome[] };
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
}

const LABEL = { updated: 'Updated', hidden: 'Hidden by the channel', not_found: 'Channel not found', error: 'Error' } as const;

export function RefreshResults({ response }: { response: RefreshResponse }) {
  if (!response.ok) return <Notice tone={response.error === NO_KEY ? 'info' : 'error'}>{response.error}</Notice>;
  const r = response.results;
  const n = (s: string) => r.filter((x) => x.status === s).length;
  const bad = n('not_found') + n('error');
  return (
    <Notice tone={bad ? 'warn' : 'success'} title="Subscribers refreshed">
      <div>{n('updated')} updated, {n('hidden')} hidden by the channel, {n('not_found')} not found, {n('error')} errors.</div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {r.map((x) => (
          <li key={x.id}>
            {x.name || x.id}: {LABEL[x.status]}
            {x.status === 'updated' ? ` (${x.subscribers?.toLocaleString('en-US')})` : ''}
            {x.message ? ` - ${x.message}` : ''}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
