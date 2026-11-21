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
  const { data: email } = await admin.from('emails').select('to_email, is_test').eq('id', emailId).maybeSingle();
  if (!email) return 'invalid';
  // A test email went to our own test address: nothing to opt out.
  if (email.is_test) return 'test';

  // The address on the email row is the creator's real address, even in test mode (to_email is never rewritten).
  const { error } = await admin.rpc('opt_out', { email: email.to_email, reason: 'link' });
  if (error) throw new Error('opt_out failed');
  // No actor: nobody is logged in.
  await admin.rpc('log_audit', { action: 'email.unsubscribed', entity_type: 'email', entity_id: emailId, details: {} });
  return 'done';
}
