// Ends the session (POST only, so another site cannot log anyone out by linking here).
// GET just shows the login page. The shell's "Log out" is a server action; this POST route serves
// the "use a different account" button on the 2FA step.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function toLogin(request: NextRequest, search = '') {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = search;
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return toLogin(request);
}

export async function GET(request: NextRequest) {
  return toLogin(request, request.nextUrl.searchParams.get('reason') === 'no_access' ? '?error=no_access' : '');
}
