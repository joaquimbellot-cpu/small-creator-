// YouTube Data API v3 `channels.list` (part=statistics) to refresh subscriber counts.
// The key stays on the server: it is only read from the environment here and never returned, logged or put in an error message.
//   refreshFromEnv(creators) -> results per creator: updated | hidden | not_found | error
import 'server-only';
export { parseChannelUrl, channelKey, normalizeChannelUrl, type ChannelRef } from './channel';
import { parseChannelUrl, type ChannelRef } from './channel';

export type RefreshInput = { id: string; channel_url: string | null; youtube_channel_id: string | null };
export type RefreshResult = {
  id: string;
  status: 'updated' | 'hidden' | 'not_found' | 'error';
  subscribers?: number;
  channelId?: string;
  message?: string;
};
export type YouTubeConfig = { apiKey: string; baseUrl?: string };

export const DEFAULT_BASE = 'https://www.googleapis.com/youtube/v3';
export const MISSING_KEY_MESSAGE = 'Add a YouTube API key to turn this on';

type Item = { id?: string; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } };
class ApiProblem extends Error {}

export function youtubeConfigFromEnv(): YouTubeConfig | null {
  const apiKey = (process.env.YOUTUBE_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return { apiKey, baseUrl: (process.env.YOUTUBE_API_BASE ?? '').trim() || DEFAULT_BASE };
}

/** True when a YouTube API key is set (the page uses this to turn the refresh buttons on or off). */
export function youtubeEnabled(): boolean {
  return youtubeConfigFromEnv() !== null;
}

async function listChannels(cfg: YouTubeConfig, lookup: Record<string, string>): Promise<Item[]> {
  const url = new URL(`${(cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')}/channels`);
  url.searchParams.set('part', 'statistics');
  url.searchParams.set('maxResults', '50');
  for (const [k, v] of Object.entries(lookup)) url.searchParams.set(k, v);
  url.searchParams.set('key', cfg.apiKey);
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiProblem('Could not reach YouTube.');
  }
  if (res.status === 403 || res.status === 429) throw new ApiProblem('YouTube refused the request (key or daily quota).');
  if (!res.ok) throw new ApiProblem(`YouTube returned an error (${res.status}).`);
  let json: { items?: Item[] };
  try { json = await res.json(); } catch { throw new ApiProblem('YouTube sent an unreadable answer.'); }
  return Array.isArray(json.items) ? json.items : [];
}

function toResult(id: string, item: Item): RefreshResult {
  const st = item.statistics;
  const channelId = item.id;
  if (st?.hiddenSubscriberCount) return { id, status: 'hidden', channelId };
  const n = st?.subscriberCount !== undefined ? Number(st.subscriberCount) : NaN;
  if (!Number.isFinite(n)) return { id, status: 'error', message: 'YouTube sent no subscriber count.' };
  return { id, status: 'updated', subscribers: n, channelId };
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function refreshSubscribers(cfg: YouTubeConfig, creators: RefreshInput[]): Promise<RefreshResult[]> {
  const out = new Map<string, RefreshResult>();
  const byId: { id: string; channelId: string }[] = [];
  const single: { id: string; ref: ChannelRef }[] = [];

  for (const c of creators) {
    const ref: ChannelRef | null = c.youtube_channel_id
      ? { kind: 'id', value: c.youtube_channel_id }
      : c.channel_url ? parseChannelUrl(c.channel_url) : null;
    if (!ref) out.set(c.id, { id: c.id, status: 'error', message: c.channel_url ? 'Could not resolve this channel link.' : 'No channel link saved.' });
    else if (ref.kind === 'id') byId.push({ id: c.id, channelId: ref.value });
    else single.push({ id: c.id, ref });
  }

  // Up to 50 channel IDs per call.
  for (let i = 0; i < byId.length; i += 50) {
    const chunk = byId.slice(i, i + 50);
    try {
      const items = await listChannels(cfg, { id: [...new Set(chunk.map((x) => x.channelId))].join(',') });
      const map = new Map(items.map((it) => [it.id, it]));
      for (const x of chunk) {
        const it = map.get(x.channelId);
        out.set(x.id, it ? toResult(x.id, it) : { id: x.id, status: 'not_found', message: 'YouTube has no channel with this ID.' });
      }
    } catch (e) {
      for (const x of chunk) out.set(x.id, { id: x.id, status: 'error', message: e instanceof Error ? e.message : 'Lookup failed.' });
    }
  }

  // Handles and old-style names: one call each.
  await pool(single, 4, async ({ id, ref }) => {
    try {
      const lookup: Record<string, string> = ref.kind === 'handle' ? { forHandle: `@${ref.value}` } : { forUsername: ref.value };
      const items = await listChannels(cfg, lookup);
      if (items[0]) out.set(id, toResult(id, items[0]));
      else if (ref.kind === 'handle') out.set(id, { id, status: 'not_found', message: 'YouTube has no channel with this handle.' });
      else out.set(id, { id, status: 'error', message: 'Could not resolve this channel link. Use the /@handle or /channel/ link instead.' });
    } catch (e) {
      out.set(id, { id, status: 'error', message: e instanceof Error ? e.message : 'Lookup failed.' });
    }
  });

  return creators.map((c) => out.get(c.id) ?? { id: c.id, status: 'error' as const, message: 'Lookup failed.' });
}
