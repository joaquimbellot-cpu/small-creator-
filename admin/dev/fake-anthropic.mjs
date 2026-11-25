// A fake Anthropic API for tests, on port 4010 (override: FAKE_ANTHROPIC_PORT). POST /v1/messages, JSON, non-streaming.
// Point the app at it with ANTHROPIC_BASE_URL=http://localhost:4010 and any ANTHROPIC_API_KEY.
//
// It is scripted by keywords in the LAST OWNER TEXT (the last user message that has a text block):
//   refuse / forbidden .......... stop_reason "refusal"
//   stats, overview, numbers .... get_overview_stats, then a text built from the result
//   propose ... stage / move deal list_deals, then propose_deal_stage ("to <stage>")
//   add creator <name> <email> .. propose_add_creator
//   propose ... status / change status  search_creators ("named X"), then propose_edit_creator ("to <status>")
//   draft ....................... search_creators ("to X"), then create_email_draft, then a text
//   find / search ............... search_creators ("named X"), then a text listing the names
//   anything else ............... a short text
// PITCH DRAFTS (lib/drafting/pitch*.ts): a request whose system prompt starts "You write pitch emails for Smallfold" is answered
// with a JSON subject and body (structured output) written ONLY from the tags in the prompt (creator, sponsor, past sponsors,
// greeting name). It is not held to the Opus-only request checks below, because drafting uses ANTHROPIC_MODEL. If the sponsor
// name in the prompt contains "ZZ INVENT", the reply names a company that is not in the facts, so a test can see the draft refused.
//
// It REJECTS (400) shapes the real API rejects for claude-opus-5-5: wrong model, temperature / top_p / top_k,
// tool_choice other than auto, thinking disabled or with budget_tokens, tools without strict: true or without
// additionalProperties: false, assistant prefill, missing output_config.effort / top-level cache_control / fallbacks,
// missing server-side-fallback beta header, tool_use without a matching tool_result (all in the next user message).
// Every response starts with a fake thinking block whose signature covers the whole turn; when a turn comes back
// edited, reordered or with blocks dropped, the signature no longer matches and the request is rejected.
// Every request body is appended to a log file (one JSON line each): admin/dev/.logs/fake-anthropic-requests.log
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FAKE_ANTHROPIC_PORT || 4010);
const LOG = process.env.FAKE_ANTHROPIC_LOG || path.join(dev, '.logs', 'fake-anthropic-requests.log');
const MODEL = 'claude-opus-5-5';
const SECRET = crypto.randomBytes(16).toString('hex');
fs.mkdirSync(path.dirname(LOG), { recursive: true });

class Bad extends Error {}
const bad = (m) => { throw new Bad(m); };
// Keys are sorted first: a database may store JSON with its keys in another order, which is the same content.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const sign = (thinking, rest) => crypto.createHmac('sha256', SECRET).update(JSON.stringify(canon([thinking, rest]))).digest('base64url');
let counter = 0;

