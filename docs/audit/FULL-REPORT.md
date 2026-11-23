# Smallfold back office: full audit report

Date: 23 November 2026. Branch: `audit-fixes` (made from commit `c3f03b6`, tag `safety-before-audit`). Eight specialist agents (six on Sonnet, two on Haiku) read the code, ran the app on the local test stack with fake data, and wrote the reports `01` to `08` in this folder. Nothing touched production. This file merges their 126 findings into one list of 111.

## Result after the repair phase (read this first)

- **Branch:** `audit-fixes` (26 commits after the safety tag `safety-before-audit`, 154 files changed). Not pushed: the repository is public.
- **The 111 issues:** 99 fixed, 8 need your decision, 4 not fixed on purpose or because they are large (each with its reason in the table below).
- **Verification:** a QA re-test (score 9/10) and a read-only security re-audit (8/10) found no regression and 10 more small issues. They also found one problem that the repairs themselves had caused: `http://` channel links were refused. All of these are fixed except two: one needs your Supabase settings (V04), and one is only partly fixed (V08). See section 7.
- **Tests on the final code** (fresh fake data): database tests about 314 checks, 125 unit tests, and every browser suite (QA 72, creators 62, deals 47, email 51, website 28, forms 96, Claude page 51, login 29). All pass, and lint is clean.
- **Open High issues:** none that code can fix. H02 (Supabase's own login limit) and H03 (how far to trust workers with contact details) are your decisions.
- **Live since 23 November:** the four migrations were applied to the live database (after a backup, and all 7 new rules validated), and the site was deployed (deploy `6b03ef4f`).

## 1. Executive summary

1. The back office is built on a careful foundation: every page and API checks the login and the role, the database repeats those checks, the public key reads nothing, and no secret is in the code or the git history.
2. No Critical issue was found: no outsider could read personal data, take over an account or send an email without a click.
3. Seven issues are High. The worst for the business is that the one-click "Unsubscribe" button in Gmail and Yahoo does nothing (H01), which breaks your opt-out rule and the large mail providers' rules.
4. Three High issues are about outages: when the login service is down, correct passwords are called wrong and lock people out (H05); a silent Claude or mail server can hang a request and leave an email stuck as "sending" (H06, H07).
5. Two High issues need your decision: the 5-try login limit can be skipped by calling Supabase directly (H02, fixed by a Supabase setting), and any worker can copy every creator's email, phone and notes through the database API without an audit line (H03, a trust and design choice).
6. The last High issue is the screen people see when something fails: a bare white error page with no way back (H04).
7. Medium issues are mostly safeguards that a worker can undo (lifting "do not contact"), missing audit lines, hidden errors, phone layout problems, and setup docs that a newcomer cannot follow for email and browser tests.
8. Performance is fine at today's size, but every page asks Supabase several times across the Pacific, and link prefetching multiplies those calls.
9. Average score before fixes: 7.0 out of 10 (table below). The repair phase fixes everything that does not need your decision; section 5 lists what does.
10. The GitHub repository is public, so this branch is not pushed yet: these reports describe weaknesses that the live site still has until the fixes are deployed.

## 2. Scores

| Area | Agent (model) | Report | Before | After |
|---|---|---|---|---|
| Architecture and code quality | 1 (Sonnet) | `01-architecture.md` | 8/10 | 9/10 (estimate) |
| Security | 2 (Sonnet) | `02-security.md` | 7/10 | 8/10 (re-audited, `10-security-reaudit.md`) |
| Database | 3 (Sonnet) | `03-database.md` | 7/10 | 8/10 (estimate) |
| Functional QA | 4 (Sonnet) | `04-functional-qa.md` | 8/10 | 9/10 (re-tested, `09-qa-retest.md`) |
| Email and Claude | 5 (Sonnet) | `05-email-claude.md` | 7/10 | 8/10 (estimate) |
| UI, UX and accessibility | 6 (Sonnet) | `06-ui-ux-accessibility.md` | 7/10 | 8/10 (estimate) |
| Performance and reliability | 7 (Haiku) | `07-performance-reliability.md` | 6/10 | 8/10 (estimate) |
| Docs and setup | 8 (Haiku) | `08-docs-setup.md` | 6/10 | 8/10 (estimate) |
| **Average** | | | **7.0** | **8.3** |

"Re-audited" and "re-tested" scores come from the verification agents. "Estimate" is the leader's judgement from the fix logs and the passing tests, because those areas were not audited again.

## 3. Merged issue list

Sorted by severity. "From" names the agents' IDs, where the full detail and the exact fix are. Status: Open, Fixed, Not fixed (with the reason), or Needs me (your decision).

### High (7)

| ID | Area | Where | What is wrong | Fix | Effort | Status | From |
|---|---|---|---|---|---|---|---|
| H01 | Email | `lib/email/send.ts:45,52`, `mailer.ts:37` | The List-Unsubscribe header points at the confirm page, so the one-click Unsubscribe in Gmail and Yahoo shows success but records nothing. | Point the header at `/api/unsubscribe/<token>`; keep the page link in the footer. | small | Fixed | EML-01 |
| H02 | Security | `app/(auth)/login/actions.ts:28-40` | The 5-try limit lives only in the app. Calling Supabase Auth directly with the public key allowed 10 wrong passwords and 8 wrong 2FA codes with no lock. | Supabase settings: turn on CAPTCHA protection and check the Auth rate limits; optionally Auth hooks. Keep the app limit. | medium | Needs me | SEC-01 |
| H03 | Security, database | RLS `staff_select_creators`, `api/creators/export` | Any worker can read every creator's email, phone and notes through the REST API with their own login, bypassing the owner-only export and the audit log. | Your choice: trust staff and add mitigations (audit page views, 2FA for workers), or redesign so personal fields come only through audited functions (large). | large | Needs me (narrowed: M05 and M07 fixed) | DB-01, SEC-05 |
| H04 | UX | `admin/app` (no `error.tsx`, `not-found.tsx`, `global-error.tsx`) | A failed action replaces the whole screen with Next's bare error page; 404 pages are unstyled with no way back. | Add designed error, not-found and global-error pages that keep the navigation. | small | Fixed | UX-01, UX-07, ARC-13 |
| H05 | Reliability | `app/(auth)/login/actions.ts:39-42` | When Supabase Auth is down, a correct password is reported as wrong and counted as a failure; the 6th try locks the account for 15 minutes. | Treat an outage as "try again later" and do not record it as a failed attempt. | small | Fixed | PERF-01 |
| H06 | Reliability | `lib/drafting/index.ts:27`, `emails/compose/actions.ts` | Drafting calls Claude with no timeout (10 minutes, 3 tries). A silent Claude kept compose waiting over 200 s; the host then cuts the request off midway. | One shared Claude client with a 25 s timeout; stop starting batches after about 40 s and list the rest. | small | Fixed | PERF-02, ARC-06 |
| H07 | Reliability, email | `lib/email/mailer.ts:23-28`, send route, `reserve_send` | SMTP has no timeouts and the send has no time limit. A stopped send leaves the email "sending" forever (it blocks the limit and gap and nobody can change it). "Sent but not recorded" shows a generic error. | Mail timeouts, a route time limit, a `release_stale_sending()` repair, and a clear "it WAS sent" message. | small | Fixed | PERF-03, DB-04, ARC-04 |

### Medium (44)

| ID | Area | Where | What is wrong | Fix | Effort | Status | From |
|---|---|---|---|---|---|---|---|
| M01 | Database | `staff_update_creators` policy | A worker can lift "do not contact" with one edit, and a hand-set "do not contact" is not an address-level block. | Trigger: only the owner may lift it; setting it also adds the address to the suppression list. | small | Fixed | DB-02, EML-03 |
| M02 | Database | `emails.creator_id ... on delete cascade` | Deleting a creator deletes their sent-email history and can forget their opt-out. | Before-delete trigger keeps the opt-out; sent history blocks the delete (drafts are removed). | medium | Fixed | DB-03 |
| M03 | Security | `creators.email`, `emails.to_email`, `mailer.ts:30` | Any text is accepted as an email address; `a@x, b@x` sends to both and slips past the suppression check. | Format constraints (added NOT VALID, then validated) and the mailer refuses more than one recipient. | small | Fixed | SEC-02, DB-15 |
| M04 | Security | `lib/supabase/server.ts`, `lib/supabase/proxy.ts` | The session cookie can be read by scripts, is not marked Secure and lasts about 400 days. | httpOnly, Secure in production, 30 days. | small | Fixed | SEC-03 |
| M05 | Security | `creators/page.tsx:45` | Opening `/creators?creator=ID&edit=1` shows the full record with no audit line. | Log `creator.viewed` there too. | small | Fixed | SEC-04 |
| M06 | Security | `log_audit()` | Any staff member can write fake audit lines, including owner-type events. | Owner-type actions only for the owner. | small | Fixed | SEC-06, DB-12 |
| M07 | Security | `settings/security/actions.ts`, `settings/layout.tsx` | Only the owner can turn on two-step login; workers cannot. | Each staff member can enrol their own factor; the Security page is shown to workers. | medium | Fixed | SEC-07 |
| M08 | Security | `login_allowed()` | Anyone who knows the owner's address can lock the owner out again and again. | Lock per email and IP after 5; per email from all addresses only after 20. | medium | Fixed | SEC-08 |
| M09 | Code | `lib/audit.ts:21`, `api/creators/export` | The export still goes out if the audit line fails, and the line is written only after all rows are read. | Write the line first; stop the export if it cannot be written. | small | Fixed | ARC-01, PERF-09 |
| M10 | Code | deals, emails actions; review, templates, users, claude pages | Several actions and pages hide database errors: the click does nothing, or the page looks empty. | Return and show a plain error. | medium | Fixed | ARC-02, ARC-05 |
| M11 | Code | `settings/users/actions.ts:39,61,75` | Removing a user does not check that the account ban worked, and logs "removed" anyway. | Check the result; log only on success. | small | Fixed | ARC-03 |
| M12 | Code | about 10 `as unknown as` casts | No generated database types, so a renamed column fails only at run time. | Generate types and remove the casts. | large | Not fixed: large (needs the Supabase type generator and touches about 10 files); recommended next | ARC-07 |
| M13 | Code | `lib/api`, `lib/auth`, `lib/deals` | The security helpers have no unit tests. | Add tests for the API wrapper, client IP and amounts. | medium | Fixed (API wrapper, client IP, mailer, deal amounts) | ARC-08 |
| M14 | Code | repository | No CI and no lint step. | GitHub workflow running typecheck, tests and oxlint. | small | Fixed (the workflow has not run on GitHub yet) | ARC-09 |
| M15 | Email, Claude | `lib/drafting/validate.ts` | The draft check only looks for `{{`: drafts with invented sponsors, prices, outside links or placeholders are saved. | Stricter checks (links other than the channel, prices, placeholders, fake unsubscribe lines, word cap). | medium | Fixed | EML-02 |
| M16 | Email | no screen | There is no screen to see or add opt-outs (for example a reply saying "unsubscribe"). M01 gives an address-level block through "do not contact". | An Opt-outs page is a new screen. | medium | Needs me (new screen) | EML-03 |
| M17 | Legal | creators, `footer.ts`, privacy page | Cold-email gaps (observation, not legal advice): no record of where each address came from or the basis, no notice line, draft privacy page. | Decide with a lawyer; then add source and basis fields and a footer line. | large | Needs me | EML-11 |
| M18 | QA | `lib/creators/csv.ts:16` | Export puts a quote before phone numbers that start with "+", so your own export cannot be re-imported (46 of 67 rows refused). | Leave phone-like values alone; strip a guard quote on import. | small | Fixed | QA-01 |
| M19 | QA | `creators/page.tsx`, `deals/page.tsx` | A page number past the end shows "No creators yet" or "Deals could not be loaded". | Send the person to the last page. | small | Fixed | QA-02 |
| M20 | QA | `/deals` | A deal's amount cannot be changed after it is created. | An "edit amount" action is a new feature. | medium | Needs me (new feature) | QA-03 |
| M21 | UX | `/deals`, `/settings/users` on phones | The page scrolls sideways and the stage dropdown shrinks to an arrow. | Clip the hidden header; give the dropdown a minimum width. | small | Fixed | UX-02, QA-09 |
| M22 | UX | `deals/StageForm.tsx` | The stage dropdown saves on every arrow-key press. | Save only when the person confirms. | small | Fixed | UX-03 |
| M23 | UX | navigation | No phone menu: the links wrap into three rows, about 200 px of header. | One scrollable row on small screens. | medium | Fixed | UX-04 |
| M24 | UX | no `loading.tsx` | A slow page change shows nothing for seconds. | A loading state. | small | Fixed (a line under the clicked link; a route-wide loading screen was tried and dropped, because it turned server redirects into browser redirects) | UX-05 |
| M25 | UX | tables | Wide tables are cut off with no hint; a long name pushes columns off screen. | Wrap long text; shorter badge. | small | Fixed | UX-06 |
| M26 | Reliability | `lib/auth/staff.ts:25-31` | A short database outage tells staff "This account does not have access". | Tell an outage apart from "no access". | small | Fixed | PERF-04 |
| M27 | Performance | `NavLinks.tsx`, `CreatorsTable.tsx` | Link prefetching makes 12 to 33 extra server renders per page view, each with session checks. | Turn prefetch off on those links. | small | Fixed | PERF-05 |
| M28 | Performance | Supabase project setting | Tokens are signed with a shared secret, so every page asks Supabase Auth twice before reading data. | Switch the project to asymmetric signing keys in the dashboard. | medium | Needs me | PERF-06 |
| M29 | Performance | `deals/page.tsx:43-44` | The deals page loads up to 1,000 creators; above that the dropdown silently stops. | Notice when the list is cut; later a search box. | medium | Fixed (notice; a search box later) | PERF-07 |
| M30 | Performance | `api/creators/import` | Import reads every creator before checking; a failing chunk can outrun the host; a partial import writes no audit line. | Check only the incoming addresses; always write the audit line. | medium | Fixed | PERF-08, ARC-19 |
| M31 | Monitoring | no health route; Overview | No health check and no sign of failed sends; failed audit writes only reach the console. | Health route and a failed-sends tile; an outside uptime monitor is your choice. | medium | Fixed (health route and tile; the outside monitor: Needs me) | PERF-10 |
| M32 | Database | `recent_activity()` | The activity list scans whole tables (3.6 s at 50,000 creators). | Compare ids as uuids. | small | Fixed | DB-05 |
| M33 | Database, privacy | `audit_row()` | The audit log copies creators' email, phone and notes, and nothing can erase them. | Record "changed" instead of the values for personal fields; document an erasure procedure. | small | Fixed (the erasure procedure waits for your approval) | DB-06 |
| M34 | Docs | `admin/README.md:243-246` | Says visitors cannot open the site; it is public. | Update. | small | Fixed | DOC-01 |
| M35 | Docs | `admin/README.md` Step 5 | The site address is set only after the first deploy; until then unsubscribe links point at localhost. | Set it first. | small | Fixed | DOC-02 |
| M36 | Setup | `admin/dev/keys.mjs` | The local setup never writes `EMAIL_FROM`, so every local send fails. | Write the test sender. | small | Fixed | DOC-03 |
| M37 | Docs | `admin/README.md` prerequisites | Missing tools, image pulls and ports. | List them. | small | Fixed | DOC-04 |
| M38 | Setup | `admin/package.json`, `tests/run-all.sh:9` | Playwright is not declared; the runner falls back to a sandbox path. | Document the install; keep the fallback optional. | medium | Fixed | DOC-05 |
| M39 | Docs | `admin/README.md` Tests | Restart after reset, `env -u ANTHROPIC_BASE_URL` and the login limit are not explained. | Add them. | small | Fixed | DOC-06 |
| M40 | Docs | `docs/handoff.md` deploy | Deploy steps exist only as agent-tool calls; the npx package is not pinned. | Add a human command-line path; pin the version. | medium | Fixed | DOC-07 |
| M41 | Docs | `docs/handoff.md:47,64` | Contradicts itself about which SMTP variables are set. | Fix. | small | Fixed | DOC-08 |
| M42 | Docs | `README.md` | Says `site/` is what goes online. | Explain that Netlify builds `admin/`. | small | Fixed | DOC-09 |
| M43 | Docs, security | `docs/handoff.md` | The public repository describes a live Supabase management token. | Remove the token details; you delete the token. | small | Fixed (deleting the token: Needs me) | DOC-10 |
| M44 | Docs | none | No guide for adding migrations, finding logs, backups, rollback or key rotation. | Add a "Maintaining Smallfold" section. | medium | Fixed | DOC-11 |

### Low (60)

| ID | Area | Where | What is wrong | Fix | Effort | Status | From |
|---|---|---|---|---|---|---|---|
| L01 | Security | `lib/auth/ip.ts:19-21` | Off Vercel, a missing Netlify header falls back to the client-sent `x-real-ip`. | On Netlify never read `x-real-ip`. | small | Fixed (how Netlify is detected is unverified in production) | SEC-09 |
| L02 | Security | `lib/forms/public.ts` | Public forms have no overall cap and no CAPTCHA. | Global hourly cap; CAPTCHA needs an account. | medium | Fixed (global cap; CAPTCHA: Needs me) | SEC-10 |
| L03 | Security | `lib/api/handler.ts:42-49` | JSON routes accept `text/plain` bodies (a cross-site form could post). | Require `application/json` when a body is expected. | small | Fixed | SEC-11 |
| L04 | Security | `forgot-password/actions.ts:12` | No limit on password-reset emails. | 3 per hour per email and per IP. | small | Fixed | SEC-12 |
| L05 | Database | `creators.channel_url`, `contact_messages` | The database does not check channel links or the length of form messages. | Constraints (NOT VALID, then validated). | small | Fixed | SEC-13, DB-15 |
| L06 | Security | `netlify.toml`, `proxy.ts` | `/assets` and robots.txt lack some headers; no Permissions-Policy on website pages. | Add the headers. | small | Fixed | SEC-14 |
| L07 | Database | `creator_summaries` | The view adds up all deals and emails for every list page. | Lateral joins. | small | Fixed | DB-07 |
| L08 | Database | trigram indexes | The search indexes are not used under row-level security. | Search through a function (only matters past a few thousand creators). | medium | Not fixed, on purpose: it only matters past a few thousand creators and would replace the main list query | DB-08 |
| L09 | Database | `audit_log`, `deals`, foreign keys | Missing indexes for the audit filters, the deals sort and some foreign keys. | Add the indexes. | small | Fixed | DB-09 |
| L10 | Database | `audit_log` | No retention plan; the audit page counts exactly. | Estimated count now; how long to keep the log is your call. | medium | Fixed (estimated count; retention: Needs me) | DB-10 |
| L11 | Database | `20261121000500_rls_and_grants.sql:57-60` | The default-privileges revoke does nothing. | Correct statement plus a test. | small | Fixed | DB-11 |
| L12 | Database | `recent_activity` vs refresh route | `creator.subscribers_refreshed` never shows on the Overview (name mismatch). | Use the same name. | small | Fixed | DB-13 |
| L13 | Database | `suppression_after` | A creator added after their address was suppressed shows "New". | Before-insert trigger. | small | Fixed | DB-14 |
| L14 | Database | `creators`, `contact_messages` | Workers can write bookkeeping columns (`user_id`, `created_by`, `handled_by`). | Guards in triggers. | small | Fixed | DB-16 |
| L15 | Database | `admin/dev/migrate.sh` | No rollback notes; the migration record is written outside the migration's transaction. | Same transaction; rollback notes in each new migration. | small | Fixed | DB-17 |
| L16 | Business | commission, `deal_stage`, currency | The commission tier drops at $500 and $2,000; there is no "lost" stage; USD only. | Your call. | small | Needs me | DB-18, QA-05 |
| L17 | Database | design | Future brand and creator portals need new roles, links and safe views. | Design notes in the docs. | large | Fixed (docs/future-portals.md) | DB-19 |
| L18 | Code | `lib/auth/staff.ts:13,49,64` | `mfaRequired` is always false (dead code). | Remove it. | small | Fixed | ARC-10 |
| L19 | Code | login and unsubscribe actions | Some database call results are ignored or errors not logged. | Log them. | small | Fixed | ARC-11 |
| L20 | Code | `lib/email/send.ts:21-24` | Raw mail-server errors are stored and shown. | Fixed wording; detail to the server log. | small | Fixed | ARC-12, PERF-14 |
| L21 | Code | several files | Small lint warnings. | Clean up. | small | Fixed (lint is clean) | ARC-14 |
| L22 | Code | `lib/youtube/index.ts` | Reads a secret key without `server-only`. | Add it. | small | Fixed | ARC-15 |
| L23 | Code | several files | Three ways to validate ids; helpers copied in several places. | One shared helper. | medium | Not fixed, on purpose: a refactor with no bug behind it, across many files | ARC-16 |
| L24 | Code | `lib/**/e2e.cjs` | Test scripts live inside `lib/`; unused exports. | Move and tidy. | medium | Not fixed, on purpose: moving the test scripts would churn the test runner for no gain | ARC-17 |
| L25 | Code | `tsconfig.json`, `vitest.config.ts`, `package.json` | Leftover build folders, a config warning, no `engines` field. | Clean up. | small | Fixed (npm prune skipped: it would add 75 packages) | ARC-18, DOC-22 |
| L26 | QA | `creators/actions.ts:37` | Adding a creator by hand does not check for the same channel. | Check like the import does. | small | Fixed | QA-04 |
| L27 | QA | `lib/deals/schemas.ts:14` | An amount like `1,2,3` is accepted as $123. | Check thousands groups. | small | Fixed | QA-06 |
| L28 | QA | `api/creators/import:14` | An empty file says "Choose a CSV file first". | Say the file is empty. | small | Fixed | QA-07 |
| L29 | QA | `lib/creators/csv.ts:40` | Rows with the wrong number of columns are accepted. | Mark them as errors. | small | Fixed | QA-08 |
| L30 | QA | `lib/auth/staff.ts:70` | A worker sent away from an owner page gets no message. | Short notice. | small | Fixed | QA-10 |
| L31 | UX | emails log, audit, creators | Four date styles; UTC not stated. | One format, say UTC. | small | Fixed | QA-11, UX-11 |
| L32 | Email | `lib/email/unsubscribe.ts:13-19` | An opt-out under an old address leaves the creator's new address contactable. | Also mark the creator by id. | small | Fixed | EML-04 |
| L33 | Claude | Review and email pages | A draft written by Claude looks like the person's own. | "Written by Claude" label. | small | Fixed | EML-05 |
| L34 | Claude | `lib/assistant/tools.ts` | Claude can propose a creator address the owner never typed. | Check the address was typed by the owner. | small | Fixed | EML-06 |
| L35 | Email | compose and review | Draft failures give no reason; the review page prints any text from the address bar. | Short reason codes with fixed texts. | small | Fixed | EML-07 |
| L36 | Claude | `lib/drafting/prompt.ts` | The drafting prompt uses a weaker text cleaner than the assistant. | Use the same cleaner. | small | Fixed | EML-08 |
| L37 | Email | `emails/review/SendBar.tsx` | "Send N approved" does not show who will get mail, and includes old approvals. | List recipients; flag old approvals. | small | Fixed | EML-09 |
| L38 | Claude | assistant tables | Claude conversations cannot be deleted by anyone. | Owner can delete a conversation. | medium | Fixed | EML-10 |
| L39 | Email | website Apply form | Anyone can enter someone else's address; that person then becomes contactable. | A confirm-your-address step is a new feature. | medium | Needs me (new feature) | EML-12 |
| L40 | Accessibility | audit table | Its scroll area cannot be reached with the keyboard. | Make it focusable. | small | Fixed | UX-08 |
| L41 | Accessibility | `EmptyState.tsx:8` | Empty-state title skips a heading level. | h2. | small | Fixed | UX-09 |
| L42 | Accessibility | ghost buttons, placeholders | Low contrast of button edges and placeholder text. | Darker border and placeholder. | small | Fixed | UX-10 |
| L43 | UX | Overview | Activity says "Someone"; heading and chart text styles differ. | Names and shared styles. | small | Fixed | UX-12 |
| L44 | UX | compose | Cramped intro; lists every creator. | Spacing; limit the list. | small | Fixed | UX-13 |
| L45 | UX | shell | No logo mark in the back office. | Optional: reuse the website logo. | small | Fixed | UX-14 |
| L46 | UX | compose, audit, emails log, import | Developer words ("Mock mode", raw codes). | Plain English. | small | Fixed | UX-15 |
| L47 | Performance | `app/layout.tsx:12,21-23` | Google Fonts block rendering on every page. | Self-host the fonts. | small | Fixed (self-hosted fonts) | PERF-11 |
| L48 | Performance | `settings/audit/page.tsx:26` | The audit page loads 1,000 rows to build a dropdown. | A small function for the list of actions. | small | Fixed | PERF-12 |
| L49 | Performance | `inbox/page.tsx:37` | The inbox waits for its audit write. | Write it after the response. | small | Fixed | PERF-13 |
| L50 | Tests | four e2e scripts | Ignore `BASE_URL`; comments show wrong ports. | Read `BASE_URL`. | small | Fixed | DOC-12 |
| L51 | Docs | `admin/README.md:335` | Login-limit wording is wrong. | Correct it. | small | Fixed | DOC-13 |
| L52 | Docs | `admin/README.md:151-156` | The `/auth/hash` step is not documented. | One sentence. | small | Fixed | DOC-14 |
| L53 | Docs | `admin/README.md:163` | Refers to Step 2 before it comes. | Add "(Step 2 below)". | small | Fixed | DOC-15 |
| L54 | Docs | `.env.example:55` | `UNSUBSCRIBE_SECRET` also protects the website forms. | Say so. | small | Fixed | DOC-16 |
| L55 | Docs | `next.config.ts:6` | `NEXT_DIST_DIR` is not documented; screenshot folders go to odd places. | Document; better defaults. | small | Fixed | DOC-17 |
| L56 | Docs | `docs/handoff.md:122` | Says `start.sh` starts Docker; it does not. | Correct. | small | Fixed | DOC-18 |
| L57 | Setup | `admin/dev/start.sh:62-64` | Continues silently when the login service did not finish. | Stop with a clear message. | small | Fixed | DOC-19 |
| L58 | Docs | `supabase/tests/run.sh`, README | Misdescribes what the database tests run. | Correct the wording. | small | Fixed | DOC-20 |
| L59 | Docs | `admin/README.md` | The 25-creator drafting limit is not mentioned. | Mention it. | small | Fixed | DOC-21 |
| L60 | Docs | `admin/README.md` | `npm test` and `npm run typecheck` are not documented. | Document. | small | Fixed | DOC-22 |

## 4. Quick wins (small effort, big impact)

- H01 the one-click unsubscribe, H05 the login outage message, H06 the Claude timeout, H07 the mail timeouts and stuck-email repair, H04 the error pages.
- M01 "do not contact" only liftable by the owner, M03 one recipient per email, M09 export only with an audit line, M18 export that re-imports, M26 the outage message, M27 no prefetch storms, M36 the local sender address, M35 the site address before the first deploy.

## 5. Decisions only you can make

1. **Worker access to contact details (H03).** Today any worker can copy the whole creator list (emails, phones, notes) through the database API, unseen. Either accept that because staff are trusted (we add audit lines and 2FA for workers), or ask for a larger redesign where personal fields come only through audited server functions.
2. **Supabase settings (H02, M28).** Turn on CAPTCHA protection (Cloudflare Turnstile is free but needs an account and a small app change) and check Supabase's Auth rate limits. Switch the project to asymmetric JWT signing keys, so pages stop asking Supabase Auth on every view; existing sessions may need a fresh login.
3. **Legal (M17).** Whether you may email creators found on YouTube at all, which lawful basis to record, the wording of a notice line, the privacy page, and a registered business name and postal address. This needs a lawyer. Not legal advice.
4. **New features:** an Opt-outs screen (M16), editing a deal's amount (M20), a confirm-your-address step for the Apply form (L39), CAPTCHA on the public forms (L02).
5. **Business rules (L16).** Should the commission drop at $500 and $2,000 (today's rule) or be charged in bands? Do you want a "lost" deal stage? Other currencies?
6. **Audit-log retention (L10).** How long to keep the log (for example 12 months), and approval of the erasure procedure for a person's data.
7. **Monitoring (M31).** Which free uptime service should watch the new health address.
8. **Housekeeping.** Delete the Supabase management token named `smallfold` (M43). Decide whether to make the GitHub repository private before this branch is pushed.

## 6. How the audit was run

- Rules and report format for every agent: `AGENT-BRIEF.md`. Shared project map: `00-project-map.md`.
- At most three agents ran at once. Agents that change test data or stop services ran on their own.
- Sub-agent tokens, audit: about 1.70 million (agents 1 to 8: 163k, 203k, 241k, 221k, 242k, 163k, 246k, 226k).
- Sub-agent tokens, repairs: about 1.15 million (FA database 229k, FB server 182k, FC screens 204k, FD creators and drafting 185k, FE docs and setup 206k, FR follow-ups 141k).
- Sub-agent tokens, verification: about 0.43 million (QA re-test 203k, security re-audit 230k).
- Total for 16 sub-agent runs: about 3.3 million tokens (Sonnet 2.8 million, Haiku 0.5 million). No sub-agent ran on Opus or Fable. The leader (this session) is extra; check `/usage` for the exact figures.
- Fix logs per group: `docs/audit/fixes/`. Rules for the fix agents: `FIX-BRIEF.md`.

## 7. Verification round (after the repairs)

| ID | Severity | What was found | Status |
|---|---|---|---|
| V00 | High (regression from the repairs) | The new channel-link rule refused `http://` links, so a visitor typing one on the Apply form would have got an error. | Fixed: links are always stored as `https://`; the rule now allows YouTube addresses only. |
| V01 | Medium | A stranger with about 4 IP addresses could still keep the owner's login and reset email blocked (SEC2-01). | Fixed: an IP that logged in successfully in the last 30 days is not blocked by the per-email cap; reset is limited per address and IP pair. |
| V02 | Low | A worker could write a fake "exported" audit line (SEC2-02). | Fixed. |
| V03 | Low | Each repeated one-click unsubscribe added an audit line (SEC2-03). | Fixed. |
| V04 | Low | After a password-reset or invite link, the session cookie is briefly readable by scripts (SEC2-04). | Needs me: switch Supabase's email templates to the `token_hash` link (the free plan may not allow editing them). |
| V05 | Low | A worker could aim an approved draft at an address that is not the creator's (SEC2-05). | Fixed. |
| V06 | Low | Any `https://` link was accepted as a channel link (SEC2-06). | Fixed (YouTube only). |
| V07 | Low | The public health check queried the database on every call (SEC2-07). | Fixed (10-second cache). |
| V08 | Low | Lifting "do not contact" could leave an old address blocked (SEC2-08). | Fixed in part: an address edited in an earlier, separate save can still stay blocked. |
| V09 | Low | The 404 page outside the back office had no links (QA2-01). | Fixed. |
| V10 | Low | Acting on a deal deleted in another tab gave no message (QA2-02). | Fixed. |

## 8. What you must do yourself

1. ~~Apply the four new migrations to the live database~~ **Done on 23 November** (at your request, after a backup; all 7 new rules validated, no existing row broke them).
2. ~~Then deploy~~ **Done on 23 November** (deploy `6b03ef4f`). Please log in once and check the Overview, Creators and Emails pages.
3. **Supabase settings** (H02, M28, V04): turn on CAPTCHA protection and check the Auth rate limits; switch the project to asymmetric JWT signing keys, so pages stop asking Supabase Auth on every view; if your plan allows it, use the `token_hash` links in the email templates.
4. **Delete the Supabase management token** named `smallfold` (M43), and turn on two-step login for your own account.
5. **Email sending** (still open from before the audit): the Gmail app password as `SMTP_PASS` in Netlify, the sender postal address in Settings, then a first test send.
6. **Legal check** (M17): the right to email creators found on YouTube, the notice line and the privacy page. Ask a lawyer; this report is not legal advice.
7. **Your decisions** in section 5: worker access (H03), new features (M16, M20, L39, CAPTCHA on the forms), commission rules (L16), audit-log retention (L10), an uptime monitor (M31), and approval of the erasure procedure in `docs/handoff.md` (M33).
8. **GitHub:** make the repository private, then tell Claude to push `audit-fixes`. The safety system blocked publishing it to a public repository.
