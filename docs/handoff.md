# Handoff: where Smallfold stands (updated 25 November 2026)

Read this first in a new chat. It replaces the history of the previous one.

## Back office upgrade: LIVE since 25 November 2026

- **What it is:** creators list with a filter panel, creator and sponsor profiles with a sponsorship history (Confirmed and Detected labels), a new Sponsors tab, linking with match suggestions, a deals board with a new first stage "Matched", pitch drafts with Claude from confirmed facts only, a global search (Ctrl+K) and a sponsorship price calculator.
- **Live deploy:** `6b076cb0969b11ad0db431be`, made from the branch `ui-upgrade`. The deploy before it, `6b040d4192fa3138c25671aa` (23 November), is kept by Netlify: to go back, open Netlify, Deploys, pick it and "Publish deploy". The old app works with the upgraded database, except that an export writes two audit lines.
- **Live database:** the eleven migration files `20261125*` were applied on 25 November with the owner's approval, one file per transaction, each checked. The 117 creators were compared row by row with the copy afterwards: nothing changed. All 25 public tables have RLS on and `anon` can read none of them. The fake seed was not loaded.
- **Safety copy in the live database:** schema `backup_20261125` holds a copy of all 16 tables as they were just before the upgrade (117 creators, 285 audit lines). The app and the public cannot read it. Remove it with `drop schema backup_20261125 cascade;` once the upgrade has run well for a few weeks. It is not a backup against losing the whole project.
- **Not checked yet:** nobody has opened the live site since the deploy. Claude's sandbox cannot reach `*.netlify.app`, so the owner has to log in and look at Overview, Creators, Sponsors, Deals and the search.
- **Branches:** `claude/wonderful-meitner-sjwb8y` was fast-forwarded to `ui-upgrade` after the deploy, so both hold the live code. **Never deploy a commit older than this one: it would put the old app back on the upgraded database.**
- **Read these:** `docs/ui-upgrade/04-ui-spec.md` (the screens), `05-build-plan.md` (decisions and the database contract), `06-security-review.md`, `07-qa-report.md`, `08-retest.md`, `09-go-live.md`, and `build/*.md` (one note per agent). The approved clickable prototype is `docs/ui-upgrade/prototype/smallfold-ui-prototype.html` (fake data).
- **Tested before going live:** on a production build against a database rebuilt from scratch, `admin/tests/run-all.sh` ended "ALL SUITES PASSED" (database, 490 unit tests, twelve browser suites). The security review gave 8/10 with no critical or high finding; its four medium findings were fixed and re-tested.
- **Open decisions for the owner:** (1) the price calculator uses its own margin field (20% in the example) while the database still takes 10%, 8% or 5% by deal size; (2) any staff member, a worker too, can approve and send an email, although the rule says "the owner's click"; (3) the creators list now opens sorted by subscribers, high to low; (4) the niche list is the 12 from the prototype.
- **What the owner needs to enter:** sponsors with their details and a contact person; each creator's niche (from the fixed list), country, language, average views and engagement; past sponsorships on each creator's profile. Until then the new filters and suggestions show little.
- **Known limits:** no YouTube scanner, so Detected records only come from imports marked unverified, and there is no list of videos on a profile; no screen to delete a list or a tag; the pitch draft checker catches common mistakes only (its limits are in `docs/ui-upgrade/build/retest-fixes.md`), so a person must read every draft before sending; real Claude drafts were tested only against the local stand-in.
- **Local stack:** `admin/dev/reset.sh` loads both seeds (60 creators, 26 sponsors, 34 contact people, 115 sponsorship records, 19 deals). After a reset, rebuild the app before testing a production build, because the local keys change.

## What this is

- **Smallfold**: a public website plus a private back office for the owner. Both are one Next.js 16 app in `admin/`.
- The website pages are built from `src/` by `build.js` into `admin/public/`. A copy is also built into `site/`.
- Working branch: `claude/wonderful-meitner-sjwb8y`. Commit and push all work there. It holds the audit fixes and, since 25 November, the back office upgrade. The repository's default branch `claude/awesome-lamport-rlk8gy` is still at the 23 November commit, without the upgrade.
- Setup guide: `admin/README.md` (rewritten for Netlify on 22 November). Design decisions: `docs/launch-plan.md`.

## Live now

- **Website and back office:** https://smallfold.netlify.app (deploy `6b076cb0969b11ad0db431be`, 25 November: the back office upgrade; see the section above).
- **Creators in production (24 November): 117,** all status New, source Import: 17 from the first sheet and 100 from the sheet "Small YouTube Creators Worldwide - 100 with emails (Nov 2026)". Each one's notes give the country, score, growth outlook, average views, the reason and the sheet row. Nobody has been emailed yet.
- **Bulk status change:** on Creators, tick creators, then "Change status to", "Change status", "Yes, change" (route `POST /api/creators/status`, at most 200). Only the owner can take creators off Do not contact; a worker's attempt is skipped and counted.
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
  - The eleven migrations dated 25 November (`20261125...`) of the back office upgrade were applied on 25 November. In total 26 migration files are applied in production. There is no migration tracking table in production: check by the objects (for example `select count(*) from niches;` returns 12).
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

## Advertising campaign (version 2, updated 24 November)

- **Version 1 is archived** in `marketing/v1/`. The owner found it bland; do not reuse its ideas.
- **Version 2 is in `marketing/v2/`** (start with its `README.md`). It sells the creator offer, never the company or its story. `product-brief.md` is the only source of facts. The campaign idea is the blank: "Sponsored by ____".
- **Approved by the owner:** the video concept "The Line", as an outtakes reel. Its video is not generated; the prompts and steps for doing it on Higgsfield are in `marketing/v2/README.md`.
- **Rejected by the owner (24 November):** the first static ads in `marketing/v2/assets/static/` (phone selfies with captions). Do not make more like them.
- **Current work: the poster series** in `marketing/v2/posters/`: seven designed posters in two sizes (`out/`), built in HTML and CSS from `src/` with `tools/render.cjs`, following `design-system.md`. Waiting for the owner's reaction.
- **Higgsfield:** 3.44 credits spent in total, 4.16 left. On 24 November the account showed the free plan and refused generation. Claude does not spend credits without the owner's explicit "go" for a quoted batch. Unlimited generations do not work from Claude Code.
- The commission rates and "reply within 2 working days" are still unconfirmed and stay out of the ads.
- Claude never publishes and never spends ad money. The owner turns on each platform's AI-content label where a generated picture or video is used.

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
