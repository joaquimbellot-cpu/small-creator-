// End-to-end check of login, rate limit, roles, reset, invite and 2FA against the local stack.
// Needs: admin/dev/start.sh running and `npm run dev` on :3000. Run: node scripts/e2e-auth.cjs
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const BASE = 'http://localhost:3000';
const MAIL = 'http://localhost:8025';
const OWNER = ['owner@example.test', 'Owner-Test-Pass-2026!'];
const WORKER = ['worker@example.test', 'Worker-Test-Pass-2026!'];
const NEWBIE = 'newbie.worker@example.test';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/shots';

const psql = (sql) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-tAc', sql]).toString().trim();
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); if (!ok) failures++; };

function totp(secret, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Math.floor(Date.now() / 30000) + offset;
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}

async function latestMail(to, afterId) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAIL}/latest?to=${encodeURIComponent(to)}`);
    if (r.ok) { const m = await r.json(); if (m.id && m.id !== afterId) return m; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no mail for ' + to);
}
async function mailId(to) { const r = await fetch(`${MAIL}/latest?to=${encodeURIComponent(to)}`); return r.ok ? (await r.json()).id : null; }

async function login(page, [email, pw]) {
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', pw);
  await page.click('button[type=submit]');
}

(async () => {
  psql("delete from login_attempts"); psql("delete from auth.mfa_factors");
  psql(`delete from auth.users where email = '${NEWBIE}'`);
  const browser = await chromium.launch();
  const ctx = async (ip) => browser.newContext({ extraHTTPHeaders: { 'x-real-ip': ip } });

  // logged out -> login
  { const c = await ctx('10.0.0.1'); const p = await c.newPage();
    await p.goto(BASE + '/overview'); check('logged-out /overview redirects to login', p.url().includes('/login'));
    const r = await c.request.get(BASE + '/api/anything'); check('logged-out /api returns 401', r.status() === 401);
    const h = (await c.request.get(BASE + '/login')).headers();
    check('security headers', h['x-frame-options'] === 'DENY' && /frame-ancestors 'none'/.test(h['content-security-policy']) && /noindex/.test(h['x-robots-tag']));
    await c.close(); }

  // wrong password + rate limit (unknown email, own IP)
  { const c = await ctx('10.0.0.2'); const p = await c.newPage();
    await login(p, [OWNER[0], 'wrong-password']);
    await p.waitForSelector('form [role=alert]');
    check('wrong password: generic message', (await p.textContent('form [role=alert]')).includes('That email or password is not right.'));
    await c.close();
    const c2 = await ctx('10.0.0.3'); const p2 = await c2.newPage();
    for (let i = 0; i < 5; i++) { await login(p2, ['lock.test@example.test', 'nope' + i]); await p2.waitForSelector('form [role=alert]'); }
    await login(p2, ['lock.test@example.test', 'nope6']);
    await p2.waitForFunction(() => /Too many attempts/.test(document.body.innerText));
    check('6th failed try is blocked with 15 minute message', /15 minutes/.test(await p2.textContent('body')));
    await c2.close(); }

  // owner login, look, logout
  const ownerCtx = await ctx('10.0.0.4');
  { const p = await ownerCtx.newPage();
    await login(p, OWNER); await p.waitForURL('**/overview');
    check('owner login works', /owner/i.test(await p.textContent('header')));
    require('node:fs').mkdirSync(SHOTS, { recursive: true });
    await p.screenshot({ path: `${SHOTS}/shell.png` });
    await p.goto(BASE + '/settings/users'); await p.waitForSelector('table');
    await p.screenshot({ path: `${SHOTS}/users.png`, fullPage: true });
    check('owner opens /settings/users', true);
    await p.goto(BASE + '/settings/audit'); await p.waitForSelector('table');
    await p.screenshot({ path: `${SHOTS}/audit.png` });
    check('audit log lists login', (await p.textContent('tbody')).includes('Logged in'));
    await p.goto(BASE + '/login'); await p.screenshot({ path: `${SHOTS}/login-owner-redirect.png` });
  }

  // worker: refused from settings, invite action refused
  let inviteReq;
  { const p = await ownerCtx.newPage();
    p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && /email/.test(r.postData() || '')) inviteReq = r; });
    await p.goto(BASE + '/settings/users');
    await p.fill('input[name=email]', NEWBIE); await p.fill('input[name=full_name]', 'Newbie Worker');
    await p.click('text=Send invite'); await p.waitForSelector('text=Invite sent to');
    check('owner invites a worker', psql(`select role from profiles where email='${NEWBIE}'`) === 'worker');
    await p.close(); }
  { const wc = await ctx('10.0.0.5'); const p = await wc.newPage();
    await login(p, WORKER); await p.waitForURL('**/overview');
    check('worker login works', /worker/i.test(await p.textContent('header')));
    check('worker sees no link to the owner-only settings pages', (await p.locator('header a[href="/settings/users"], header a[href="/settings/audit"], header a[href="/settings/sending"]').count()) === 0);
    await p.goto(BASE + '/settings/users'); check('worker refused at /settings/users', /\/overview\?notice=owner-only$/.test(p.url()), p.url());
    await p.goto(BASE + '/settings/audit'); check('worker refused at /settings/audit', /\/overview\?notice=owner-only$/.test(p.url()), p.url());
    await p.goto(BASE + '/settings'); check('worker sent from /settings to Security', p.url().endsWith('/settings/security'), p.url());
    check('worker can set up two-step login', (await p.textContent('body')).includes('Set up two-step login'));
    const h = inviteReq.headers();
    let body = inviteReq.postData().replace(NEWBIE, 'sneaky.worker@example.test');
    await wc.request.post(BASE + '/settings/users', { headers: { 'next-action': h['next-action'], 'content-type': h['content-type'], 'next-router-state-tree': h['next-router-state-tree'] || '' }, data: body, maxRedirects: 0 });
    check('invite server action refuses a worker', psql("select count(*) from profiles where email='sneaky.worker@example.test'") === '0');
    await wc.close(); }

  // invite end to end: open the invite mail, set a password, log in
  const first = (async () => {
    const m = await latestMail(NEWBIE, null);
    const link = m.links.find((l) => l.includes('verify'));
    const c = await ctx('10.0.0.6'); const p = await c.newPage();
    await p.goto(link); await p.waitForURL('**/reset-password', { timeout: 15000 });
    await p.fill('input[name=password]', 'Newbie-First-Pass-2026!'); await p.fill('input[name=confirm]', 'Newbie-First-Pass-2026!');
    await p.click('button[type=submit]'); await p.waitForURL('**/login?notice=password_updated');
    await login(p, [NEWBIE, 'Newbie-First-Pass-2026!']); await p.waitForURL('**/overview');
    check('invited worker: link, password, login', /worker/i.test(await p.textContent('header')));
    await c.close();
  })();
  await first;

  // forgot password end to end (same user)
  { const before = await mailId(NEWBIE);
    const c = await ctx('10.0.0.7'); const p = await c.newPage();
    await p.goto(BASE + '/forgot-password'); await p.fill('input[name=email]', NEWBIE); await p.click('button[type=submit]');
    await p.waitForSelector('text=If that address belongs');
    const neutral = await p.textContent('[role=status]');
    await p.goto(BASE + '/forgot-password'); await p.fill('input[name=email]', 'nobody@example.test'); await p.click('button[type=submit]');
    await p.waitForSelector('text=If that address belongs');
    check('reset message is the same for unknown addresses', neutral === (await p.textContent('[role=status]')));
    const m = await latestMail(NEWBIE, before);
    await p.goto(m.links.find((l) => l.includes('verify'))); await p.waitForURL('**/reset-password', { timeout: 15000 });
    await p.fill('input[name=password]', 'Newbie-Second-Pass-2026!'); await p.fill('input[name=confirm]', 'Newbie-Second-Pass-2026!');
    await p.click('button[type=submit]'); await p.waitForURL('**/login?notice=password_updated');
    await login(p, [NEWBIE, 'Newbie-Second-Pass-2026!']); await p.waitForURL('**/overview');
    check('password reset end to end', true);
    await c.close(); }

  // removing the invited worker locks them out
  { const p = await ownerCtx.newPage(); await p.goto(BASE + '/settings/users');
    const row = p.locator('tr', { hasText: NEWBIE });
    await row.getByRole('button', { name: 'Remove' }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await row.getByText('Removed').waitFor();
    check('worker removed', psql(`select is_active from profiles where email='${NEWBIE}'`) === 'f');
    const c = await ctx('10.0.0.8'); const q = await c.newPage();
    await login(q, [NEWBIE, 'Newbie-Second-Pass-2026!']);
    await q.waitForSelector('form [role=alert]'); check('removed worker cannot log in', q.url().includes('/login'));
    const own = p.locator('tr', { hasText: OWNER[0] });
    check('no remove button for yourself', (await own.getByRole('button', { name: 'Remove' }).count()) === 0);
    await c.close(); await p.close(); }

  // 2FA
  { const p = await ownerCtx.newPage();
    await p.goto(BASE + '/settings/security'); await p.click('text=Set up two-step login');
    await p.waitForSelector('[data-testid=totp-secret]');
    await p.screenshot({ path: `${SHOTS}/2fa-enroll.png`, fullPage: true });
    const secret = (await p.textContent('[data-testid=totp-secret]')).trim();
    await p.fill('input[name=code]', totp(secret)); await p.click('text=Turn on');
    await p.waitForSelector('text=Turn off');
    check('2FA enrolled', true);
    await p.click('header >> text=Log out'); await p.waitForURL('**/login');
    await login(p, OWNER); await p.waitForTimeout(2500); await p.waitForURL(/login\/2fa/);
    await p.fill('input[name=code]', '000000'); await p.click('button[type=submit]');
    await p.waitForSelector('form [role=alert]'); check('wrong 2FA code refused', p.url().includes('/login/2fa'));
    await p.fill('input[name=code]', totp(secret, 1)); await p.click('button[type=submit]');
    let ok = true; try { await p.waitForURL('**/overview', { timeout: 6000 }); } catch { ok = false; }
    if (!ok) { await p.fill('input[name=code]', totp(secret, -1)); await p.click('button[type=submit]'); await p.waitForURL('**/overview'); }
    check('login with 2FA code', true);
    // a half-logged-in session (password only) cannot reach pages
    const c = await ctx('10.0.0.9'); const q = await c.newPage();
    await login(q, OWNER); await q.waitForURL(/login\/2fa/); await q.goto(BASE + '/overview');
    check('password-only session is sent to the 2FA step', q.url().includes('/login/2fa')); await c.close();
    await p.goto(BASE + '/settings/security'); await p.getByRole('button', { name: 'Turn off' }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
    await p.waitForSelector('text=Set up two-step login');
    check('2FA removed', true);
    await p.close(); }

  // sign-out route: GET must not sign out
  { const p = await ownerCtx.newPage(); await p.goto(BASE + '/auth/signout'); await p.goto(BASE + '/overview');
    check('GET /auth/signout does not sign out', p.url().includes('/overview')); await p.close(); }

  // logout clears the session
  { const p = await ownerCtx.newPage(); await p.goto(BASE + '/overview');
    await p.click('header >> text=Log out'); await p.waitForURL('**/login');
    await p.goto(BASE + '/overview'); check('logout clears the session', p.url().includes('/login')); }

  await browser.close();
  psql("delete from login_attempts"); psql(`delete from auth.users where email in ('${NEWBIE}')`);
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
