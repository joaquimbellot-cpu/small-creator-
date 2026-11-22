// Checks of the public website and its two forms, plus the headers and the login link, against the local stack
// (fake data only). Needs the stack up (Postgres on :54322) and the production or dev server on BASE_URL.
// Run:  BASE_URL=http://localhost:3000 NODE_PATH=/opt/node-tools/node_modules node tests/website.e2e.cjs
// Prints PASS/FAIL per check and exits 1 on any failure. The creator, contact message and rate-limit rows
// it makes are removed at the end (rate-limit rows are removed by their creation time, from this run only).
const { chromium, request } = require('playwright');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PSQL_ENV = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const psql = (q) => execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: PSQL_ENV, encoding: 'utf8' }).trim();

const RUN = randomUUID().slice(0, 8);
const APPLY_EMAIL = `qa-apply-${Date.now()}-${RUN}@example.test`;
const BRAND_EMAIL = `qa-brand-${Date.now()}-${RUN}@example.test`;
const APPLY_SUCCESS = 'Your application is with us. We reply within 2 working days.';
const BRAND_SUCCESS = 'Your inquiry is with us. We will write back by email.';
const CSP_RE = /content[- ]security[- ]policy|\bCSP\b/i;

let failures = 0;
function check(cond, name, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
  if (!cond) failures++;
}
async function step(name, fn) {
  try { await fn(); } catch (e) { check(false, `${name} (threw)`, String(e.message).split('\n')[0]); }
}

