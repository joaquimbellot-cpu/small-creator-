// Browser + database check for the owner-only Claude page, against the local stack with the fake Anthropic server.
// Needs: stack up (admin/dev/start.sh, which also starts dev/fake-anthropic.mjs on :4010) and the dev server:
//   cd admin && npm run tokens && NEXT_DIST_DIR=.next-claude npx next dev -p 3300
// Run:  BASE_URL=http://localhost:3300 NODE_PATH=/opt/node-tools/node_modules node admin/lib/assistant/e2e.cjs
// It creates threads, one draft, one creator, and changes one creator status; everything is removed or restored at the
// end, so the numbers in supabase/seed/EXPECTED.md stay exact (audit lines stay: the log is append-only).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3300';
const FAKE_LOG = process.env.FAKE_ANTHROPIC_LOG || path.join(__dirname, '..', '..', 'dev', '.logs', 'fake-anthropic-requests.log');
const OWNER = { email: 'owner@example.test', password: 'Owner-Test-Pass-2026!' };
const WORKER = { email: 'worker@example.test', password: 'Worker-Test-Pass-2026!' };
const NEW_EMAIL = 'zz-claude-e2e@example.test';

const PSQL_ENV = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGDATABASE: 'postgres' };
const psql = (sql) => execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: PSQL_ENV, encoding: 'utf8' }).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (cond) passed++; else failures.push(msg);
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

// Sends one message and waits until Claude has finished (the Send button is back and "Working…" is gone).
async function ask(page, text) {
  const before = await page.locator('main [data-from="you"]').count();
  await page.locator('#claude-message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.locator('main [data-from="you"]').nth(before).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Send' }).waitFor({ timeout: 120000 });
}
const lastReply = (page) => page.locator('main [data-from="claude"]').last().innerText();

