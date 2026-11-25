// QA checks for the Smallfold back office, run against the local stack with FAKE seed data only.
// Needs: local stack up (gateway :54321, Postgres :54322, mail catcher :8025) and the dev server on :3000.
// Run:  node admin/tests/qa.e2e.cjs   (BASE_URL sets another address; needs Playwright, see admin/README.md, Tests)
// Prints PASS/FAIL per check and exits 1 on any failure. Records it creates are removed at the end
// (named "ZZ QA ..."); settings are left with test mode ON.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ADMIN = path.resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MAIL = 'http://localhost:8025';
const GW = 'http://localhost:54321';
const OWNER = { email: 'owner@example.test', password: 'Owner-Test-Pass-2026!' };
const WORKER = { email: 'worker@example.test', password: 'Worker-Test-Pass-2026!' };
const LOGIN_ERROR = 'That email or password is not right.';
const EXPECTED = JSON.parse(fs.readFileSync(path.join(ADMIN, 'supabase/seed/expected.json'), 'utf8'));
const ANON = fs.readFileSync(path.join(ADMIN, '.env.local'), 'utf8').match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)[1].trim();
const STAGE_SRC = fs.readFileSync(path.join(ADMIN, 'lib/deals/format.ts'), 'utf8');

const PSQL_ENV = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres', PGOPTIONS: '-c client_min_messages=warning' };
const sql = (q) => execFileSync('psql', ['-X', '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', q], { env: PSQL_ENV, encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- reporting
const checks = [];
let section = '';
function startSection(name) { section = name; console.log(`\n== ${name}`); }
function check(name, cond, detail = '') {
  checks.push({ section, name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { check(`${name} (threw)`, false, String(e.message).split('\n')[0]); }
}

// ---------- mail catcher helpers
async function latestMsg(to) {
  const r = await fetch(`${MAIL}/latest?to=${encodeURIComponent(to)}`);
  return r.ok ? r.json() : null;
}
const latestId = async (to) => ((await latestMsg(to)) || {}).id ?? null;
const allMsgs = async () => (await (await fetch(`${MAIL}/messages`)).json());

// ---------- gateway helpers (real anon key, real logins)
async function gwToken({ email, password }) {
  const r = await fetch(`${GW}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  return (await r.json()).access_token;
}
async function gwInsertEmail(token, row) {
  const r = await fetch(`${GW}/rest/v1/emails`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  return { status: r.status, body: await r.text() };
}

// ---------- browser helpers
let ipN = 10;
async function newSession(browser, creds) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${ipN++}` },
  });
  const page = await ctx.newPage();
  if (creds) {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', creds.email);
    await page.fill('input[name=password]', creds.password);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  }
  return { ctx, page };
}
const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Fixtures picked from the seed (read at run time, so nothing is hard-coded to ids).
const blockedWren = sql("select id, email from creators where email = 'wren.mbeki59@example.test'").split('|');
const blockedOskar = sql("select id, email from creators where status = 'do_not_contact' and email <> 'wren.mbeki59@example.test' order by full_name limit 1").split('|');
const [WREN_ID, WREN_EMAIL] = blockedWren;
const [OSKAR_ID, OSKAR_EMAIL] = blockedOskar;

// Cleanup registry
const cleanup = { emailIds: [], creatorRestore: [], zzCreatorId: null, runStart: sql('select now()::text') };

(async () => {
  const browser = await chromium.launch();
  let owner = null;
  let worker = null;
  try {
    // ---------------------------------------------------------------- 1. failed login
    startSection('1. failed login');
    await step('wrong password and unknown email', async () => {
      const s = await newSession(browser, null);
      const p = s.page;
      const attempt = async (email, password) => {
        await p.goto(`${BASE}/login`);
        await p.fill('input[name=email]', email);
        await p.fill('input[name=password]', password);
        await p.click('button[type=submit]');
        const msg = p.getByText(LOGIN_ERROR, { exact: false }).first();
        const shown = await msg.waitFor({ timeout: 15000 }).then(() => true, () => false);
        const text = shown ? (await msg.textContent()).trim() : '';
        return { shown, text, path: new URL(p.url()).pathname };
      };
      const wrong = await attempt(OWNER.email, 'Not-The-Password-1!');
      check('wrong password shows the generic error', wrong.shown && wrong.text.includes(LOGIN_ERROR), `shown=${wrong.shown} text=${wrong.text}`);
      check('wrong password stays on /login', wrong.path === '/login', wrong.path);
      const unknown = await attempt(`qa.nobody.${randomUUID().slice(0, 8)}@example.test`, 'Not-The-Password-1!');
      check('unknown email shows the same error', unknown.shown && unknown.text === wrong.text, `"${unknown.text}" vs "${wrong.text}"`);
      check('unknown email stays on /login', unknown.path === '/login', unknown.path);
      await s.ctx.close();
    });

    // ---------------------------------------------------------------- 4. stats (before any ZZ QA record exists)
    startSection('4. overview numbers');
    owner = await newSession(browser, OWNER);
    await step('overview tiles and deals by stage', async () => {
      await owner.page.goto(`${BASE}/overview`);
      await owner.page.waitForSelector('section[aria-label="Key numbers"]', { timeout: 15000 });
      const tiles = await owner.page.$$eval('section[aria-label="Key numbers"] > div', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
      const rest = (label) => { const t = tiles.find((x) => x.startsWith(label)); return t === undefined ? null : t.slice(label.length).trim(); };
      const r1 = rest('Total creators');
      check(`total creators = ${EXPECTED.total_creators}`, r1 !== null && r1.startsWith(String(EXPECTED.total_creators)), String(r1));
      const r2 = rest('Emails sent');
      check(`emails sent all = ${EXPECTED.emails_sent_all}`, r2 !== null && r2.startsWith(String(EXPECTED.emails_sent_all)), String(r2));
      check(`emails sent last 7 days = ${EXPECTED.emails_sent_7d}`, r2 !== null && r2.includes(`${EXPECTED.emails_sent_7d} in the last 7 days`), String(r2));
      check(`emails sent last 30 days = ${EXPECTED.emails_sent_30d}`, r2 !== null && r2.includes(`${EXPECTED.emails_sent_30d} in the last 30`), String(r2));
      const r3 = rest('Replies');
      const rate = Number(EXPECTED.reply_rate).toFixed(1);
      check(`replies = ${EXPECTED.replies}`, r3 !== null && r3.startsWith(`${EXPECTED.replies} replies`), String(r3));
      check(`reply rate = ${rate}%`, r3 !== null && r3.includes(`${rate}%`), String(r3));
      const r4 = rest('Active deals');
      check(`active deals = ${EXPECTED.active_deals}`, r4 !== null && r4.startsWith(String(EXPECTED.active_deals)), String(r4));
      const r5 = rest('Commission earned');
      const usd = `$${(EXPECTED.commission_earned_cents / 100).toFixed(2)}`;
      check(`commission earned = ${usd}`, r5 !== null && r5.startsWith(usd), String(r5));

      // deals by stage: map stage keys to the labels the page uses
      const block = STAGE_SRC.match(/STAGE_LABEL[^=]*=\s*\{([\s\S]*?)\}/);
      const labelOf = Object.fromEntries([...(block ? block[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g) : [])].map((m) => [m[1], m[2]]));
      const pairs = await owner.page.$$eval('dl div', (els) => els.map((d) => [d.querySelector('dt')?.textContent.trim(), Number(d.querySelector('dd')?.textContent.trim())]));
      for (const [stage, n] of Object.entries(EXPECTED.deals_by_stage)) {
        const label = labelOf[stage] ?? stage;
        const got = pairs.find((p) => p[0] === label);
        check(`deals by stage ${stage} = ${n}`, got && got[1] === n, JSON.stringify(got ?? pairs));
      }

      // the same numbers straight from the database function, plus the weekly series sums
      const dbRes = await fetch(`${GW}/rest/v1/rpc/stats_overview`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${await gwToken(OWNER)}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const db = await dbRes.json();
      const same = (k) => Number(db[k]) === Number(EXPECTED[k]);
      for (const k of ['total_creators', 'emails_sent_all', 'emails_sent_7d', 'emails_sent_30d', 'replies', 'active_deals', 'commission_earned_cents']) {
        check(`db stats_overview ${k} = expected`, same(k), `${db[k]} vs ${EXPECTED[k]}`);
      }
      check('db reply_rate = expected', Math.abs(Number(db.reply_rate) - EXPECTED.reply_rate) < 0.05, String(db.reply_rate));
      const weekly = db.weekly || [];
      check(`db weekly has ${EXPECTED.weekly_points} points`, weekly.length === EXPECTED.weekly_points, String(weekly.length));
      check(`db weekly sent sums to ${EXPECTED.weekly_sent_total}`, weekly.reduce((a, w) => a + w.sent, 0) === EXPECTED.weekly_sent_total);
      check(`db weekly replies sum to ${EXPECTED.weekly_replies_total}`, weekly.reduce((a, w) => a + w.replies, 0) === EXPECTED.weekly_replies_total);
    });

    // ---------------------------------------------------------------- 3. search and side panel
    startSection('3. search and side panel (owner)');
    await step('search and side panel match the database', async () => {
      const [id, name, email, phone, channel, subs] = sql(
        "select id, full_name, email, coalesce(phone,''), channel_url, subscribers from creators " +
        "where phone is not null and channel_url is not null and subscribers is not null and subscribers_hidden = false " +
        "and status <> 'do_not_contact' order by full_name limit 1",
      ).split('|');
      await owner.page.goto(`${BASE}/creators?q=${encodeURIComponent(name)}`);
      const row = owner.page.locator('table tbody tr', { hasText: name }).first();
      await row.waitFor({ timeout: 15000 });
      check(`search for "${name}" shows that creator's row`, (await row.count()) === 1);
      await row.locator('td').nth(2).click();
      await owner.page.waitForURL(/open=/, { timeout: 15000 });
      const dlg = owner.page.getByRole('dialog');
      await dlg.locator('dl').first().waitFor({ timeout: 15000 });
      const fields = await dlg.locator('dl').first().evaluate((dl) => {
        const out = {}; let last = null;
        for (const el of dl.children) {
          if (el.tagName === 'DT') last = el.textContent.trim();
          else if (last) { out[last] = { text: el.textContent.trim(), href: el.querySelector('a')?.getAttribute('href') ?? null }; last = null; }
        }
        return out;
      });
      check('panel email matches the database', fields.Email?.text === email, `${fields.Email?.text} vs ${email}`);
      check('panel phone matches the database', fields.Phone?.text === phone, `${fields.Phone?.text} vs ${phone}`);
      // The channel link is no longer a "YouTube" row of the list: it is the channel name under the heading.
      check('panel channel link matches the database', (await dlg.locator(`a[href="${channel}"]`).count()) >= 1, channel);
      check('panel subscribers match the database', (fields.Subscribers?.text || '').includes(fmtInt(subs)), fields.Subscribers?.text);
      // New: the list itself shows no email address (only the panel and the full page do, and they write an audit line).
      await owner.page.keyboard.press('Escape');
      await owner.page.waitForURL((u) => !u.search.includes('open='), { timeout: 15000 });
      check('the creators list shows no email address', !/@example\.test/.test(await owner.page.locator('table').first().textContent()));
    });

    // ---------------------------------------------------------------- 6a. opted-out creators: compose and insert
    startSection('6a. opted-out creators (compose and insert)');
    await step('compose blocks opted-out creators', async () => {
      await owner.page.goto(`${BASE}/emails/compose`);
      const search = owner.page.locator('input[type=search]');
      for (const [name, label] of [['Wren Mbeki', /Opted out|Do not contact/], ['Oskar Ibarra', /Do not contact/]]) {
        await search.fill(name);
        const li = owner.page.locator('ul[aria-label="Search results"] li', { hasText: name }).first();
        await li.waitFor({ timeout: 10000 });
        const add = li.getByRole('button', { name: /^Add$/ });
        check(`${name}: Add is disabled in search`, await add.isDisabled());
        check(`${name}: shows a block badge`, label.test(await li.textContent()), (await li.textContent()).trim());
      }
      await owner.page.goto(`${BASE}/emails/compose?creators=${WREN_ID},${OSKAR_ID}`);
      const selected = owner.page.locator('ul[aria-label="Selected creators"] li');
      await selected.first().waitFor({ timeout: 10000 });
      check('preselected blocked creators are listed as blocked', (await selected.count()) === 2);
      check('Draft emails is disabled when only blocked creators are chosen', await owner.page.getByRole('button', { name: 'Draft emails' }).isDisabled());
    });
    await step('staff insert of a draft for blocked creators is refused', async () => {
      const token = await gwToken(OWNER);
      const amara = sql("select id from creators where status = 'new' and id not in (select creator_id from emails) order by full_name limit 1");
      const amaraEmail = sql(`select email from creators where id = '${amara}'`);
      const base = { subject: 'ZZ QA blocked draft', body: 'QA only', template_id: null };
      const oskar = await gwInsertEmail(token, { ...base, creator_id: OSKAR_ID, to_email: OSKAR_EMAIL });
      check('draft for do_not_contact creator is refused', oskar.status >= 400 && oskar.body.includes('do_not_contact'), `${oskar.status} ${oskar.body.slice(0, 160)}`);
      const wren = await gwInsertEmail(token, { ...base, creator_id: WREN_ID, to_email: WREN_EMAIL });
      check('draft for suppressed, do_not_contact creator is refused', wren.status >= 400, `${wren.status}`);
      const sup = await gwInsertEmail(token, { ...base, creator_id: amara, to_email: WREN_EMAIL });
      // Refused twice over since the follow-up fixes: the address is suppressed, and it is not this creator's own
      // address (a direct client write must use the creator's current address, SEC2-05). Either refusal is right.
      check('draft to a suppressed address is refused (suppression list or address rule)', sup.status >= 400 && (sup.body.includes('suppression list') || sup.body.includes("creator's current address")), `${sup.status} ${sup.body.slice(0, 160)}`);
      check('no blocked-creator draft was stored', sql("select count(*) from emails where subject = 'ZZ QA blocked draft'") === '0');
      void amaraEmail;
    });

    // ---------------------------------------------------------------- 5. email test mode
    startSection('5. test mode send');
    await step('compose -> approve -> send goes only to the test address', async () => {
      const [cid, cname, cemail, cstatus, clast] = sql(
        "select id, full_name, email, status, coalesce(last_contacted_at::text,'') from creators " +
        "where status = 'new' and subscribers_hidden = false and email not in (select email from suppression_list) " +
        "and id not in (select creator_id from emails) order by full_name limit 1",
      ).split('|');
      cleanup.creatorRestore.push({ id: cid, status: cstatus, last: clast });
      const testAddr = sql('select test_email from settings where id = 1');
      const modeOn = sql('select test_mode from settings where id = 1');
      check('settings: test mode is on with a test address', modeOn === 't' && testAddr === OWNER.email, `${modeOn} ${testAddr}`);

      const beforeTest = await latestId(testAddr);
      const beforeCreator = await latestId(cemail);
      const beforeIds = new Set((await allMsgs()).map((m) => m.id));

      const page = owner.page;
      await page.goto(`${BASE}/emails/compose?creators=${cid}`);
      await page.locator('select[name=mode]').selectOption('goal');
      await page.locator('textarea[name=goal]').fill('Introduce Smallfold and ask if they would like to hear about sponsors.');
      await page.getByRole('button', { name: 'Draft emails' }).click();
      await page.waitForURL(/\/emails\/review/, { timeout: 20000 });
      const emailId = sql(`select id from emails where creator_id = '${cid}' and status = 'draft' order by created_at desc limit 1`);
      cleanup.emailIds.push(emailId);
      check('draft created for the creator', !!emailId);

      await page.getByRole('article', { name: `Email to ${cname}` }).getByRole('button', { name: 'Approve', exact: true }).click();
      for (let i = 0; i < 20 && sql(`select status from emails where id = '${emailId}'`) !== 'approved'; i++) await sleep(300);
      check('draft approved on /emails/review', sql(`select status from emails where id = '${emailId}'`) === 'approved');
      const subject = sql(`select subject from emails where id = '${emailId}'`);

      await page.reload();
      // Seed approved emails drafted by the owner are also listed for Send. Only this QA email goes to the
      // real send route: other sends are answered by the harness, so seed emails stay approved and unsent.
      await page.route('**/api/emails/*/send', (route) => {
        if (route.request().url().includes(emailId)) return route.continue();
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Skipped by the QA harness (seed email).' }) });
      });
      await page.getByRole('button', { name: /^Send \d+ approved$/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /^Send \d+$/ }).click();
      await page.getByText(/^Finished:|^Stopped\.|daily sending limit/).first().waitFor({ timeout: 90000 });
      await page.unroute('**/api/emails/*/send');

      const row = sql(`select status, is_test, to_email from emails where id = '${emailId}'`).split('|');
      // emails.to_email keeps the creator's address; the mail itself is routed to the test address (checked below).
      check('email recorded as sent in test mode', row[0] === 'sent' && row[1] === 't', row.join('|'));

      let msg = null;
      for (let i = 0; i < 60 && !msg; i++) {
        const m = await latestMsg(testAddr);
        if (m && m.id !== beforeTest) msg = m; else await sleep(500);
      }
      check('a new message reached the test address', !!msg);
      if (msg) {
        const raw = JSON.stringify(msg);
        check('subject has the [TEST] prefix', String(msg.subject || '').startsWith('[TEST] ') && String(msg.subject).includes(subject), String(msg.subject));
        check('footer has the unsubscribe line', raw.includes('If you would rather not hear from us'));
        check('footer has the unsubscribe link', raw.includes('/unsubscribe/'));
      }
      check('nothing new arrived at the creator address', (await latestId(cemail)) === beforeCreator);
      const newForCreator = (await allMsgs()).filter((m) => !beforeIds.has(m.id) && JSON.stringify(m).includes(cemail));
      check('no new mail mentions the creator address anywhere', newForCreator.length === 0, `${newForCreator.length} message(s)`);
    });

    // ---------------------------------------------------------------- 6b. send API refuses blocked creators
    startSection('6b. send API refuses blocked creators');
    await step('send API refuses an approved email once the creator is do_not_contact', async () => {
      const used = cleanup.creatorRestore[0]?.id ?? '00000000-0000-0000-0000-000000000000';
      const [yid, yemail, ystatus, ylast] = sql(
        "select id, email, status, coalesce(last_contacted_at::text,'') from creators " +
        `where status = 'new' and subscribers_hidden = false and email not in (select email from suppression_list) and id not in (select creator_id from emails) and id <> '${used}' order by full_name limit 1`,
      ).split('|');
      cleanup.creatorRestore.push({ id: yid, status: ystatus, last: ylast });
      const eid = randomUUID();
      cleanup.emailIds.push(eid);
      sql(`insert into emails (id, creator_id, to_email, subject, body, status, is_test) values ('${eid}', '${yid}', '${yemail}', 'ZZ QA send refusal', 'QA only', 'approved', false)`);
      sql(`update creators set status = 'do_not_contact' where id = '${yid}'`);
      const beforeTest = await latestId(OWNER.email);
      const r = await owner.page.request.post(`${BASE}/api/emails/${eid}/send`);
      const body = await r.text();
      check('send API answers 409 for a do_not_contact creator', r.status() === 409 && /do not contact/i.test(body), `${r.status()} ${body.slice(0, 160)}`);
      check('email is still approved, not sent', sql(`select status from emails where id = '${eid}'`) === 'approved');
      check('no new message reached the test address', (await latestId(OWNER.email)) === beforeTest);
    });

    // ---------------------------------------------------------------- 2. worker cannot do owner actions
    startSection('2. worker limits');
    const zzId = randomUUID();
    cleanup.zzCreatorId = zzId;
    sql(`insert into creators (id, full_name, email, status) values ('${zzId}', 'ZZ QA Delete Target', 'zz.qa.delete.target@example.test', 'new')`);
    worker = await newSession(browser, WORKER);
    const wp = worker.page;
    await step('owner pages refuse the worker', async () => {
      for (const p of ['/settings/users', '/settings/sending', '/settings/audit']) {
        await wp.goto(`${BASE}${p}`);
        await wp.waitForLoadState('networkidle');
        check(`worker is sent away from ${p}`, new URL(wp.url()).pathname !== p, wp.url());
      }
    });
    await step('export and delete refuse the worker', async () => {
      const ex = await wp.request.get(`${BASE}/api/creators/export`);
      check('GET /api/creators/export is 403 for worker', ex.status() === 403, String(ex.status()));
      check('export returns no CSV to worker', !(ex.headers()['content-type'] || '').includes('csv'));
      const del = await wp.request.delete(`${BASE}/api/creators/${zzId}`);
      check('DELETE /api/creators/<id> is 403 for worker', del.status() === 403, String(del.status()));
      check('creator still exists after the refused delete', sql(`select count(*) from creators where id = '${zzId}'`) === '1');
    });
    await step('no Delete button in the side panel or on /deals for the worker', async () => {
      await wp.goto(`${BASE}/creators?q=${encodeURIComponent('ZZ QA Delete Target')}`);
      const row = wp.locator('table tbody tr', { hasText: 'ZZ QA Delete Target' }).first();
      await row.waitFor({ timeout: 15000 });
      await row.locator('td').nth(2).click();
      await wp.waitForURL(/open=/, { timeout: 15000 });
      const dlg = wp.getByRole('dialog');
      await dlg.locator('dl').first().waitFor({ timeout: 15000 });
      check('worker side panel has no Delete button', (await dlg.getByRole('button', { name: /delete/i }).count()) === 0);
      await wp.keyboard.press('Escape');
      await wp.goto(`${BASE}/deals?view=table`); // Delete lives in the table view; the board (default) has no Delete
      await wp.waitForLoadState('networkidle');
      check('worker /deals has no Delete button', (await wp.getByRole('button', { name: /^Delete$/ }).count()) === 0);
    });
    await step('owner sees Delete (control for the checks above)', async () => {
      await owner.page.goto(`${BASE}/creators?q=${encodeURIComponent('ZZ QA Delete Target')}`);
      const row = owner.page.locator('table tbody tr', { hasText: 'ZZ QA Delete Target' }).first();
      await row.waitFor({ timeout: 15000 });
      await row.locator('td').nth(2).click();
      await owner.page.waitForURL(/open=/, { timeout: 15000 });
      const dlg = owner.page.getByRole('dialog');
      await dlg.locator('dl').first().waitFor({ timeout: 15000 });
      check('owner side panel has a Delete button', (await dlg.getByRole('button', { name: /^Delete$/ }).count()) >= 1);
      await owner.page.keyboard.press('Escape');
      await owner.page.goto(`${BASE}/deals?view=table`); // Delete lives in the table view; the board (default) has no Delete
      await owner.page.waitForLoadState('networkidle');
      check('owner /deals has a Delete button', (await owner.page.getByRole('button', { name: /^Delete$/ }).count()) >= 1);
    });

    // ---------------------------------------------------------------- 7. anon cannot read
    startSection('7. anon cannot read');
    await step('anon key returns no rows', async () => {
      for (const t of ['creators', 'emails']) {
        const r = await fetch(`${GW}/rest/v1/${t}?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
        const text = await r.text();
        let rows = null;
        try { rows = JSON.parse(text); } catch { /* not JSON: an error page, which also means no rows */ }
        const noRows = r.status !== 200 || (Array.isArray(rows) && rows.length === 0);
        check(`anon GET /rest/v1/${t} returns no rows`, noRows && !text.includes('@example.test'), `status ${r.status}`);
      }
    });

    // ---------------------------------------------------------------- 8. new screens (added with the upgrade)
    startSection('8. creators, sponsors and calculator screens');
    await step('creators list counts match the database', async () => {
      const total = sql('select count(*) from creators');
      await owner.page.goto(`${BASE}/creators`);
      await owner.page.locator('.list-count').waitFor({ timeout: 15000 });
      check('creators list says how many creators there are', (await owner.page.locator('.list-count').textContent()).includes(`${total} creators`), await owner.page.locator('.list-count').textContent());
      check('the page title says Creators', /Creators/.test(await owner.page.title()), await owner.page.title());
      check('the top bar has a Sponsors tab', (await owner.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Sponsors' }).count()) === 1);
    });
    await step('creator profile page', async () => {
      const [id, name] = sql("select id, full_name from creators where status <> 'do_not_contact' order by full_name limit 1").split('|');
      await owner.page.goto(`${BASE}/creators/${id}`);
      check('full profile page has the creator name as its heading', await owner.page.getByRole('heading', { level: 1, name }).isVisible());
      for (const h of ['Sponsorship history', 'Deals', 'Notes']) check(`profile has the section ${h}`, await owner.page.getByRole('heading', { name: h }).isVisible());
      const r = await owner.page.goto(`${BASE}/creators/not-a-real-id`);
      check('an unknown creator id gives a 404 page', r.status() === 404, String(r.status()));
    });
    await step('sponsors list and profile', async () => {
      const total = sql('select count(*) from brands');
      await owner.page.goto(`${BASE}/sponsors`);
      await owner.page.locator('.list-count').waitFor({ timeout: 15000 });
      check('sponsors list says how many sponsors there are', (await owner.page.locator('.list-count').textContent()).includes(`${total} sponsors`), await owner.page.locator('.list-count').textContent());
      const [bid, bname] = sql('select id, name from brands order by name limit 1').split('|');
      await owner.page.goto(`${BASE}/sponsors?open=${bid}`);
      const dlg = owner.page.getByRole('dialog');
      await dlg.getByRole('heading', { name: bname }).waitFor({ timeout: 15000 });
      check('the sponsors panel opens from ?open=', true);
      await owner.page.keyboard.press('Escape');
      const full = await owner.page.goto(`${BASE}/sponsors/${bid}`);
      check('full sponsor page opens', full.status() === 200 && await owner.page.getByRole('heading', { level: 1, name: bname }).isVisible());
      check('worker can open a sponsor page too', (await wp.goto(`${BASE}/sponsors/${bid}`)).status() === 200);
      check('worker sponsor page has no Delete button', (await wp.getByRole('button', { name: /^Delete/ }).count()) === 0);
    });
    await step('price calculator', async () => {
      await owner.page.goto(`${BASE}/creators/calculator`);
      check('calculator page opens with its heading', await owner.page.getByRole('heading', { level: 1 }).first().isVisible());
    });

    // ---------------------------------------------------------------- 9. search box (Ctrl+K)
    startSection('9. search box');
    await step('search box finds and opens a creator, a sponsor and a deal', async () => {
      const pg = owner.page;
      const [cid, cname] = sql("select id, full_name from creators where full_name !~ '[%_]' order by full_name limit 1").split('|');
      const [bid, bname] = sql("select id, name from brands order by name limit 1").split('|');
      const [dc, db] = sql("select c.full_name, b.name from deals d join creators c on c.id = d.creator_id join brands b on b.id = d.brand_id order by d.created_at limit 1").split('|');
      await pg.goto(`${BASE}/overview`);
      await pg.waitForLoadState('networkidle');
      await pg.keyboard.press('Control+k');
      const input = pg.getByRole('dialog', { name: 'Search' }).getByLabel('Search creators, sponsors and deals');
      await input.waitFor({ timeout: 10000 });
      check('Ctrl+K opens the search box with focus in the input', await input.evaluate((el) => el === document.activeElement));
      await input.fill(cname);
      const opt = pg.getByRole('option').filter({ hasText: cname }).first();
      await opt.waitFor({ timeout: 10000 });
      const shown = await pg.getByRole('dialog', { name: 'Search' }).textContent();
      check('results show no email address', !/@example\.test/.test(shown));
      await pg.keyboard.press('Enter');
      await pg.waitForURL(new RegExp(`/creators/${cid}$`), { timeout: 15000 });
      check('Enter opens the creator page', true);
      await pg.keyboard.press('Control+k');
      await input.waitFor();
      check('Recently opened lists the creator just opened', (await pg.getByRole('option').filter({ hasText: cname }).count()) >= 1);
      await pg.keyboard.press('Escape');
      check('Esc closes the search box', (await pg.getByRole('dialog', { name: 'Search' }).count()) === 0);
      await pg.keyboard.press('Control+k');
      await input.fill(bname);
      await pg.getByRole('option').filter({ hasText: bname }).first().click();
      await pg.waitForURL(new RegExp(`/sponsors/${bid}$`), { timeout: 15000 });
      check('clicking a sponsor result opens the sponsor page', true);
      await pg.keyboard.press('Control+k');
      await input.fill(dc);
      const deal = pg.getByRole('option').filter({ hasText: `${dc} with ${db}` }).first();
      await deal.waitFor({ timeout: 10000 });
      await deal.click();
      await pg.waitForURL(/\/deals$/, { timeout: 15000 });
      check('a deal result opens /deals', true);
      await pg.keyboard.press('Control+k');
      await input.fill('zzzz-nothing-like-this');
      check('"Nothing matches" is shown for a search with no result', await pg.getByText('Nothing matches').first().waitFor({ timeout: 10000 }).then(() => true, () => false));
      await pg.keyboard.press('Escape');
    });
    await step('search route is closed to strangers and bad input', async () => {
      const anon = await fetch(`${BASE}/api/search?q=a`);
      check('GET /api/search is 401 when not logged in', anon.status === 401, String(anon.status));
      check('GET /api/search?q= is 400 for an empty search', (await owner.page.request.get(`${BASE}/api/search?q=`)).status() === 400);
      check('GET /api/search is 400 for 101 characters', (await owner.page.request.get(`${BASE}/api/search?q=${'a'.repeat(101)}`)).status() === 400);
      const wr = await wp.request.get(`${BASE}/api/search?q=a`);
      check('a worker can search', wr.status() === 200);
      check('the reply has no email, phone or note', !/@|phone|notes?"/.test(await wr.text()));
    });
  } finally {
    // ---------------------------------------------------------------- cleanup (everything this run created)
    startSection('cleanup');
    await step('cleanup', async () => {
      for (const id of cleanup.emailIds) sql(`delete from emails where id = '${id}'`);
      for (const c of cleanup.creatorRestore) {
        const last = c.last ? sqlStr(c.last) : 'null';
        sql(`update creators set status = '${c.status}', last_contacted_at = ${last} where id = '${c.id}'`);
      }
      if (cleanup.zzCreatorId) sql(`delete from creators where id = '${cleanup.zzCreatorId}'`);
      sql(`delete from login_attempts where created_at >= '${cleanup.runStart}'`);
      const modeOn = sql('select test_mode from settings where id = 1');
      check('settings still have test mode on', modeOn === 't');
      check('no ZZ QA creator left behind', sql("select count(*) from creators where full_name like 'ZZ QA%'") === '0');
    });
    if (owner) await owner.ctx.close();
    if (worker) await worker.ctx.close();
    await browser.close();
  }

  const failed = checks.filter((c) => !c.ok);
  const sections = [...new Set(checks.map((c) => c.section))];
  console.log('\n== summary');
  for (const s of sections) {
    const xs = checks.filter((c) => c.section === s);
    console.log(`  ${xs.filter((c) => c.ok).length}/${xs.length} passed  ${s}`);
  }
  console.log(`\nQA: ${checks.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => {
  console.error('FAIL  harness error:', e);
  process.exitCode = 1;
});
