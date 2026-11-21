// Ends the session and goes to the login page. Used when a signed-in user turns out to have no access
// (cookies cannot be changed while a page renders), and by "use a different account" on the 2FA step.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = request.nextUrl.searchParams.get('reason') === 'no_access' ? '?error=no_access' : '';
  return NextResponse.redirect(url);
}
