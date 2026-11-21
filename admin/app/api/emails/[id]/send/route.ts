// POST /api/emails/<id>/send  — sends ONE approved email. Only the Send button on the review page calls this.
// 200 { ok, delay_seconds }   429 { reason: 'too_soon' | 'daily_limit', retry_after_seconds }   409 other refusals
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, apiHandler } from '@/lib/api/handler';
import { sendEmail } from '@/lib/email/send';

const MESSAGES: Record<string, string> = {
  not_found: 'That email does not exist.',
  not_approved: 'The email is not approved.',
  do_not_contact: 'This creator is marked do not contact.',
  suppressed: 'This address is on the suppression list.',
  test_email_missing: 'Test mode is on but no test address is set in Settings.',
  postal_address_missing: 'Real sending needs a postal address in Settings.',
  forbidden: 'Not allowed.',
  send_failed: 'The email could not be sent. See the email log.',
};

export const POST = apiHandler({ role: 'staff' }, async ({ supabase, params }) => {
  const id = z.guid().safeParse(params.id);
  if (!id.success) throw new ApiError(400, 'Invalid input.');

  const r = await sendEmail(supabase, id.data);
  if (r.ok) return { ok: true, to: r.to, is_test: r.isTest, delay_seconds: r.delaySeconds };

  if (r.reason === 'too_soon' || r.reason === 'daily_limit') {
    const wait = r.retryAfterSeconds ?? 0;
    return NextResponse.json(
      {
        error: r.reason === 'too_soon' ? 'Too soon after the last send.' : 'The daily sending limit is reached.',
        reason: r.reason,
        retry_after_seconds: wait,
      },
      { status: 429, headers: wait ? { 'Retry-After': String(wait) } : {} },
    );
  }
  throw new ApiError(409, MESSAGES[r.reason] ?? 'The email could not be sent.');
});