// ---------------------------------------------------------------- request checks
function validate(body, headers) {
  if (body.model !== MODEL) bad(`model must be ${MODEL}, got ${JSON.stringify(body.model)}`);
  for (const k of ['temperature', 'top_p', 'top_k']) if (k in body) bad(`${k} is not allowed on this model`);
  if (!Number.isInteger(body.max_tokens)) bad('max_tokens is required');
  if (body.tool_choice !== undefined && body.tool_choice?.type !== 'auto') bad('tool_choice must be auto');
  if (body.thinking !== undefined) {
    if (body.thinking?.type !== 'adaptive') bad('thinking must be omitted or {type: "adaptive"}');
    if ('budget_tokens' in body.thinking) bad('budget_tokens is not allowed');
  }
  if (body.output_config?.effort !== 'medium') bad('output_config.effort must be set explicitly (medium)');
  if (body.cache_control?.type !== 'ephemeral') bad('top-level cache_control {type: "ephemeral"} is required');
  if (body.fallbacks !== 'default') bad('fallbacks must be "default"');
  if (!String(headers['anthropic-beta'] || '').split(',').map((s) => s.trim()).includes('server-side-fallback-2026-07-01')) bad('beta header server-side-fallback-2026-07-01 is missing');
  if (body.stream) bad('this fake does not stream');
  const tools = body.tools ?? [];
  for (const t of tools) {
    if (t.strict !== true) bad(`tool ${t.name}: strict must be true`);
    if (t.input_schema?.type !== 'object' || t.input_schema.additionalProperties !== false) bad(`tool ${t.name}: input_schema needs additionalProperties: false`);
  }
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) bad('messages is required');
  if (msgs[0].role !== 'user') bad('first message must be a user message');
  if (msgs.at(-1).role !== 'user') bad('the last message must be a user message (no assistant prefill)');
  const names = new Set(tools.map((t) => t.name));
  msgs.forEach((m, i) => {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (!Array.isArray(blocks) || blocks.length === 0) bad(`message ${i} has no content`);
    if (m.role !== 'assistant') return;
    // thinking first, signature must match the rest of the turn
    const [first, ...rest] = blocks;
    if (first.type !== 'thinking') bad(`assistant message ${i} must start with its thinking block (blocks were dropped or reordered)`);
    if (first.signature !== sign(first.thinking, rest)) bad(`assistant message ${i} was changed: its blocks do not match the signature`);
    const uses = rest.filter((b) => b.type === 'tool_use');
    for (const u of uses) if (!names.has(u.name)) bad(`assistant message ${i} calls unknown tool ${u.name}`);
    if (uses.length) {
      const next = msgs[i + 1];
      if (!next || next.role !== 'user' || !Array.isArray(next.content)) bad(`tool_use in message ${i} has no tool_result in the next user message`);
      const answered = next.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id);
      for (const u of uses) if (!answered.includes(u.id)) bad(`tool_use ${u.id} has no tool_result in the next user message`);
    }
  });
}

// ---------------------------------------------------------------- the script
const blocksOf = (m) => (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content);
const stripTags = (s) => String(s ?? '').replace(/<\/?untrusted>/g, '');
const resultJson = (m) => {
  const r = blocksOf(m).find((b) => b.type === 'tool_result');
  try { return { error: r?.is_error === true, data: JSON.parse(r.content) }; } catch { return { error: true, data: {} }; }
};

