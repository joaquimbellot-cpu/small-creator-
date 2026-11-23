// Request proxy (Next 16's "middleware"): refreshes the Supabase session, requires login for
// every route except the public ones, and sets security headers (CSP with a per-request nonce).
import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';
import { SITE_PAGES } from '@/lib/site-pages';

const PUBLIC = [/^\/login(\/|$)/, /^\/forgot-password$/, /^\/reset-password$/, /^\/auth(\/|$)/, /^\/unsubscribe(\/|$)/, /^\/api\/unsubscribe(\/|$)/, /^\/api\/public\//, /^\/api\/health$/];

// The public website (built from ../src into public/): the home page, its .html pages, the same pages without
// ".html" (Netlify drops it from addresses), /assets and robots.txt.
// None of the back-office routes ends in .html or starts with /assets, and lib/site-pages.test.ts checks that no
// back-office route has a website page's name.
const WEBSITE = [/^\/$/, /^\/[a-z0-9-]+\.html$/, new RegExp(`^/(${SITE_PAGES.join('|')})$`), /^\/assets\//, /^\/robots\.txt$/];

// sha256 of the one inline script every website page has (src/partials/head.html):
//   document.documentElement.classList.add('js');
// If that script changes, update this hash (the browser console shows the right one).
const SITE_INLINE_SCRIPT_HASH = 'sha256-/x7W7R75k8Roq0WaVRQX9blP4OufE5xbAdzklGxsgpw=';

function websiteCsp(): string {
  return [
    `default-src 'self'`,
    `script-src 'self' '${SITE_INLINE_SCRIPT_HASH}'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data:`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

// Website responses: public, indexable, cacheable. Only the safety headers.
function websiteResponse() {
  const res = NextResponse.next();
  res.headers.set('Content-Security-Policy', websiteCsp());
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  return res;
}

function csp(nonce: string): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const dev = process.env.NODE_ENV !== 'production';
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // The back office serves its own fonts (@fontsource, see app/layout.tsx), so Google Fonts is not allowed here.
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self'`,
    `img-src 'self' data: blob:`,
    `connect-src 'self' ${supabase}${dev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`.trim(),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

function applyHeaders(res: NextResponse, policy: string) {
  res.headers.set('Content-Security-Policy', policy);
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

// Shown for every back-office address while NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are missing (they are set
// when the site is built, so adding them needs a new deploy). See admin/README.md, "Put it online".
function notConnected(pathname: string) {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'The back office is not connected yet.' }, { status: 503 });
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Back office not connected yet</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1efea;color:#141414;font:17px/1.5 system-ui,sans-serif}main{max-width:32rem;padding:24px}h1{font-weight:500;font-size:1.6rem;margin:0 0 .5rem}a{color:inherit}</style></head>
<body><main><h1>The back office is not connected yet</h1><p>The website is live, but the database and login are not set up on this host yet. Once they are, this address shows the login page.</p><p><a href="/">Back to the website</a></p></main></body></html>`;
  return new NextResponse(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function proxy(request: NextRequest) {
  if (WEBSITE.some((re) => re.test(request.nextUrl.pathname))) return websiteResponse();

  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);

  // The database and login (Supabase) are not connected yet: say so instead of failing.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return applyHeaders(notConnected(request.nextUrl.pathname), policy);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const { user, getResponse } = await refreshSession(request, requestHeaders);
  const { pathname, search } = request.nextUrl;

  if (!user && !PUBLIC.some((re) => re.test(pathname))) {
    if (pathname.startsWith('/api/')) {
      return applyHeaders(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }), policy);
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return applyHeaders(NextResponse.redirect(url), policy);
  }
  return applyHeaders(getResponse(), policy);
}

export const config = {
  // /assets and robots.txt are plain files: they skip this proxy, so Netlify does not run a server step for every
  // image and stylesheet. Their safety and cache headers are set in ../netlify.toml.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/|robots.txt).*)'],
};
