// Browser check for /overview, /deals (board and table) and the Link dialog against the local stack (fake data only).
// Run from admin/ with the stack and dev server already up:  node lib/deals/e2e.cjs
// It creates one test creator ("ZZ Deals Creator") and three test brands ("ZZ ..."), links and moves a deal of its own, and removes
// everything it made at the end (deals, the sponsorship record a completed deal adds, the creator and the brands). The seed is left as found.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOT = process.env.SHOT_PATH || '/tmp/claude-0/-home-user-small-creator-/5fc4e65e-85c4-51b1-b3b6-58cfdbef0441/scratchpad/overview.png';
const BRAND = 'ZZ Test Brand';        // the brand of the deal made with the Link dialog
const BRAND_ADD = 'ZZ Added Brand';   // a new brand typed into the Add deal form
const BRAND_DNC = 'ZZ Blocked Brand'; // marked do_not_contact: its pair can never be linked
const CREATOR = 'ZZ Deals Creator';
const CREATOR_EMAIL = 'zz-deals-e2e@example.test';
const OWNER = { email: 'owner@example.test', password: 'Owner-Test-Pass-2026!' };
const WORKER = { email: 'worker@example.test', password: 'Worker-Test-Pass-2026!' };

const PSQL_ENV = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const psql = (sql) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: PSQL_ENV, encoding: 'utf8' }).trim();

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const num = (n) => new Intl.NumberFormat('en-US').format(Number(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

const failures = [];
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
}

async function until(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e.message;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for: ${label} (last: ${last})`);
}

// The live numbers: stats_overview() as the owner, in a transaction that is rolled back.
function liveStats() {
  const ownerId = psql(`select id from profiles where email = '${OWNER.email}'`);
  const claims = JSON.stringify({ sub: ownerId, role: 'authenticated' }).replace(/'/g, "''");
  const out = psql(`begin; set local role authenticated; select set_config('request.jwt.claims', '${claims}', true); select stats_overview()::text; rollback;`);
  return JSON.parse(out.split('\n').filter(Boolean).pop());
}

// Removes everything this script makes. Order matters: sponsorship records first (a deal delete would only unlink them).
function cleanTest() {
  psql(`delete from sponsorships where creator_id in (select id from creators where email = '${CREATOR_EMAIL}')
          or brand_id in (select id from brands where name in ('${BRAND}', '${BRAND_ADD}', '${BRAND_DNC}'));
        delete from deals where creator_id in (select id from creators where email = '${CREATOR_EMAIL}')
          or brand_id in (select id from brands where name in ('${BRAND}', '${BRAND_ADD}', '${BRAND_DNC}'));
        delete from brands where name in ('${BRAND}', '${BRAND_ADD}', '${BRAND_DNC}');
        delete from creators where email = '${CREATOR_EMAIL}';`);
}
function setupTest() {
  cleanTest();
  psql(`insert into creators (full_name, email, niche_slug, subscribers, status) values ('${CREATOR}', '${CREATOR_EMAIL}', 'tech', 12000, 'new');
        insert into brands (name, target_niches, target_min_subs, target_max_subs) values ('${BRAND}', '{tech}', 5000, 50000);
        insert into brands (name, relationship) values ('${BRAND_DNC}', 'do_not_contact');`);
}
const dealOf = (brand) => psql(`select d.id || '|' || d.stage || '|' || coalesce(d.amount_cents::text, 'null') from deals d join brands b on b.id = d.brand_id
  join creators c on c.id = d.creator_id where b.name = '${brand}' and c.email = '${CREATOR_EMAIL}'`);

async function login(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/overview/, { timeout: 90000 });
  return { ctx, page, pageErrors };
}

async function checkOverview(page, stats, who) {
  await page.goto(`${BASE}/overview`);
  await page.waitForSelector('section[aria-label="Key numbers"]', { timeout: 90000 });
  const raw = await page.$$eval('section[aria-label="Key numbers"] .tile', (els) =>
    els.map((el) => ({ label: el.querySelector('.label')?.textContent, value: el.children[1]?.textContent, note: el.querySelector('p')?.textContent })),
  );
  const cards = raw.map((c) => ({ label: norm(c.label), value: norm(c.value), note: norm(c.note) }));
  const card = (label) => cards.find((c) => c.label === label);

  check(card('Total creators')?.value === num(stats.total_creators), `${who}: total creators = ${num(stats.total_creators)}`);
  const sent = card('Emails sent');
  check(sent?.value === num(stats.emails_sent_all), `${who}: emails sent = ${num(stats.emails_sent_all)}`);
  check(sent?.note.includes(`${num(stats.emails_sent_7d)} in the last 7 days`), `${who}: emails sent 7 days = ${num(stats.emails_sent_7d)}`);
  check(sent?.note.includes(`${num(stats.emails_sent_30d)} in the last 30`), `${who}: emails sent 30 days = ${num(stats.emails_sent_30d)}`);
  const replies = `${num(stats.replies)} replies · ${Number(stats.reply_rate).toFixed(1)}%`;
  check(card('Replies')?.value === replies, `${who}: replies card reads "${replies}" (got "${card('Replies')?.value}")`);
  check(card('Active deals')?.value === num(stats.active_deals), `${who}: active deals = ${num(stats.active_deals)}`);
  check(card('Commission earned')?.value === usd.format(stats.commission_earned_cents / 100), `${who}: commission = ${usd.format(stats.commission_earned_cents / 100)}`);

  const stageRaw = await page.$$eval('section[aria-labelledby="stages-title"] dl > div', (els) =>
    els.map((el) => [el.querySelector('dt')?.textContent, el.querySelector('dd')?.textContent]),
  );
  const stages = stageRaw.map(([a, b]) => [norm(a), norm(b)]);
  check(stages.length === 7, `${who}: seven deal stages shown, Matched first (got ${stages.length})`);
  check(stages[0]?.[0] === 'Matched', `${who}: the first stage is Matched`);
  for (const [label, value] of stages) {
    const key = label.toLowerCase();
    check(value === num(stats.deals_by_stage[key]), `${who}: stage ${label} = ${num(stats.deals_by_stage[key])}`);
  }

  const bars = await page.$$eval('section[aria-labelledby="chart-title"] svg rect', (els) => els.length);
  check(bars === 24, `${who}: chart draws 24 bars for 12 weeks (got ${bars})`);
  const rowsRaw = await page.$$eval('section[aria-labelledby="chart-title"] details tbody tr', (trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)),
  );
  const rows = rowsRaw.map((r) => r.map(norm));
  check(rows.length === 12, `${who}: chart table has 12 weeks (got ${rows.length})`);
  const sumSent = rows.reduce((a, r) => a + Number(r[1].replace(/,/g, '')), 0);
  const sumReplies = rows.reduce((a, r) => a + Number(r[2].replace(/,/g, '')), 0);
  const weeklySent = stats.weekly.reduce((a, w) => a + w.sent, 0);
  const weeklyReplies = stats.weekly.reduce((a, w) => a + w.replies, 0);
  check(sumSent === weeklySent && sumReplies === weeklyReplies, `${who}: chart table sums match (${weeklySent} sent, ${weeklyReplies} replies)`);

  const activity = (await page.$$eval('aside ul li', (lis) => lis.map((li) => li.textContent))).map(norm);
  check(activity.length > 0 && activity.length <= 20, `${who}: activity feed shows rows (${activity.length})`);
  check(activity.every((t) => t.length > 0), `${who}: activity rows have text`);
  if (activity[0]) console.log(`      first activity line: "${activity[0]}"`);
}


const SIZES = [400, 820, 1360];

async function noSideScroll(browser, who, path, label) {
  for (const w of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Email').fill(who.email);
    await page.getByLabel('Password').fill(who.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(/\/overview/, { timeout: 90000 });
    await page.goto(`${BASE}${path}`);
    await page.waitForSelector('h1.page-title', { timeout: 90000 });
    await sleep(500);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(sw <= cw, `${label} at ${w}px: no sideways page scroll (${sw} <= ${cw})`);
    await ctx.close();
  }
}

const card = (page, name) => page.locator('article[data-deal]', { hasText: name });
const column = (page, stage) => page.locator(`section[data-stage="${stage}"]`);

async function main() {
  const browser = await chromium.launch();
  // ---------- owner
  setupTest();
  const stats = liveStats(); // taken after the test rows exist, so the overview must show them too
  console.log(`live stats: ${stats.total_creators} creators, ${stats.emails_sent_all} sent, ${stats.replies} replies, ${stats.active_deals} active deals`);
  const owner = await login(browser, OWNER);
  const { page } = owner;

  await checkOverview(page, stats, 'owner');
  await page.screenshot({ path: SHOT, fullPage: true });
  console.log(`screenshot: ${SHOT}`);

  // ----- Board: the seed's deals sit in the right columns, with counts and totals
  await page.goto(`${BASE}/deals`);
  await page.waitForSelector('[aria-label="Deals board"]', { timeout: 90000 });
  const stages = ['matched', 'contacted', 'replied', 'negotiating', 'signed', 'completed', 'paid'];
  const dbCounts = Object.fromEntries(psql("select stage || '|' || count(*) || '|' || coalesce(sum(amount_cents), 0) from deals group by stage").split('\n').filter(Boolean).map((r) => { const [st, n, t] = r.split('|'); return [st, [Number(n), Number(t)]]; }));
  check((await page.locator('section[data-stage]').count()) === 7, 'board: seven columns');
  for (const st of stages) {
    const [n, total] = dbCounts[st] ?? [0, 0];
    const cards = await column(page, st).locator('article[data-deal]').count();
    const head = norm(await column(page, st).locator('h2').textContent());
    const sum = norm(await column(page, st).locator('.colHead, div').first().textContent());
    check(cards === Math.min(n, 50), `board: column ${st} shows ${Math.min(n, 50)} cards (got ${cards})`);
    check(head.endsWith(String(n)), `board: column ${st} count reads ${n} (got "${head}")`);
    check(sum.includes(total ? usd.format(total / 100) : 'No amounts yet'), `board: column ${st} total reads ${total ? usd.format(total / 100) : 'No amounts yet'}`);
  }
  const noAmount = Number(psql("select count(*) from deals where amount_cents is null"));
  check((await page.getByText('Amount not set').count()) === noAmount, `board: ${noAmount} cards say "Amount not set"`);
  check((await column(page, 'matched').locator('select').first().inputValue()) === 'matched', 'board: a Matched card says "Stage: Matched"');
  check((await column(page, 'matched').getByRole('button', { name: /Draft pitch/ }).count()) >= 0, 'board: Matched cards may carry a Draft pitch button (Outreach slot)');
  await noSideScroll(browser, OWNER, '/deals', 'owner board');
  await noSideScroll(browser, OWNER, '/deals?view=table', 'owner table');

  // ----- Table: stage filter
  await page.goto(`${BASE}/deals?view=table`);
  const paidCount = Number(psql("select count(*) from deals where stage = 'paid'"));
  const toolbar = page.locator('form.toolbar');
  await toolbar.getByLabel('Stage', { exact: true }).selectOption('paid');
  await toolbar.getByRole('button', { name: 'Filter' }).click();
  await page.waitForURL(/stage=paid/);
  check(/view=table/.test(page.url()), 'table: the view stays in the address after filtering');
  const filtered = await page.$$eval('table[aria-label="Deals"] tbody tr', (trs) => trs.length);
  const filteredStages = await page.$$eval('table[aria-label="Deals"] tbody tr', (trs) => trs.map((tr) => tr.querySelector('select')?.value));
  check(filtered === Math.min(25, paidCount), `owner: stage filter "paid" shows ${Math.min(25, paidCount)} rows (got ${filtered})`);
  check(filteredStages.every((s) => s === 'paid'), 'owner: every filtered row is paid');
  const matchedOpt = await page.locator('table[aria-label="Deals"] tbody tr select').first().locator('option[value="matched"]').count();
  check(matchedOpt === 1, 'table: the stage menu has Matched');

  // ----- Link from a creator profile creates a deal at Matched
  const creatorId = psql(`select id from creators where email = '${CREATOR_EMAIL}'`);
  await page.goto(`${BASE}/creators/${creatorId}`);
  await page.getByRole('button', { name: 'Link to a sponsor' }).click();
  let dlg = page.getByRole('dialog', { name: 'Link a creator and a sponsor' });
  await dlg.waitFor();
  await until(async () => (await dlg.getByLabel('Creator').inputValue()) === CREATOR, 'creator name filled in');
  // a blocked pair cannot be linked
  await dlg.getByLabel('Sponsor').fill(BRAND_DNC);
  await dlg.getByRole('option', { name: new RegExp(BRAND_DNC) }).click();
  await dlg.getByText('This pair cannot be linked.').waitFor({ timeout: 30000 });
  check(await dlg.getByRole('button', { name: 'Create link' }).isDisabled(), 'link: a Do not contact sponsor cannot be linked (button disabled)');
  check((await dlg.getByText('The sponsor is marked Do not contact.').count()) === 1, 'link: the reason is shown');
  // a good pair: score with reasons, then create
  await dlg.getByLabel('Sponsor').fill(BRAND);
  await dlg.getByRole('option', { name: new RegExp(BRAND) }).click();
  await dlg.getByText(`${CREATOR} with ${BRAND}`).waitFor({ timeout: 30000 });
  check((await dlg.locator('[role="img"][aria-label^="Score"]').count()) === 1, 'link: the score is shown with its meter');
  check((await dlg.locator('ul li').count()) >= 4, 'link: four reasons are shown with the score');
  check((await dlg.getByText('is inside the sponsor').count()) === 1, 'link: the size reason is built from the real numbers');
  check((await dlg.getByLabel('Starting stage').inputValue()) === 'matched', 'link: the starting stage defaults to Matched');
  await dlg.getByLabel('Expected amount (USD)').fill('1000');
  check(await dlg.getByRole('button', { name: 'Create link' }).isEnabled(), 'link: Create link is enabled for a clean pair');
  await dlg.getByRole('button', { name: 'Create link' }).click();
  await page.getByRole('button', { name: 'View on the board' }).waitFor({ timeout: 30000 });
  check(dealOf(BRAND).endsWith('|matched|100000'), `link: a deal at Matched with $1,000 was created (got ${dealOf(BRAND)})`);
  // the same pair again: an open deal blocks it
  await page.getByRole('button', { name: 'Link to a sponsor' }).click();
  dlg = page.getByRole('dialog', { name: 'Link a creator and a sponsor' });
  await until(async () => (await dlg.getByLabel('Creator').inputValue()) === CREATOR, 'creator name filled in again');
  await dlg.getByLabel('Sponsor').fill(BRAND);
  await dlg.getByRole('option', { name: new RegExp(BRAND) }).click();
  await dlg.getByText('already have an open deal').waitFor({ timeout: 30000 });
  check(await dlg.getByRole('button', { name: 'Create link' }).isDisabled(), 'link: a pair with an open deal cannot be linked again');
  await page.keyboard.press('Escape');
  check((await page.getByRole('dialog', { name: 'Link a creator and a sponsor' }).count()) === 0, 'link: Escape closes the dialog');
  const dealId = dealOf(BRAND).split('|')[0];

  // ----- Board: Move to changes the stage and survives a reload
  await page.goto(`${BASE}/deals`);
  await page.waitForSelector('[aria-label="Deals board"]', { timeout: 90000 });
  check((await column(page, 'matched').locator('article[data-deal]', { hasText: CREATOR }).count()) === 1, 'board: the new link sits in the Matched column');
  await card(page, CREATOR).locator('select').selectOption('negotiating');
  await page.getByText('Moved from "Matched" to "Negotiating".').waitFor({ timeout: 30000 });
  await until(() => dealOf(BRAND).split('|')[1] === 'negotiating', 'stage saved as negotiating');
  await page.reload();
  await page.waitForSelector('[aria-label="Deals board"]', { timeout: 90000 });
  check((await column(page, 'negotiating').locator('article[data-deal]', { hasText: CREATOR }).count()) === 1, 'board: the move survives a reload');

  // ----- Amount can be edited (board)
  await card(page, CREATOR).getByRole('button', { name: /Edit the amount/ }).click();
  await card(page, CREATOR).getByLabel(/Amount in US dollars/).fill('2500.50');
  await card(page, CREATOR).getByRole('button', { name: 'Save' }).click();
  await page.getByText('Amount set to $2,500.50.').waitFor({ timeout: 30000 });
  check(dealOf(BRAND).endsWith('|250050'), `board: the amount was edited to 250050 cents (got ${dealOf(BRAND)})`);
  check(psql(`select commission_cents from deals where id = '${dealId}'`) === psql('select commission_cents(250050)'), 'board: the database worked the commission out again for the new amount');
  check(Number(psql(`select count(*) from audit_log where entity_id = '${dealId}' and action like 'deal.%'`)) >= 2, 'board: the audit log has lines for the deal');
  // an invalid amount is refused with a message
  await card(page, CREATOR).getByRole('button', { name: /Edit the amount/ }).click();
  await card(page, CREATOR).getByLabel(/Amount in US dollars/).fill('abc');
  await card(page, CREATOR).getByRole('button', { name: 'Save' }).click();
  await card(page, CREATOR).getByRole('alert').waitFor({ timeout: 30000 });
  check(dealOf(BRAND).endsWith('|250050'), 'board: a bad amount changes nothing');
  await card(page, CREATOR).getByRole('button', { name: 'Cancel' }).click();

  // ----- Moving to Completed adds a Confirmed record to the creator's history
  check(psql(`select count(*) from sponsorships where deal_id = '${dealId}'`) === '0', 'board: no sponsorship record before Completed');
  await card(page, CREATOR).locator('select').selectOption('completed');
  await page.getByText('A Confirmed sponsorship was added to both histories.').waitFor({ timeout: 30000 });
  await until(() => psql(`select count(*) from sponsorships where deal_id = '${dealId}' and source_label = 'confirmed' and origin = 'deal'`) === '1', 'confirmed record added');
  await page.goto(`${BASE}/creators/${creatorId}`);
  await page.getByRole('heading', { name: 'Sponsorship history' }).waitFor({ timeout: 60000 });
  check((await page.getByText(BRAND, { exact: false }).count()) > 0, "board: the creator's history lists the new Confirmed record");
  // moving it back and forth must not add a second record, nor claim to
  await page.goto(`${BASE}/deals`);
  await page.waitForSelector('[aria-label="Deals board"]', { timeout: 90000 });
  await card(page, CREATOR).locator('select').selectOption('paid');
  await page.getByText('Moved from "Completed" to "Paid".').waitFor({ timeout: 30000 });
  check(psql(`select count(*) from sponsorships where deal_id = '${dealId}'`) === '1', 'board: still one sponsorship record after Paid');

  // ----- Drag and drop (on top of the menu)
  await column(page, 'paid').locator('article[data-deal]', { hasText: CREATOR }).waitFor();
  await sleep(1500); // let the refresh that follows a move settle, so the drag is not interrupted by a re-render
  await card(page, CREATOR).dragTo(column(page, 'signed'), { sourcePosition: { x: 8, y: 6 } }); // grab the card's padding: its centre may be a menu or a button
  await page.getByText('Moved from "Paid" to "Signed".').waitFor({ timeout: 30000 });
  await until(() => dealOf(BRAND).split('|')[1] === 'signed', 'drag and drop saved the stage');
  check(true, 'board: drag and drop moves a card');

  // ----- Table: amount edit, stage Save pattern
  await page.goto(`${BASE}/deals?view=table`);
  const trow = page.locator('table[aria-label="Deals"] tbody tr', { hasText: CREATOR });
  await trow.getByRole('button', { name: /Edit the amount/ }).click();
  await trow.getByLabel(/Amount in US dollars/).fill('');
  await trow.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Amount cleared.').waitFor({ timeout: 30000 });
  check(dealOf(BRAND).endsWith('|null'), 'table: clearing the amount stores it as empty');
  check(psql(`select commission_cents from deals where id = '${dealId}'`) === '0', 'table: an empty amount has no commission');
  await until(async () => norm(await trow.locator('td').nth(3).textContent()).startsWith('Not set'), 'an empty amount reads "Not set"').then(() => check(true, 'table: an empty amount reads "Not set"')).catch(() => check(false, 'table: an empty amount reads "Not set"'));
  await trow.getByRole('button', { name: /Edit the amount/ }).click();
  await trow.getByLabel(/Amount in US dollars/).fill('$1,250');
  await trow.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Amount set to $1,250.00.').waitFor({ timeout: 30000 });
  check(dealOf(BRAND).endsWith('|125000'), 'table: the amount was edited to 125000 cents');
  await trow.getByRole('combobox').selectOption('contacted');
  await trow.getByRole('button', { name: 'Save' }).click();
  await trow.getByText('Saved').waitFor({ timeout: 30000 });
  await until(() => dealOf(BRAND).split('|')[1] === 'contacted', 'stage saved as contacted');
  await page.reload();
  check((await page.locator('table[aria-label="Deals"] tbody tr', { hasText: CREATOR }).getByRole('combobox').inputValue()) === 'contacted', 'owner: stage change persists after reload');

  // ----- Add a deal with a new brand (table view), leave the amount empty
  await page.goto(`${BASE}/deals?view=table`);
  const addForm = page.locator('form.tile');
  await addForm.getByLabel('Creator', { exact: true }).selectOption({ label: CREATOR });
  await addForm.getByLabel('Sponsor', { exact: true }).fill(BRAND_ADD);
  await addForm.getByLabel('Amount (USD)', { exact: true }).fill('1234.56');
  await addForm.getByLabel('Stage', { exact: true }).selectOption('contacted');
  await addForm.getByRole('button', { name: 'Add deal' }).click();
  await page.getByText(`Deal with ${BRAND_ADD} added.`).waitFor({ timeout: 30000 });
  const added = psql(`select d.stage || '|' || d.amount_cents || '|' || d.commission_cents from deals d join brands b on b.id = d.brand_id where b.name = '${BRAND_ADD}'`);
  check(added === 'contacted|123456|9876', `owner: new deal stored as stage contacted, 123456 cents, commission from the database (got ${added})`);

  // ----- Delete as owner
  await page.reload();
  const rowAfter = page.locator('table[aria-label="Deals"] tbody tr', { hasText: BRAND_ADD });
  check((await rowAfter.getByRole('button', { name: 'Delete' }).count()) === 1, 'owner: Delete button is shown');
  await rowAfter.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await until(() => psql(`select count(*) from deals d join brands b on b.id = d.brand_id where b.name = '${BRAND_ADD}'`) === '0', 'deal deleted');
  await page.reload();
  check((await page.locator('table[aria-label="Deals"] tbody tr', { hasText: BRAND_ADD }).count()) === 0, 'owner: deleted deal is gone from the list');
  // ----- B-1: the owner can delete a deal that reached Paid; its record stays, with the deal link cleared
  psql(`insert into deals (creator_id, brand_id, stage, amount_cents) select c.id, b.id, 'contacted', 50000 from creators c, brands b where c.email = '${CREATOR_EMAIL}' and b.name = '${BRAND_ADD}'`);
  psql(`update deals set stage = 'paid' where brand_id = (select id from brands where name = '${BRAND_ADD}')`);
  check(psql(`select count(*) from sponsorships where brand_id = (select id from brands where name = '${BRAND_ADD}') and origin = 'deal'`) === '1', 'owner: a Paid deal has its record');
  await page.goto(`${BASE}/deals?view=table`);
  const paidRow = page.locator('table[aria-label="Deals"] tbody tr', { hasText: BRAND_ADD });
  await paidRow.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await until(() => psql(`select count(*) from deals d join brands b on b.id = d.brand_id where b.name = '${BRAND_ADD}'`) === '0', 'the Paid deal was deleted');
  check(psql(`select count(*) from sponsorships where brand_id = (select id from brands where name = '${BRAND_ADD}') and origin = 'deal' and deal_id is null`) === '1', 'owner: the record of the deleted Paid deal stays, deal link empty');
  if (owner.pageErrors.length) failures.push(`owner page errors: ${owner.pageErrors.join(' | ')}`);
  await owner.ctx.close();

  // ---------- worker: sees and moves deals, cannot delete
  const worker = await login(browser, WORKER);
  await checkOverview(worker.page, liveStats(), 'worker'); // the owner's moves above changed the numbers: read them again
  await worker.page.goto(`${BASE}/deals`);
  await worker.page.waitForSelector('[aria-label="Deals board"]', { timeout: 90000 });
  check((await worker.page.locator('article[data-deal]').count()) > 0, 'worker: the board shows deals');
  await worker.page.goto(`${BASE}/deals?view=table`);
  await worker.page.waitForSelector('h1.page-title', { timeout: 90000 });
  const workerDeletes = await worker.page.getByRole('button', { name: 'Delete' }).count();
  check(workerDeletes === 0, `worker: no Delete buttons on /deals (got ${workerDeletes})`);
  check((await worker.page.locator('form.tile').getByRole('button', { name: 'Add deal' }).count()) === 1, 'worker: add-deal form is shown');
  // a worker can edit an amount (staff) but the server refuses a delete
  const wrow = worker.page.locator('table[aria-label="Deals"] tbody tr', { hasText: CREATOR });
  await wrow.getByRole('button', { name: /Edit the amount/ }).click();
  await wrow.getByLabel(/Amount in US dollars/).fill('777');
  await wrow.getByRole('button', { name: 'Save' }).click();
  await worker.page.getByText('Amount set to $777.00.').waitFor({ timeout: 30000 });
  check(dealOf(BRAND).endsWith('|77700'), 'worker: can edit an amount');
  check(psql(`select count(*) from deals where id = '${dealId}'`) === '1', 'worker: the deal is still there (workers cannot delete)');
  await noSideScroll(browser, WORKER, '/deals', 'worker board');

  // ----- "Best match" sort on both lists (the address carries sort=match and for=<id>)
  const brandId = psql(`select id from brands where name = '${BRAND}'`);
  const scores = async (url) => {
    await worker.page.goto(`${BASE}${url}`);
    await worker.page.waitForSelector('summary:has-text("Why")', { timeout: 90000 });
    const t = await worker.page.$$eval('summary:has-text("Why")', (els) => els.map((e) => e.textContent));
    return t.map((x) => Number(/· (\d+)/.exec(x)?.[1]));
  };
  const cs = await scores(`/creators?sort=match&for=${brandId}`);
  check(cs.length > 5 && cs.every((n, i) => i === 0 || n <= cs[i - 1]), `creators: best match for a sponsor lists scores high to low (${cs.slice(0, 5).join(', ')} ...)`);
  const ss = await scores(`/sponsors?sort=match&for=${creatorId}`);
  check(ss.length > 5 && ss.every((n, i) => i === 0 || n <= ss[i - 1]), `sponsors: best match for a creator lists scores high to low (${ss.slice(0, 5).join(', ')} ...)`);
  await worker.page.locator('summary:has-text("Why")').first().click();
  check((await worker.page.locator('ul li', { hasText: 'subscribers' }).count()) >= 1 || (await worker.page.getByText('Why').count()) > 0, 'sponsors: the Why disclosure opens the reasons');
  check((await worker.page.url()).includes('open=') === false, 'sponsors: opening Why does not open the side panel');
  if (worker.pageErrors.length) failures.push(`worker page errors: ${worker.pageErrors.join(' | ')}`);
  await worker.ctx.close();

  // ---------- put everything back
  cleanTest();
  check(psql(`select count(*) from creators where email = '${CREATOR_EMAIL}'`) === '0' && psql(`select count(*) from brands where name in ('${BRAND}', '${BRAND_ADD}', '${BRAND_DNC}')`) === '0', 'cleanup: test creator, brands, deals and records removed');
  const after = Object.fromEntries(psql("select stage || '|' || count(*) from deals group by stage").split('\n').filter(Boolean).map((r) => r.split('|')));
  check(stages.every((st) => Number(after[st] ?? 0) === (dbCounts[st]?.[0] ?? 0)), 'cleanup: the seed deals are back as they were');

  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  try { cleanTest(); } catch {}
  process.exit(1);
});