async function main() {
  const startedAt = new Date(Date.now() - 2000).toISOString();
  const logOffset = fs.existsSync(FAKE_LOG) ? fs.statSync(FAKE_LOG).size : 0;
  const auditStart = Number(psql('select coalesce(max(id), 0) from audit_log'));
  const base = {
    creators: psql('select count(*) from creators'), deals: psql('select count(*) from deals'), emails: psql('select count(*) from emails'),
    draftEmails: psql("select count(*) from emails where status = 'draft'"),
    stages: psql("select string_agg(id || ':' || stage, ',' order by id) from deals"),
    statuses: psql("select md5(string_agg(id || ':' || status, ',' order by id)) from creators"),
  };
  const sensitive = psql(`select email from creators union select phone from creators where phone is not null union select notes from creators where length(notes) >= 15
    union select email from contact_messages`).split('\n').filter((s) => s.length >= 8);
  check(sensitive.length > 60, `loaded ${sensitive.length} seeded emails, phones and notes to look for in the fake server log`);

  const created = { emailIds: [], creatorIds: [], touchedCreators: [] };
  const browser = await chromium.launch();
  try {
    // ------------------------------------------------------------ worker is refused
    const w = await login(browser, WORKER);
    await w.page.goto(`${BASE}/claude`);
    await w.page.waitForURL(/\/overview/, { timeout: 90000 });
    check(!w.page.url().includes('/claude'), 'worker: /claude sends the worker back to the Overview');
    check((await w.page.getByRole('heading', { name: 'Claude' }).count()) === 0, 'worker: no Claude page content shown');
    const wChat = await w.ctx.request.post(`${BASE}/api/assistant/chat`, { data: { message: 'hello' } });
    check(wChat.status() === 403, `worker: POST /api/assistant/chat is refused (${wChat.status()})`);
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const wApprove = await w.ctx.request.post(`${BASE}/api/assistant/proposals/${fakeId}/approve`);
    const wReject = await w.ctx.request.post(`${BASE}/api/assistant/proposals/${fakeId}/reject`);
    check(wApprove.status() === 403 && wReject.status() === 403, `worker: approve and reject are refused (${wApprove.status()}, ${wReject.status()})`);
    await w.ctx.close();
    const anon = await browser.newContext();
    const aChat = await anon.request.post(`${BASE}/api/assistant/chat`, { data: { message: 'hello' } });
    check(aChat.status() === 401, `anonymous: POST /api/assistant/chat is refused (${aChat.status()})`);
    await anon.close();

    // ------------------------------------------------------------ owner chats
    const o = await login(browser, OWNER);
    const page = o.page;
    await page.goto(`${BASE}/claude`);
    await page.locator('#claude-message').waitFor({ timeout: 90000 });
    check(await page.locator('#claude-message').isEnabled(), 'owner: Claude page loads and the chat box is enabled (Claude is connected)');

    // other sites cannot write as the logged-in owner
    const evil = await o.ctx.request.post(`${BASE}/api/assistant/proposals/${fakeId}/reject`, { headers: { Origin: 'https://evil.example.test' } });
    const cross = await o.ctx.request.post(`${BASE}/api/assistant/proposals/${fakeId}/reject`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    const sameSite = await o.ctx.request.post(`${BASE}/api/assistant/proposals/${fakeId}/reject`, { headers: { Origin: BASE, 'Sec-Fetch-Site': 'same-origin' } });
    check(evil.status() === 403 && cross.status() === 403, `same-origin: a foreign Origin and a cross-site request are refused (${evil.status()}, ${cross.status()})`);
    check(sameSite.status() !== 403, `same-origin: the same origin is let through (${sameSite.status()})`);

    // 1. stats question: tool_use then an answer built from the tool result
    await ask(page, 'How are the stats looking?');
    const reply1 = await lastReply(page);
    check(await page.getByText('Looked at the Overview numbers').count() === 1, 'stats: a live step line "Looked at the Overview numbers" is shown');
    check(reply1.includes(`You have ${base.creators} creators`), `stats: the answer uses the tool result (${base.creators} creators): "${reply1.slice(0, 80)}"`);
    check(/t=[0-9a-f-]{36}/.test(page.url()), 'stats: the URL now names the conversation');
    const threadId = new URL(page.url()).searchParams.get('t');

    // 2. find creators
    await ask(page, 'Find creators named Wren');
    const reply2 = await lastReply(page);
    check(await page.getByText('Searched creators').count() >= 1 && /Wren Mbeki/.test(reply2) && /Wren Castellano/.test(reply2) && /Wren Hartmann/.test(reply2), `find: the answer lists the three Wrens: "${reply2.slice(0, 100)}"`);

    // 3. draft an email: Review gets a draft, nothing is sent
    await ask(page, 'Draft an email to Castellano');
    check(await page.getByText('Wrote an email draft').count() === 1, 'draft: step line "Wrote an email draft" is shown');
    check(await page.getByRole('link', { name: /Open Review/ }).count() === 1, 'draft: a link to Review is shown');
    const draft = psql(`select id || '|' || to_email || '|' || status || '|' || is_test from emails where drafted_by = (select id from profiles where email = ${q(OWNER.email)}) and created_at > ${q(startedAt)} order by created_at desc limit 1`).split('|');
    if (draft[0]) created.emailIds.push(draft[0]);
    check(draft[2] === 'draft' && draft[3] === 'false', `draft: saved with status draft (${draft[2]})`);
    check(Number(psql('select count(*) from emails')) === Number(base.emails) + 1, 'draft: exactly one email row was added');
    const audited = psql(`select count(*) from audit_log where id > ${auditStart} and action = 'email.drafted' and entity_id = ${q(draft[0])} and details->>'via' = 'claude'`);
    check(audited === '1', "draft: audit 'email.drafted' with via claude was written");
    await page.goto(`${BASE}/emails/review`);
    await page.getByText('Email to Wren Castellano', { exact: false }).first().waitFor({ timeout: 60000 }).catch(() => {});
    const inReview = await page.locator('article', { hasText: draft[1] }).count();
    check(inReview >= 1, 'draft: it appears on the Review page as a Draft');
    const mail = await fetch(`http://localhost:8025/latest?to=${encodeURIComponent(draft[1])}`);
    check(mail.status === 404, `draft: the mail catcher received nothing for ${draft[1]} (HTTP ${mail.status})`);

    // 4. propose a status change, approve it
    await page.goto(`${BASE}/claude?t=${threadId}`);
    await page.locator('#claude-message').waitFor({ timeout: 60000 });
    check((await page.getByText('Draft saved').count()) === 1 && (await page.getByText('Looked at the Overview numbers').count()) === 1, 'history: reloading the conversation shows the earlier steps and the draft card');
    const wren = psql(`select id || '|' || status from creators where full_name ilike '%wren%' and status <> 'do_not_contact' order by created_at desc limit 1`).split('|');
    const target = wren[1] === 'active' ? 'inactive' : 'active';
    created.touchedCreators.push({ id: wren[0], status: wren[1] });
    await ask(page, `Propose changing the status of the creator named Wren to ${target}`);
    const card1 = page.locator('main [data-from="proposal"]').last();
    await card1.getByText('Waiting for you').waitFor({ timeout: 30000 });
    const cardText = await card1.innerText();
    const label = (x) => ({ active: 'Active', inactive: 'Inactive' }[x] || x);
    check(/Change a creator/.test(cardText) && /Status/.test(cardText) && cardText.includes(label(wren[1])) && cardText.includes(label(target)), `status proposal: the card shows the kind and the old and new value ("${cardText.replace(/\s+/g, ' ').slice(0, 120)}")`);
    check(await card1.locator('[data-part="from"]').innerText() === label(wren[1]) && await card1.locator('[data-part="to"]').innerText() === label(target), 'status proposal: old and new values are in their own places');
    check(psql(`select status from creators where id = ${q(wren[0])}`) === wren[1], 'status proposal: nothing changed before approval');
    check(psql(`select count(*) from assistant_proposals where status = 'pending' and kind = 'creator.update' and thread_id = ${q(threadId)}`) === '1', 'status proposal: stored as pending');
    await card1.getByRole('button', { name: 'Approve' }).click();
    await card1.getByText('Approved').waitFor({ timeout: 30000 });
    check(psql(`select status from creators where id = ${q(wren[0])}`) === target, `status proposal: approving changed the creator to ${target}`);
    check(psql(`select count(*) from audit_log where id > ${auditStart} and action = 'assistant.proposal_approved'`) === '1', "status proposal: audit 'assistant.proposal_approved' written");
    check(psql(`select decided_by is not null from assistant_proposals where thread_id = ${q(threadId)} and status = 'approved'`) === 't', 'status proposal: decided_by is recorded');

    // 5. propose a deal stage, reject it
    await ask(page, 'Propose moving a deal to signed');
    const card2 = page.locator('main [data-from="proposal"]').last();
    await card2.getByText('Waiting for you').waitFor({ timeout: 30000 });
    const card2Text = await card2.innerText();
    check(/Move a deal/.test(card2Text) && /Stage/.test(card2Text) && /Signed/.test(card2Text), `deal proposal: the card shows from stage and to stage ("${card2Text.replace(/\s+/g, ' ').slice(0, 120)}")`);
    await card2.getByRole('button', { name: 'Reject' }).click();
    await card2.getByText('Rejected').waitFor({ timeout: 30000 });
    check(psql("select string_agg(id || ':' || stage, ',' order by id) from deals") === base.stages, 'deal proposal: rejecting changed no deal');
    check(psql(`select count(*) from assistant_proposals where thread_id = ${q(threadId)} and kind = 'deal.stage' and status = 'rejected'`) === '1', 'deal proposal: stored as rejected');
    check(psql(`select count(*) from audit_log where id > ${auditStart} and action = 'assistant.proposal_rejected'`) === '1', "deal proposal: audit 'assistant.proposal_rejected' written");
    // a decided proposal cannot be decided again
    const pid = psql(`select id from assistant_proposals where thread_id = ${q(threadId)} and kind = 'deal.stage'`);
    const again = await o.ctx.request.post(`${BASE}/api/assistant/proposals/${pid}/approve`);
    check(again.status() === 409, `deal proposal: approving a rejected proposal is refused (${again.status()})`);

    // 6. propose a deal stage, approve it (state is re-checked), then restore by hand at the end
    await ask(page, 'Propose moving a deal to paid');
    const card3 = page.locator('main [data-from="proposal"]').last();
    await card3.getByText('Waiting for you').waitFor({ timeout: 30000 });
    // The deal changes behind Claude's back: approval must notice and refuse.
    const dealId = psql(`select payload->>'deal_id' from assistant_proposals where status = 'pending' and thread_id = ${q(threadId)}`);
    const oldStage = psql(`select stage from deals where id = ${q(dealId)}`);
    psql(`update deals set stage = 'replied' where id = ${q(dealId)}`);
    await card3.getByRole('button', { name: 'Approve' }).click();
    await card3.getByText('Failed').waitFor({ timeout: 30000 });
    check(psql(`select stage from deals where id = ${q(dealId)}`) === 'replied', 'deal proposal: approval re-checked the state and did not overwrite a deal that changed');
    psql(`update deals set stage = ${q(oldStage)} where id = ${q(dealId)}`);

    // 7. add a creator, approve
    await ask(page, `Add creator Zed Testperson ${NEW_EMAIL}`);
    const card4 = page.locator('main [data-from="proposal"]').last();
    await card4.getByText('Waiting for you').waitFor({ timeout: 30000 });
    check(psql(`select count(*) from creators where email = ${q(NEW_EMAIL)}`) === '0', 'add creator: nothing added before approval');
    await card4.getByRole('button', { name: 'Approve' }).click();
    await card4.getByText('Approved').waitFor({ timeout: 30000 });
    const newId = psql(`select id from creators where email = ${q(NEW_EMAIL)}`);
    if (newId) created.creatorIds.push(newId);
    check(!!newId, 'add creator: approving added the creator');

    // 8. a do-not-contact creator can never be moved: even a stored proposal is refused on approval
    const dnc = psql("select id from creators where status = 'do_not_contact' order by id limit 1");
    const forced = psql(`insert into assistant_proposals (thread_id, owner_id, kind, payload, summary)
      select ${q(threadId)}, owner_id, 'creator.update', jsonb_build_object('creator_id', ${q(dnc)}, 'changes', jsonb_build_object('status', 'active'), 'from', jsonb_build_object('status', 'do_not_contact')), 'Test: move a do-not-contact creator'
      from assistant_threads where id = ${q(threadId)} returning id`).split('\n')[0];
    const forcedRes = await o.ctx.request.post(`${BASE}/api/assistant/proposals/${forced}/approve`);
    const forcedBody = await forcedRes.json();
    check(forcedBody.proposal?.status === 'failed' && psql(`select status from creators where id = ${q(dnc)}`) === 'do_not_contact', 'do not contact: a creator is never moved out of do_not_contact, even on approval');

    // 9. refusal and "send" requests
    await ask(page, 'Please refuse this');
    check(await page.getByText('Claude declined to answer that.').count() === 1, 'refusal: the page says Claude declined');
    const after = await ask(page, 'Find creators named Mbeki').then(() => lastReply(page));
    check(/Mbeki/.test(after), 'refusal: the conversation keeps working afterwards (history stays valid)');

    // ------------------------------------------------------------ database facts
    const tools = psql(`select string_agg(details->>'thread' || ' ' || (details->'tools')::text, ';') from audit_log where id > ${auditStart} and action = 'assistant.message'`);
    check(psql(`select count(*) from audit_log where id > ${auditStart} and action = 'assistant.message'`) === '9', "audit: one 'assistant.message' per owner message (9)");
    const seenAudit = psql(`select count(*) from audit_log where id > ${auditStart} and action = 'assistant.message' and jsonb_array_length(details->'creator_ids') >= 3`);
    check(Number(seenAudit) >= 1, "audit: assistant.message lists the creator ids the tools returned");
    check(tools.includes('get_overview_stats') && tools.includes('create_email_draft') && tools.includes('propose_deal_stage'), 'audit: assistant.message lists the tool names used');
    const stored = psql(`select count(*) from assistant_messages where thread_id = ${q(threadId)} and role = 'assistant' and content->0->>'type' = 'thinking'`);
    check(Number(stored) >= 10, `messages: assistant content is stored with its thinking block (${stored} turns)`);
    check(o.pageErrors.length === 0, `owner: no uncaught page errors (${o.pageErrors.join(' | ')})`);
    await o.ctx.close();

    // ------------------------------------------------------------ what the fake server saw
    const raw = fs.readFileSync(FAKE_LOG, 'utf8').slice(logOffset);
    const lines = raw.split('\n').filter(Boolean);
    check(lines.length >= 20, `fake server: ${lines.length} requests were logged`);
    const leaked = sensitive.filter((s) => raw.includes(s));
    check(leaked.length === 0, `fake server log contains none of the seeded emails, phones or notes${leaked.length ? ` (found: ${leaked.slice(0, 3).join(', ')})` : ''}`);
    const bodies = lines.map((l) => JSON.parse(l).body);
    check(bodies.every((b) => b.model === 'claude-opus-5-5' && b.output_config?.effort === 'medium' && b.fallbacks === 'default' && b.cache_control && b.max_tokens === 16000 && !('thinking' in b) && !('temperature' in b)), 'fake server: every request used the required model, effort, fallbacks, cache_control and max_tokens');
    check(bodies.every((b) => b.tools.length === 11 && b.tools.every((t) => t.strict === true && t.input_schema.additionalProperties === false)), 'fake server: all 11 tools are strict with additionalProperties false');
    const names = bodies[0].tools.map((t) => t.name);
    check(!names.some((n) => /send|delete|export|settings|staff/i.test(n)), `fake server: no tool can send, delete, export or touch settings/staff (${names.join(', ')})`);
    const last = bodies.filter((b) => b.messages.length > 8).at(-1);
    const thinkingKept = last.messages.filter((m) => m.role === 'assistant').every((m) => m.content[0].type === 'thinking');
    check(thinkingKept, 'fake server: replayed history keeps every thinking block (the fake verifies signatures and would return 400 otherwise)');
  } finally {
    await browser.close();
    // ------------------------------------------------------------ clean up
    for (const t of created.touchedCreators) psql(`update creators set status = ${q(t.status)} where id = ${q(t.id)}`);
    for (const id of created.creatorIds) psql(`delete from creators where id = ${q(id)}`);
    for (const id of created.emailIds) psql(`delete from emails where id = ${q(id)}`);
    psql(`delete from assistant_threads where created_at > ${q(startedAt)}`);
    // The audit log is append-only by design, so its lines stay (they are not part of the seed numbers).
    const now = {
      creators: psql('select count(*) from creators'), deals: psql('select count(*) from deals'), emails: psql('select count(*) from emails'),
      draftEmails: psql("select count(*) from emails where status = 'draft'"),
      stages: psql("select string_agg(id || ':' || stage, ',' order by id) from deals"),
      statuses: psql("select md5(string_agg(id || ':' || status, ',' order by id)) from creators"),
    };
    check(JSON.stringify(now) === JSON.stringify(base), 'cleanup: creators, deals, emails, stages and statuses are back to how they were');
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
