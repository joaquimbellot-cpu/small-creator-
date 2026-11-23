# Handoff: where Smallfold stands (updated 23 November 2026)

Read this first in a new chat. It replaces the history of the previous one.

## What this is

- **Smallfold**: a public website plus a private back office for the owner. Both are one Next.js 16 app in `admin/`.
- The website pages are built from `src/` by `build.js` into `admin/public/`. A copy is also built into `site/`.
- Working branch: `claude/wonderful-meitner-sjwb8y`. Commit and push all work there. It holds the audit fixes too; the repository's default branch `claude/awesome-lamport-rlk8gy` was brought up to the same commit on 23 November.
- Setup guide: `admin/README.md` (rewritten for Netlify on 22 November). Design decisions: `docs/launch-plan.md`.

## Live now

- **Website and back office:** https://smallfold.netlify.app (deploy `6b03ef4fab4c283ba7c3a5e3`, 23 November: the audit fixes from the `audit-fixes` branch)
  - Netlify project `smallfold`. The site id is on the project's page in Netlify (Project configuration, General). It is not written here.
- **Visitor access:** the Netlify team login was turned off on 22 November at the owner's request. The site is **public**. To lock it again: Project configuration, Access & security, Visitor access, turn team login on.
- **Search engines:** every website page has `<meta name="robots" content="noindex">` (`src/partials/head.html`), so the site is open to anyone with the link but search engines are asked to skip it. Remove that line, and fill in `siteUrl` in `src/content/seo.json`, when the owner wants the site found in search.
- **Still drafts, now visible to the public:** the Privacy and Terms pages have 13 blanks and a "draft" notice. The phone number in `src/content/site.json` is empty.
- **Log in:** at `/login`. The link is at the bottom of the drop-down menu on phones, and on the right of the footer's copyright line on every page.
- Website pages answer with or without `.html`, because Netlify drops it. See `admin/lib/site-pages.ts`.
- **Deploys are manual uploads.** GitHub is not connected to Netlify. There are two ways. Both deploy a clean export of the latest commit, so nothing from your working folder (such as `.env.local`) goes up.
  - **By a person, with the Netlify command-line tool.** The flags below were read from `netlify deploy --help` of version 27.20.1 on 23 November. The deploy itself was not run here.
    1. Export the latest commit to a clean folder: `git archive HEAD | tar -x -C <empty scratch dir>`, then `cd` into that folder.
    2. Install the app's packages there: `(cd admin && npm ci)`. The deploy builds on your computer, so it needs them.
    3. Log in once: `npx -y netlify-cli@27.20.1 login`. It opens a browser. Nothing goes into a file in the project.
    4. Try a draft first: `npx -y netlify-cli@27.20.1 deploy --site smallfold --message "what changed"`. It builds with the settings in `netlify.toml` and prints a draft address. Open it and check it.
    5. When it looks right, go live: `npx -y netlify-cli@27.20.1 deploy --prod --site smallfold --message "what changed"`.
    6. If the CLI asks which project to use, choose `smallfold`. If the local build fails, `--remote` builds on Netlify instead (also listed in `--help`, not tried here). Add `--no-build` only if you built it yourself.
  - **By an agent, with the Netlify MCP tools.**
    1. Export the latest commit to a clean folder, as above.
    2. Call the Netlify MCP `deploy-site`.
    3. In that folder, run `NODE_USE_ENV_PROXY=1 npx -y @netlify/mcp@1.22.1 --site-id <id> --proxy-path "<path it returns>"` (version checked on 23 November; update it on purpose, never use `@latest`). Without `NODE_USE_ENV_PROXY=1`, fetch fails in the sandbox.
- **Bad deploy?** See "Maintaining Smallfold" in `admin/README.md` (roll back in Netlify, then fix and deploy again).
- **Can't test live from the sandbox:** it can't reach `*.netlify.app`, so the owner has to check the live site.

## Supabase (database and login)

- Region Tokyo, free plan. The project reference is in the Supabase dashboard (Project Settings, General). It is not written here.
- **Database:**
  - All 15 migrations in `admin/supabase/migrations/` are applied in production. The last four (`20261123000100` to `000400`) were applied on 23 November at the owner's request, after a backup; their 7 new CHECK constraints were then validated (no existing row broke them).
  - **Not applied yet:** the migrations dated 23 November (`20261123...`), written by the repair job. The owner applies them in order in the SQL Editor, after taking a backup, and only then deploys the new app. Steps: "Maintaining Smallfold" in `admin/README.md`. The first of them has a `VALIDATE` step that needs a check query to come back empty first (see its header).
  - Checked: all 15 public tables have RLS on, and the `anon` role can't select any table or execute any function.
- **Auth settings:**
  - sign-up off;
  - minimum password length 12;
  - secure password change on;
  - `site_url` = https://smallfold.netlify.app;
  - redirect list = `https://smallfold.netlify.app/**`.