function script(msgs) {
  let lastOwner = -1;
  msgs.forEach((m, i) => { if (m.role === 'user' && blocksOf(m).some((b) => b.type === 'text')) lastOwner = i; });
  const text = blocksOf(msgs[lastOwner]).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
  const tail = msgs.slice(lastOwner + 1);
  const results = tail.filter((m) => m.role === 'user').map(resultJson); // one per completed step
  const step = results.length;
  const call = (name, input) => ({ tools: [{ name, input }] });
  const say = (t) => ({ text: t });
  const word = (re) => (text.match(re) || [])[1];
  const first = (r) => (r.data.creators || []).find((c) => c.status !== 'do_not_contact');

  if (/refus|forbidden/i.test(text)) return { refusal: true };
  if (/add creator/i.test(text)) {
    if (step === 0) {
      const email = word(/([\w.+-]+@[\w.-]+\.\w+)/);
      const name = (text.match(/add creator\s+(.+?)\s+[\w.+-]+@/i) || [])[1] || 'New Person';
      return call('propose_add_creator', { name, email, status: 'new' });
    }
    return say(results[0].error ? `I could not propose that: ${results[0].data.error}` : 'I proposed adding the creator. It is waiting for your approval.');
  }
  if (/stage|mov(e|ing).*deal|deal.*mov(e|ing)/i.test(text) && /propos|move/i.test(text)) {
    const stage = word(/\bto\s+(contacted|replied|negotiating|signed|completed|paid)\b/i)?.toLowerCase() || 'signed';
    if (step === 0) return call('list_deals', { limit: 25 });
    if (step === 1) {
      const deal = (results[0].data.deals || []).find((d) => d.stage !== stage);
      return deal ? call('propose_deal_stage', { deal_id: deal.id, stage }) : say('I found no deal to move.');
    }
    return say(results[1].error ? `I could not propose that: ${results[1].data.error}` : `I proposed moving a deal to ${stage}. It is waiting for your approval.`);
  }
  if (/status/i.test(text) && /propos|chang/i.test(text)) {
    const status = word(/\bto\s+(new|contacted|replied|active|inactive|do_not_contact)\b/i)?.toLowerCase() || 'contacted';
    const q = word(/(?:named|called|for)\s+([\w-]+)/i) || '';
    if (step === 0) return call('search_creators', { query: q, limit: 10 });
    if (step === 1) {
      const c = first(results[0]);
      return c ? call('propose_edit_creator', { creator_id: c.id, status }) : say('I found no matching creator.');
    }
    return say(results[1].error ? `I could not propose that: ${results[1].data.error}` : `I proposed changing the status to ${status}. It is waiting for your approval.`);
  }
  if (/draft/i.test(text)) {
    const q = word(/(?:to|for)\s+([\w-]+)\s*$/i) || word(/(?:to|for)\s+([\w-]+)/i) || '';
    if (step === 0) return call('search_creators', { query: q, limit: 10 });
    if (step === 1) {
      const c = first(results[0]);
      if (!c) return say('I found no matching creator to write to.');
      const name = stripTags(c.full_name);
      return call('create_email_draft', {
        creator_id: c.id,
        subject: 'A sponsor chosen for your channel',
        body: `Hello ${name.split(/\s+/)[0]},\n\nWe are Smallfold. We find sponsors for small YouTube channels, and a person looks at each channel by hand. Joining is free.\n\nWould you like to hear more?\n\nWarmly`,
      });
    }
    const r = results.at(-1);
    return say(r.error ? `I could not save the draft: ${r.data.error}` : 'I saved a draft. It is on the Review page for you to read, approve and send.');
  }
  if (/stats|overview|numbers|how many/i.test(text)) {
    if (step === 0) return call('get_overview_stats', {});
    const d = results[0].data;
    return say(results[0].error ? 'I could not load the numbers.' : `You have ${d.total_creators} creators and ${d.emails_sent_all} emails sent. ${d.replies} replies, a reply rate of ${d.reply_rate} percent. ${d.active_deals} deals are active.`);
  }
  if (/find|search|list/i.test(text)) {
    const q = word(/(?:named|called|matching|about)\s+([\w-]+)/i) || '';
    if (step === 0) return call('search_creators', { query: q, limit: 5 });
    const cs = results[0].data.creators || [];
    return say(`I found ${cs.length} creators: ${cs.map((c) => stripTags(c.full_name)).join(', ') || 'none'}.`);
  }
  return say('I can look at your creators, deals, emails and Inbox, write drafts, and propose changes for you to approve.');
}

