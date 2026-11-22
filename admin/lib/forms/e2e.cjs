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
// Off Vercel the app trusts x-real-ip, so each group of checks sends as its own fake visitor and the
// per-visitor limit (5 sends per hour per form) never mixes them up. All are in 203.0.113.0/24 (TEST-NET-3,
// never a real visitor), and cleanup removes the rate rows of the whole range.
const IP = { basic: '203.0.113.1', refused: '203.0.113.2', formats: '203.0.113.3', limit: '203.0.113.4', contact: '203.0.113.5' };
const fitIp = (i) => `203.0.113.${100 + i}`; // one visitor per fitted case
const TEST_IPS = Array.from({ length: 256 }, (_, i) => `203.0.113.${i}`);
const MAIL = 'forms-e2e-%@example.test';
const YT = 'https://www.youtube.com/@formstest';
const LONG_TOPIC = 'I make fake videos about fake things, mostly slow cooking, bread and fermentation for beginners. '.repeat(4).trim();

// The website accepts these, so the Apply form fits them instead of refusing them (lib/forms/schemas.ts).
// Each row: what, the changed fields, and what must be stored (c = the saved creator row).
const has = (c, text) => typeof c.notes === 'string' && c.notes.includes(text);
const FITTED = [
  ['a bare @handle', { channel: '@formstest' }, (c) => c.channel_url === YT && c.notes === null],
  ['a channel link to another site', { channel: 'https://example.test/@formstest' }, (c) => c.channel_url === null && has(c, 'https://example.test/@formstest')],
  ['a plain word as the channel', { channel: 'FormsTestKitchen' }, (c) => c.channel_url === null && has(c, 'FormsTestKitchen')],
  ['a javascript: channel link', { channel: 'javascript:alert(1)' }, (c) => c.channel_url === null && has(c, 'javascript:alert(1)')],
  ['a javascript:// channel link that names YouTube', { channel: 'javascript://www.youtube.com/@formstest' }, (c) => c.channel_url === null && has(c, 'javascript://www.youtube.com/@formstest')],
  ['a YouTube video link', { channel: 'https://www.youtube.com/watch?v=formstest1' }, (c) => c.channel_url === null && has(c, 'watch?v=formstest1')],
  ['a phone with dots', { phone: '555.010.0100' }, (c) => c.phone === '555 010 0100' && c.notes === null],
  ['a phone with slashes', { phone: '555/010/0100' }, (c) => c.phone === '555 010 0100' && c.notes === null],
  ['a phone with letters', { phone: 'call me maybe' }, (c) => c.phone === null && has(c, 'call me maybe') && c.channel_url === YT],
  ['a phone over 30 characters', { phone: '+1 555 0100 0100 0100 0100 0100 0100' }, (c) => c.phone === null && has(c, '+1 555 0100 0100 0100 0100 0100 0100') && c.channel_url === YT],
  ['a niche of exactly 120 characters', { topic: 'x'.repeat(120) }, (c) => c.niche === 'x'.repeat(120) && c.notes === null],
  ['a niche over 120 characters (one long word)', { topic: 'x'.repeat(121) }, (c) => c.niche.length <= 120 && has(c, 'x'.repeat(121))],
  ['a long answer about the channel', { topic: LONG_TOPIC }, (c) => c.niche.length <= 120 && LONG_TOPIC.startsWith(c.niche.replace(/…$/, '')) && has(c, LONG_TOPIC)],
  ['a name over 120 characters', { name: 'n'.repeat(121) }, (c) => c.full_name === 'n'.repeat(120) && c.channel_url === YT],
  ['a name of 300 characters', { name: 'm'.repeat(300) }, (c) => c.full_name === 'm'.repeat(120)],
  ['a plain-word channel, a phone with letters and a long answer at once', { channel: 'FormsTestKitchen', phone: 'call me maybe', topic: LONG_TOPIC },
    (c) => c.channel_url === null && c.phone === null && c.niche.length <= 120 && has(c, 'FormsTestKitchen') && has(c, 'call me maybe') && has(c, LONG_TOPIC)],
];

// Still refused with 400, and nothing saved (undefined = the field is not sent at all).
const REFUSED = [
  ['an invalid email', { email: 'not-an-email' }],
  ['a missing email', { email: undefined }],
  ['an empty email', { email: '' }],
  ['missing subscribers', { subscribers: undefined }],
  ['empty subscribers', { subscribers: '' }],
  ['non-numeric subscribers', { subscribers: 'lots' }],
  ['subscribers over 100 million', { subscribers: '100000001' }],
  ['a missing name', { name: undefined }],
  ['a name of only spaces', { name: '   ' }],
  ['a missing channel', { channel: undefined }],
  ['an empty channel', { channel: '' }],
  ['a missing answer about the channel', { topic: undefined }],
  ['a name over 300 characters', { name: 'n'.repeat(301) }],
  ['a channel over 500 characters', { channel: `https://www.youtube.com/@${'a'.repeat(480)}` }],
  ['an answer about the channel over 2000 characters', { topic: 'x'.repeat(2001) }],
  ['a phone over 100 characters', { phone: '1'.repeat(101) }],
];

