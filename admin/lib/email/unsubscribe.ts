// The opt-out itself, shared by the confirm page and the one-click API.
// Uses the service-role client: the person is not logged in, and this is one of the few allowed uses.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyToken } from './token';

export type UnsubscribeResult = 'done' | 'test' | 'invalid';

export async function unsubscribe(token: string): Promise<UnsubscribeResult> {
  const emailId = verifyToken(token);
  if (!emailId) return 'invalid';
  const admin = createAdminClient();
  const { data: email } = await admin.from('emails').select('to_email, is_test, creator_id').eq('id', emailId).maybeSingle();
  if (!email) return 'invalid';
  // A test email went to our own test address: nothing to opt out.
  if (email.is_test) return 'test';

  // The address on the email row is the creator's real address, even in test mode (to_email is never rewritten).
  const { error } = await admin.rpc('opt_out', { email: email.to_email, reason: 'link' });
  if (error) throw new Error('opt_out failed');
  // opt_out matches creators by their CURRENT address. If the address was edited after this mail went out, the
  // creator would stay contactable under the new one, so also mark the creator this email was written to.
  if (email.creator_id) {
    const { error: creatorErr } = await admin.from('creators').update({ status: 'do_not_contact' }).eq('id', email.creator_id);
    if (creatorErr) console.error('unsubscribe: could not mark creator', creatorErr.code);
  }
  // No actor: nobody is logged in.
  const { error: auditErr } = await admin.rpc('log_audit', { action: 'email.unsubscribed', entity_type: 'email', entity_id: emailId, details: {} });
  if (auditErr) console.error('unsubscribe: audit write failed', auditErr.code);
  return 'done';
}