function respond(body) {
  const plan = script(body.messages);
  const base = { id: `msg_fake_${++counter}`, type: 'message', role: 'assistant', model: body.model, stop_sequence: null };
  const usage = { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const turn = (rest, stop_reason) => {
    const thinking = `Fake reasoning ${counter}.`;
    return { ...base, content: [{ type: 'thinking', thinking, signature: sign(thinking, rest) }, ...rest], stop_reason, usage };
  };
  if (plan.refusal) {
    return { ...base, content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms', explanation: 'Scripted refusal.' }, usage };
  }
  if (plan.tools) {
    const rest = plan.tools.map((t) => ({ type: 'tool_use', id: `toolu_fake_${counter}_${crypto.randomBytes(3).toString('hex')}`, name: t.name, input: t.input }));
    return turn(rest, 'tool_use');
  }
  return turn([{ type: 'text', text: plan.text, citations: null }], 'end_turn');
}

// ---------------------------------------------------------------- pitch drafts
const isPitch = (body) => typeof body.system === 'string' ? body.system.startsWith('You write pitch emails for Smallfold') : Array.isArray(body.system) && String(body.system[0]?.text ?? '').startsWith('You write pitch emails for Smallfold');
function pitchReply(body) {
  const msg = body.messages?.at(-1);
  const prompt = typeof msg?.content === 'string' ? msg.content : (msg?.content ?? []).map((b) => b.text ?? '').join('\n');
  if (!body.output_config?.format) bad('pitch drafts need output_config.format (structured output)');
  const tag = (name) => (prompt.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [])[1]?.trim() ?? '';
  const direction = tag('direction'), greet = tag('greeting_first_name');
  const channel = tag('channel_name') || 'your channel', niche = tag('niche').toLowerCase();
  const sponsor = tag('name').split('</name>')[0];
  const sponsorName = (prompt.match(/<sponsor>\s*<name>([\s\S]*?)<\/name>/) || [])[1]?.trim() || 'the sponsor';
  const subs = tag('subscribers'), views = tag('average_views'), similar = tag('other_channels_in_this_niche_it_has_sponsored');
  const past = [...prompt.matchAll(/<sponsorship><name>([\s\S]*?)<\/name><month>([\s\S]*?)<\/month><\/sponsorship>/g)].map((m) => m[1]);
  void sponsor;
  const hello = greet ? `Hi ${greet},` : 'Hello,';
  const lines = [hello, ''];
  const invent = /ZZ INVENT/.test(sponsorName) ? 'We also work with Zentora Labs and Globex Corp.' : null;
  if (direction === 'to_sponsor') {
    lines.push('We connect brands with small YouTube channels, and a person at Smallfold chooses each match by hand.', '',
      `${tag('channel_name') ? `${tag('channel_name')} is` : 'This is'} a ${niche || 'YouTube'} channel${subs && subs !== 'hidden' ? ` with ${Number(subs).toLocaleString('en-US')} subscribers` : ''}${views && views !== 'unknown' ? ` and about ${Number(views).toLocaleString('en-US')} views per video` : ''}.`);
    if (past.length) lines.push('', `The channel has completed sponsorships with ${past.join(' and ')}.`);
    if (Number(similar) > 0) lines.push('', `You have sponsored ${similar} similar ${Number(similar) === 1 ? 'channel' : 'channels'} before.`);
    if (invent) lines.push('', invent);
    lines.push('', 'If this sounds useful, reply and we will send more detail.');
  } else {
    lines.push('We connect small YouTube channels with sponsors, and a person at Smallfold chooses each match by hand.', '',
      `${sponsorName} may suit ${channel}.${subs && subs !== 'hidden' ? ` The channel has ${Number(subs).toLocaleString('en-US')} subscribers.` : ''}`);
    if (past.length) lines.push('', `You have already worked with ${past.join(' and ')}.`);
    if (Number(similar) > 0) lines.push('', `${sponsorName} has sponsored ${similar} other ${niche || 'similar'} ${Number(similar) === 1 ? 'channel' : 'channels'} before.`);
    if (invent) lines.push('', invent);
    lines.push('', 'Would you like to hear more? A short reply is enough.');
  }
  const subject = direction === 'to_sponsor' ? `A ${niche || 'YouTube'} channel for ${sponsorName}: ${channel}` : `A sponsor that fits ${channel}: ${sponsorName}`;
  const text = JSON.stringify({ subject, body: lines.join('\n') });
  return { id: `msg_fake_${++counter}`, type: 'message', role: 'assistant', model: body.model, stop_sequence: null, content: [{ type: 'text', text, citations: null }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
}

// ---------------------------------------------------------------- server
const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || url.pathname !== '/v1/messages') return send(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'not found' } });
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'invalid JSON' } }); }
    fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), headers: { 'anthropic-beta': req.headers['anthropic-beta'] }, body }) + '\n');
    try {
      if (isPitch(body)) return send(res, 200, pitchReply(body));
      validate(body, req.headers);
      send(res, 200, respond(body));
    } catch (e) {
      if (e instanceof Bad) return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: e.message } });
      console.error(e);
      send(res, 500, { type: 'error', error: { type: 'api_error', message: 'fake server error' } });
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`fake anthropic on http://127.0.0.1:${PORT}`));
