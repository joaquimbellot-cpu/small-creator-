// POST /api/creators/import?mode=preview|commit   multipart form with field "file" (CSV, max 1 MB, 2,000 rows).
// Both modes parse and check the file again on the server, so the browser cannot smuggle in unchecked rows.
import { apiHandler, ApiError } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { MAX_IMPORT_BYTES } from '@/lib/creators/constants';
import { classifyRows, parseCsvText, type ExistingKeys } from '@/lib/creators/csv';
import { channelKey, parseChannelUrl } from '@/lib/youtube/channel';

/** An ILIKE pattern as one PostgREST double-quoted value: % _ \ are escaped for ILIKE, then \ and " for PostgREST. */
const quotedLike = (text: string, wrap: boolean) => {
  const like = text.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_'); // PostgREST reads * as a wildcard
  return `"${(wrap ? `%${like}%` : like).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

export const POST = apiHandler({}, async ({ req, supabase }) => {
  const mode = req.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview';
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(400, 'Upload a CSV file.'); }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'Choose a CSV file first.');
  if (file.size === 0) throw new ApiError(400, 'The file is empty.');
  if (file.size > MAX_IMPORT_BYTES) throw new ApiError(400, 'The file is larger than 1 MB.');

  const parsed = parseCsvText(await file.text());
  if (!parsed.ok) throw new ApiError(400, parsed.error);

  // Look up only the incoming addresses and channels, not every creator.
  const existing: ExistingKeys = { emails: new Set(), channels: new Set() };
  const wantEmails = new Set<string>();
  const wantChannels = new Set<string>();
  for (const raw of parsed.rows) {
    const e = String(raw.email ?? '').trim().toLowerCase();
    if (e) wantEmails.add(e);
    const k = channelKey(String(raw.channel_url ?? '').trim());
    if (k) wantChannels.add(k);
  }
  const emailList = [...wantEmails];
  for (let i = 0; i < emailList.length; i += 200) {
    // ilike with no wildcards is a case-insensitive match; addresses are stored as typed.
    const batch = emailList.slice(i, i + 200);
    const { data, error } = await supabase.from('creators').select('email').or(batch.map((e) => `email.ilike.${quotedLike(e, false)}`).join(','));
    if (error) throw error;
    for (const c of data ?? []) existing.emails.add(String(c.email).toLowerCase());
  }
  // Channels: look for each channel's name in the stored links, then compare keys (same rule as everywhere else).
  const names = new Map<string, string>();
  for (const raw of parsed.rows) {
    const ref = parseChannelUrl(String(raw.channel_url ?? '').trim());
    if (ref) names.set(`${ref.kind}:${ref.value.toLowerCase()}`, ref.value);
  }
  const nameList = [...names.values()];
  for (let i = 0; i < nameList.length; i += 100) {
    const batch = nameList.slice(i, i + 100);
    const ids = batch.filter((n) => /^UC[A-Za-z0-9_-]{22}$/.test(n));
    const likes = batch.map((n) => `channel_url.ilike.${quotedLike(n, true)}`);
    if (ids.length) likes.push(`youtube_channel_id.in.(${ids.join(',')})`);
    const { data, error } = await supabase.from('creators').select('channel_url, youtube_channel_id').or(likes.join(','));
    if (error) throw error;
    for (const c of data ?? []) {
      const k = channelKey(c.channel_url);
      if (k) existing.channels.add(k);
      if (c.youtube_channel_id) existing.channels.add(`id:${c.youtube_channel_id}`);
    }
  }

  const rows = classifyRows(parsed.rows, existing, parsed.badRows);
  const counts = {
    new: rows.filter((r) => r.status === 'new').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };
  if (mode === 'preview') return { counts, rows: rows.map(({ data: _d, ...r }) => r) };

  // avg_views from a file counts as checked now; files without the new columns insert exactly the same columns as before plus empty ones.
  const checkedAt = new Date().toISOString();
  const toInsert = rows.filter((r) => r.data).map((r) => ({ ...r.data!, ...(r.data!.avg_views != null ? { avg_views_checked_at: checkedAt } : {}) }));
  let imported = 0;
  let skipped = 0;
  let stopped: string | null = null;
  try {
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('creators').insert(chunk);
      if (!error) { imported += chunk.length; continue; }
      // A clash (someone added the same email meanwhile) or any other error: stop here rather than loop for minutes.
      console.error('creator import chunk failed', error.code);
      stopped = error.code === '23505'
        ? 'Some of these creators were added by someone else while the import ran.'
        : 'The database refused part of the file.';
      break;
    }
  } finally {
    // Always leave a record, with the count saved so far (also when something threw).
    await logAudit('creators.imported', 'creator', null, { count: imported, duplicates: counts.duplicate + skipped, errors: counts.error, ...(stopped || imported < toInsert.length ? { partial: true } : {}) });
  }
  if (stopped) throw new ApiError(409, `${stopped} ${imported} of ${toInsert.length} creators were saved. Upload the same file again to add the rest; creators already saved are skipped as duplicates.`);
  return { imported, skipped: counts.duplicate + counts.error + skipped };
});