async function main() {
  const t0 = psql('select now()'); // DB clock: rate-limit rows created at or after this belong to this run
  const api = await request.newContext({ baseURL: BASE, maxRedirects: 0 });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cspErrors = {};
  try {
    // ---------- public website: status and headers
    await step('site status', async () => {
      const home = await api.get('/');
      check(home.status() === 200, `GET / returns 200 (got ${home.status()})`);
      check(!home.headers()['x-robots-tag'], 'GET / has no X-Robots-Tag header', home.headers()['x-robots-tag'] || '');
      const how = await api.get('/how-it-works.html');
      check(how.status() === 200, `GET /how-it-works.html returns 200 (got ${how.status()})`);
      // Netlify drops ".html" from addresses, so every page must also work without it, as a website page.
      for (const p of ['how-it-works', 'brands', 'about', 'questions', 'contact', 'apply', 'privacy', 'terms']) {
        const r = await api.get(`/${p}`);
        const body = await r.text();
        const csp = r.headers()['content-security-policy'] || '';
        check(r.status() === 200 && body.includes('site-menu') && !r.headers()['x-robots-tag'] && csp.includes('sha256-'),
          `GET /${p} (no .html) shows the website page (got ${r.status()}, ${r.headers()['location'] || 'no redirect'})`);
      }
      const css = await api.get('/assets/site.css');
      check(css.status() === 200, `GET /assets/site.css returns 200 (got ${css.status()})`);
    });

    // ---------- back office: noindex header, login redirect
    await step('admin headers', async () => {
      const want = 'noindex, nofollow, noarchive';
      const login = await api.get('/login');
      check(login.status() === 200 && login.headers()['x-robots-tag'] === want, `/login has X-Robots-Tag "${want}" (got "${login.headers()['x-robots-tag'] || ''}")`);
      const overview = await api.get('/overview');
      check(overview.headers()['x-robots-tag'] === want, `/overview has X-Robots-Tag "${want}" (got "${overview.headers()['x-robots-tag'] || ''}")`);
      const loc = overview.headers()['location'] || '';
      check(overview.status() >= 300 && overview.status() < 400 && loc.startsWith('/login'), `/overview without login redirects to /login (got ${overview.status()} ${loc})`);
    });

    // ---------- phone-size menu reaches the login page
    await step('phone menu', async () => {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}/`);
      await page.locator('button[aria-controls="site-menu"]').click();
      const link = page.locator('#site-menu').getByRole('link', { name: 'Log in' });
      await link.waitFor({ state: 'visible', timeout: 10000 });
      check(await link.isVisible(), 'phone menu shows a visible "Log in" link');
      await link.click();
      await page.waitForURL(/\/login(\?|$)/, { timeout: 15000 });
      check(new URL(page.url()).pathname === '/login', `"Log in" reaches /login (at ${new URL(page.url()).pathname})`);
      await page.close();
    });

    // ---------- wide screens: no menu button, so the footer carries the Log in link
    await step('desktop footer login', async () => {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/how-it-works`);
      check(!(await page.locator('button[aria-controls="site-menu"]').isVisible()), 'wide screen: the menu button is hidden (links sit in the top bar)');
      const link = page.locator('footer').getByRole('link', { name: 'Log in' });
      await link.scrollIntoViewIfNeeded();
      check(await link.isVisible(), 'wide screen: the footer shows a visible "Log in" link');
      await link.click();
      await page.waitForURL(/\/login(\?|$)/, { timeout: 15000 });
      check(new URL(page.url()).pathname === '/login', `footer "Log in" reaches /login (at ${new URL(page.url()).pathname})`);
      await page.close();
    });

    // ---------- console CSP errors on the public pages
    for (const p of ['/', '/apply.html', '/brands.html']) {
      await step(`csp ${p}`, async () => {
        const page = await ctx.newPage();
        const errs = [];
        page.on('console', (m) => { if (m.type() === 'error' && CSP_RE.test(m.text())) errs.push(m.text()); });
        page.on('pageerror', (e) => { if (CSP_RE.test(e.message)) errs.push(e.message); });
        await page.goto(`${BASE}${p}`, { waitUntil: 'load' });
        await page.waitForTimeout(1000);
        cspErrors[p] = errs;
        check(errs.length === 0, `no CSP console errors on ${p}`, errs.join(' | '));
        await page.close();
      });
    }

    // ---------- apply form: real submit, creator saved as new/website, then removed
    await step('apply form', async () => {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/apply.html`);
      await page.fill('#apply-name', 'QA Website Test');
      await page.fill('#apply-email', APPLY_EMAIL);
      await page.fill('#apply-channel', 'https://www.youtube.com/@qawebsitetest');
      await page.fill('#apply-topic', 'Fake videos for a QA check.');
      await page.fill('#apply-subscribers', '12,500');
      await page.click('form[data-form] button[type=submit]');
      const status = page.locator('form[data-form] [data-form-status]');
      await status.getByText(APPLY_SUCCESS).waitFor({ timeout: 20000 }).catch(() => {});
      const shown = (await status.textContent()) || '';
      check(shown.includes(APPLY_SUCCESS), 'apply form shows its success message', shown.trim().slice(0, 120));
      const row = psql(`select status || '|' || source from creators where email = '${APPLY_EMAIL}'`);
      check(row === 'new|website', `apply: creator saved with status new and source website (got "${row}")`);
      await page.close();
    });

    // ---------- brand inquiry form: real submit, row in contact_messages, then removed
    await step('brand form', async () => {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/brands.html`);
      await page.fill('#enquiry-company', 'QA Fake Brand Co');
      await page.fill('#enquiry-promote', 'A fake product for a QA check.');
      await page.selectOption('#enquiry-budget', '$500 to $1,999');
      await page.fill('#enquiry-name', 'QA Website Test');
      await page.fill('#enquiry-email', BRAND_EMAIL);
      await page.click('form[data-form] button[type=submit]');
      const status = page.locator('form[data-form] [data-form-status]');
      await status.getByText(BRAND_SUCCESS).waitFor({ timeout: 20000 }).catch(() => {});
      const shown = (await status.textContent()) || '';
      check(shown.includes(BRAND_SUCCESS), 'brand form shows its success message', shown.trim().slice(0, 120));
      const n = psql(`select count(*) from contact_messages where email = '${BRAND_EMAIL}'`);
      check(n === '1', `brand: row exists in contact_messages (count ${n})`);
      await page.close();
    });
  } finally {
    // ---------- cleanup: this run's rows only
    psql(`delete from creators where email = '${APPLY_EMAIL}'`);
    psql(`delete from contact_messages where email = '${BRAND_EMAIL}'`);
    psql(`delete from form_rate_limits where created_at >= '${t0}'`);
    const left = psql(`select (select count(*) from creators where email = '${APPLY_EMAIL}') + (select count(*) from contact_messages where email = '${BRAND_EMAIL}')`);
    check(left === '0', 'cleanup: this run left no creator or contact row', `left ${left}`);
    await api.dispose();
    await ctx.close();
    await browser.close();
  }

  console.log(failures === 0 ? '\nALL WEBSITE CHECKS PASSED' : `\n${failures} WEBSITE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.log(`FAIL  website e2e crashed -- ${e.message}`); process.exit(1); });
