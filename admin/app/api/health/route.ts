// GET /api/health  — for an outside uptime monitor. Public (see proxy.ts). Answers 200 {"ok":true} when a trivial
// query with the service role works, otherwise 503 {"ok":false}. Nothing else is ever in the answer.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const { error } = await createAdminClient().from('settings').select('id').eq('id', 1).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    console.error('health check failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
