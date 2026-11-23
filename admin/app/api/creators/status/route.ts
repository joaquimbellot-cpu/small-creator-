// POST /api/creators/status  { ids: uuid[] (max 200), status }
// Changes the status of several creators at once (the "Change status to" control on the Creators list).
// It runs as the logged-in person, so row-level security and every database rule apply, and the audit trigger
// writes one "creator updated" line per changed creator, with who did it.
// Only the owner may take a creator off "do not contact" (the database refuses it for a worker). For a worker
// those creators are skipped and counted, so one of them does not stop the whole batch.
import { z } from 'zod';
import { apiHandler, ApiError } from '@/lib/api/handler';
import { MAX_REFRESH_IDS, STATUSES } from '@/lib/creators/constants';

const body = z.object({
  ids: z.array(z.guid()).min(1).max(MAX_REFRESH_IDS),
  status: z.enum(STATUSES),
});

export const POST = apiHandler({ body }, async ({ supabase, staff, body }) => {
  const ids = [...new Set(body.ids)];
  const { data, error } = await supabase.from('creators').select('id, status').in('id', ids);
  if (error) throw error;
  const found = data ?? [];

  const ownerOnly = staff.role !== 'owner' && body.status !== 'do_not_contact'
    ? new Set(found.filter((c) => c.status === 'do_not_contact').map((c) => c.id))
    : new Set<string>();
  const unchanged = found.filter((c) => c.status === body.status).length;
  const toChange = found.filter((c) => c.status !== body.status && !ownerOnly.has(c.id)).map((c) => c.id);

  let changed = 0;
  if (toChange.length > 0) {
    const { data: updated, error: upErr } = await supabase.from('creators').update({ status: body.status }).in('id', toChange).select('id');
    if (upErr) {
      console.error('creators: bulk status change failed', upErr.code);
      throw new ApiError(409, 'The status could not be changed. Refresh the page and try again.');
    }
    changed = updated?.length ?? 0;
  }
  return { changed, unchanged, ownerOnly: ownerOnly.size, notFound: ids.length - found.length };
});
