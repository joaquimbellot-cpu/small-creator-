// Creates the two seed logins through the GoTrue admin API (service key, direct to GoTrue).
// app_metadata.role is what the database trigger turns into profiles.role.
// Fake dev-only passwords, safe to commit; they only work against the local stack.
import { loadSecrets } from '../../dev/keys.mjs';
import { SEED_USERS } from './users.mjs';

const GOTRUE = process.env.GOTRUE_URL || 'http://127.0.0.1:9999';
const { service_key } = loadSecrets();


for (const u of SEED_USERS) {
  const res = await fetch(`${GOTRUE}/admin/users`, {
    method: 'POST',
    headers: { authorization: `Bearer ${service_key}`, apikey: service_key, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: u.email, password: u.password, email_confirm: true,
      app_metadata: { role: u.role }, user_metadata: { full_name: u.full_name },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) console.log(`created ${u.email} (${u.role})`);
  else if (body.error_code === 'email_exists') console.log(`exists  ${u.email}`);
  else { console.error(`failed ${u.email}: ${res.status} ${JSON.stringify(body)}`); process.exit(1); }
}
