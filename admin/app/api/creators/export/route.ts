// GET /api/creators/export?q=&status=&sort=&dir=  -> CSV of the current filter. OWNER ONLY (checked here on the server).
import { ApiError, apiHandler } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { CSV_COLUMNS, toCsv } from '@/lib/creators/csv';
import { applyFilters } from '@/lib/creators/query';
import { parseFilters } from '@/lib/creators/filters';

export const GET = apiHandler({ role: 'owner' }, async ({ req, supabase }) => {
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  // The audit line comes FIRST, with the row count, and the export is refused when it cannot be written:
  // personal data must never leave without a record (and a cut-off export must still leave one).
  const { count, error: countError } = await applyFilters(
    supabase.from('creator_summaries').select('id', { count: 'exact', head: true }), f,
  );
  if (countError) throw countError;
  const audited = await logAudit('creators.exported', null, null, { count: count ?? 0, filters: { q: f.q, status: f.status, sort: f.sort, dir: f.dir } });
  if (!audited) throw new ApiError(500, 'Could not record the export in the audit log. Nothing was exported.');
  const rows: unknown[][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await applyFilters(
      supabase.from('creator_summaries').select('full_name, email, phone, channel_url, niche, subscribers, status, notes'), f,
    ).range(from, from + 999);
    if (error) throw error;
    for (const c of (data ?? []) as Record<string, unknown>[]) rows.push([c.full_name, c.email, c.phone, c.channel_url, c.niche, c.subscribers, c.status, c.notes]);
    if (!data || data.length < 1000) break;
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(CSV_COLUMNS, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="creators-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
