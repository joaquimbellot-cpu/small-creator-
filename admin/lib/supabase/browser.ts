// Supabase client for client components (anon key only; it can read nothing on its own).
// Usage: const supabase = createBrowserSupabase();
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
