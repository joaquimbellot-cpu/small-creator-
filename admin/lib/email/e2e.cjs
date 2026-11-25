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


    // ================= pitch drafts (sponsor + creator), added for the Outreach feature =================
    // Fake sponsors, contacts and sponsorship records; the app drafts in mock mode here (DRAFT_MODE=mock), so no Claude call is made.
    const [ownerProfile] = await db('GET', 'profiles', '?email=eq.owner@example.test&select=id');
    const sp = (name, relationship, extra = {}) => ({ name, relationship, industry: null, target_min_subs: null, target_max_subs: null, ...extra });
    const [spA, spDnc, spNone, spPast, spDet] = await db('POST', 'brands', '', [
      sp('ZZ Test Sponsor A', 'prospect', { industry: 'Testing gear', target_min_subs: 1000, target_max_subs: 10000 }),
      sp('ZZ Test Sponsor Dnc', 'do_not_contact'),
      sp('ZZ Test Sponsor NoContact', 'prospect'),
      sp('ZZ Test Past', 'past'),
      sp('ZZ Test Detected Brand', 'prospect'),
    ]);
    await db('POST', 'brand_contacts', '', [
      { brand_id: spA.id, full_name: 'ZZ Contact One', email: 'zz.contact.one@example.test', is_primary: true },
      { brand_id: spA.id, full_name: 'ZZ Contact Two', email: 'zz.contact.two@example.test', is_primary: false },
      { brand_id: spA.id, full_name: 'ZZ Contact Opted', email: 'zz.contact.opted@example.test', is_primary: false },
      { brand_id: spDnc.id, full_name: 'ZZ Contact Dnc', email: 'zz.contact.dnc@example.test', is_primary: true },
    ]);
    await db('POST', 'suppression_list', '', [{ email: 'zz.contact.opted@example.test', reason: 'ZZ Test' }]);
    const confirmedAt = new Date().toISOString();
    await db('POST', 'sponsorships', '', [
      { creator_id: C.Alpha.id, brand_id: spPast.id, sponsored_on: '2026-03-10', source_label: 'confirmed', origin: 'manual', confirmed_by: ownerProfile.id, confirmed_at: confirmedAt, detection_signal: null, detection_confidence: null },
      { creator_id: C.Alpha.id, brand_id: spDet.id, sponsored_on: '2026-02-01', source_label: 'detected', origin: 'detected', confirmed_by: null, confirmed_at: null, detection_signal: 'zz test', detection_confidence: 'low' },
      { creator_id: C.Delta.id, brand_id: spA.id, sponsored_on: '2026-04-02', source_label: 'confirmed', origin: 'manual', confirmed_by: ownerProfile.id, confirmed_at: confirmedAt, detection_signal: null, detection_confidence: null },
    ]);
    const pitchBase = await mailCount('ZZ Test Sponsor A');
    const lateBase = await mailCount('ZZ Test late sponsor block');
    await setSettings(op, { limit: 20, delay: 2, testMode: true, postal: '' });
    await op.getByText('Saved.').waitFor();

    const openDraftDialog = async (page, sponsor) => {
      await page.goto(`${SITE}/sponsors/${sponsor.id}`);
      await page.getByRole('button', { name: 'Draft pitch with Claude' }).first().click();
      return page.getByRole('dialog');
    };
    const pickCreator = async (dlg, name) => {
      await dlg.getByLabel('Creator', { exact: true }).fill(name);
      await dlg.getByRole('button', { name: new RegExp(name) }).first().click();
    };
    const pitchRows = async (query) => db('GET', 'emails', `${query}&select=id,status,to_email,subject,body,brand_id,recipient_kind,brand_contact_id,pitch_facts,drafted_by,creator_id&order=created_at.desc`);

    // -- to the creator
    let dlg = await openDraftDialog(op, spA);
    await pickCreator(dlg, 'ZZ Test Alpha');
    await dlg.getByRole('button', { name: 'Write the draft' }).click();
    await dlg.getByText('Facts used').waitFor();
    let dtxt = await dlg.textContent();
    check('pitch dialog shows Facts used with the confirmed sponsorship', dtxt.includes('Confirmed sponsorship: ZZ Test Past, Mar 2026'));
    check('pitch dialog lists the detected record as Left out, not confirmed', dtxt.includes('Detected sponsorship: ZZ Test Detected Brand, Feb 2026 (not confirmed)'));
    check('pitch dialog says nothing is sent from here', dtxt.includes('Nothing is sent from here. The draft waits in Emails, Review, and only the owner\'s click on Send sends it.'));
    check('the draft text never names the detected sponsor, nor shows an address', !dtxt.split('Facts used')[0].includes('ZZ Test Detected Brand') && !/@example\.test/.test(dtxt));
    const toCreator = (await pitchRows(`?creator_id=eq.${C.Alpha.id}&brand_id=eq.${spA.id}&recipient_kind=eq.creator`))[0];
    check('pitch draft to the creator is saved as a draft with the sponsor attached', !!toCreator && toCreator.status === 'draft' && toCreator.to_email === C.Alpha.email && toCreator.pitch_facts.used.length > 0 && toCreator.pitch_facts.left_out.some((l) => l.includes('not confirmed')));
    check('the saved draft names the sponsor but not the detected brand', !!toCreator && toCreator.body.includes('ZZ Test Sponsor A') && !toCreator.body.includes('ZZ Test Detected Brand') && !/@/.test(toCreator.body));
    const aud = (await db('GET', 'audit_log', '?action=eq.email.drafted&order=id.desc&limit=1'))[0];
    check('the audit line email.drafted has ids only', !!aud && aud.details.pitch === true && aud.details.brand_id === spA.id && !JSON.stringify(aud.details).includes('@'));
    await dlg.getByRole('button', { name: 'Close' }).last().click();

    // -- it appears in Review with the sponsor, and in the log
    await op.goto(SITE + '/emails/review');
    const pcard = op.getByRole('article', { name: 'Email to ZZ Test Alpha' });
    const ptxt = await pcard.textContent();
    check('Review shows the sponsor on the pitch draft', ptxt.includes('Pitch: ZZ Test Sponsor A'));
    check('Review warns that facts added by hand are not checked', ptxt.includes('Facts you add by hand are not checked'));
    check('Review shows Facts used and Left out', ptxt.includes('Facts used') && ptxt.includes('Left out') && ptxt.includes('Detected sponsorship: ZZ Test Detected Brand'));
    await op.goto(SITE + '/emails?creator=ZZ%20Test%20Alpha');
    check('the log shows the sponsor of a pitch draft', (await op.textContent('body')).includes('ZZ Test Sponsor A'));
    await op.goto(`${SITE}/sponsors/${spA.id}`);
    check('Outreach history on the sponsor page lists the pitch', (await op.textContent('body')).includes('Outreach history') && (await op.textContent('body')).includes('Draft, not sent'));

    // -- to the sponsor's contact (two contacts: one must be chosen)
    dlg = await openDraftDialog(op, spA);
    await pickCreator(dlg, 'ZZ Test Alpha');
    await dlg.getByLabel("The sponsor's contact").check();
    check('write is disabled until a contact person is chosen', await dlg.getByRole('button', { name: 'Write the draft' }).isDisabled());
    await dlg.getByLabel('Contact person').selectOption({ label: 'ZZ Contact Two' });
    await dlg.getByRole('button', { name: 'Write the draft' }).click();
    await dlg.getByText('Facts used').waitFor();
    check('the dialog never shows a contact address', !/@example\.test/.test(await dlg.textContent()));
    const toContact = (await pitchRows(`?creator_id=eq.${C.Alpha.id}&recipient_kind=eq.brand_contact`))[0];
    check('pitch draft to the contact is saved: right address, sponsor, contact, still about the creator', !!toContact && toContact.status === 'draft' && toContact.to_email === 'zz.contact.two@example.test' && toContact.brand_id === spA.id && !!toContact.brand_contact_id && toContact.body.startsWith('Hi ZZ,'));
    check('a pitch to the contact does not mention the creator address', !!toContact && !toContact.body.includes(C.Alpha.email));
    await dlg.getByRole('button', { name: 'Close' }).last().click();

    // -- refusals in the dialog
    async function refused(label, sponsor, creatorName, to, text, contactName) {
      const d = await openDraftDialog(op, sponsor);
      await pickCreator(d, creatorName);
      if (to === 'sponsor') await d.getByLabel("The sponsor's contact").check();
      if (contactName) await d.getByLabel('Contact person').selectOption({ label: contactName });
      await d.getByText(text).waitFor({ timeout: 8000 }).catch(() => {});
      const t = await d.textContent();
      check(`${label}: refused with a plain message`, t.includes(text), t.slice(0, 200));
      check(`${label}: Write the draft is disabled`, await d.getByRole('button', { name: 'Write the draft' }).isDisabled());
      await d.getByRole('button', { name: 'Close' }).last().click();
    }
    const before = (await pitchRows(`?creator_id=in.(${[C.Beta, C.Gamma, C.Theta, C.Eta].map((c) => c.id).join(',')})`)).length;
    await refused('a do_not_contact sponsor', spDnc, 'ZZ Test Theta', 'creator', 'ZZ Test Sponsor Dnc is marked Do not contact');
    await refused('a do_not_contact creator', spA, 'ZZ Test Beta', 'creator', 'ZZ Test Beta is marked Do not contact');
    await refused('an opted-out creator address', spA, 'ZZ Test Gamma', 'creator', 'ZZ Test Gamma is marked Do not contact');
    await refused('an opted-out contact address', spA, 'ZZ Test Theta', 'sponsor', 'This address is on the opt-out list', 'ZZ Contact Opted (opted out)');
    await refused('a sponsor with no contact person', spNone, 'ZZ Test Theta', 'sponsor', 'ZZ Test Sponsor NoContact has no contact person yet');
    check('no draft was saved by any refusal', (await pitchRows(`?creator_id=in.(${[C.Beta, C.Gamma, C.Theta, C.Eta].map((c) => c.id).join(',')})`)).length === before);
    // the database refuses too, even if a client skips the dialog (it applies to every caller)
    await db('PATCH', 'brands', `?id=eq.${spDnc.id}`, { relationship: 'do_not_contact' });
    let directRefused = false;
    try { await db('POST', 'emails', '', [{ creator_id: C.Theta.id, to_email: C.Theta.email, subject: 'ZZ Test direct', body: 'x', brand_id: spDnc.id }]); } catch { directRefused = true; }
    check('the database refuses a draft about a do_not_contact sponsor even for the service role', directRefused);

    // -- approving and sending the contact draft: test mode sends to the test address only
    await op.goto(SITE + '/emails/review');
    const kcard = op.getByRole('article', { name: 'Email to ZZ Contact Two about ZZ Test Alpha' });
    check('Review shows who a contact draft goes to', (await kcard.textContent()).includes('ZZ Contact Two') && (await kcard.textContent()).includes('ZZ Test Sponsor A'));
    await kcard.getByRole('button', { name: 'Approve' }).click();
    await kcard.getByText('Approved.').waitFor();
    check('approving the pitch sends nothing', (await mailCount('ZZ Test Sponsor A')) === pitchBase);
    await op.waitForTimeout(2500);
    const sentPitch = await op.request.post(`${SITE}/api/emails/${toContact.id}/send`);
    check('sending the contact draft works (200)', sentPitch.status() === 200, String(sentPitch.status()));
    const pm = await mail('ZZ Test Sponsor A');
    check('the pitch went to the TEST address, never to the contact', !!pm && pm.to === 'owner@example.test' && pm.subject.startsWith('[TEST] ') && !/zz\.contact/.test(JSON.stringify(await (await fetch(`${MAIL}/messages`)).json())), JSON.stringify(pm && pm.to));
    check('the pitch mail has the sender line and the opt-out line', !!pm && pm.raw.includes('Smallfold, sponsors for small YouTube channels') && /open this link or reply 'unsubscribe'/.test(pm.raw));
    check('a test send of a contact draft leaves the creator and the sponsor alone',
      (await db('GET', 'creators', `?id=eq.${C.Alpha.id}&select=status,last_contacted_at`))[0].last_contacted_at === null
      && (await db('GET', 'brands', `?id=eq.${spA.id}&select=last_contacted_at`))[0].last_contacted_at === null);
    // a sponsor that became do_not_contact after approval is refused at the send API
    const [lateEmail] = await db('POST', 'emails', '', [{ creator_id: C.Theta.id, to_email: C.Theta.email, subject: 'ZZ Test late sponsor block', body: 'x', brand_id: spA.id, status: 'approved' }]);
    await db('PATCH', 'brands', `?id=eq.${spA.id}`, { relationship: 'do_not_contact' });
    await op.waitForTimeout(2500);
    const lateSend = await op.request.post(`${SITE}/api/emails/${lateEmail.id}/send`);
    check('send API refuses an approved pitch when the sponsor has become do_not_contact (409)', lateSend.status() === 409 && (await mailCount('ZZ Test late sponsor block')) === lateBase, String(lateSend.status()));
    await db('PATCH', 'brands', `?id=eq.${spA.id}`, { relationship: 'prospect' });
    await db('DELETE', 'emails', `?id=eq.${lateEmail.id}`);

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

    // a worker may draft a pitch exactly as a worker may use Compose today (any staff member); the draft is theirs and unapproved
    const wdlg = await openDraftDialog(wp, spA);
    await pickCreator(wdlg, 'ZZ Test Theta');
    await wdlg.getByRole('button', { name: 'Write the draft' }).click();
    await wdlg.getByText('Facts used').waitFor();
    const wDraft = (await pitchRows(`?creator_id=eq.${C.Theta.id}&brand_id=eq.${spA.id}`))[0];
    check('a worker can draft a pitch; it is a draft in their name, never approved', !!wDraft && wDraft.status === 'draft' && wDraft.drafted_by === workerProfile.id);
    await wdlg.getByRole('button', { name: 'Close' }).last().click();

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
    await db('DELETE', 'brands', '?name=like.ZZ Test*');
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
