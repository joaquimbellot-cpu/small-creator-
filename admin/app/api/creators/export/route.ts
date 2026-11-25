// GET /api/creators/export?<the list's filters>  -> CSV of the creators that match the filters (same address keys as the
// Creators list page). OWNER ONLY (checked here on the server).
import { ApiError, apiHandler } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { CSV_COLUMNS, toCsv } from '@/lib/creators/csv';
import { NICHES } from '@/lib/creators/constants';
import { filtersToQuery, parseFilters, toRpcArgs } from '@/lib/creators/filters';

// The columns of the import template first (so an export can be imported again), then the list's extra columns.
const HEADER = [...CSV_COLUMNS, 'niche_category', 'country', 'language', 'average_views'] as const;

export const GET = apiHandler({ role: 'owner' }, async ({ req, supabase }) => {
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const args = toRpcArgs(f);
  // The audit line comes FIRST, with the row count, and the export is refused when it cannot be written:
  // personal data must never leave without a record (and a cut-off export must still leave one).
  const { data: head, error: countError } = await supabase.rpc('creators_list', { ...args, p_limit: 1 });
  if (countError) throw countError;
  const count = head?.length ? Number((head as { total: number }[])[0].total) : 0;
  const query = filtersToQuery({ ...f, page: 1, open: '', for: '' }).replace(/^\?/, '');
  const audited = await logAudit('creators.exported', null, null, { count, filters: { query } });
  if (!audited) throw new ApiError(500, 'Could not record the export in the audit log. Nothing was exported.');
  const rows: unknown[][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc('creators_export', { ...args, p_limit: 1000, p_offset: from });
    if (error) throw error;
    for (const c of (data ?? []) as Record<string, unknown>[]) {
      rows.push([
        c.full_name, c.email, c.phone, c.channel_url, c.niche, c.subscribers, c.status, c.notes,
        typeof c.niche_slug === 'string' && c.niche_slug in NICHES ? NICHES[c.niche_slug as keyof typeof NICHES] : '', c.country, c.language, c.avg_views,
      ]);
    }
    if (!data || data.length < 1000) break;
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(HEADER, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="creators-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
