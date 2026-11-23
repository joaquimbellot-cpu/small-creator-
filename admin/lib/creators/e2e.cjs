// Browser test for /creators (fake data only). Run: node lib/creators/e2e.cjs
// Needs the local stack + dev server. Creates "ZZ Test ..." records and removes them at the end.
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PG = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const sql = (q) => execSync(`psql -At -F '|' -c "${q.replace(/"/g, '\\"')}"`, { env: PG }).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const shot = path.join(__dirname, 'e2e-list.png');

async function login(browser, email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/overview|creators/, { timeout: 15000 });
  return { ctx, page };
}
const rowsCount = (page) => page.locator('table tbody tr').count();

(async () => {
  const browser = await chromium.launch();
  const o = await login(browser, 'owner@example.test', 'Owner-Test-Pass-2026!');
  const w = await login(browser, 'worker@example.test', 'Worker-Test-Pass-2026!');
  const page = o.page;
  try {
    console.log('list, pagination, sort, filter, search');
    const total = Number(sql('select count(*) from creator_summaries'));
    await page.goto(BASE + '/creators');
    ok((await rowsCount(page)) === 25, 'page 1 has 25 rows');
    ok((await page.textContent('.page-lead')).includes(`${total} in total`), `shows total ${total}`);
    ok(await page.getByText(`1–25 of ${total}`).isVisible(), 'pager text');
    await page.getByRole('link', { name: 'Next' }).click();
    await page.waitForURL(/page=2/);
    ok((await rowsCount(page)) === Math.min(25, total - 25), 'page 2 rows');
    // sort by subscribers desc
    await page.goto(BASE + '/creators?sort=subscribers&dir=desc');
    const topSubs = sql("select subscribers from creator_summaries order by subscribers desc nulls last, full_name, id limit 1");
    const firstName = await page.locator('table tbody tr').first().locator('a').first().textContent();
    const dbFirst = sql("select full_name from creator_summaries order by subscribers desc nulls last, full_name, id limit 1");
    ok(firstName === dbFirst, `sort subscribers desc first = ${dbFirst} (${topSubs})`);
    await page.goto(BASE + '/creators?sort=name&dir=asc');
    const n1 = await page.locator('table tbody tr').first().locator('a').first().textContent();
    ok(n1 === sql("select full_name from creator_summaries order by full_name asc, id limit 1"), 'sort name asc first row (db collation may differ)');
    await page.goto(BASE + '/creators?sort=last_contacted&dir=asc');
    ok((await rowsCount(page)) > 0, 'sort last contacted works');
    // status filter
    await page.goto(BASE + '/creators');
    await page.selectOption('select[name=status]', 'do_not_contact');
    await page.click('button:has-text("Apply")');
    await page.waitForURL(/status=do_not_contact/);
    ok((await rowsCount(page)) === Number(sql("select count(*) from creators where status='do_not_contact'")), 'status filter count matches db');
    // search
    const sample = sql("select full_name from creators order by full_name limit 1 offset 7");
    const term = sample.split(' ')[0];
    await page.goto(BASE + '/creators?q=' + encodeURIComponent(term));
    const expected = Number(sql(`select count(*) from creators where full_name ilike '%${term}%' or email ilike '%${term}%' or channel_name ilike '%${term}%'`));
    ok(expected > 0 && (await page.textContent('.page-lead')).includes(`${expected} matching`), `search "${term}" -> ${expected}`);
    for (const nasty of ['a,b)(', '%', '_', '"', '\\\\', '*', 'x.eq.1,id.neq.0', '))((,,']) {
      const r = await page.goto(BASE + '/creators?q=' + encodeURIComponent(nasty));
      ok(r.status() === 200 && !(await page.content()).includes('Something went wrong'), `search with ${JSON.stringify(nasty)} does not break`);
    }
    await page.goto(BASE + '/creators?q=' + encodeURIComponent('%'));
    ok((await page.textContent('.page-lead')).includes('0 matching'), '"%" is literal (matches none)');

    console.log('pop-up content');
    const wren = sql("select id, full_name, email, deal_count, total_earned_cents from creator_summaries where total_earned_cents > 0 order by total_earned_cents desc limit 1").split('|');
    const [wid, wname, wemail, wdeals, wearn] = wren;
    const auditBefore = Number(sql(`select count(*) from audit_log where action='creator.viewed' and entity_id='${wid}'`));
    await page.goto(BASE + '/creators?q=' + encodeURIComponent(wemail));
    await page.locator('table tbody tr').first().locator('td').nth(2).click();
    await page.waitForURL(/creator=/);
    const dlg = page.getByRole('dialog');
    await dlg.getByText(wemail).waitFor();
    const dtext = await dlg.textContent();
    ok(dtext.includes(wname), 'pop-up shows name');
    ok(dtext.includes('$' + (Number(wearn) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })), `earned $${Number(wearn) / 100}`);
    ok(new RegExp('Deals' + wdeals).test(dtext.replace(/\s/g, '')), `deals ${wdeals}`);
    const link = dlg.locator('a[target=_blank]').first();
    ok((await link.getAttribute('rel')) === 'noopener noreferrer', 'channel link rel');
    await page.waitForTimeout(500);
    ok(Number(sql(`select count(*) from audit_log where action='creator.viewed' and entity_id='${wid}'`)) > auditBefore, 'creator.viewed audited');
    await page.goto(BASE + '/creators?creator=' + wid);
    await page.getByRole('dialog').getByText(wemail).waitFor();
    ok(true, 'deep link ?creator= opens pop-up');
    ok(await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).isVisible(), 'owner sees Delete');
    // delete refused because of deals
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete creator' }).click();
    await page.getByText('has deals').waitFor();
    ok(true, 'friendly message when creator has deals');
    ok(Number(sql(`select count(*) from creators where id='${wid}'`)) === 1, 'creator with deals still exists');
    // refresh without key
    await page.getByRole('dialog').getByRole('button', { name: 'Refresh subscribers' }).click();
    ok(await page.getByText('Add a YouTube API key to turn this on').first().isVisible(), 'refresh explains missing key');
    await page.keyboard.press('Escape');
    await page.waitForURL((u) => !u.search.includes('creator='));

    console.log('add / edit / delete');
    await page.goto(BASE + '/creators?new=1');
    const d = page.getByRole('dialog');
    await d.getByRole('button', { name: 'Add creator' }).click();
    await d.getByText('Name is required.').waitFor();
    ok(true, 'required name error');
    await d.locator('input[name=name]').fill('ZZ Test Alpha');
    await d.locator('input[name=email]').fill('zz.test.alpha@example.test');
    await d.locator('input[name=channel_url]').fill('https://example.com/@nope');
    await d.locator('input[name=phone]').fill('abc');
    await d.locator('input[name=subscribers]').fill('5');
    await d.getByRole('button', { name: 'Add creator' }).click();
    await d.getByText(/Use a YouTube channel link/).waitFor();
    ok(await d.getByText(/Phone can only/).isVisible(), 'channel + phone errors shown');
    ok(await d.locator('input[name=name]').inputValue() === 'ZZ Test Alpha', 'values kept after error');
    await d.locator('input[name=channel_url]').fill('https://www.youtube.com/@zztestalpha');
    await d.locator('input[name=phone]').fill('+1 (555) 000-1111');
    await d.getByRole('button', { name: 'Add creator' }).click();
    await page.waitForURL(/creator=/);
    await page.getByRole('dialog').getByText('zz.test.alpha@example.test').waitFor();
    ok(sql("select subscribers from creators where email='zz.test.alpha@example.test'") === '5', 'created with subscribers 5 (outside 1k-50k allowed)');
    const aid = sql("select id from creators where email='zz.test.alpha@example.test'");
    // duplicate email
    await page.goto(BASE + '/creators?new=1');
    await d.locator('input[name=name]').fill('ZZ Test Beta');
    await d.locator('input[name=email]').fill('ZZ.TEST.ALPHA@example.test');
    await d.getByRole('button', { name: 'Add creator' }).click();
    await d.getByText('A creator with this email already exists.').waitFor();
    ok(true, 'duplicate email friendly error (case-insensitive)');
    // edit
    await page.goto(BASE + `/creators?creator=${aid}&edit=1`);
    await d.locator('input[name=niche]').fill('Testing');
    await d.locator('select[name=status]').selectOption('contacted');
    await d.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('dialog').getByText('Testing').waitFor();
    ok(sql(`select status||'/'||niche from creators where id='${aid}'`) === 'contacted/Testing', 'edit saved');
    // worker cannot delete
    const wp = w.page;
    await wp.goto(BASE + `/creators?creator=${aid}`);
    await wp.getByRole('dialog').getByText('zz.test.alpha@example.test').waitFor();
    ok((await wp.getByRole('button', { name: 'Delete' }).count()) === 0, 'worker sees no Delete');
    ok((await wp.getByRole('link', { name: 'Export CSV' }).count()) === 0, 'worker sees no Export');
    const dr = await w.ctx.request.delete(BASE + '/api/creators/' + aid);
    ok(dr.status() === 403, 'worker DELETE api -> 403');
    const er = await w.ctx.request.get(BASE + '/api/creators/export');
    ok(er.status() === 403, 'worker export api -> 403');
    ok(Number(sql(`select count(*) from creators where id='${aid}'`)) === 1, 'still there after worker attempt');
    // worker can edit
    await wp.goto(BASE + `/creators?creator=${aid}&edit=1`);
    await wp.getByRole('dialog').locator('input[name=niche]').fill('Worker edit');
    await wp.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await wp.getByRole('dialog').getByText('Worker edit').waitFor();
    ok(true, 'worker can edit');
    // anonymous
    const anon = await browser.newContext();
    ok((await anon.request.get(BASE + '/api/creators/' + aid)).status() === 401, 'anonymous api -> 401');
    ok((await anon.request.post(BASE + '/api/creators/refresh-subscribers', { data: { ids: [aid] } })).status() === 401, 'anonymous refresh -> 401');
    // refresh API with no key
    const rr = await o.ctx.request.post(BASE + '/api/creators/refresh-subscribers', { data: { ids: [aid] } });
    ok(rr.status() === 503 && (await rr.json()).error === 'Add a YouTube API key to turn this on', 'refresh api 503 without key');
    ok((await o.ctx.request.post(BASE + '/api/creators/refresh-subscribers', { data: { ids: ['nope'] } })).status() === 400, 'refresh validates ids');
    // bulk status change ("Change status to" on the list)
    const setStatus = (ctx, ids, status) => ctx.request.post(BASE + '/api/creators/status', { data: { ids, status } });
    const statusOf = () => sql(`select status from creators where id='${aid}'`);
    const target = statusOf() === 'contacted' ? 'replied' : 'contacted';
    let sr = await setStatus(o.ctx, [aid], target);
    let sj = await sr.json();
    ok(sr.status() === 200 && sj.changed === 1 && statusOf() === target, `bulk status: owner sets ${target}`);
    sj = await (await setStatus(o.ctx, [aid], target)).json();
    ok(sj.changed === 0 && sj.unchanged === 1, 'bulk status: the same status counts as unchanged');
    sr = await setStatus(o.ctx, [aid], 'do_not_contact');
    ok(sr.status() === 200 && statusOf() === 'do_not_contact', 'bulk status: owner sets Do not contact');
    sr = await setStatus(w.ctx, [aid], 'new');
    sj = await sr.json();
    ok(sr.status() === 200 && sj.ownerOnly === 1 && statusOf() === 'do_not_contact', 'bulk status: a worker cannot lift Do not contact (skipped and counted)');
    sr = await setStatus(o.ctx, [aid], 'new');
    ok(sr.status() === 200 && statusOf() === 'new', 'bulk status: the owner can lift Do not contact');
    ok((await setStatus(o.ctx, [aid], 'bogus')).status() === 400, 'bulk status: unknown status -> 400');
    ok((await anon.request.post(BASE + '/api/creators/status', { data: { ids: [aid], status: 'new' } })).status() === 401, 'bulk status: anonymous -> 401');
    const aidName = sql(`select full_name from creators where id='${aid}'`);
    await page.goto(BASE + '/creators?q=' + encodeURIComponent(aidName));
    await page.getByRole('checkbox', { name: `Select ${aidName}` }).check();
    await page.getByLabel('Change status to').selectOption('replied');
    await page.getByRole('button', { name: 'Change status' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, change' }).click();
    await page.getByText('Changed 1 creator to Replied.').waitFor({ timeout: 10000 });
    ok(statusOf() === 'replied', 'bulk status: the list control changes the status after a confirm');
    // owner delete via UI
    await page.goto(BASE + `/creators?creator=${aid}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete creator' }).click();
    await page.waitForURL((u) => !u.search.includes('creator='));
    ok(Number(sql(`select count(*) from creators where id='${aid}'`)) === 0, 'owner deleted creator');

    console.log('CSV import');
    const existing = sql("select email from creators order by email limit 1");
    const csv = [
      'Name,EMAIL,phone,Channel_URL,niche,subscribers,status,notes',
      'ZZ Test Imp1,zz.imp1@example.test,+1 555,https://youtube.com/@zzimp1,Cooking,1200,new,hello',
      'ZZ Test Imp2,zz.imp2@example.test,,,,,,',
      `ZZ Test Dup,${existing},,,,,,`,
      'ZZ Test Same,ZZ.IMP1@example.test,,,,,,',
      'ZZ Test Chan,zz.imp3@example.test,,youtube.com/@ZZIMP1/videos,,,,',
      'ZZ Test Bad,not-an-email,,,,,,',
      '=ZZ Test Formula,zz.imp4@example.test,,,,,,',
    ].join('\n');
    const f = path.join(os.tmpdir(), 'zz-import.csv');
    fs.writeFileSync(f, csv);
    await page.goto(BASE + '/creators/import');
    await page.setInputFiles('#csv-file', f);
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByText('3 new', { exact: true }).waitFor();
    ok(await page.getByText('3 duplicate', { exact: true }).isVisible() && await page.getByText('1 error', { exact: true }).isVisible(), 'preview: 3 new, 3 duplicate, 1 error');
    ok(await page.getByText(/Same email as line 2/).isVisible() && await page.getByText(/Same channel as line 2/).isVisible(), 'in-file duplicate reasons');
    ok(Number(sql("select count(*) from creators where email like 'zz.imp%'")) === 0, 'nothing saved by preview');
    const impBefore = Number(sql("select count(*) from audit_log where action='creators.imported'"));
    await page.getByRole('button', { name: 'Import 3 new creators' }).click();
    await page.getByText('Imported 3 new creators').waitFor();
    ok(Number(sql("select count(*) from creators where email like 'zz.imp%'")) === 3, 'import inserted 3');
    ok(Number(sql("select count(*) from audit_log where action='creators.imported'")) === impBefore + 1, 'creators.imported audited');
    ok(sql("select details->>'count' from audit_log where action='creators.imported' order by created_at desc limit 1") === '3', 'audit count = 3');
    // oversize and bad files
    fs.writeFileSync(f, 'name,email\n' + 'x'.repeat(1100 * 1024));
    await page.reload();
    await page.setInputFiles('#csv-file', f);
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByText('larger than 1 MB').waitFor();
    ok(true, '>1MB refused');
    const big = await o.ctx.request.post(BASE + '/api/creators/import?mode=preview', { multipart: { file: { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('name,email\n' + 'x'.repeat(1100 * 1024)) } } });
    ok(big.status() === 400, 'server also refuses >1MB');
    const many = 'name,email\n' + Array.from({ length: 2001 }, (_, i) => `ZZ ${i},zz.many${i}@example.test`).join('\n');
    const m = await o.ctx.request.post(BASE + '/api/creators/import?mode=preview', { multipart: { file: { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from(many) } } });
    ok(m.status() === 400, '2001 rows refused');
    const wi = await w.ctx.request.post(BASE + '/api/creators/import?mode=preview', { multipart: { file: { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('name,email\nZZ Q,zz.q@example.test') } } });
    ok(wi.status() === 200, 'worker can import (preview)');
    const sampleRes = await o.ctx.request.get(BASE + '/api/creators/sample');
    ok(sampleRes.status() === 200 && (await sampleRes.text()).startsWith('name,email'), 'sample CSV downloads');

    console.log('CSV export');
    const exBefore = Number(sql("select count(*) from audit_log where action='creators.exported'"));
    await page.goto(BASE + '/creators?q=zz.imp');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
    const out = fs.readFileSync(await dl.path(), 'utf8');
    const lines = out.trim().split('\r\n');
    ok(lines[0] === 'name,email,phone,channel_url,niche,subscribers,status,notes', 'export header');
    ok(lines.length === 4, 'export has the 3 filtered rows (+header)');
    ok(out.includes("'=ZZ Test Formula"), 'formula cell prefixed with quote');
    ok(Number(sql("select count(*) from audit_log where action='creators.exported'")) === exBefore + 1, 'creators.exported audited');
    ok(JSON.parse(sql("select details::text from audit_log where action='creators.exported' order by created_at desc limit 1")).count === 3, 'audit has count');

    console.log('layout');
    await page.goto(BASE + '/creators?q=zz.imp');
    await page.locator('table tbody tr').first().locator('td').nth(2).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({ path: shot });
    const mob = await o.ctx.newPage();
    await mob.setViewportSize({ width: 390, height: 800 });
    await mob.goto(BASE + '/creators');
    ok(await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll at 390px');
  } catch (e) {
    fail++;
    console.log('  ERROR ' + e.message.split('\n').slice(0, 4).join(' | '));
    await page.screenshot({ path: path.join(__dirname, 'e2e-error.png') }).catch(() => {});
  } finally {
    sql("delete from creators where full_name like 'ZZ Test%' or full_name like '=ZZ Test%' or email like 'zz.%@example.test'");
    console.log('leftover ZZ rows:', sql("select count(*) from creators where full_name like '%ZZ Test%' or email like 'zz.%'"));
    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