- **Free plan email limits:** email templates can't be edited, so the default templates are used. That works: the app passes `redirectTo: <site>/auth/confirm`, and `/auth/hash` reads the tokens. The default sender only reaches the Supabase account's own team addresses, at most 2 per hour. Custom SMTP (Gmail) lifts both limits.
- **Owner:** the owner created their own login in the Supabase dashboard, and `bootstrap_owner` made it the owner. It's the only account. Never put the owner's email in a request or a file.
- **Management API token:** a token for Supabase's management API may still exist. The owner deletes it (Supabase, Account, Access tokens). Its name and details are not written here.

## Sending settings (23 November)

- **Test mode is off** (turned off at the owner's request, in the `settings` table). No email has been sent.
- **The sender postal address is still empty,** so the database refuses every real send (`postal_address_missing`). `SMTP_PASS` is not set either (see the next point). To send, the owner needs both. Settings, then Sending, takes the postal address.
- **Gmail variables set in Netlify on 23 November** (not secret): `SMTP_HOST`=smtp.gmail.com, `SMTP_PORT`=465, `SMTP_SECURE`=true, `SMTP_USER` and `EMAIL_FROM` = the business address on the Contact page (`src/content/site.json`). **`SMTP_PASS` is not set:** it is the Gmail app password, and only the owner types it in (Netlify, Environment variables, tick "Contains secret values"). The new variables take effect at the next deploy, so redeploy after `SMTP_PASS` is in.
- Netlify MCP `manage-env-vars` upsert: send only `siteId`, `upsertEnvVar`, `envVarKey`, `envVarValue`. Adding `newVarContext` or `newVarScopes` gave a 403. Its `getAllEnvVars` output includes the person who last edited a variable, with their email: never copy that anywhere.
- To turn test mode back on: Settings, then Sending, tick **Test mode**. It also needs a test address.

## Netlify environment variables (set)

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |
| `NEXT_PUBLIC_SITE_URL` | |
| `ASSISTANT_DEADLINE_MS` | `50000`, because Netlify functions stop at 60 s |
| `SUPABASE_SERVICE_ROLE_KEY` | secret, Production only |
| `UNSUBSCRIBE_SECRET` | secret, Production only. Also hashes visitor IPs for the website forms |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `EMAIL_FROM` | set 23 Nov (not secret). Take effect at the next deploy |

- `NEXT_PUBLIC_*` values are built in, so changing one needs a redeploy.
- **Not set yet:**
  - `SMTP_PASS` (the Gmail app password, guide Step 2). Only the owner types it in;
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
- **Done on the audit branch:** the back office fonts are now packaged with the app (npm packages `@fontsource/newsreader` and `@fontsource/instrument-sans`) instead of loading from Google Fonts. The public website pages (`src/`) still load Google Fonts.
- Can't measure the live site from the sandbox, so the owner has to say whether it feels faster.

## The owner's standing rules

- Do what the owner asks unless told otherwise. Sub-agents run on Sonnet (model `sonnet`), or Haiku (model `haiku`) for simple scans, never on the most powerful models, and at most 3 at once. The owner changed this on 23 November; it used to say Opus.
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

## Audit and repair job (started 23 November)

- The owner asked for a full audit by 8 specialist agents, then fixes. All work is on the branch `audit-fixes`, made from commit `c3f03b6` (tag `safety-before-audit`). To undo it all, delete that branch: `claude/wonderful-meitner-sjwb8y` was not touched.
- **Pushed and merged on 23 November at the owner's request.** `audit-fixes` was pushed, the fixes went live (see "Live now"), and the branch was merged (fast-forward) into `claude/wonderful-meitner-sjwb8y` and into the repository's default branch `claude/awesome-lamport-rlk8gy`. The repository is public, so the audit reports in `docs/audit/` are public too. Push only when the owner says so, ideally after making the repository private.
- A first attempt (made before the owner switched the leader to another model) is kept, unpushed, on the local branch `audit-sonnet-draft`. It holds only an earlier project map.
- **Done (23 November):** 111 issues found, 99 fixed, 8 need the owner, 4 not fixed with reasons; a QA re-test (9/10) and a security re-audit (8/10) followed, and their follow-ups were fixed. All test suites pass. The owner's to-do list is section 8 of `docs/audit/FULL-REPORT.md`: four new migrations go to the live database BEFORE the code is deployed.
- Reports: `docs/audit/` (`AGENT-BRIEF.md`, `FIX-BRIEF.md`, `00-project-map.md`, `01` to `08` (audit), `09` and `10` (verification), `fixes/` (one log per fix group), `FULL-REPORT.md`). Agents use the local test stack and fake data only. Database changes are new migration files: the owner applies them in production first, then deploys.

## Advertising campaign (started 23 November)

- Everything is in `marketing/`. Start with `marketing/README.md`. `marketing/brand-brief.md` is the only source of facts for ads.
- **Built, not published:** 3 static ads in 1:1 and 9:16 and 2 silent caption-led 9:16 videos, in `marketing/assets/`. They use the website's own pictures; type, logo and motion come from `marketing/tools/` (needs the two `@fontsource` packages, Playwright and ffmpeg).
- **Not generated:** the talking-presenter video (Concept A) and the voice-over video (Concept B). Their prompts are in `marketing/generation-sheet.md`, written to be pasted into Claude chat, where the owner's Higgsfield Ultra unlimited allowance works. It does not work from Claude Code, and the sandbox cannot download from Higgsfield's file hosts.
- Higgsfield credits spent: 0. Balance 7.6. Claude does not spend credits without the owner's explicit go.
- For creators first, button "Apply", YouTube Shorts and Instagram, English. Brands are a later round.
- Before publishing, the owner checks the four points in section 11 of the brief, and turns on each platform's AI-content label. Claude never publishes and never spends ad money.

## Working in the sandbox

- Local test stack: `admin/dev/start.sh` needs the Docker daemon running (it does not start it). It starts Postgres on :54322, the gateway on :54321, the mail catcher on :8025 and the fake Claude on :4010. It stops with a message if Docker, `psql` or `curl` is missing.
- Run the app with `env -u ANTHROPIC_BASE_URL npm run build` / `npm run start` in `admin/`, because the shell exports an `ANTHROPIC_BASE_URL`.
- `dev/start.sh` now writes `EMAIL_FROM=smallfold-test@example.test` into `admin/.env.local` (the email suite expects that sender). If your `.env.local` is older, run `start.sh` again, or add the line by hand. After `dev/reset.sh` the keys change, so restart the app, and run `npm run build` again if you test the built app.
- Tests:
  - all suites: `admin/tests/run-all.sh` (run `reset.sh` before a full run);
  - one website check: `BASE_URL=http://localhost:3000 node tests/website.e2e.cjs`. Playwright must be installed first (see "Tests" in `admin/README.md`). In the build sandbox a copy is in `/opt/node-tools/node_modules`: set `NODE_PATH` to it.
- A dev server with `NEXT_DIST_DIR` rewrites `admin/tsconfig.json`. Restore it with `git checkout -- admin/tsconfig.json`, and delete the extra build folder.
- Unit checks and lint, from `admin/`: `npm run typecheck`, `npm test`, `npm run lint`. The same three run on GitHub for every push and pull request (`.github/workflows/ci.yml`).
- After any change to `src/`, rebuild both copies: `node build.js` (into `site/`) and `npm run build` in `admin/`.
- Sandbox only: if Docker will not start and its log says "containerd is still running", delete the stale `/var/run/docker/containerd/containerd.pid` and the `.sock` files beside it, then start `dockerd` again.

## Erasing a person's data on request (needs the owner's approval)

**Status: a proposal. The owner has not approved it, and it is not legal advice.** A lawyer should say when a request must be honoured and what must be kept. Do nothing until the owner agrees.

Why it needs a procedure: a creator's email, phone and notes live in `creators`, in the emails written to them, and, in lines written before 23 November, in the audit log. The app cannot erase the audit log (nobody can change it, not even the owner).

Steps, for the owner, in the Supabase SQL Editor. Take a backup first (see "Maintaining Smallfold" in `admin/README.md`).

1. **Write down the request:** who asked, when, how you checked it was them. Keep this note without the person's details.
2. **Keep them suppressed.** Make sure the address is in `suppression_list`, so they are never emailed again. Marking the creator "Do not contact" does this (the database adds a `manual` suppression row, and it also keeps one when the creator is deleted). **Never delete a suppression row**: if you do, the person can be emailed again.
3. **Find the rows:** the creator, their deals, their emails (`emails.creator_id`), and any Inbox message from the same address (`contact_messages`).
4. **Delete or blank them.** A creator with deals or sent emails cannot be deleted while those rows exist (the database refuses on purpose). Delete the deals and emails first, or, if a deal must be kept for accounts, blank the creator's email, phone, notes and channel link instead and keep the row. Do it in one transaction (`begin; ... commit;`) and read the counts before you commit.
5. **Old audit lines.** Lines written before the 23 November fix may hold the person's old email, phone or notes inside their details. Lines written after it hold only the word "changed". The audit log refuses edits, so only the **database owner** can change old lines, in one transaction that disables and re-enables the protection triggers (`trg_immutable_row` and `trg_immutable_truncate` on `audit_log`), changes only the lines that name this person, and writes its own audit line saying what was done, when and why (without the person's details). Check that both triggers are enabled again afterwards. Do this only if the lawyer says it is needed: it breaks the "nobody can change the log" promise for those lines.
6. **Other places:** the Gmail Sent folder (messages sent to them), backups (they keep old data until they expire; say so in your reply), and any export file someone saved.
7. **Reply to the person** with what was done and what had to stay (the suppression entry).

Open question for the owner: how long to keep the audit log (for example 12 months), and whether to approve this procedure.

## Later: brand and creator logins

Design notes: `docs/future-portals.md`.
