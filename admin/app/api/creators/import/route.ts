// POST /api/creators/import?mode=preview|commit   multipart form with field "file" (CSV, max 1 MB, 2,000 rows).
// Both modes parse and check the file again on the server, so the browser cannot smuggle in unchecked rows.
import { apiHandler, ApiError } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { MAX_IMPORT_BYTES } from '@/lib/creators/constants';
import { classifyRows, parseCsvText, type ExistingKeys } from '@/lib/creators/csv';
import { channelKey } from '@/lib/youtube/channel';

export const POST = apiHandler({}, async ({ req, supabase }) => {
  const mode = req.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview';
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(400, 'Upload a CSV file.'); }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, 'Choose a CSV file first.');
  if (file.size > MAX_IMPORT_BYTES) throw new ApiError(400, 'The file is larger than 1 MB.');

  const parsed = parseCsvText(await file.text());
  if (!parsed.ok) throw new ApiError(400, parsed.error);

  const existing: ExistingKeys = { emails: new Set(), channels: new Set() };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('creators').select('email, channel_url, youtube_channel_id').order('id').range(from, from + 999);
    if (error) throw error;
    for (const c of data ?? []) {
      existing.emails.add(String(c.email).toLowerCase());
      const k = channelKey(c.channel_url);
      if (k) existing.channels.add(k);
      if (c.youtube_channel_id) existing.channels.add(`id:${c.youtube_channel_id}`);
    }
    if (!data || data.length < 1000) break;
  }

  const rows = classifyRows(parsed.rows, existing);
  const counts = {
    new: rows.filter((r) => r.status === 'new').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };
  if (mode === 'preview') return { counts, rows: rows.map(({ data: _d, ...r }) => r) };

  const toInsert = rows.filter((r) => r.data).map((r) => r.data!);
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabase.from('creators').insert(chunk);
    if (!error) { imported += chunk.length; continue; }
    // Someone added the same email in the meantime: fall back to one by one and skip the clashes.
    for (const row of chunk) {
      const one = await supabase.from('creators').insert(row);
      if (!one.error) imported += 1;
      else if (one.error.code === '23505') skipped += 1;
      else throw one.error;
    }
  }
  await logAudit('creators.imported', 'creator', null, { count: imported, duplicates: counts.duplicate + skipped, errors: counts.error });
  return { imported, skipped: counts.duplicate + counts.error + skipped };
});
