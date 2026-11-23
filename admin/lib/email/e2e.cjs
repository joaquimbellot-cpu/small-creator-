// End-to-end check of the email section against the LOCAL stack only (never a real mail server).
//   node lib/email/e2e.cjs      (run from admin/, dev server + stack + mail catcher already running)
// Creates "ZZ Test" records, checks the whole flow in a real browser, then removes them and restores settings.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SITE = process.env.BASE_URL || 'http://localhost:3000';
const MAIL = 'http://localhost:8025';
const SHOT = process.env.SHOT_DIR || path.join(require('os').tmpdir(), 'smallfold-shots');
fs.mkdirSync(SHOT, { recursive: true });

// ---- env + tiny helpers
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (env.SMTP_HOST !== 'localhost' || env.SMTP_PORT !== '1025') throw new Error('Refusing to run: SMTP is not the local mail catcher');
const REST = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1';
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
async function db(method, table, query = '', body) {
  const res = await fetch(`${REST}/${table}${query}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${table}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}
let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
}

async function mail(subjectPart) {
  // newest message whose subject contains the text
  const list = await (await fetch(`${MAIL}/messages`)).json();
  const hit = list.filter((m) => m.subject.includes(subjectPart)).pop();
  if (!hit) return null;
  // Mail bodies are quoted-printable: join soft line breaks and decode =XX before searching the text.
  const raw = (await (await fetch(`${MAIL}/messages/${hit.id}`)).text()).replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return { ...hit, raw };
}
const mailCount = async (subjectPart) => (await (await fetch(`${MAIL}/messages`)).json()).filter((m) => m.subject.includes(subjectPart)).length;

async function login(browser, email, password) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(SITE + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/overview');
  return { ctx, page };
}

// Settings through the real form (owner only).
async function setSettings(page, { limit, delay, testMode, postal }) {
  await page.goto(SITE + '/settings/sending');
  await page.getByLabel('Daily limit').fill(String(limit));
  await page.getByLabel('Seconds between sends').fill(String(delay));
  const box = page.getByRole('checkbox');
  if ((await box.isChecked()) !== testMode) await box.setChecked(testMode);
  await page.getByRole('textbox', { name: 'Test address' }).fill('owner@example.test');
  await page.getByLabel('Sender postal address').fill(postal || '');
  await page.getByRole('button', { name: 'Save' }).click();
}

(async () => {
  // A password-only owner session reads nothing once the owner has a verified 2FA factor: remove any (local stack only).
  require('child_process').execSync(`PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres /usr/lib/postgresql/16/bin/psql -c "delete from auth.mfa_factors where user_id = (select id from auth.users where email='owner@example.test')"`, { stdio: 'inherit' });
  const original = (await db('GET', 'settings', '?id=eq.1'))[0];
  const mk = (n, extra = {}) => ({ full_name: `ZZ Test ${n}`, email: `zz.${n.toLowerCase()}@example.test`, channel_name: `ZZ Test Channel ${n}`, niche: 'testing', subscribers: 2500, status: 'new', ...extra });
  const created = await db('POST', 'creators', '', [
    mk('Alpha'), mk('Beta', { status: 'do_not_contact' }), mk('Gamma'), mk('Delta'), mk('Epsilon'), mk('Zeta'), mk('Eta'), mk('Theta'),
  ]);
  const C = Object.fromEntries(created.map((c) => [c.full_name.split(' ')[2], c]));
  await db('POST', 'suppression_list', '', [{ email: C.Gamma.email, reason: 'ZZ Test' }]);

  // The seed has approved emails. Park them as drafts so the Send button cannot touch them; restored at the end.
  const parked = await db('GET', 'emails', '?status=eq.approved&select=id');
  if (parked.length) await db('PATCH', 'emails', `?id=in.(${parked.map((p) => p.id).join(',')})`, { status: 'draft' });

  const baseline = await mailCount('ZZ Test'); // the catcher may still hold mail from earlier runs
  const browser = await chromium.launch();
  try {
    // ================= owner: settings =================
    const owner = await login(browser, 'owner@example.test', 'Owner-Test-Pass-2026!');
    const op = owner.page;
    await op.goto(SITE + '/settings/sending');
    check('settings page mentions the Gmail limit', (await op.textContent('body')).includes('about 500 emails a day'));
    // test mode off without a postal address must be refused
    await setSettings(op, { limit: 10, delay: 10, testMode: false, postal: '' });
    await op.getByText('needs a postal address').waitFor();
    check('test mode off needs a postal address', (await db('GET', 'settings', '?id=eq.1'))[0].test_mode === true);
    await setSettings(op, { limit: 10, delay: 10, testMode: true, postal: '' });
    await op.getByText('Saved.').waitFor();

    // ================= compose =================
    await op.goto(`${SITE}/emails/compose?creators=${C.Alpha.id},${C.Beta.id},${C.Gamma.id}`);
    const body = await op.textContent('body');
    check('compose shows do-not-contact as blocked', body.includes('ZZ Test Beta') && body.includes('Do not contact'));
    check('compose shows the suppressed creator as blocked too', (body.match(/Do not contact/g) || []).length === 2 && body.includes('ZZ Test Gamma'));
    check('only the usable creator is submitted', (await op.locator('input[name=creators]').count()) === 1);
    // search + add three more
    for (const n of ['Delta', 'Epsilon', 'Zeta']) {
      await op.getByLabel('Find creators').fill(`ZZ Test ${n}`);
      await op.getByRole('listitem').filter({ hasText: `ZZ Test ${n}` }).getByRole('button', { name: 'Add' }).click();
    }
    check('blocked creator cannot be added from search', await (async () => {
      await op.getByLabel('Find creators').fill('ZZ Test Gamma');
      return op.getByRole('listitem').filter({ hasText: 'Do not contact' }).getByRole('button', { name: 'Add' }).first().isDisabled();
    })());
    await op.getByLabel('Start from').selectOption('goal');
    await op.getByLabel('Goal, in one sentence').fill('Ask if they would like to hear about sponsors.');
    check('mock mode is labelled on compose', (await op.textContent('body')).includes('Practice drafts'));
    await op.getByRole('button', { name: 'Draft emails' }).click();
    await op.waitForURL('**/emails/review**');
    check('review says 4 mock drafts saved', (await op.textContent('body')).includes('4 drafts saved (mock drafts'));
    const drafted = await db('GET', 'emails', `?creator_id=in.(${[C.Alpha, C.Delta, C.Epsilon, C.Zeta].map((c) => c.id).join(',')})&select=id,creator_id,status,subject`);
    check('4 draft rows saved', drafted.length === 4 && drafted.every((d) => d.status === 'draft'));
    const E = Object.fromEntries(drafted.map((d) => [created.find((c) => c.id === d.creator_id).full_name.split(' ')[2], d.id]));

    // ================= review: edit, approve =================
    const card = (n) => op.getByRole('article', { name: `Email to ZZ Test ${n}` });
    await card('Alpha').getByLabel('Subject').fill('ZZ Test edited subject');
    await card('Alpha').getByRole('button', { name: 'Save' }).click();
    await card('Alpha').getByText('Saved.').waitFor();
    check('edit is saved', (await db('GET', 'emails', `?id=eq.${E.Alpha}&select=subject`))[0].subject === 'ZZ Test edited subject');
    for (const n of ['Alpha', 'Delta', 'Epsilon']) {
      await card(n).getByRole('button', { name: 'Approve' }).click();
      await card(n).getByText('Approved.').waitFor();
    }
    check('approving sends nothing', (await mailCount('ZZ Test')) === baseline);
    await op.screenshot({ path: `${SHOT}/review.png`, fullPage: true });

    // ================= send: API rules =================
    const api = (id) => op.request.post(`${SITE}/api/emails/${id}/send`);
    const unapproved = await api(E.Zeta);
    check('send API refuses an unapproved email (409)', unapproved.status() === 409, String(unapproved.status()));
    const noLogin = await fetch(`${SITE}/api/emails/${E.Alpha}/send`, { method: 'POST' });
    check('send API needs a login (401)', noLogin.status === 401, String(noLogin.status));
    const first = await api(E.Alpha);
    check('first send works (200)', first.status() === 200, String(first.status()));
    const soon = await api(E.Delta);
    const soonBody = await soon.json();
    check('second send right away is refused: 429 too_soon with retry-after', soon.status() === 429 && soonBody.reason === 'too_soon' && soon.headers()['retry-after'] > 0 && soonBody.retry_after_seconds > 0, JSON.stringify(soonBody));

    const subj = await mail('ZZ Test edited subject');
    check('mail catcher got Alpha at the TEST address with [TEST]', !!subj && subj.to === 'owner@example.test' && subj.subject.startsWith('[TEST] '), JSON.stringify(subj && subj.subject));
    check('mail has footer and unsubscribe link', !!subj && subj.raw.includes('Smallfold, sponsors for small YouTube channels') && /open this link or reply 'unsubscribe': http:\/\/localhost:3000\/unsubscribe\//.test(subj.raw));
    check('mail has List-Unsubscribe headers', !!subj && /List-Unsubscribe: <http:\/\/localhost:3000\/api\/unsubscribe\/[^>]+>, <mailto:smallfold-test@example\.test\?subject=unsubscribe>/i.test(subj.raw.replace(/\r\n\s+/g, ' ')) && /List-Unsubscribe-Post: List-Unsubscribe=One-Click/i.test(subj.raw));
    check('mail is plain text', !!subj && /Content-Type: text\/plain/i.test(subj.raw));

    // ================= send: UI, daily limit =================
    await setSettings(op, { limit: 2, delay: 2, testMode: true, postal: '' });
    await op.getByText('Saved.').waitFor();
    await op.goto(SITE + '/emails/review');
    const sendBtn = op.getByRole('button', { name: /^Send \d+ approved/ });
    check('Send button counts the approved emails listed (Delta, Epsilon)', (await sendBtn.textContent()).includes('Send 2 approved'));
    await sendBtn.click();
    const dialog = op.getByRole('dialog');
    const dtext = await dialog.textContent();
    check('confirm dialog states count and test address', dtext.includes('2 approved') && dtext.includes('Test mode: all go to owner@example.test'), dtext);
    const t0 = Date.now();
    await dialog.getByRole('button', { name: 'Send 2' }).click();
    await op.getByText('daily sending limit is reached').waitFor({ timeout: 60000 });
    check('daily limit stops the run', true);
    const sentRows = await db('GET', 'emails', `?id=in.(${E.Alpha},${E.Delta},${E.Epsilon})&select=id,status`);
    const st = Object.fromEntries(sentRows.map((r) => [r.id, r.status]));
    // The list is newest first, so Epsilon goes first and Delta is the one left over.
    const left = [E.Delta, E.Epsilon].find((id) => st[id] === 'approved');
    check('one more was sent, the other is still approved', st[E.Alpha] === 'sent' && !!left && [E.Delta, E.Epsilon].filter((id) => st[id] === 'sent').length === 1, JSON.stringify(st));
    check('the UI waited for the delay (Delta needed >= 2s)', Date.now() - t0 >= 1500, `${Date.now() - t0}ms`);
    const direct = await api(left);
    check('API also refuses at the limit (429 daily_limit)', direct.status() === 429 && (await direct.json()).reason === 'daily_limit');

    // ================= log, detail, replied, retry =================
    await op.goto(SITE + '/emails?status=sent&kind=test&creator=ZZ%20Test');
    check('log filters by status, type and creator', (await op.textContent('body')).includes('ZZ Test Alpha') && !(await op.textContent('body')).includes('ZZ Test Zeta'));
    await op.goto(`${SITE}/emails/${E.Alpha}`);
    check('detail shows body, footer and people', (await op.textContent('body')).includes('Smallfold, sponsors for small YouTube channels') && (await op.textContent('body')).includes('Drafted by'));
    await op.getByRole('button', { name: 'Mark as replied' }).click();
    // Wait for the database, not for the word "Replied": the page also has a "Replied" label row.
    let repliedStatus = '';
    for (let i = 0; i < 50 && repliedStatus !== 'replied'; i++) {
      repliedStatus = (await db('GET', 'emails', `?id=eq.${E.Alpha}&select=status`))[0].status;
      if (repliedStatus !== 'replied') await op.waitForTimeout(100);
    }
    check('mark as replied', repliedStatus === 'replied');
    await db('PATCH', 'emails', `?id=eq.${left}`, { status: 'failed', error: 'ZZ Test smtp error' });
    await op.goto(`${SITE}/emails/${left}`);
    check('failed email shows its error', (await op.textContent('body')).includes('ZZ Test smtp error'));
    await op.getByRole('button', { name: /Retry/ }).click();
    await op.getByText('Open in Review').waitFor();
    check('retry puts a failed email back to draft', (await db('GET', 'emails', `?id=eq.${left}&select=status`))[0].status === 'draft');

    // ================= blocked at the send API =================
    async function blockedCase(label, name, block) {
      const [c] = await db('POST', 'creators', '', [mk(name)]);
      const [e] = await db('POST', 'emails', '', [{ creator_id: c.id, to_email: c.email, subject: 'ZZ Test blocked', body: 'x', status: 'approved' }]);
      await block(c);
      const r = await api(e.id);
      check(`send API refuses ${label} (409)`, r.status() === 409, `${r.status()} ${await r.text()}`);
      check(`${label}: nothing reached the mail catcher`, (await mailCount('ZZ Test blocked')) === 0);
    }
    await blockedCase('a do_not_contact creator', 'Iota', (c) => db('PATCH', 'creators', `?id=eq.${c.id}`, { status: 'do_not_contact' }));
    await blockedCase('a suppressed address', 'Kappa', (c) => db('POST', 'suppression_list', '', [{ email: c.email, reason: 'ZZ Test' }]));

    // ================= templates =================
    const tp = owner.page;
    await tp.goto(SITE + '/emails/templates/new');
    await tp.getByLabel('Name').fill('ZZ Test template');
    await tp.getByLabel('Subject').fill('Hi {{first_name}}');
    await tp.getByLabel('Body').fill('Hello {{nickname}}');
    await tp.getByRole('button', { name: 'Save template' }).click();
    await tp.getByText('not a known placeholder').waitFor();
    await tp.getByLabel('Body').fill('Hello {{first_name}} of {{channel_name}}');
    await tp.getByRole('button', { name: 'Save template' }).click();
    await tp.waitForURL('**/emails/templates', { timeout: 8000 }).catch(async () => console.log('template page text:', (await tp.textContent('main')).slice(0, 300)));
    check('template saved, unknown placeholder refused', (await tp.textContent('body')).includes('ZZ Test template'));

    // ================= worker =================
    // real mode: owner sets a postal address and turns test mode off (through the form)
    await setSettings(op, { limit: 10, delay: 2, testMode: false, postal: 'ZZ Test PO Box 1, Testville' });
    await op.getByText('Saved.').waitFor();
    // Zeta's draft belongs to the worker for this step, so the worker's own list shows it.
    const [workerProfile] = await db('GET', 'profiles', '?email=eq.worker@example.test&select=id');
    await db('PATCH', 'emails', `?id=eq.${E.Zeta}`, { drafted_by: workerProfile.id });
    const worker = await login(browser, 'worker@example.test', 'Worker-Test-Pass-2026!');
    const wp = worker.page;
    await wp.goto(SITE + '/settings/sending');
    check('worker cannot open /settings/sending', !wp.url().includes('/settings/sending'), wp.url());
    await wp.goto(SITE + '/emails/templates');
    check('worker sees templates without a Delete button', (await wp.getByText('ZZ Test template').count()) > 0 && (await wp.getByRole('button', { name: 'Delete' }).count()) === 0);
    // the worker sends Zeta for real (drafted by the owner; "All staff" filter)
    await wp.goto(SITE + '/emails/review');
    const zeta = wp.getByRole('article', { name: 'Email to ZZ Test Zeta' });
    await zeta.getByLabel('Subject').fill('ZZ Test real send');
    await zeta.getByRole('button', { name: 'Approve' }).click();
    await zeta.getByText('Approved.').waitFor();
    // approve the other ZZ drafts is not needed; send only Zeta: others listed as drafts stay unsent
    await wp.getByRole('button', { name: /^Send \d+ approved/ }).click();
    check('real-mode dialog says test mode is off', (await wp.getByRole('dialog').textContent()).includes('Test mode is off'));
    await wp.getByRole('dialog').getByRole('button', { name: /^Send 1$/ }).click();
    await wp.getByText('Finished: 1 sent').waitFor({ timeout: 30000 });
    const real = await mail('ZZ Test real send');
    check('worker real send reached the creator address, no [TEST]', !!real && real.to === C.Zeta.email && !real.subject.startsWith('[TEST]'), JSON.stringify(real && [real.to, real.subject]));
    check('real mail footer has the postal address', !!real && real.raw.includes('ZZ Test PO Box 1, Testville'));
    check('real mail from the configured sender', !!real && /From: "?Smallfold"? <smallfold-test@example\.test>/.test(real.raw));
    const [zetaNow] = await db('GET', 'creators', `?id=eq.${C.Zeta.id}&select=status,last_contacted_at`);
    check('real send marks the creator contacted', zetaNow.status === 'contacted' && !!zetaNow.last_contacted_at);

    // ================= unsubscribe =================
    const link = (real.raw.match(/http:\/\/localhost:3000\/unsubscribe\/[^\s>]+/) || [])[0];
    check('unsubscribe link found in mail', !!link);
    const pub = await browser.newContext();
    const pp = await pub.newPage();
    await pp.goto(link);
    check('GET shows a confirm button, no unsubscribe yet', (await pp.getByRole('button', { name: /unsubscribe me/ }).count()) === 1 && (await db('GET', 'suppression_list', `?email=eq.${C.Zeta.email}`)).length === 0);
    await pp.screenshot({ path: `${SHOT}/unsubscribe.png` });
    // tampered token
    const bad = link.slice(0, -2) + (link.endsWith('AA') ? 'BB' : 'AA');
    await pp.goto(bad);
    check('tampered token shows the neutral page', (await pp.textContent('body')).includes('not valid') && (await pp.getByRole('button', { name: /unsubscribe me/ }).count()) === 0);
    const badPost = await fetch(bad.replace('/unsubscribe/', '/api/unsubscribe/'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    check('tampered token does nothing at the API (404)', badPost.status === 404 && (await db('GET', 'suppression_list', `?email=eq.${C.Zeta.email}`)).length === 0, String(badPost.status));
    await pp.goto(link);
    await pp.getByRole('button', { name: /unsubscribe me/ }).click();
    await pp.getByText('You are unsubscribed').waitFor();
    check('confirm puts the address on the suppression list', (await db('GET', 'suppression_list', `?email=eq.${C.Zeta.email}`)).length === 1);
    check('creator becomes do_not_contact', (await db('GET', 'creators', `?id=eq.${C.Zeta.id}&select=status`))[0].status === 'do_not_contact');
    const audit = await db('GET', 'audit_log', '?action=eq.email.unsubscribed&order=id.desc&limit=1');
    check('opt-out is in the audit log with no actor', audit.length === 1 && audit[0].actor_id === null);
    const one = await fetch(link.replace('/unsubscribe/', '/api/unsubscribe/'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    check('one-click POST works (200)', one.status === 200, String(one.status));

    // a TEST email's link does nothing
    const testMail = await mail('ZZ Test edited subject');
    const tlink = (testMail.raw.match(/http:\/\/localhost:3000\/unsubscribe\/[^\s>]+/) || [])[0];
    await pp.goto(tlink);
    await pp.getByRole('button', { name: /unsubscribe me/ }).click();
    await pp.getByText('This was a test email').waitFor();
    check('unsubscribing from a test email changes nothing', (await db('GET', 'suppression_list', `?email=eq.${C.Alpha.email}`)).length === 0);
    await owner.ctx.close(); await worker.ctx.close(); await pub.close();
  } catch (e) {
    failures++;
    console.log('FAIL  script error:', e.message);
  } finally {
    await browser.close();
    // ---- cleanup: ZZ emails first (a sent email now blocks deleting its creator), then ZZ creators,
    // suppression rows and templates; settings restored
    if (parked.length) await db('PATCH', 'emails', `?id=in.(${parked.map((p) => p.id).join(',')})`, { status: 'approved' });
    const zz = await db('GET', 'creators', '?full_name=like.ZZ Test*&select=id');
    if (zz.length) await db('DELETE', 'emails', `?creator_id=in.(${zz.map((c) => c.id).join(',')})`);
    await db('DELETE', 'creators', '?full_name=like.ZZ Test*');
    // Last: deleting a do-not-contact creator keeps their address on the suppression list (M02).
    await db('DELETE', 'suppression_list', '?email=like.zz.*');
    await db('DELETE', 'email_templates', '?name=like.ZZ Test*');
    const { id: _id, updated_at: _updatedAt, updated_by: _updatedBy, ...keep } = original;
    await db('PATCH', 'settings', '?id=eq.1', keep);
    console.log('cleaned up; settings restored');
  }
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
