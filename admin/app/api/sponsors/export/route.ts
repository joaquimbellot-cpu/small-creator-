// GET /api/sponsors/export?<the list filters>  -> CSV of the sponsors that match. OWNER ONLY (checked here on the server).
// The audit line is written FIRST, with the row count, and the export is refused when it cannot be written: contact details
// must never leave without a record.
import { ApiError, apiHandler } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { CSV_COLUMNS, toCsv } from '@/lib/sponsors/csv';
import { filtersToParams, filtersToRpc, parseFilters } from '@/lib/sponsors/filters';
import { countSponsors } from '@/lib/sponsors/queries';

export const GET = apiHandler({ role: 'owner' }, async ({ req, supabase }) => {
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const count = await countSponsors(supabase, f);
  const audited = await logAudit('brands.exported', 'brand', null, { count, filters: filtersToParams({ ...f, page: 1, open: null }).toString().slice(0, 500) });
  if (!audited) throw new ApiError(500, 'Could not record the export in the audit log. Nothing was exported.');
  const rows: unknown[][] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.rpc('sponsors_export', { p: filtersToRpc(f), p_sort: f.sort, p_dir: f.dir, p_limit: 1000, p_offset: offset });
    if (error) throw error;
    for (const r of (data ?? []) as Record<string, unknown>[]) rows.push(CSV_COLUMNS.map((c) => r[c]));
    if (!data || data.length < 1000) break;
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(CSV_COLUMNS, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sponsors-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
