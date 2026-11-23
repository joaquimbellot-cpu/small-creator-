// Creates local-only secrets once (.data/secrets.json) and keeps admin/.env.local in sync.
//   node keys.mjs init      create secrets if missing, write/refresh .env.local, print nothing secret
//   node keys.mjs get KEY   print one value (jwt_secret, anon_key, service_key)
// Only the managed keys are rewritten; any other line the app team adds to .env.local is kept.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = path.dirname(fileURLToPath(import.meta.url));
const secretsFile = path.join(dev, '.data', 'secrets.json');
const envFile = path.join(dev, '..', '.env.local');
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

export function sign(payload, secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function loadSecrets() {
  if (fs.existsSync(secretsFile)) return JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
  const jwt_secret = crypto.randomBytes(32).toString('hex');
  const iat = Math.floor(Date.now() / 1000), exp = iat + 10 * 365 * 24 * 3600;
  const s = {
    jwt_secret,
    anon_key: sign({ role: 'anon', iss: 'smallfold-local', iat, exp }, jwt_secret),
    service_key: sign({ role: 'service_role', iss: 'smallfold-local', iat, exp }, jwt_secret),
    unsubscribe_secret: crypto.randomBytes(24).toString('hex'),
  };
  fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
  fs.writeFileSync(secretsFile, JSON.stringify(s, null, 2), { mode: 0o600 });
  return s;
}

function writeEnv(s) {
  const managed = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: s.anon_key,
    SUPABASE_SERVICE_ROLE_KEY: s.service_key,
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
  };
  // Placeholders: added only when missing, never overwritten.
  const defaults = {
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    SMTP_USER: '',
    SMTP_PASS: '',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: 'claude-sonnet-5-5',
    YOUTUBE_API_KEY: '',
    UNSUBSCRIBE_SECRET: s.unsubscribe_secret,
    // Local fake of the Anthropic API (dev/fake-anthropic.mjs). DRAFT_MODE=mock keeps email drafting offline.
    ANTHROPIC_BASE_URL: 'http://localhost:4010',
    DRAFT_MODE: 'mock',
  };
  // An empty placeholder counts as missing for these. ANTHROPIC_API_KEY gets the local fake key (a real key is never touched).
  // EMAIL_FROM is the test sender: without it every local send fails with "EMAIL_FROM is not set", and the email suite expects this address.
  const fillIfEmpty = { ANTHROPIC_API_KEY: 'local-fake-key', EMAIL_FROM: 'smallfold-test@example.test' };
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split('\n') : ['# Local dev only. Written by admin/dev/start.sh. Never commit.'];
  if (lines.at(-1) === '') lines.pop();
  const seen = new Set();
  const out = lines.map((l) => {
    const m = l.match(/^([A-Z0-9_]+)=/);
    if (!m) return l;
    seen.add(m[1]);
    if (m[1] in fillIfEmpty && l === `${m[1]}=`) return `${m[1]}=${fillIfEmpty[m[1]]}`;
    return m[1] in managed ? `${m[1]}=${managed[m[1]]}` : l;
  });
  for (const [k, v] of Object.entries({ ...defaults, ...managed, ...fillIfEmpty })) if (!seen.has(k)) out.push(`${k}=${v}`);
  fs.writeFileSync(envFile, out.join('\n') + '\n', { mode: 0o600 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, key] = process.argv.slice(2);
  const s = loadSecrets();
  if (cmd === 'init') writeEnv(s);
  else if (cmd === 'get') process.stdout.write(String(s[key] ?? ''));
  else { console.error('usage: keys.mjs init | get KEY'); process.exit(2); }
}
