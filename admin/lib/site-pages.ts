// The website's pages (built from ../src/pages by ../build.js into public/), by their address without ".html".
// Some hosts drop ".html" from addresses (Netlify sends /how-it-works.html to /how-it-works), so the proxy lets
// both forms through and next.config.ts serves /how-it-works from public/how-it-works.html.
// Must match PAGES in ../build.js (minus the home page and the style guide); lib/site-pages.test.ts checks it.
export const SITE_PAGES = ['how-it-works', 'brands', 'about', 'questions', 'contact', 'apply', 'privacy', 'terms'] as const;
