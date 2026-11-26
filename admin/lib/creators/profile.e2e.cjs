// Browser test for the creator profile at /creators/<id> (fake data only). Run: node lib/creators/profile.e2e.cjs
// Needs the local stack and the dev server. It creates its own records ("ZZ E2E ...") and removes them (and restores the notes) at the end.
// The audit log is append-only, so the lines these actions write stay; that is expected.
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PG = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const sql = (q) => execSync(`psql -At -F '|' -c "${q.replace(/"/g, '\\"')}"`, { env: PG }).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(browser, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/overview|creators/, { timeout: 20000 });
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const o = await login(browser, 'owner@example.test', 'Owner-Test-Pass-2026!');
  const w = await login(browser, 'worker@example.test', 'Worker-Test-Pass-2026!');
  const page = o.page;
  const [id, name, oldNotes] = sql("select id, full_name, coalesce(notes,'') from creators where email not like 'removed%' order by full_name limit 1").split('|');
  const url = `${BASE}/creators/${id}`;
  const views = () => Number(sql(`select count(*) from audit_log where action='creator.viewed' and entity_id='${id}'`));
  const waitViews = async (n) => { for (let i = 0; i < 30 && views() < n; i++) await sleep(200); await sleep(600); return views(); };
  const brandId = sql("select id from brands order by name limit 1");
  try {
    console.log('sections and the audit line');
    const v0 = views();
    await page.goto(url);
    ok(await page.getByRole('heading', { level: 1, name }).isVisible(), 'name is the page heading');
    for (const h of ['Sponsorship potential', 'Sponsorship history', 'Performance', 'Deals', 'Outreach history', 'Notes']) {
      ok(await page.getByRole('heading', { name: h }).isVisible(), `section ${h}`);
    }
    ok(await page.getByRole('link', { name: 'Edit' }).getAttribute('href') === `/creators?creator=${id}&edit=1`, 'Edit links to the edit form');
    ok(await page.getByRole('link', { name: 'Open in the calculator' }).getAttribute('href') === `/creators/calculator?creator=${id}`, 'calculator link');
    ok((await waitViews(v0 + 1)) === v0 + 1, 'one view wrote exactly one creator.viewed line');
    await page.reload();
    ok((await waitViews(v0 + 2)) === v0 + 2, 'a second view wrote one more line');

    console.log('add a record');
    const v1 = views();
    await page.getByRole('button', { name: 'Add a record' }).click();
    await page.getByLabel('Sponsor', { exact: true }).fill('ZZ E2E Brand');
    await page.getByLabel('Date of the video').fill('2026-11-01');
    await page.getByLabel('Video title').fill('ZZ E2E video');
    // B-4: an unknown sponsor is only created by its own explicit button, never by Save record.
    await page.getByText('No sponsor called “ZZ E2E Brand” yet.').waitFor();
    ok(await page.getByRole('button', { name: 'Save record' }).isDisabled(), 'Save record is off while the sponsor is unknown');
    ok(sql(`select count(*) from brands where name='ZZ E2E Brand'`) === '0', 'no sponsor was created by typing');
    await page.getByRole('button', { name: 'Add ZZ E2E Brand as a new sponsor' }).click();
    await page.getByText('was added as a new sponsor').first().waitFor();
    const item = page.locator('li', { hasText: 'ZZ E2E video' });
    await item.waitFor();
    ok((await item.textContent()).includes('Confirmed'), 'new record shows as Confirmed');
    ok((await item.textContent()).includes('Confirmed by Olive Owner'), "it carries the person's name");
    ok(await item.getByRole('link', { name: 'ZZ E2E Brand' }).isVisible(), 'sponsor is a link');
    ok((await waitViews(v1)) === v1, 'saving a record did not write another creator.viewed line');

    console.log('future date and bad link are refused');
    await page.getByRole('button', { name: 'Add a record' }).click();
    await page.getByLabel('Sponsor', { exact: true }).fill('ZZ E2E Brand');
    await page.getByLabel('Date of the video').evaluate((el) => { el.removeAttribute('max'); });
    await page.getByLabel('Date of the video').fill('2030-01-01');
    await page.getByRole('button', { name: 'Save record' }).click();
    ok(await page.getByText('The date cannot be in the future.').waitFor().then(() => true, () => false), 'future date refused');
    await page.getByLabel('Date of the video').fill('2026-11-02');
    await page.getByLabel('Video link').fill('http://example.com/x');
    await page.getByRole('button', { name: 'Save record' }).click();
    ok(await page.getByText('Use a link that starts with https://').waitFor().then(() => true, () => false), 'link outside YouTube refused');
    await page.getByRole('button', { name: 'Cancel' }).click();

    console.log('confirm, reject, restore');
    sql(`insert into sponsorships (creator_id, brand_id, sponsored_on, video_title, source_label, origin, detection_signal, detection_confidence) values ('${id}','${brandId}','2026-10-01','ZZ E2E detected one','detected','detected','paid_flag','medium'), ('${id}','${brandId}','2026-10-02','ZZ E2E detected two','detected','detected','discount_code','low')`);
    await page.goto(url);
    const one = page.locator('li', { hasText: 'ZZ E2E detected one' });
    ok((await one.textContent()).includes('Detected'), 'detected record has the Detected badge');
    await one.getByRole('button', { name: 'Confirm' }).click();
    await one.getByRole('button', { name: 'Confirm record' }).click();
    ok(await one.getByText('Say how you checked it.').isVisible(), 'confirming without a note is refused');
    await one.getByLabel('How did you check it?').fill('Watched it, ad read at 0:45');
    await one.getByRole('button', { name: 'Confirm record' }).click();
    await page.locator('li', { hasText: 'ZZ E2E detected one' }).getByText('Confirmed by Olive Owner').waitFor();
    ok(sql("select source_label from sponsorships where video_title='ZZ E2E detected one'") === 'confirmed', 'record is confirmed in the database');
    const two = page.locator('li', { hasText: 'ZZ E2E detected two' });
    await two.getByRole('button', { name: 'Reject' }).click();
    await page.locator('li', { hasText: 'ZZ E2E detected two' }).waitFor({ state: 'detached' });
    ok(sql("select rejected from sponsorships where video_title='ZZ E2E detected two'") === 't', 'rejected record is hidden but kept');
    await page.getByRole('button', { name: /Show 1 rejected record/ }).click();
    await page.getByRole('button', { name: /^Restore/ }).click();
    await page.locator('li', { hasText: 'ZZ E2E detected two' }).waitFor();
    ok(sql("select rejected from sponsorships where video_title='ZZ E2E detected two'") === 'f', 'restored record is back');

    console.log('notes');
    const text = 'ZZ E2E note ' + Date.now();
    await page.getByRole('textbox', { name: 'Notes' }).fill(text);
    await page.getByRole('button', { name: 'Save notes' }).click();
    await page.getByText('Notes saved.').first().waitFor();
    ok(sql(`select notes from creators where id='${id}'`) === text, 'notes saved');
    ok(sql(`select count(*) from audit_log where details::text like '%ZZ E2E note%'`) === '0', 'note text is not in the audit log');

    console.log('roles and unknown id');
    ok(await page.getByRole('button', { name: 'Delete', exact: true }).isVisible(), 'owner sees Delete');
    await w.page.goto(url);
    await w.page.getByRole('heading', { level: 1, name }).waitFor();
    ok((await w.page.getByRole('button', { name: 'Delete', exact: true }).count()) === 0, 'worker sees no Delete');
    ok(await w.page.getByRole('button', { name: 'Add a record' }).isVisible(), 'worker can add a record');
    const r = await page.goto(`${BASE}/creators/00000000-0000-4000-8000-000000000000`);
    ok(r.status() === 404 && await page.getByText('This creator does not exist').first().isVisible(), 'unknown id gives the not-found screen');
    const r2 = await page.goto(`${BASE}/creators/not-an-id`);
    ok(r2.status() === 404, 'a malformed id gives the not-found screen');

    console.log('no sideways scroll');
    for (const width of [400, 820, 1360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${width}px: no sideways scroll`);
    }
  } catch (e) {
    fail++; console.log('  FAIL exception: ' + (e && e.message ? e.message.split('\n')[0] : e));
  } finally {
    sql(`delete from sponsorships where creator_id='${id}' and video_title like 'ZZ E2E%'`);
    sql(`delete from brands where name='ZZ E2E Brand'`);
    execSync(`psql -c "update creators set notes = nullif($1, '') where id = '${id}'" `.replace('$1', `'${oldNotes.replace(/'/g, "''")}'`), { env: PG });
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
