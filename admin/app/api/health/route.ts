// GET /api/health  — for an outside uptime monitor. Public (see proxy.ts). Answers 200 {"ok":true} when a trivial
// query with the service role works, otherwise 503 {"ok":false}. Nothing else is ever in the answer.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// The answer is remembered for 10 seconds so a flood of calls cannot make the database work for nothing.
let last: { ok: boolean; at: number } | null = null;
const TTL_MS = 10_000;

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  if (last && Date.now() - last.at < TTL_MS) {
    return last.ok ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ ok: false }, { status: 503, headers });
  }
  try {
    const { error } = await createAdminClient().from('settings').select('id').eq('id', 1).limit(1);
    if (error) throw error;
    last = { ok: true, at: Date.now() };
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    console.error('health check failed', e instanceof Error ? e.message : 'error');
    last = { ok: false, at: Date.now() };
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
