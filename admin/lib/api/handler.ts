// Wrapper for route handlers (app/api/**/route.ts).
//
//   export const POST = apiHandler({ role: 'owner', body: z.object({...}) }, async ({ staff, body, supabase }) => {
//     return { ok: true };            // returned values become JSON (200); or return a Response / NextResponse
//   });
//
// Options: role: 'staff' (default, owner or worker) | 'owner'; body: zod schema for the JSON body;
//          query: zod schema for the search params (values are strings).
// Context: { req, staff, supabase (as the user, RLS applies), body, query, params }
// Errors, always JSON { error: string }: 401 not logged in, 403 wrong role, 400 invalid input,
// 403 also for a write from another site (Origin / Sec-Fetch-Site check), 429 too many requests, 500 anything else (details only go to the server log).
// Throw `new ApiError(status, 'message')` for your own controlled errors.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodType } from 'zod';
import { getCurrentStaff, type Staff } from '@/lib/auth/staff';
import { createClient } from '@/lib/supabase/server';

export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 429 | 500, message: string) {
    super(message);
  }
}

type Opts<B, Q> = { role?: 'staff' | 'owner'; body?: ZodType<B>; query?: ZodType<Q> };
type Ctx<B, Q> = {
  req: NextRequest;
  staff: Staff;
  supabase: SupabaseClient;
  body: B;
  query: Q;
  params: Record<string, string | string[]>;
};

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Logged-in writes must come from our own pages. Browsers always send Origin and/or Sec-Fetch-Site on cross-site
// requests; scripts and tests that send neither stay allowed.
function sameOrigin(req: NextRequest): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (origin !== null && origin !== req.nextUrl.origin) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

export function apiHandler<B = undefined, Q = undefined>(
  opts: Opts<B, Q>,
  fn: (ctx: Ctx<B, Q>) => Promise<unknown> | unknown,
) {
  return async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string | string[]>> }) => {
    try {
      if (!sameOrigin(req)) return fail(403, 'Not allowed.');
      const staff = await getCurrentStaff();
      if (!staff) return fail(401, 'Not logged in.');
      if ((opts.role ?? 'staff') === 'owner' && staff.role !== 'owner') return fail(403, 'Not allowed.');

      let body = undefined as B;
      if (opts.body) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return fail(400, 'Invalid input.');
        }
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return fail(400, 'Invalid input.');
        body = parsed.data;
      }
      let query = undefined as Q;
      if (opts.query) {
        const parsed = opts.query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
        if (!parsed.success) return fail(400, 'Invalid input.');
        query = parsed.data;
      }
      const params = (await routeCtx?.params) ?? {};
      const out = await fn({ req, staff, supabase: await createClient(), body, query, params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.message);
      console.error('api error', e instanceof Error ? e.message : e);
      return fail(500, 'Something went wrong.');
    }
  };
}
