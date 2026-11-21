// HTTP tests through the local gateway with the real anon key and real GoTrue logins.
// Needs the stack from admin/dev/start.sh (seeded). Dependency-free: Node 18+ fetch.
import fs from 'node:fs';
import { loadSecrets } from '../../dev/keys.mjs';
import { SEED_USERS } from '../seed/users.mjs';

const expected = JSON.parse(fs.readFileSync(new URL('../seed/expected.json', import.meta.url)));
const { anon_key, service_key } = loadSecrets();
const API = 'http://localhost:54321';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  ' + info}`); if (!ok) failed++; };

const rest = (path, { token, key = anon_key, method = 'GET', body, headers = {} } = {}) =>
  fetch(`${API}/rest/v1/${path}`, {
    method, body: body && JSON.stringify(body),
    headers: { apikey: key, ...(token === null ? {} : { authorization: `Bearer ${token ?? key}` }), 'content-type': 'application/json', ...headers },
  });
const json = async (r) => { try { return await r.json(); } catch { return null; } };
async function login(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon_key, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { status: r.status, body: await json(r) };
}

// ---- anon: nothing
const tables = ['creators', 'creator_summaries', 'brands', 'deals', 'emails', 'email_templates', 'suppression_list', 'settings', 'audit_log', 'profiles', 'login_attempts'];
for (const t of tables) {
  const r = await rest(t);
  const b = await json(r);
  check(`anon GET /rest/v1/${t} returns no data (HTTP ${r.status})`, !(Array.isArray(b) && b.length > 0) && r.status !== 200 || (Array.isArray(b) && b.length === 0));
}
check('anon cannot call stats_overview', (await rest('rpc/stats_overview', { method: 'POST', body: {} })).status >= 400);
check('anon cannot insert a creator', (await rest('creators', { method: 'POST', body: { full_name: 'x', email: 'x@example.test' } })).status >= 400);
check('no apikey -> 401', (await fetch(`${API}/rest/v1/creators`)).status === 401);
check('wrong apikey -> 401', (await rest('creators', { key: 'nope' })).status === 401);

