// POST /api/sponsors/import?mode=preview|commit   multipart form with field "file" (CSV, max 1 MB, 2,000 rows).
// Both modes read and check the file again on the server, so the browser cannot smuggle in unchecked rows.
// Staff may import. Each row is marked new, duplicate (same name, any letter case) or error; commit saves only the new rows.
import { ApiError, apiHandler } from '@/lib/api/handler';
import { readFormLimited, UploadTooLarge } from '@/lib/lists/readUpload';
import { MAX_IMPORT_BYTES } from '@/lib/sponsors/constants';
import { classifyRows, parseCsvText } from '@/lib/sponsors/csv';

export const POST = apiHandler({}, async ({ req, supabase }) => {
  const mode = req.nextUrl.searchParams.get('mode') === 'commit' ? 'commit' : 'preview';
  let form: FormData;
  try { form = await readFormLimited(req, MAX_IMPORT_BYTES); } catch (e) {
    if (e instanceof UploadTooLarge) throw new ApiError(400, 'The file is larger than 1 MB.');
    throw new ApiError(400, 'Upload a CSV file.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'Choose a CSV file first.');
  if (file.size === 0) throw new ApiError(400, 'The file is empty.');
  if (file.size > MAX_IMPORT_BYTES) throw new ApiError(400, 'The file is larger than 1 MB.');
  const parsed = parseCsvText(await file.text());
  if (!parsed.ok) throw new ApiError(400, parsed.error);

  // The names are unique whatever the letter case, so compare against all stored names (a few hundred at most).
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('brands').select('name').order('name').range(from, from + 999);
    if (error) throw error;
    for (const b of data ?? []) existing.add(String(b.name).toLowerCase());
    if (!data || data.length < 1000) break;
  }
  const rows = classifyRows(parsed.rows, existing, parsed.badRows);
  const counts = {
    new: rows.filter((r) => r.status === 'new').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };
  if (mode === 'preview') return { counts, rows: rows.map(({ data, ...r }) => ({ ...r, contact: data?.contact?.full_name ?? '' })) };

  const todo = rows.filter((r) => r.data).map((r) => r.data!);
  let imported = 0;
  let contacts = 0;
  let stopped: string | null = null;
  try {
    for (let i = 0; i < todo.length; i += 200) {
      const chunk = todo.slice(i, i + 200);
      const { data, error } = await supabase.from('brands').insert(chunk.map((c) => c.sponsor)).select('id, name');
      if (error || !data) {
        console.error('sponsor import chunk failed', error?.code);
        stopped = error?.code === '23505' ? 'Some of these sponsors were added by someone else while the import ran.' : 'The database refused part of the file.';
        break;
      }
      imported += data.length;
      const idByName = new Map(data.map((b) => [String(b.name).toLowerCase(), b.id as string]));
      const people = chunk.flatMap((c) => {
        const brand_id = idByName.get(c.sponsor.name.toLowerCase());
        return c.contact && brand_id ? [{ ...c.contact, brand_id, is_primary: true }] : [];
      });
      if (people.length) {
        const { error: cErr } = await supabase.from('brand_contacts').insert(people);
        if (cErr) { console.error('sponsor import contacts failed', cErr.code); stopped = 'The sponsors were saved but some contact people were refused by the database.'; break; }
        contacts += people.length;
      }
    }
  } finally {
    // Always leave a record, with the count saved so far (also when something threw). No names or emails in it.
    // The only way to write this line is record_brand_import(): the database checks the caller is staff and that the count is
    // backed by sponsors created a moment ago. A failed write is logged, never thrown (it must not hide the import's own result).
    const { error: auditErr } = await supabase.rpc('record_brand_import', {
      p_count: imported, p_contacts: contacts, p_duplicates: counts.duplicate, p_errors: counts.error, p_partial: !!(stopped || imported < todo.length),
    });
    if (auditErr) console.error('audit write failed brands.imported', auditErr.code);
  }
  if (stopped) throw new ApiError(409, `${stopped} ${imported} of ${todo.length} sponsors were saved. Upload the same file again to add the rest; sponsors already saved are skipped as duplicates.`);
  return { imported, contacts, skipped: counts.duplicate + counts.error };
});
