// Session refresh used by /proxy.ts. Returns the user (or null) and a response carrying refreshed cookies.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from './env';

// The session cookie holds the refresh token: scripts must not read it, it travels only over https in production,
// and it lasts 30 days (the library default is about 400). Used by both cookie writers (here and server.ts).
// A cookie being removed (maxAge 0) must stay removable, so a zero or negative maxAge is kept.
export function sessionCookie(options: { maxAge?: number } | undefined) {
  const remove = options?.maxAge !== undefined && options.maxAge <= 0;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    ...(remove ? {} : { maxAge: 60 * 60 * 24 * 30 }),
  };
}

export async function refreshSession(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...sessionCookie(options) }));
      },
    },
  });
  // getClaims() checks the login token's signature on this server (no trip to the database in Tokyo) and
  // refreshes an expired one. If the project signs with a shared secret, it falls back to asking Supabase.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;
  return { user, getResponse: () => response };
}
