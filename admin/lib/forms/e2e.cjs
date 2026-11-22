// Check of the website forms and the Inbox against the local stack (fake data only).
// Run from admin/ with the stack and a dev server up:
//   BASE_URL=http://localhost:3200 NODE_PATH=/opt/node-tools/node_modules node lib/forms/e2e.cjs
// Every row it creates (creators, contact messages, rate-limit rows) is removed at the start and the end.
const { chromium, request } = require('playwright');
const { execFileSync } = require('child_process');
const { createHmac } = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OWNER = { email: 'owner@example.test', password: 'Owner-Test-Pass-2026!' };
const WORKER = { email: 'worker@example.test', password: 'Worker-Test-Pass-2026!' };
const PSQL_ENV = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const psql = (sql) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: PSQL_ENV, encoding: 'utf8' }).trim();

function envFile() {
  const out = {};
  const f = path.join(__dirname, '..', '..', '.env.local');
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}
const ENV = envFile();
const hashOf = (ip) => createHmac('sha256', ENV.UNSUBSCRIBE_SECRET).update(`form-rate:${ip}`).digest('hex');
const IPS = ['10.99.0.1', '10.99.0.2', '10.99.0.3', '10.99.0.4'];
const MAIL = 'forms-e2e-%@example.test';

const failures = [];
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
}

function cleanup() {
  psql(`delete from contact_messages where email like '${MAIL}';
        delete from creators where email like '${MAIL}';
        delete from form_rate_limits where ip_hash in (${IPS.map((ip) => `'${hashOf(ip)}'`).join(',')});`);
}

async function login(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/overview/, { timeout: 90000 });
  return { ctx, page };
}

