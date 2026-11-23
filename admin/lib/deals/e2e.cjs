// Browser check for /overview and /deals against the local stack (fake data only).
// Run from admin/ with the stack and dev server already up:  node lib/deals/e2e.cjs
// It creates one deal and one brand ("ZZ Test Brand") and removes both at the end.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOT = process.env.SHOT_PATH || '/tmp/claude-0/-home-user-small-creator-/5fc4e65e-85c4-51b1-b3b6-58cfdbef0441/scratchpad/overview.png';
const BRAND = 'ZZ Test Brand';
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

function cleanBrand() {
  psql(`delete from deals where brand_id in (select id from brands where name = '${BRAND}'); delete from brands where name = '${BRAND}';`);
}

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
  check(stages.length === 6, `${who}: six deal stages shown (got ${stages.length})`);
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

async function main() {
  const browser = await chromium.launch();
  const stats = liveStats();
  console.log(`live stats: ${stats.total_creators} creators, ${stats.emails_sent_all} sent, ${stats.replies} replies, ${stats.active_deals} active deals`);

  // ---------- owner
  cleanBrand();
  const owner = await login(browser, OWNER);
  const { page } = owner;

  await checkOverview(page, stats, 'owner');
  await page.screenshot({ path: SHOT, fullPage: true });
  console.log(`screenshot: ${SHOT}`);

  // Filter by stage (through the UI).
  await page.goto(`${BASE}/deals`);
  const paidCount = Number(psql("select count(*) from deals where stage = 'paid'"));
  const toolbar = page.locator('form.toolbar');
  await toolbar.getByLabel('Stage', { exact: true }).selectOption('paid');
  await toolbar.getByRole('button', { name: 'Filter' }).click();
  await page.waitForURL(/stage=paid/);
  const filtered = await page.$$eval('table[aria-label="Deals"] tbody tr', (trs) => trs.length);
  const filteredStages = await page.$$eval('table[aria-label="Deals"] tbody tr', (trs) => trs.map((tr) => tr.querySelector('select')?.value));
  check(filtered === Math.min(25, paidCount), `owner: stage filter "paid" shows ${Math.min(25, paidCount)} rows (got ${filtered})`);
  check(filteredStages.every((s) => s === 'paid'), 'owner: every filtered row is paid');

  // Add a deal with a new brand.
  await page.goto(`${BASE}/deals`);
  const addForm = page.locator('form.tile');
  await addForm.getByLabel('Creator', { exact: true }).selectOption({ index: 1 });
  await addForm.getByLabel('Brand', { exact: true }).fill(BRAND);
  await addForm.getByLabel('Amount (USD)', { exact: true }).fill('1234.56');
  await addForm.getByLabel('Stage', { exact: true }).selectOption('contacted');
  await addForm.getByRole('button', { name: 'Add deal' }).click();
  await page.getByText(`Deal with ${BRAND} added.`).waitFor({ timeout: 30000 });
  const added = psql(`select d.stage || '|' || d.amount_cents || '|' || d.commission_cents from deals d join brands b on b.id = d.brand_id where b.name = '${BRAND}'`);
  check(added === 'contacted|123456|9876', `owner: new deal stored as stage contacted, 123456 cents, commission from the database (got ${added})`);

  // Change its stage.
  const row = page.locator('table[aria-label="Deals"] tbody tr', { hasText: BRAND });
  await row.getByRole('combobox').selectOption('signed');
  await row.getByRole('button', { name: 'Save' }).click();
  await row.getByText('Saved').waitFor({ timeout: 30000 });
  await until(() => psql(`select d.stage from deals d join brands b on b.id = d.brand_id where b.name = '${BRAND}'`) === 'signed', 'stage saved as signed');
  await page.reload();
  const rowAfter = page.locator('table[aria-label="Deals"] tbody tr', { hasText: BRAND });
  check((await rowAfter.getByRole('combobox').inputValue()) === 'signed', 'owner: stage change persists after reload');

  // Delete as owner.
  check((await rowAfter.getByRole('button', { name: 'Delete' }).count()) === 1, 'owner: Delete button is shown');
  await rowAfter.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await until(() => psql(`select count(*) from deals d join brands b on b.id = d.brand_id where b.name = '${BRAND}'`) === '0', 'deal deleted');
  await page.reload();
  check((await page.locator('table[aria-label="Deals"] tbody tr', { hasText: BRAND }).count()) === 0, 'owner: deleted deal is gone from the list');
  cleanBrand();
  check(psql(`select count(*) from brands where name = '${BRAND}'`) === '0', 'cleanup: test brand removed');
  if (owner.pageErrors.length) failures.push(`owner page errors: ${owner.pageErrors.join(' | ')}`);
  await owner.ctx.close();

  // ---------- worker
  const worker = await login(browser, WORKER);
  await checkOverview(worker.page, stats, 'worker');
  await worker.page.goto(`${BASE}/deals`);
  await worker.page.waitForSelector('h1.page-title', { timeout: 90000 });
  const workerDeletes = await worker.page.getByRole('button', { name: 'Delete' }).count();
  check(workerDeletes === 0, `worker: no Delete buttons on /deals (got ${workerDeletes})`);
  check((await worker.page.locator('form.tile').getByRole('button', { name: 'Add deal' }).count()) === 1, 'worker: add-deal form is shown');
  if (worker.pageErrors.length) failures.push(`worker page errors: ${worker.pageErrors.join(' | ')}`);
  await worker.ctx.close();

  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  try { cleanBrand(); } catch {}
  process.exit(1);
});
