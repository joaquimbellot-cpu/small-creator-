// GET /api/emails/creators?q=maya  — search box on the compose page. Staff only, runs as the user.
import { z } from 'zod';
import { apiHandler } from '@/lib/api/handler';
import { searchCreators } from '@/lib/email/creators';

export const GET = apiHandler({ query: z.object({ q: z.string().max(100).default('') }) }, async ({ supabase, query }) => {
  return { creators: await searchCreators(supabase, query.q) };
});
