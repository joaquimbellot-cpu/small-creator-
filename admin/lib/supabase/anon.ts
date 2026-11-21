// Cookie-less anon client with the implicit flow, for sending password-reset emails.
// (Implicit flow means the link works even if opened in another browser.)
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './env';

export function createAnonClient() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' },
  });
}
