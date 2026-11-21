// Supabase client for server components, server actions and route handlers.
// Runs as the logged-in user (cookies), so row level security always applies.
// Usage: const supabase = await createClient();
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from './env';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component: cookies cannot be set there. The proxy refreshes the session.
        }
      },
    },
  });
}