const failures = [];
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
}

function cleanup() {
  psql(`delete from contact_messages where email like '${MAIL}';
        delete from creators where email like '${MAIL}';
        delete from form_rate_limits where ip_hash in (${TEST_IPS.map((ip) => `'${hashOf(ip)}'`).join(',')});`);
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
  const person = (n, extra = {}) => Object.fromEntries(Object.entries({
    name: `Forms Test ${n}`, email: `forms-e2e-${n}@example.test`, phone: '+1 555 0100', channel: YT,
    topic: 'Fake videos about fake things.', subscribers: '12,500', _subject: 'New creator application', _gotcha: '', ...extra,
  }).filter(([, v]) => v !== undefined));
  const stored = (n) => {
    const j = psql(`select row_to_json(c) from (select full_name, phone, channel_url, niche, notes, subscribers from creators where email = 'forms-e2e-${n}@example.test') c`);
    return j ? JSON.parse(j) : null;
  };
  const testCreators = () => psql(`select count(*) from creators where email like '${MAIL}'`);
  const rateRows = (ip) => psql(`select count(*) from form_rate_limits where ip_hash = '${hashOf(ip)}'`);

  // ---------- apply
  let r = await apply(IP.basic, person('one'));
  check(r.status() === 200 && (await r.json()).ok === true, 'apply: 200 with {ok:true}');
  const row = psql(`select status || '|' || source || '|' || subscribers || '|' || coalesce(niche,'') || '|' || coalesce(notes,'none') from creators where email = 'forms-e2e-one@example.test'`);
  check(row === 'new|website|12500|Fake videos about fake things.|none', `apply: creator saved as new, website, 12500, niche, no notes (got ${row})`);
  check(psql(`select count(*) from audit_log where action = 'application.received' and entity_id = (select id::text from creators where email = 'forms-e2e-one@example.test')`) === '1', 'apply: audit row written');

  r = await apply(IP.basic, person('one', { name: 'Someone Else' }));
  check(r.status() === 200 && (await r.json()).ok === true, 'apply: duplicate email gets the same success');
  check(psql(`select count(*) from creators where email = 'forms-e2e-one@example.test'`) === '1' &&
        psql(`select full_name from creators where email = 'forms-e2e-one@example.test'`) === 'Forms Test one', 'apply: duplicate created nothing and changed nothing');

  r = await apply(IP.basic, person('bot', { _gotcha: 'I am a robot' }));
  check(r.status() === 200 && (await r.json()).ok === true, 'apply: _gotcha filled answers like a success');
  check(psql(`select count(*) from creators where email = 'forms-e2e-bot@example.test'`) === '0', 'apply: _gotcha filled saved nothing');

  r = await apply(IP.basic, person('evil'), 'https://evil.example.test');
  check(r.status() === 403, `apply: wrong Origin gets 403 (got ${r.status()})`);
  r = await api.post(`${BASE}/api/public/apply`, { headers: { 'x-real-ip': IP.basic }, multipart: person('evil') });
  check(r.status() === 403, 'apply: missing Origin gets 403');
  check(psql(`select count(*) from creators where email = 'forms-e2e-evil@example.test'`) === '0', 'apply: wrong Origin saved nothing');
  r = await api.post(`${BASE}/api/public/apply`, { headers: headers(IP.basic), data: { name: 'x' } });
  check(r.status() === 400, 'apply: JSON body is refused with 400');
  r = await api.get(`${BASE}/api/public/apply`);
  check(r.status() === 405, 'apply: GET gets 405');
  check(rateRows(IP.basic) === '2', `apply: only the two saved sends used the visitor's limit (got ${rateRows(IP.basic)})`);

  // still refused: these cannot be fitted, and they save nothing
  const before = testCreators();
  for (const [what, extra] of REFUSED) {
    r = await apply(IP.refused, person('refused', extra));
    const ok = r.status() === 400 && (await r.json().catch(() => ({}))).ok === false;
    check(ok, `apply: ${what} gets 400 (got ${r.status()})`);
  }
  check(testCreators() === before && psql(`select count(*) from creators where email = 'forms-e2e-refused@example.test'`) === '0', 'apply: refused cases saved nothing');
  check(rateRows(IP.refused) === '0', `apply: refused sends do not use the visitor's limit (got ${rateRows(IP.refused)})`);

  // fitted, not refused: saved, and what does not fit its column is kept in the notes
  for (const [i, [what, extra, expect]] of FITTED.entries()) {
    r = await apply(fitIp(i), person(`fit${i}`, extra));
    check(r.status() === 200 && (await r.json().catch(() => ({}))).ok === true, `apply (fitted): ${what} gets 200 (got ${r.status()})`);
    const c = stored(`fit${i}`);
    const ok = c !== null && c.subscribers === 12500 && typeof c.niche === 'string' && c.niche.length <= 120 && expect(c);
    check(ok, `apply (fitted): ${what} is stored as expected${ok ? '' : ` (got ${JSON.stringify(c)})`}`);
  }
  check(testCreators() === String(Number(before) + FITTED.length), 'apply (fitted): each fitted send saved exactly one creator');
  check(psql(`select count(*) from creators where channel_url ilike '%javascript%'`) === '0', 'apply (fitted): no javascript: link in channel_url');
  check(psql(`select count(*) from creators where email like 'forms-e2e-fit%' and channel_url is not null and channel_url not like 'https://%youtube.com/%'`) === '0', 'apply (fitted): every stored channel link is a https YouTube link');

  r = await apply(IP.formats, person('norm', { channel: 'youtube.com/@formsnorm', subscribers: '12.500', phone: '' }));
  check(r.status() === 200 && psql(`select channel_url || '|' || subscribers || '|' || coalesce(phone,'none') from creators where email = 'forms-e2e-norm@example.test'`) === 'https://youtube.com/@formsnorm|12500|none', 'apply: channel link is stored normalized (https://), 12.500 reads as 12500');
  // urlencoded works, too
  r = await api.post(`${BASE}/api/public/apply`, { headers: headers(IP.formats), form: person('two') });
  check(r.status() === 200 && psql(`select count(*) from creators where email = 'forms-e2e-two@example.test'`) === '1', 'apply: urlencoded body accepted');

  // rate limit: a fresh visitor gets 5 sends in an hour, the 6th is refused
  const codes = [];
  for (let i = 3; i <= 8; i++) codes.push((await apply(IP.limit, person(`r${i}`))).status());
  check(codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, `apply: 6th send in an hour is limited (got ${codes.join(',')})`);
  r = await apply(IP.limit, person('r9'));
  const body = await r.json();
  check(r.status() === 429 && /too many/i.test(body.error || ''), `apply: limited send has a clear message ("${body.error}")`);
  check(psql(`select count(*) from creators where email in ('forms-e2e-r8@example.test','forms-e2e-r9@example.test')`) === '0', 'apply: limited sends saved nothing');
  check(rateRows(IP.limit) === '5', 'apply: rate rows hold only the hash');
  check(psql(`select count(*) from form_rate_limits where ip_hash like '%203.0.113.%'`) === '0', 'apply: no raw IP stored');
  r = await apply(fitIp(0), person('r10'));
  check(r.status() === 200, `apply: another visitor is not limited by the first one (got ${r.status()})`);

  // ---------- contact
  r = await api.post(`${BASE}/api/public/contact`, { headers: headers(IP.contact), form: { company: 'Fake Brand Co', promote: 'A fake product for fake people.', budget: '$500 to $1,999', name: 'Forms Contact', email: 'forms-e2e-contact@example.test', phone: '+1 555 0101', _subject: 'New brand inquiry', _gotcha: '' } });
  check(r.status() === 200 && (await r.json()).ok === true, 'contact: 200 with {ok:true}');
  check(psql(`select count(*) from contact_messages where email = 'forms-e2e-contact@example.test'`) === '1', 'contact: message saved');
  const saved = psql(`select topic || '|' || message || '|' || company || '|' || budget || '|' || phone from contact_messages where email = 'forms-e2e-contact@example.test'`);
  check(saved === 'Brand inquiry|Fake Brand Co wants to promote: A fake product for fake people.\nBudget: $500 to $1,999|Fake Brand Co|$500 to $1,999|+1 555 0101', `contact: topic, summary, company, budget, phone stored (got ${saved})`);
  check(!psql(`select message from contact_messages where email = 'forms-e2e-contact@example.test'`).includes('555'), 'contact: phone is not in the message text');
  r = await api.post(`${BASE}/api/public/contact`, { headers: headers(IP.contact, 'https://evil.example.test'), form: { company: 'X', promote: 'x', budget: 'x', name: 'X', email: 'forms-e2e-x@example.test' } });
  check(r.status() === 403, 'contact: wrong Origin gets 403');
  r = await api.post(`${BASE}/api/public/contact`, { headers: headers(IP.contact), form: { company: 'X', promote: 'x', budget: 'x', name: 'Bot', email: 'forms-e2e-bot@example.test', _gotcha: 'x' } });
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
  const nav = await worker.page.locator('nav[aria-label="Main"]').textContent();
  check(/Inbox/.test(nav) && !/Claude/.test(nav), 'worker: nav has Inbox and no Claude');
  const wrow = worker.page.locator('table[aria-label="Messages"] tbody tr', { hasText: 'Forms Contact' });
  check((await wrow.count()) === 1, 'worker: the contact message shows in the Inbox');
  await wrow.getByRole('link', { name: 'Forms Contact' }).click();
  await worker.page.waitForURL(new RegExp(`/inbox/${id}`));
  await worker.page.getByText('Budget: $500 to $1,999').waitFor();
  check((await worker.page.getByText('Fake Brand Co', { exact: true }).count()) === 1 && (await worker.page.getByText('+1 555 0101').count()) === 1, 'worker: detail shows company and phone');
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
  const onav = await op.locator('nav[aria-label="Main"]').textContent();
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
