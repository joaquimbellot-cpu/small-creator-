// POST /api/assistant/proposals/:id/reject — owner only. Returns { proposal }.
import { z } from 'zod';
import { ApiError, apiHandler } from '@/lib/api/handler';
import { rejectProposal } from '@/lib/assistant/proposals';

export const POST = apiHandler({ role: 'owner' }, async ({ staff, supabase, params }) => {
  const id = z.guid().safeParse(params.id);
  if (!id.success) throw new ApiError(400, 'Invalid input.');
  return { proposal: await rejectProposal(supabase, staff.id, id.data) };
});
