// GET /api/creators/:id  -> one creator with deal summary; writes creator.viewed to the audit log.
// DELETE /api/creators/:id -> owner only. A creator with deals is refused by the database (409).
import { z } from 'zod';
import { apiHandler, ApiError } from '@/lib/api/handler';
import { logAudit } from '@/lib/audit';

const uuid = z.guid();

export const GET = apiHandler({}, async ({ supabase, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success) throw new ApiError(404, 'Creator not found.');
  const { data, error } = await supabase.from('creator_summaries').select('*').eq('id', id.data).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Creator not found.');
  await logAudit('creator.viewed', 'creator', data.id, { label: data.full_name });
  return { creator: data };
});

export const DELETE = apiHandler({ role: 'owner' }, async ({ supabase, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success) throw new ApiError(404, 'Creator not found.');
  const { data, error } = await supabase.from('creators').delete().eq('id', id.data).select('id');
  if (error) {
    if (error.code === '23503') throw new ApiError(409, 'This creator has deals, so they cannot be deleted. Remove their deals first, or set the status to Inactive.');
    throw error;
  }
  if (!data || data.length === 0) throw new ApiError(404, 'Creator not found.');
  return { ok: true };
});
