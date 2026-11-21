// POST /api/unsubscribe/<token>  — one-click unsubscribe (RFC 8058). Mail apps call this after the
// person presses their own "Unsubscribe" button. Public: the signed token is the proof.
import { NextResponse } from 'next/server';
import { unsubscribe } from '@/lib/email/unsubscribe';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const result = await unsubscribe(token);
    if (result === 'invalid') return NextResponse.json({ error: 'Invalid link.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('unsubscribe failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
