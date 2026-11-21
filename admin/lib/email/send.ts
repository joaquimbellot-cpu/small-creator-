// Sends ONE approved email. Called only from POST /api/emails/[id]/send (a person's click).
// Order: reserve_send (the database checks everything) -> build message -> SMTP -> mark_sent / mark_failed.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/supabase/env';
import { makeToken } from './token';
import { buildFooter, buildText } from './footer';
import { sendMail } from './mailer';

export type SendResult =
  | { ok: true; to: string; isTest: boolean; delaySeconds: number }
  | { ok: false; reason: string; retryAfterSeconds?: number };

class BookkeepingError extends Error {}

// Never put secrets or long server text into the log: keep a short, plain message.
function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return `Could not send: ${msg}`.slice(0, 300);
}

export async function sendEmail(supabase: SupabaseClient, emailId: string): Promise<SendResult> {
  // 1. The database gate: approved? creator ok? not suppressed? daily limit? spacing? test mode?
  const { data: r, error } = await supabase.rpc('reserve_send', { email_id: emailId });
  if (error) throw new Error('reserve_send failed');
  if (!r?.ok) return { ok: false, reason: r?.reason ?? 'unknown', retryAfterSeconds: r?.retry_after_seconds };

  // From here the email is "sending". Any problem must end in mark_failed.
  try {
    const { data: email } = await supabase.from('emails').select('subject, body').eq('id', emailId).single();
    const { data: settings } = await supabase
      .from('settings')
      .select('sender_name, sender_postal_address, min_seconds_between_sends')
      .eq('id', 1)
      .single();
    if (!email || !settings) throw new Error('email or settings not found');

    const link = `${siteUrl()}/unsubscribe/${makeToken(emailId)}`;
    const footer = buildFooter(settings.sender_postal_address, link);
    const messageId = await sendMail({
      to: r.to_email,
      fromName: settings.sender_name,
      subject: `${r.subject_prefix}${email.subject}`,
      text: buildText(email.body, footer),
      unsubscribeUrl: link,
    });

    const { error: markError } = await supabase.rpc('mark_sent', { email_id: emailId, message_id: messageId });
    // The message is already out. Do not mark it failed; report the bookkeeping problem instead.
    if (markError) throw new BookkeepingError();
    return { ok: true, to: r.to_email, isTest: r.is_test, delaySeconds: settings.min_seconds_between_sends };
  } catch (e) {
    if (e instanceof BookkeepingError) throw new Error('sent, but mark_sent failed for ' + emailId);
    await supabase.rpc('mark_failed', { email_id: emailId, error: shortError(e) });
    return { ok: false, reason: 'send_failed' };
  }
}
