// Reads the public Supabase settings. Only the URL and the anon key may reach the browser.
export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return v;
}
export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return v;
}
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}
