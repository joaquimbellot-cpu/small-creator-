// GET /api/sponsors/sample -> a sample CSV for the import page (fake rows).
import { apiHandler } from '@/lib/api/handler';
import { SAMPLE_CSV } from '@/lib/sponsors/csv';

export const GET = apiHandler({}, () => new Response(SAMPLE_CSV, {
  headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sponsors-sample.csv"', 'Cache-Control': 'no-store' },
}));
