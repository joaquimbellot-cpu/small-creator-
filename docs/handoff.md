# Handoff: where Smallfold stands (22 November 2026)

Read this first in a new chat. It replaces the history of the previous one.

## What this is

- **Smallfold**: a public website plus a private back office for the owner. Both are one Next.js 16 app in `admin/`.
- The website pages are built from `src/` by `build.js` into `admin/public/`. A copy is also built into `site/`.
- Working branch: `claude/wonderful-meitner-sjwb8y`. Commit and push all work there.
- Setup guide: `admin/README.md` (rewritten for Netlify on 22 November). Design decisions: `docs/launch-plan.md`.

## Live now

- **Website and back office:** https://smallfold.netlify.app
  - Netlify project `smallfold`, site id `13382a5d-efd4-4324-9a26-37187b574c55`.
- **Visitor access:** the Netlify team login was turned off on 22 November at the owner's request (`update-visitor-access-controls`, `requireSSOTeamLogin: false`, checked afterwards with `get-project`). The site is **public**. To lock it again, call the same operation with `requireSSOTeamLogin: true`.
- **Search engines:** every website page has `<meta name="robots" content="noindex">` (`src/partials/head.html`), so the site is open to anyone with the link but search engines are asked to skip it. Remove that line, and fill in `siteUrl` in `src/content/seo.json`, when the owner wants the site found in search.
- **Still drafts, now visible to the public:** the Privacy and Terms pages have 13 blanks and a "draft" notice. The phone number in `src/content/site.json` is empty.
- **Log in:** at `/login`. The link is at the bottom of the drop-down menu on phones, and on the right of the footer's copyright line on every page.
- Website pages answer with or without `.html`, because Netlify drops it. See `admin/lib/site-pages.ts`.
- **Deploys are manual uploads.** GitHub is not connected to Netlify. To deploy:
  1. Export the latest commit to a clean folder: `git archive HEAD | tar -x -C <empty scratch dir>`.
  2. Call the Netlify MCP `deploy-site`.
  3. In that folder, run `NODE_USE_ENV_PROXY=1 npx -y @netlify/mcp@latest --site-id <id> --proxy-path "<path it returns>"`. Without `NODE_USE_ENV_PROXY=1`, fetch fails in the sandbox.
- **Can't test live from the sandbox:** it can't reach `*.netlify.app`, so the owner has to check the live site.

## Supabase (database and login)

- Project ref: `lmmuymyghsohxrxdhucv`. Region Tokyo, free plan.
- **Database:**
  - All 11 migrations in `admin/supabase/migrations/` were applied.
  - Checked: all 15 public tables have RLS on, and the `anon` role can't select any table or execute any function.
- **Auth settings:**
  - sign-up off;
  - minimum password length 12;
  - secure password change on;
  - `site_url` = https://smallfold.netlify.app;
  - redirect list = `https://smallfold.netlify.app/**`.
- **Free plan email limits:** email templates can't be edited, so the default templates are used. That works: the app passes `redirectTo: <site>/auth/confirm`, and `/auth/hash` reads the tokens. The default sender only reaches the Supabase account's own team addresses, at most 2 per hour. Custom SMTP (Gmail) lifts both limits.
- **Owner:** the owner created their own login in the Supabase dashboard, and `bootstrap_owner` made it the owner. It's the only account. Never put the owner's email in a request or a file.
- **Management API access:** possible through a personal access token saved as a network secret for `api.supabase.com`. The owner was told to delete it after the first successful login. On 22 November (second chat) it still worked.

## Netlify environment variables (set)

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |
| `NEXT_PUBLIC_SITE_URL` | |
| `ASSISTANT_DEADLINE_MS` | `50000`, because Netlify functions stop at 60 s |
| `SUPABASE_SERVICE_ROLE_KEY` | secret, Production only |
| `UNSUBSCRIBE_SECRET` | secret, Production only |

- `NEXT_PUBLIC_*` values are built in, so changing one needs a redeploy.
- **Not set yet:**
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (Gmail, guide Step 2);
  - `ANTHROPIC_API_KEY` (Claude page and email drafts);
  - `YOUTUBE_API_KEY` (optional).
- **Secret keys:** the sandbox's safety rules stop Claude from reading secret keys. The owner copies them in, by hand or with Claude in Chrome. Never ask for keys in the chat.

