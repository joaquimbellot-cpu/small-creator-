// GET /api/creators/export?q=&status=&sort=&dir=  -> CSV of the current filter. OWNER ONLY (checked here on the server).
import { apiHandler } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';
import { CSV_COLUMNS, toCsv } from '@/lib/creators/csv';
import { applyFilters } from '@/lib/creators/query';
import { parseFilters } from '@/lib/creators/filters';

export const GET = apiHandler({ role: 'owner' }, async ({ req, supabase }) => {
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const rows: unknown[][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await applyFilters(
      supabase.from('creator_summaries').select('full_name, email, phone, channel_url, niche, subscribers, status, notes'), f,
    ).range(from, from + 999);
    if (error) throw error;
    for (const c of (data ?? []) as Record<string, unknown>[]) rows.push([c.full_name, c.email, c.phone, c.channel_url, c.niche, c.subscribers, c.status, c.notes]);
    if (!data || data.length < 1000) break;
  }
  await logAudit('creators.exported', null, null, { count: rows.length, filters: { q: f.q, status: f.status, sort: f.sort, dir: f.dir } });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(CSV_COLUMNS, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="creators-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
