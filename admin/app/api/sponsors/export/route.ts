// GET /api/sponsors/export?<the list filters>  -> CSV of the sponsors that match. OWNER ONLY (checked here on the server).
// The database function sponsors_export checks the owner and writes the audit line (brands.exported, with the row count) on the
// first page: contact details cannot leave without a record, and a failed audit write stops the export.
import { apiHandler } from '@/lib/api/handler';
import { CSV_COLUMNS, toCsv } from '@/lib/sponsors/csv';
import { filtersToRpc, parseFilters } from '@/lib/sponsors/filters';

export const GET = apiHandler({ role: 'owner' }, async ({ req, supabase }) => {
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
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