async function main() {
  cleanup();
  const baseline = {
    creators: psql('select count(*) from creators'),
    contacts: psql('select count(*) from contact_messages'),
    rates: psql('select count(*) from form_rate_limits'),
  };
  const api = await request.newContext();
  const headers = (ip, origin = BASE) => ({ Origin: origin, 'x-real-ip': ip, Accept: 'application/json' });
  const apply = (ip, fields, origin) => api.post(`${BASE}/api/public/apply`, { headers: headers(ip, origin), multipart: fields });
  const person = (n, extra = {}) => ({
    name: `Forms Test ${n}`, email: `forms-e2e-${n}@example.test`, phone: '+1 555 0100', channel: '@formstest',
    topic: 'Fake videos about fake things.', subscribers: '12,500', _subject: 'New creator application', _gotcha: '', ...extra,
  });

  // ---------- apply
  let r = await apply(IPS[0], person('one'));
  check(r.status() === 200 && (await r.json()).ok === true, 'apply: 200 with {ok:true}');
  const row = psql(`select status || '|' || source || '|' || subscribers || '|' || coalesce(notes,'') from creators where email = 'forms-e2e-one@example.test'`);
  check(row === 'new|website|12500|Fake videos about fake things.', `apply: creator saved as new, website, 12500, notes (got ${row})`);
  check(psql(`select count(*) from audit_log where action = 'application.received' and entity_id = (select id::text from creators where email = 'forms-e2e-one@example.test')`) === '1', 'apply: audit row written');

  r = await apply(IPS[0], person('one', { name: 'Someone Else' }));
  check(r.status() === 200 && (await r.json()).ok === true, 'apply: duplicate email gets the same success');
  check(psql(`select count(*) from creators where email = 'forms-e2e-one@example.test'`) === '1' &&
        psql(`select full_name from creators where email = 'forms-e2e-one@example.test'`) === 'Forms Test one', 'apply: duplicate created nothing and changed nothing');

  r = await apply(IPS[0], person('bot', { _gotcha: 'I am a robot' }));
  check(r.status() === 200 && (await r.json()).ok === true, 'apply: _gotcha filled answers like a success');
  check(psql(`select count(*) from creators where email = 'forms-e2e-bot@example.test'`) === '0', 'apply: _gotcha filled saved nothing');

  r = await apply(IPS[0], person('evil'), 'https://evil.example.test');
  check(r.status() === 403, `apply: wrong Origin gets 403 (got ${r.status()})`);
  r = await api.post(`${BASE}/api/public/apply`, { headers: { 'x-real-ip': IPS[0] }, multipart: person('evil') });
  check(r.status() === 403, 'apply: missing Origin gets 403');
  check(psql(`select count(*) from creators where email = 'forms-e2e-evil@example.test'`) === '0', 'apply: wrong Origin saved nothing');

  r = await apply(IPS[0], person('bad', { email: 'not-an-email' }));
  check(r.status() === 400 && (await r.json()).ok === false, 'apply: invalid email gets 400');
  r = await api.post(`${BASE}/api/public/apply`, { headers: headers(IPS[0]), data: { name: 'x' } });
  check(r.status() === 400, 'apply: JSON body is refused with 400');
  r = await api.get(`${BASE}/api/public/apply`);
  check(r.status() === 405, 'apply: GET gets 405');

  // urlencoded works, too
  r = await api.post(`${BASE}/api/public/apply`, { headers: headers(IPS[1]), form: person('two') });
  check(r.status() === 200 && psql(`select count(*) from creators where email = 'forms-e2e-two@example.test'`) === '1', 'apply: urlencoded body accepted');

  // rate limit: the first IP has used 2 sends (one, one-duplicate; the trap, bad and wrong-origin sends do not count)
  const codes = [];
  for (let i = 3; i <= 8; i++) codes.push((await apply(IPS[2], person(`r${i}`))).status());
  check(codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, `apply: 6th send in an hour is limited (got ${codes.join(',')})`);
  r = await apply(IPS[2], person('r9'));
  const body = await r.json();
  check(r.status() === 429 && /too many/i.test(body.error || ''), `apply: limited send has a clear message ("${body.error}")`);
  check(psql(`select count(*) from creators where email in ('forms-e2e-r8@example.test','forms-e2e-r9@example.test')`) === '0', 'apply: limited sends saved nothing');
  check(psql(`select count(*) from form_rate_limits where ip_hash = '${hashOf(IPS[2])}'`) === '5', 'apply: rate rows hold only the hash');
  check(psql(`select count(*) from form_rate_limits where ip_hash like '%10.99.%'`) === '0', 'apply: no raw IP stored');

  // ---------- contact
  r = await api.post(`${BASE}/api/public/contact`, { headers: headers(IPS[3]), form: { name: 'Forms Contact', email: 'forms-e2e-contact@example.test', topic: 'A fake question', message: 'Hello, this is a fake message.\nSecond line.', _gotcha: '' } });
  check(r.status() === 200 && (await r.json()).ok === true, 'contact: 200 with {ok:true}');
  check(psql(`select count(*) from contact_messages where email = 'forms-e2e-contact@example.test'`) === '1', 'contact: message saved');
  r = await api.post(`${BASE}/api/public/contact`, { headers: headers(IPS[3], 'https://evil.example.test'), form: { name: 'X', email: 'forms-e2e-x@example.test', message: 'x' } });
  check(r.status() === 403, 'contact: wrong Origin gets 403');
  r = await api.post(`${BASE}/api/public/contact`, { headers: headers(IPS[3]), form: { name: 'Bot', email: 'forms-e2e-bot@example.test', message: 'x', _gotcha: 'x' } });
  check(r.status() === 200 && psql(`select count(*) from contact_messages where email = 'forms-e2e-bot@example.test'`) === '0', 'contact: _gotcha saves nothing');
  const id = psql(`select id from contact_messages where email = 'forms-e2e-contact@example.test'`);

  // ---------- anon key cannot read it through REST
  const rest = await api.get(`${ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/contact_messages?select=id`, { headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } });
  const restText = await rest.text();
  check(rest.status() >= 400 || restText === '[]', `anon key cannot read contact_messages over REST (status ${rest.status()})`);
  check(!restText.includes(id), 'anon key response does not contain the message');
  const restAnonRate = await api.get(`${ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/form_rate_limits?select=id`, { headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  check(restAnonRate.status() >= 400, 'anon key cannot read the rate-limit store over REST');

  const browser = await chromium.launch();

  // ---------- worker
  const worker = await login(browser, WORKER);
  await worker.page.goto(`${BASE}/inbox`);
  const nav = await worker.page.locator('nav[aria-label="Main"]').innerText();
  check(/Inbox/.test(nav) && !/Claude/.test(nav), 'worker: nav has Inbox and no Claude');
  const wrow = worker.page.locator('table[aria-label="Messages"] tbody tr', { hasText: 'Forms Contact' });
  check((await wrow.count()) === 1, 'worker: the contact message shows in the Inbox');
  await wrow.getByRole('link', { name: 'Forms Contact' }).click();
  await worker.page.waitForURL(new RegExp(`/inbox/${id}`));
  await worker.page.getByText('Second line.').waitFor();
  check((await worker.page.getByRole('button', { name: 'Delete' }).count()) === 0, 'worker: no Delete button');
  await worker.page.getByRole('button', { name: 'Mark as handled' }).click();
  await worker.page.getByRole('button', { name: 'Mark as not handled' }).waitFor({ timeout: 30000 });
  check(psql(`select (handled_at is not null) || '|' || (handled_by = (select id from profiles where email = '${WORKER.email}')) from contact_messages where id = '${id}'`) === 'true|true', 'worker: marked handled, handled_by is the worker');
  check(psql(`select count(*) from audit_log where action = 'contact.viewed' and entity_id = '${id}'`) !== '0', 'worker: opening the message wrote contact.viewed');
  // worker delete through the API with the worker's own token
  const tok = await api.post(`${ENV.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, { headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY }, data: { email: WORKER.email, password: WORKER.password } });
  const token = (await tok.json()).access_token;
  const del = await api.delete(`${ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/contact_messages?id=eq.${id}`, { headers: { apikey: ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=representation' } });
  check(psql(`select count(*) from contact_messages where id = '${id}'`) === '1', `worker: cannot delete through the REST API (status ${del.status()})`);
  await worker.ctx.close();

  // ---------- owner
  const owner = await login(browser, OWNER);
  const op = owner.page;
  await op.goto(`${BASE}/inbox`);
  const onav = await op.locator('nav[aria-label="Main"]').innerText();
  check(/Inbox/.test(onav) && /Claude/.test(onav), 'owner: nav has Inbox and Claude');
  check((await op.locator('table[aria-label="Messages"] tbody tr', { hasText: 'Forms Contact' }).count()) === 0, 'owner: a handled message is hidden from the default "Not handled" view');
  await op.getByLabel('Show', { exact: true }).selectOption('all');
  await op.getByRole('button', { name: 'Filter' }).click();
  await op.waitForURL(/show=all/);
  const orow = op.locator('table[aria-label="Messages"] tbody tr', { hasText: 'Forms Contact' });
  check((await orow.count()) === 1, 'owner: the contact message shows under "All messages"');
  await orow.getByRole('link', { name: 'Forms Contact' }).click();
  await op.waitForURL(new RegExp(`/inbox/${id}`));
  await op.getByRole('button', { name: 'Mark as not handled' }).click();
  await op.getByRole('button', { name: 'Mark as handled' }).waitFor({ timeout: 30000 });
  check(psql(`select handled_at is null from contact_messages where id = '${id}'`) === 't', 'owner: marked not handled again');
  await op.getByRole('button', { name: 'Delete' }).click();
  await op.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await op.waitForURL(/\/inbox$/, { timeout: 30000 });
  check(psql(`select count(*) from contact_messages where id = '${id}'`) === '0', 'owner: deleted the message after confirming');
  await owner.ctx.close();
  await browser.close();
  await api.dispose();

  cleanup();
  const after = {
    creators: psql('select count(*) from creators'),
    contacts: psql('select count(*) from contact_messages'),
    rates: psql('select count(*) from form_rate_limits'),
  };
  check(JSON.stringify(after) === JSON.stringify(baseline), `cleanup: counts back to ${JSON.stringify(baseline)} (got ${JSON.stringify(after)})`);
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  try { cleanup(); } catch {}
  process.exit(1);
});
