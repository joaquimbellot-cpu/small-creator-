// Browser test for /sponsors (fake data only). Run: node lib/sponsors/e2e.cjs
// Needs the local stack + the dev server. Creates "ZZ E2E ..." sponsors and removes them (and their contacts) at the end.
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PG = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const sql = (q) => execSync('psql -At -F "|" -c ' + JSON.stringify(q), { env: PG }).toString().trim();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const TAG = 'ZZ E2E ' + Date.now().toString(36);

async function login(browser, email, password, width = 1360) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/overview|creators|sponsors/, { timeout: 15000 });
  return { ctx, page };
}

// The list is settled when the address has been sent and the server has answered.
async function settle(page) {
  await page.waitForTimeout(450);
  await page.waitForFunction(() => document.querySelector('.list-results')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const total = async (page) => {
  const t = (await page.locator('.list-count').textContent()) || '';
  const m = /^(\d+)(?: of (\d+))? sponsor/.exec(t.trim());
  return m ? Number(m[1]) : NaN;
};
const optionCount = async (page, group, label) => {
  const row = page.locator('details', { has: page.locator('summary', { hasText: group }) }).locator('label', { hasText: label }).first();
  const n = await row.locator('span').last().textContent();
  return { row, n: Number(n) };
};
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

(async () => {
  const browser = await chromium.launch();
  const o = await login(browser, 'owner@example.test', 'Owner-Test-Pass-2026!');
  const w = await login(browser, 'worker@example.test', 'Worker-Test-Pass-2026!');
  const page = o.page;
  const created = [];
  try {
    console.log('list loads');
    const all = Number(sql('select count(*) from brands'));
    const res = await page.goto(BASE + '/sponsors');
    ok(res.status() === 200, '/sponsors answers 200');
    await settle(page);
    ok((await total(page)) === all, `count line shows all ${all} sponsors`);
    ok((await page.locator('table tbody tr').count()) === Math.min(25, all), 'table has one row per sponsor on the page (25 at most)');
    ok((await page.locator('nav[aria-label="Primary"] a, header a', { hasText: 'Sponsors' }).count()) > 0, 'the Sponsors tab is in the top bar');
    ok(await page.getByRole('link', { name: 'Export CSV' }).isVisible(), 'owner sees Export CSV');
    ok(await page.getByRole('button', { name: 'Add sponsor' }).isVisible(), 'owner sees Add sponsor');

    console.log('filters: the count beside an option equals the result');
    for (const [group, label] of [['Niches they sponsor', 'Gaming'], ['Our contact status', 'Partner'], ['Industry', 'Software']]) {
      await page.goto(BASE + '/sponsors');
      await settle(page);
      const { row, n } = await optionCount(page, group, label);
      await row.locator('input').check();
      await settle(page);
      ok((await total(page)) === n, `${group} / ${label}: option said ${n}, result is ${await total(page)}`);
      ok(/niches=gaming|rel=partner|industry=Software/.test(page.url()), `${label}: the address changed (${new URL(page.url()).search})`);
      ok((await page.getByRole('button', { name: /^Remove filter/ }).count()) === 1, `${label}: one chip`);
    }
    await page.goto(BASE + '/sponsors?niches=tech');
    await settle(page);
    for (const [group, label, key] of [['Target creator size', '10k to 50k', 'target'], ['Typical budget per creator', '$250 to $1,000', 'budget'], ['Creators sponsored', '3 or more', 'count'], ['Last sponsorship', 'Last 90 days', 'last']]) {
      await page.goto(BASE + '/sponsors?niches=tech');
      await settle(page);
      await page.locator('details', { has: page.locator('summary', { hasText: group }) }).evaluate((d) => { d.open = true; });
      const { row, n } = await optionCount(page, group, label);
      await row.locator('input').check();
      await settle(page);
      ok((await total(page)) === n, `${label} (with Tech ticked): option said ${n}, result is ${await total(page)}`);
      ok(page.url().includes(key + '='), `${label}: address has ${key}=`);
    }
    await page.goto(BASE + '/sponsors');
    await settle(page);
    await page.getByRole('radiogroup', { name: 'Currently active' }).getByLabel(/^Yes/).check();
    await settle(page);
    const activeYes = await total(page);
    ok(activeYes === Number(sql("select count(*) from brands b where exists (select 1 from sponsorships s where s.brand_id=b.id and s.source_label='confirmed' and not s.rejected and s.sponsored_on >= current_date - 90)")), `Currently active: Yes gives ${activeYes} (confirmed records only)`);
    await page.getByLabel('Count detected records too').check();
    await settle(page);
    ok(page.url().includes('detected=1') && (await total(page)) >= activeYes, 'Count detected records too: address and a result at least as large');
    ok((await total(page)) === Number(sql("select count(*) from brands b where exists (select 1 from sponsorships s where s.brand_id=b.id and not s.rejected and s.sponsored_on >= current_date - 90)")), 'with detected records the result matches an independent count');

    console.log('search, chips, clear all, empty state');
    await page.goto(BASE + '/sponsors');
    await settle(page);
    await page.getByLabel('Search', { exact: true }).fill('tea');
    await settle(page);
    ok(page.url().includes('q=tea'), 'search is in the address');
    ok((await total(page)) === Number(sql("select count(*) from brands where name ilike '%tea%' or industry ilike '%tea%' or website ilike '%tea%'")), 'search by name, industry or website matches the database');
    await page.getByRole('button', { name: 'Clear all' }).first().click();
    await settle(page);
    ok(!page.url().includes('q='), 'Clear all removes the filters');
    await page.goto(BASE + '/sponsors?niches=gaming&rel=partner&size=11-50');
    await settle(page);
    ok(await page.getByText('No sponsors match all of these filters').isVisible(), 'empty state shows');
    const fixes = await page.locator('.list-body button', { hasText: /^Remove/ }).count();
    ok(fixes >= 1 && fixes <= 3, `empty state offers ${fixes} filter(s) to remove`);
    await page.locator('.list-body button', { hasText: /^Remove/ }).first().click();
    await settle(page);
    ok((await total(page)) > 0, 'removing the suggested filter brings results back');
    await page.goto(BASE + '/sponsors?niches=nope&rel=zzz&page=-3&sort=drop');
    await settle(page);
    ok((await total(page)) === all, 'bad values in the address are ignored');
    await page.goto(BASE + '/sponsors?sort=budget');
    await settle(page);
    const topBudget = await page.locator('table tbody tr').first().locator('td').nth(4).textContent();
    const dbTop = sql('select budget_min_cents/100, budget_max_cents/100 from brands order by budget_max_cents desc nulls last, name limit 1').split('|');
    ok(topBudget.replace(/[$,]/g, '').includes(dbTop[1]), `sort by budget puts $${dbTop[1]} first`);
    await page.goto(BASE + '/sponsors?view=cards');
    await settle(page);
    ok((await page.locator('[role=listitem]').count()) === Math.min(25, all), 'card view shows the cards');

    console.log('panel and full page');
    await page.goto(BASE + '/sponsors');
    await settle(page);
    const firstName = (await page.locator('table tbody tr').first().locator('a').first().textContent()).trim();
    const viewedBefore = Number(sql("select count(*) from audit_log where action = 'brand.viewed'"));
    await page.locator('table tbody tr').first().locator('td').nth(2).click();
    await page.waitForURL(/open=/);
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    ok(await dlg.getByRole('heading', { name: firstName }).isVisible(), `panel opens for ${firstName}`);
    ok(await dlg.getByText('1 of').isVisible(), 'panel shows "1 of n"');
    ok(await dlg.getByRole('heading', { name: 'Contact people' }).isVisible(), 'panel has Contact people');
    ok(await dlg.getByRole('link', { name: 'Open full page' }).isVisible(), 'panel has Open full page');
    ok(await dlg.getByRole('button', { name: 'Edit', exact: true }).first().isVisible(), 'panel has Edit');
    await page.waitForTimeout(1200);
    const viewedAfter = Number(sql("select count(*) from audit_log where action = 'brand.viewed'"));
    ok(viewedAfter === viewedBefore + 1, `one brand.viewed line for the view (${viewedBefore} -> ${viewedAfter})`);
    ok(sql("select count(*) from audit_log where action = 'brand.viewed' and details::text like '%@%'") === '0', 'no email in any brand.viewed detail');
    await dlg.getByRole('button', { name: 'Next' }).click();
    await page.waitForFunction((n) => !document.querySelector('[role=dialog] h2')?.textContent.includes(n), firstName, { timeout: 15000 });
    ok(await page.getByRole('dialog').getByText('2 of').isVisible(), 'Next moves to "2 of n"');
    await page.keyboard.press('Escape');
    await settle(page);
    ok(!page.url().includes('open='), 'Escape closes the panel');
    await page.goto(BASE + '/sponsors');
    await settle(page);
    await page.locator('table tbody tr').first().locator('a').first().click();
    await page.getByRole('dialog').getByRole('link', { name: 'Open full page' }).click();
    await page.waitForURL(/\/sponsors\/[0-9a-f-]{36}$/);
    ok(await page.getByRole('heading', { level: 1, name: firstName }).isVisible(), 'full page shows the sponsor');
    ok((await page.locator('a[target=_blank]').count()) === 0 || (await page.locator('a[target=_blank]').first().getAttribute('rel')).includes('noopener'), 'external links open in a new tab with noopener');
    ok(await noSideScroll(page), 'full page has no sideways scroll');

    console.log('add a sponsor, add and edit a contact');
    await page.goto(BASE + '/sponsors');
    await settle(page);
    const name = `${TAG} Sponsor`;
    await page.getByRole('button', { name: 'Add sponsor' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Company name').fill(name);
    await form.getByLabel('Website').fill('zz-e2e.example.test');
    await form.getByLabel('Industry').fill('Testing');
    await form.getByLabel('Location').selectOption('US');
    await form.getByLabel('Target creator size, from').fill('5k');
    await form.getByLabel('Target creator size, to').fill('50k');
    await form.getByLabel('Typical budget per creator, from (USD)').fill('200');
    await form.getByLabel('Typical budget per creator, to (USD)').fill('1,000');
    await form.getByLabel('Gaming').check();
    await form.getByRole('button', { name: 'Add sponsor' }).click();
    await page.waitForURL(/open=/, { timeout: 15000 });
    const row = sql(`select id, website, target_min_subs, target_max_subs, budget_min_cents, budget_max_cents, target_niches, relationship from brands where name = '${name}'`).split('|');
    created.push(row[0]);
    ok(row[1] === 'https://zz-e2e.example.test' && row[2] === '5000' && row[3] === '50000' && row[4] === '20000' && row[5] === '100000' && row[6] === '{gaming}' && row[7] === 'prospect', `saved with units converted: ${row.slice(1).join(' ')}`);
    ok(await page.getByRole('dialog').getByRole('heading', { name }).isVisible(), 'the new sponsor opens in the panel');
    // duplicate name
    await page.goto(BASE + '/sponsors');
    await settle(page);
    await page.getByRole('button', { name: 'Add sponsor' }).click();
    await page.getByRole('dialog').getByLabel('Company name').fill(name.toUpperCase());
    await page.getByRole('dialog').getByRole('button', { name: 'Add sponsor' }).click();
    await page.getByText('A sponsor with this name already exists.').waitFor();
    ok(true, 'a duplicate name (any letter case) is refused with a plain message');
    await page.keyboard.press('Escape');
    // contact
    await page.goto(`${BASE}/sponsors/${row[0]}`);
    await page.getByRole('button', { name: 'Add a person' }).click();
    const cf = page.getByRole('dialog');
    await cf.getByLabel('Name').fill('ZZ Person One');
    await cf.getByLabel('Role (optional)').fill('Partnerships');
    await cf.getByLabel('Email (optional)').fill('zz-person1@example.test');
    await cf.getByLabel('LinkedIn (optional)').fill('https://evil.example.test/in/x');
    await cf.getByRole('button', { name: 'Add person' }).click();
    await page.getByText('Must be a linkedin.com address').or(page.getByText('Enter a LinkedIn address')).first().waitFor();
    ok(true, 'a LinkedIn address that is not on linkedin.com is refused');
    await page.waitForTimeout(500); // the form resets itself once the action has answered
    await cf.getByLabel('LinkedIn (optional)').fill('https://www.linkedin.com/in/zz-person-one');
    await cf.getByRole('button', { name: 'Add person' }).click();
    await page.getByText('ZZ Person One').waitFor();
    ok(await page.getByText('Main contact').first().isVisible(), 'the first person is the main contact');
    await page.getByRole('button', { name: 'Add a person' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('ZZ Person Two');
    await page.getByRole('dialog').getByRole('button', { name: 'Add person' }).click();
    await page.getByText('ZZ Person Two').waitFor();
    ok(sql(`select count(*) from brand_contacts where brand_id = '${row[0]}'`) === '2', 'two people saved');
    await page.locator('[data-testid=contact-row]', { hasText: 'ZZ Person Two' }).getByRole('button', { name: 'Make main contact' }).click();
    await page.waitForTimeout(1200);
    ok(sql(`select full_name from brand_contacts where brand_id = '${row[0]}' and is_primary`) === 'ZZ Person Two', 'set main contact moves the badge');
    await page.locator('[data-testid=contact-row]', { hasText: 'ZZ Person One' }).getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Role (optional)').fill('Head of partnerships');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('Head of partnerships').waitFor();
    ok(sql(`select role_title from brand_contacts where full_name = 'ZZ Person One' and brand_id = '${row[0]}'`) === 'Head of partnerships', 'edit contact saved');
    ok(sql("select count(*) from audit_log where action like 'brand_contact.%' and details::text ~* '(@|linkedin|555)'") === '0', 'no email, phone or LinkedIn in any contact audit line');
    // edit sponsor
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('dialog').getByLabel('Industry').fill('Testing two');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('Testing two').first().waitFor();
    ok(sql(`select industry from brands where id = '${row[0]}'`) === 'Testing two', 'edit sponsor saved');
    // owner can remove a contact
    await page.locator('[data-testid=contact-row]', { hasText: 'ZZ Person One' }).getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove person' }).click();
    await page.waitForTimeout(1200);
    ok(sql(`select count(*) from brand_contacts where brand_id = '${row[0]}'`) === '1', 'owner removed a contact person');
    // delete refusal when records exist
    await page.goto(`${BASE}/sponsors/${sql('select brand_id from sponsorships where brand_id is not null limit 1')}`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete sponsor' }).click();
    await page.getByText(/cannot be deleted/).first().waitFor();
    ok(true, 'deleting a sponsor with deals or records is refused with a plain message');
    // bulk tag
    await page.goto(BASE + `/sponsors?q=${encodeURIComponent(TAG)}`);
    await settle(page);
    await page.locator('table tbody tr').first().getByRole('checkbox').check();
    await page.getByLabel('Tag name').fill(TAG + ' tag');
    await page.getByRole('button', { name: 'Add a tag' }).click();
    await page.waitForTimeout(1500);
    ok(sql(`select count(*) from brand_tags bt join tags t on t.id = bt.tag_id where bt.brand_id = '${row[0]}' and t.name = '${TAG} tag' and t.scope = 'brand'`) === '1', 'bulk "Add a tag" saved a brand tag');
    // saved view
    await page.goto(BASE + '/sponsors?niches=tech');
    await settle(page);
    await page.getByRole('button', { name: 'Saved views' }).click();
    await page.getByLabel('Name for this view').fill(TAG + ' view');
    await page.getByRole('button', { name: 'Save current view' }).click();
    await page.waitForTimeout(1500);
    ok(sql(`select query from saved_views where name = '${TAG} view' and scope = 'sponsors'`) === 'niches=tech', 'saved view stores the filters');

    console.log('import preview');
    await page.goto(BASE + '/sponsors/import');
    const csv = `name,website,niches,contact_name,contact_email\r\n${TAG} Import One,https://zz-import1.example.test,cooking;diy,ZZ Imp Person,zz-imp@example.test\r\n${name.toLowerCase()},,,,\r\n,,,,\r\n=${TAG} Import Formula,,,,\r\n${TAG} Bad Niche,,nonsense,,\r\n`;
    await page.setInputFiles('#csv-file', { name: 'zz.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByText('new', { exact: false }).first().waitFor();
    const bodyText = await page.locator('main').textContent();
    ok(/2 new/.test(bodyText) && /1 duplicate/.test(bodyText) && /1 error/.test(bodyText), 'preview marks new, duplicate and error rows (2 new: the formula name is cleaned, 1 duplicate, 1 error)');
    ok(sql(`select count(*) from brands where name like '${TAG} Import%'`) === '0', 'preview saves nothing');
    await page.getByRole('button', { name: /^Import \d+ new sponsors$/ }).click();
    await page.getByText(/Imported 2 new sponsors/).waitFor();
    const imported = sql(`select count(*) from brands where name like '${TAG} Import%'`);
    ok(imported === '2', 'commit saved the two new rows');
    ok(sql(`select count(*) from brands where name = '${TAG} Import Formula'`) === '1' && sql("select count(*) from brands where name like '=%' or name like '@%'") === '0', 'the leading = of a name was stripped on import');
    ok(sql("select count(*) from audit_log where action = 'brands.imported'") !== '0', 'an audit line brands.imported exists');

    console.log('export (owner)');
    const exp = await page.request.get(BASE + '/api/sponsors/export?niches=gaming');
    const csvText = await exp.text();
    ok(exp.status() === 200 && csvText.startsWith('name,website,industry'), 'owner export answers 200 with the header');
    ok(csvText.trim().split('\n').length - 1 === Number(sql("select count(*) from brands where 'gaming' = any(target_niches)")), 'export holds only the rows that match the filters');
    ok(Number(sql("select count(*) from audit_log where action = 'brands.exported'")) >= 1, 'audit line brands.exported written');

    console.log('layout at 400, 820 and 1360 px');
    for (const width of [400, 820, 1360]) {
      const c = await browser.newContext({ viewport: { width, height: 900 } });
      const p = await c.newPage();
      await p.goto(BASE + '/login');
      await p.fill('input[name=email]', 'owner@example.test');
      await p.fill('input[name=password]', 'Owner-Test-Pass-2026!');
      await p.click('button[type=submit]');
      await p.waitForURL(/overview|creators|sponsors/);
      for (const path of ['/sponsors', '/sponsors?view=cards', `/sponsors?open=${row[0]}`, `/sponsors/${row[0]}`, '/sponsors/import']) {
        await p.goto(BASE + path);
        await p.waitForTimeout(700);
        ok(await noSideScroll(p), `${width}px ${path.split('?')[0].replace(row[0], '[id]')}${path.includes('?') ? '?' + path.split('?')[1].replace(row[0], 'id') : ''}: no sideways scroll`);
      }
      await c.close();
    }

    console.log('worker');
    const wp = w.page;
    await wp.goto(BASE + '/sponsors');
    await settle(wp);
    ok((await total(wp)) >= 26, 'worker sees the list');
    ok((await wp.getByRole('link', { name: 'Export CSV' }).count()) === 0, 'worker sees no Export CSV');
    ok(await wp.getByRole('button', { name: 'Add sponsor' }).isVisible(), 'worker can add a sponsor');
    await wp.goto(`${BASE}/sponsors/${row[0]}`);
    ok((await wp.getByRole('button', { name: 'Delete', exact: true }).count()) === 0, 'worker sees no Delete on a sponsor');
    ok((await wp.getByRole('button', { name: 'Remove', exact: true }).count()) === 0, 'worker sees no Remove on a contact person');
    ok(await wp.getByRole('button', { name: 'Edit', exact: true }).first().isVisible(), 'worker can edit');
    const wexp = await wp.request.get(BASE + '/api/sponsors/export');
    ok(wexp.status() === 403, `export answers ${wexp.status()} for a worker (403 expected)`);
    const wimp = await wp.request.post(BASE + '/api/sponsors/import?mode=preview', { multipart: { file: { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('name\r\nZZ never saved\r\n') } } });
    ok(wimp.status() === 200, 'a worker may preview an import');
  } catch (e) {
    fail++;
    console.log('  FAIL exception: ' + (e && e.message ? e.message.split('\n')[0] : e));
    try { await page.screenshot({ path: require('node:os').tmpdir() + '/sponsors-e2e-fail.png' }); } catch { /* ignore */ }
  } finally {
    // clean up everything this run created
    try {
      sql(`delete from brand_tags where tag_id in (select id from tags where name like '${TAG}%')`);
      sql(`delete from tags where name like '${TAG}%'`);
      sql(`delete from saved_views where name like '${TAG}%'`);
      sql(`delete from brands where name like '${TAG}%'`);
      sql("delete from brands where name like 'ZZ never saved%'");
    } catch (e) { console.log('  cleanup problem: ' + e.message.split('\n')[0]); }
    ok(sql(`select count(*) from brands where name like 'ZZ E2E%'`) === '0', 'cleanup left no test sponsor behind');
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