// ---- auth
const bad = await login('owner@example.test', 'wrong-password');
check('wrong password is rejected', bad.status === 400, bad.status);
const signup = await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: anon_key, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'stranger@example.test', password: 'Stranger-Pass-1234!' }) });
check('public sign-up is disabled', signup.status >= 400 && signup.status < 500, signup.status);
const pre = await fetch(`${API}/rest/v1/creators`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET', 'access-control-request-headers': 'apikey,authorization' } });
check('CORS preflight allows http://localhost:3000', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'http://localhost:3000');
const evil = await fetch(`${API}/rest/v1/creators`, { method: 'OPTIONS', headers: { origin: 'http://evil.example.test', 'access-control-request-method': 'GET' } });
check('CORS preflight does not allow another origin', !evil.headers.get('access-control-allow-origin'));

const owner = await login(SEED_USERS[0].email, SEED_USERS[0].password);
const worker = await login(SEED_USERS[1].email, SEED_USERS[1].password);
check('owner and worker can log in', !!owner.body?.access_token && !!worker.body?.access_token);
const ot = owner.body.access_token, wt = worker.body.access_token;

// ---- owner and worker through real JWTs
const count = async (path, token) => { const r = await rest(path, { token, headers: { prefer: 'count=exact', range: '0-0' } }); return Number((r.headers.get('content-range') || '*/-1').split('/')[1]); };
check('owner reads 60 creators', (await count('creators', ot)) === 60);
check('worker reads 60 creators', (await count('creators', wt)) === 60);
check('worker reads creator_summaries', (await count('creator_summaries', wt)) === 60);
check('worker gets no audit_log rows', (await json(await rest('audit_log', { token: wt }))).length === 0);
check('owner reads the audit log', (await count('audit_log', ot)) > 0);
const first = (await json(await rest('creators?select=id&limit=1', { token: wt })))[0].id;
await rest(`creators?id=eq.${first}`, { token: wt, method: 'DELETE' });
check('worker DELETE removes nothing', (await count('creators', ot)) === 60);
const patchS = await rest('settings?id=eq.1', { token: wt, method: 'PATCH', body: { daily_send_limit: 999 }, headers: { prefer: 'return=representation' } });
check('worker cannot change settings', ((await json(patchS)) || []).length === 0 && (await json(await rest('settings', { token: ot })))[0].daily_send_limit === 30);
const patchP = await rest(`profiles?email=eq.worker@example.test`, { token: wt, method: 'PATCH', body: { role: 'owner' }, headers: { prefer: 'return=representation' } });
check('worker cannot promote themselves', ((await json(patchP)) || []).length === 0);
const upd = await rest(`creators?id=eq.${first}`, { token: wt, method: 'PATCH', body: { notes: 'edited through the API' }, headers: { prefer: 'return=representation' } });
check('worker can edit a creator', (await json(upd)).length === 1);
const rpc = async (token, fn, body = {}) => json(await rest(`rpc/${fn}`, { token, method: 'POST', body }));

// ---- overview numbers equal the seed (see seed/EXPECTED.md)
for (const [who, tok] of [['owner', ot], ['worker', wt]]) {
  const s = await rpc(tok, 'stats_overview');
  const flat = ['total_creators', 'emails_sent_all', 'emails_sent_7d', 'emails_sent_30d', 'replies', 'reply_rate', 'active_deals', 'commission_earned_cents'];
  check(`${who}: stats_overview matches the seed`,
    flat.every((k) => s?.[k] === expected[k]) && JSON.stringify(Object.entries(s?.deals_by_stage ?? {}).sort()) === JSON.stringify(Object.entries(expected.deals_by_stage).sort()),
    JSON.stringify(s));
  check(`${who}: weekly series has 12 points and the expected sums`,
    s?.weekly?.length === expected.weekly_points
    && s.weekly.reduce((a, w) => a + w.sent, 0) === expected.weekly_sent_total
    && s.weekly.reduce((a, w) => a + w.replies, 0) === expected.weekly_replies_total);
}

// ---- service-only functions are closed to logged-in users, open to the service key
check('worker cannot call opt_out', (await rest('rpc/opt_out', { token: wt, method: 'POST', body: { email: 'a@example.test' } })).status >= 400);
check('owner cannot call login_allowed', (await rest('rpc/login_allowed', { token: ot, method: 'POST', body: { email: 'a@example.test', ip: '1.1.1.1' } })).status >= 400);
check('service key: login_allowed -> true', (await rpc(service_key, 'login_allowed', { email: 'fresh@example.test', ip: '203.0.113.9' })) === true);
check('service key can read login_attempts, anon cannot', (await rest('login_attempts', { key: service_key })).status === 200);

// ---- a user with no role sees nothing
const admin = (path, init = {}) => fetch(`http://127.0.0.1:9999${path}`, { ...init, headers: { authorization: `Bearer ${service_key}`, 'content-type': 'application/json' } });
const nr = await (await admin('/admin/users', { method: 'POST', body: JSON.stringify({ email: 'norole-http@example.test', password: 'NoRole-Pass-12345!', email_confirm: true }) })).json();
const nrTok = (await login('norole-http@example.test', 'NoRole-Pass-12345!')).body?.access_token;
check('role-less user reads no creators', !!nrTok && ((await json(await rest('creators', { token: nrTok }))) || []).length === 0);
check('role-less user cannot read stats or profiles',
  (await rest('rpc/stats_overview', { token: nrTok, method: 'POST', body: {} })).status >= 400
  && ((await json(await rest('profiles', { token: nrTok }))) || []).length === 0);
await admin(`/admin/users/${nr.id}`, { method: 'DELETE' });

console.log(failed ? `\n${failed} HTTP check(s) FAILED` : '\nall HTTP checks passed');
process.exit(failed ? 1 : 0);
