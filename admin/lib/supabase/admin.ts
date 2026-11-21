// Service-role client. SERVER ONLY, bypasses row level security.
// Allowed uses: inviting and removing users, the login rate-limit functions, the public unsubscribe
// page, and the send guard functions (reserve_send / mark_sent / mark_failed), which the email send
// route calls only after its own session + role check. Everything else uses ./server.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
