// Local mail catcher. SMTP on 1025 (accepts anything, delivers nothing), HTTP on 8025.
// Every message is saved to admin/dev/.mail/<time>-<n>.eml. No mail ever leaves this machine.
//   GET /                 HTML list            GET /messages          JSON list
//   GET /messages/<id>    raw .eml             GET /messages/<id>/json  decoded subject/body/links
//   GET /latest?to=addr   newest decoded message for an address (404 if none)
//   DELETE /messages      clear everything
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.mail');
fs.mkdirSync(dir, { recursive: true });
let counter = 0;

function save(from, rcpts, raw) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(++counter).padStart(3, '0')}`;
  const head = `X-Envelope-From: ${from}\r\nX-Envelope-To: ${rcpts.join(', ')}\r\n`;
  fs.writeFileSync(path.join(dir, id + '.eml'), head + raw);
  console.log(`saved ${id} from=${from} to=${rcpts.join(',')}`);
}

// ---- SMTP (just enough for nodemailer and GoTrue)
net.createServer((sock) => {
  let buf = '', data = null, from = '', rcpts = [], auth = null;
  const send = (s) => sock.write(s + '\r\n');
  send('220 smallfold-mailcatcher ESMTP');
  const line = (l) => {
    if (data) {
      if (l === '.') { save(from, rcpts, data.join('\r\n') + '\r\n'); data = null; from = ''; rcpts = []; return send('250 OK queued'); }
      data.push(l.startsWith('..') ? l.slice(1) : l); return;
    }
    if (auth) {                       // accept any credentials
      if (auth === 'user') { auth = 'pass'; return send('334 UGFzc3dvcmQ6'); }
      auth = null; return send('235 2.7.0 Authentication successful');
    }
    const cmd = l.split(' ')[0].toUpperCase();
    if (cmd === 'EHLO') { send('250-smallfold-mailcatcher'); send('250-8BITMIME'); send('250-SIZE 20971520'); return send('250 AUTH PLAIN LOGIN'); }
    if (cmd === 'HELO') return send('250 smallfold-mailcatcher');
    if (cmd === 'AUTH') {
      const p = l.split(' ');
      if (p[1]?.toUpperCase() === 'LOGIN') { if (p[2]) { auth = 'pass'; return send('334 UGFzc3dvcmQ6'); } auth = 'user'; return send('334 VXNlcm5hbWU6'); }
      if (p[2]) return send('235 2.7.0 Authentication successful');
      auth = 'plain'; return send('334 ');
    }
    if (cmd === 'MAIL') { from = (l.match(/<([^>]*)>/) || [null, ''])[1]; return send('250 OK'); }
    if (cmd === 'RCPT') { rcpts.push((l.match(/<([^>]*)>/) || [null, ''])[1]); return send('250 OK'); }
    if (cmd === 'DATA') { data = []; return send('354 End data with <CR><LF>.<CR><LF>'); }
    if (cmd === 'RSET') { from = ''; rcpts = []; return send('250 OK'); }
    if (cmd === 'NOOP') return send('250 OK');
    if (cmd === 'QUIT') { send('221 Bye'); return sock.end(); }
    send('502 Command not implemented');
  };
  sock.on('data', (c) => {
    buf += c.toString('latin1');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); line(l); }
  });
  sock.on('error', () => {});
}).listen(1025, '127.0.0.1', () => console.log('smtp on 1025'));

// ---- minimal MIME decoding so tests can read links out of messages
const qp = (s) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
function parseMsg(raw) {
  const split = (t) => { const m = t.match(/\r?\n\r?\n/); return m ? [t.slice(0, m.index), t.slice(m.index + m[0].length)] : [t, '']; };
  const hdrs = (h) => Object.fromEntries(h.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).map((x) => { const i = x.indexOf(':'); return [x.slice(0, i).toLowerCase(), x.slice(i + 1).trim()]; }));
  const bodies = [];
  const walk = (h, b) => {
    const ct = h['content-type'] || 'text/plain';
    const bm = ct.match(/boundary="?([^";]+)"?/i);
    if (/multipart/i.test(ct) && bm) {
      for (const part of b.split('--' + bm[1]).slice(1)) { if (part.startsWith('--')) break; const [ph, pb] = split(part.replace(/^\r?\n/, '')); walk(hdrs(ph), pb); }
      return;
    }
    const enc = (h['content-transfer-encoding'] || '').toLowerCase();
    bodies.push(enc === 'quoted-printable' ? qp(b) : enc === 'base64' ? Buffer.from(b.replace(/\s/g, ''), 'base64').toString() : b);
  };
  const [h, b] = split(raw);
  const H = hdrs(h);
  walk(H, b);
  const body = bodies.join('\n');
  const links = [...new Set([...body.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0].replace(/&amp;/g, '&')))];
  return { from: H['x-envelope-from'], to: H['x-envelope-to'], subject: H.subject, date: H.date, body, links };
}
const list = () => fs.readdirSync(dir).filter((f) => f.endsWith('.eml')).sort().map((f) => {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const m = parseMsg(raw);
  return { id: f.slice(0, -4), from: m.from, to: m.to, subject: m.subject, date: m.date, size: raw.length };
});

// ---- HTTP viewer
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o, c = 200) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'DELETE' && u.pathname === '/messages') {
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.eml')) fs.unlinkSync(path.join(dir, f));
      return json({ ok: true });
    }
    if (u.pathname === '/messages') return json(list());
    if (u.pathname === '/latest') {
      const to = (u.searchParams.get('to') || '').toLowerCase();
      const hit = list().filter((m) => !to || (m.to || '').toLowerCase().includes(to)).pop();
      if (!hit) return json({ error: 'none' }, 404);
      return json({ id: hit.id, ...parseMsg(fs.readFileSync(path.join(dir, hit.id + '.eml'), 'utf8')) });
    }
    const m = u.pathname.match(/^\/messages\/([\w-]+)(\/json)?$/);
    if (m) {
      const raw = fs.readFileSync(path.join(dir, m[1] + '.eml'), 'utf8');
      if (m[2]) return json({ id: m[1], ...parseMsg(raw) });
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(raw);
    }
    if (u.pathname === '/') {
      const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const rows = list().reverse().map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.to)}</td><td><a href="/messages/${x.id}">${esc(x.subject)}</a></td></tr>`).join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><title>Mail catcher</title><h1>Local mail catcher</h1><table border=1 cellpadding=4><tr><th>Date</th><th>To</th><th>Subject</th></tr>${rows}</table>`);
    }
    json({ error: 'not found' }, 404);
  } catch (e) { json({ error: String(e.message) }, 404); }
}).listen(8025, '127.0.0.1', () => console.log('http on 8025'));
