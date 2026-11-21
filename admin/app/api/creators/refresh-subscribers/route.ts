// POST /api/creators/refresh-subscribers  { ids: uuid[] (max 200) }
// Asks YouTube for subscriber counts (batches of 50 channel IDs). 503 when no YouTube key is set.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiHandler, ApiError } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { MAX_REFRESH_IDS } from '@/lib/creators/constants';
import { MISSING_KEY_MESSAGE, refreshSubscribers, youtubeConfigFromEnv } from '@/lib/youtube';

const body = z.object({ ids: z.array(z.guid()).min(1).max(MAX_REFRESH_IDS) });

export const POST = apiHandler({ body }, async ({ supabase, body }) => {
  const cfg = youtubeConfigFromEnv();
  if (!cfg) return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  const ids = [...new Set(body.ids)];
  const { data: creators, error } = await supabase.from('creators').select('id, full_name, channel_url, youtube_channel_id').in('id', ids);
  if (error) throw error;
  if (!creators || creators.length === 0) throw new ApiError(404, 'Creators not found.');

  const results = await refreshSubscribers(cfg, creators);
  const now = new Date().toISOString();
  const names = new Map(creators.map((c) => [c.id, c.full_name as string]));
  const out: Array<(typeof results)[number] & { name: string }> = [];
  for (const r of results) {
    let result = r;
    if (r.status === 'updated' || r.status === 'hidden') {
      const patch = r.status === 'updated'
        ? { subscribers: r.subscribers, subscribers_hidden: false, subscribers_checked_at: now, youtube_channel_id: r.channelId }
        : { subscribers_hidden: true, subscribers_checked_at: now, youtube_channel_id: r.channelId };
      const { error: upErr } = await supabase.from('creators').update(patch).eq('id', r.id);
      if (upErr) result = { id: r.id, status: 'error', message: upErr.code === '23505' ? 'Another creator already has this YouTube channel saved.' : 'Could not save the result.' };
    }
    out.push({ ...result, name: names.get(r.id) ?? '' });
  }
  const count = (s: string) => out.filter((r) => r.status === s).length;
  await logAudit('creator.subscribers_refreshed', 'creator', null, {
    requested: ids.length, updated: count('updated'), hidden: count('hidden'), not_found: count('not_found'), errors: count('error'),
  });
  return { results: out };
});