## Still to do, in order

1. **First live login: done.** On 22 November the database shows the owner's sign-in and an `auth.login` audit line from the live app (21:08 UTC), then one `assistant.message` line at 21:10. Checked from counts and dates only.
2. **Owner's security steps:**
   - turn on two-step login (Settings, then Security). Not done yet: the database has no two-step factor;
   - delete the Supabase token named `smallfold`.
3. **Gmail.** Set the SMTP variables in Netlify, then turn on Supabase custom SMTP with the same details.
4. **Anthropic API key for the Claude page.**
   - It is billed per use, separately from a Claude.ai plan.
   - Daily cap: `ASSISTANT_DAILY_LIMIT`, default 100.
   - A cheaper model can be chosen with `ANTHROPIC_ASSISTANT_MODEL`.
5. **Site is public (done 22 November).** Left to do before telling people about it: the legal pages (blanks and draft notice), the phone number or removing its line, and `noindex` (see above).
6. **Optional:**
   - connect the GitHub repository in Netlify, for automatic deploys;
   - a custom domain. If added, update `NEXT_PUBLIC_SITE_URL` and Supabase's site URL and redirect list.

## Speed (22 November)

- **Why it was slow:** Supabase is in Tokyo, and Netlify's free plan runs the app's server steps in the US. Each trip between them costs a fraction of a second, and a back-office page made about four of them one after another.
- **Done:** the login check (`getClaims()` in `admin/proxy.ts` path and `admin/lib/auth/staff.ts`) now verifies the token on the server instead of asking Supabase. The 2FA level is checked only when the profile is hidden. A page now needs one or two database trips. The profile is still read from the database on every request, so a deactivated person is blocked at once. If the project ever signs with a shared secret, `getClaims()` falls back to the old slower check by itself.
- **Done:** `/assets/*` and `robots.txt` skip the app's proxy (matcher in `admin/proxy.ts`). Their headers and a one-hour browser cache are in `netlify.toml`.
- **Not possible on the free plan:** moving the server steps to Tokyo. Netlify's function region is a Pro-plan setting. With Pro, set it to the region nearest Tokyo and redeploy.
- **Not done:** the fonts still load from Google Fonts. Self-hosting them would save two connections on every first visit.
- Can't measure the live site from the sandbox, so the owner has to say whether it feels faster.

## The owner's standing rules

- Do what the owner asks unless told otherwise. All sub-agents run on Opus (model `opus`).
- Personal data (emails, phone numbers) must never be readable from the public website. Use row-level security.
- Every API route checks the session and the role and validates its input. Login attempts are rate-limited.
- The audit log records who viewed, edited, exported or sent what, and when.
- Secrets:
  - none in code or git;
  - `.env.example` lists every variable;
  - keys never go into the chat;
  - the owner's email is private.
- No home-made password system. Supabase Auth handles login.
- Claude never invents facts about a creator, and never receives a creator's email, phone or notes.
- Nothing is sent without the owner's click on "Send". Sending happens on the server only.
- Every email carries the sender's identity and an opt-out line. Opt-outs and "do not contact" block all sends.
- Only fake data during development. Never send a real email while building.

## Working in the sandbox

- Local test stack: `admin/dev/start.sh` starts Docker (Postgres on :54322, gateway on :54321, mail catcher on :8025, fake Claude on :4010). If the Docker daemon is down, start `dockerd` first.
- Run the app with `env -u ANTHROPIC_BASE_URL npm run build` / `npm run start` in `admin/`, because the shell exports an `ANTHROPIC_BASE_URL`.
- To run the email suite, start the app with `EMAIL_FROM=smallfold-test@example.test` in its environment (`dev/start.sh` does not set it). Without it, every send fails with "EMAIL_FROM is not set". After `dev/reset.sh` the keys change, so run `npm run build` again before testing.
- Tests:
  - all suites: `admin/tests/run-all.sh` (run `reset.sh` before a full run);
  - one website check: `BASE_URL=http://localhost:3000 NODE_PATH=/opt/node-tools/node_modules node tests/website.e2e.cjs`.
- A dev server with `NEXT_DIST_DIR` rewrites `admin/tsconfig.json`. Restore it with `git checkout -- admin/tsconfig.json`.
- After any change to `src/`, rebuild both copies: `node build.js` (into `site/`) and `npm run build` in `admin/`.
