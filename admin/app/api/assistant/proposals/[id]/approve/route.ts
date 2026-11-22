// POST /api/assistant/proposals/:id/approve — owner only. Returns { proposal }.
import { z } from 'zod';
import { ApiError, apiHandler } from '@/lib/api/handler';
import { approveProposal } from '@/lib/assistant/proposals';

export const POST = apiHandler({ role: 'owner' }, async ({ staff, supabase, params }) => {
  const id = z.guid().safeParse(params.id);
  if (!id.success) throw new ApiError(400, 'Invalid input.');
  return { proposal: await approveProposal(supabase, staff.id, id.data) };
});
