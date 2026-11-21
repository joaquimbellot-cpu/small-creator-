// Landing point of the links in Supabase emails (password reset, invite).
//  - ?token_hash=...&type=recovery|invite   (production email templates: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery)
//  - ?code=...                              (PKCE)
//  - otherwise the tokens are in the URL fragment: hand over to the /auth/hash page (fragments survive redirects).
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const TYPES: EmailOtpType[] = ['recovery', 'invite', 'email', 'signup', 'magiclink', 'email_change'];

function to(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  const [pathname, search = ''] = path.split('?');
  url.pathname = pathname;
  url.search = search ? `?${search}` : '';
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const tokenHash = p.get('token_hash');
  const type = p.get('type') as EmailOtpType | null;
  const code = p.get('code');
  const supabase = await createClient();

  if (tokenHash && type && TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return error ? to(request, '/login?error=link_invalid') : to(request, '/reset-password');
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? to(request, '/login?error=link_invalid') : to(request, '/reset-password');
  }
  return to(request, '/auth/hash');
}
