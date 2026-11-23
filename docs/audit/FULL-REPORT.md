# Smallfold back office: full audit report

Date: 23 November 2026. Branch: `audit-fixes` (made from commit `c3f03b6`, tag `safety-before-audit`). Eight specialist agents (six on Sonnet, two on Haiku) read the code, ran the app on the local test stack with fake data, and wrote the reports `01` to `08` in this folder. Nothing touched production. This file merges their 126 findings into one list of 111.

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
| Architecture and code quality | 1 (Sonnet) | `01-architecture.md` | 8/10 | to do |
| Security | 2 (Sonnet) | `02-security.md` | 7/10 | to do |
| Database | 3 (Sonnet) | `03-database.md` | 7/10 | to do |
| Functional QA | 4 (Sonnet) | `04-functional-qa.md` | 8/10 | to do |
| Email and Claude | 5 (Sonnet) | `05-email-claude.md` | 7/10 | to do |
| UI, UX and accessibility | 6 (Sonnet) | `06-ui-ux-accessibility.md` | 7/10 | to do |
| Performance and reliability | 7 (Haiku) | `07-performance-reliability.md` | 6/10 | to do |
| Docs and setup | 8 (Haiku) | `08-docs-setup.md` | 6/10 | to do |
| **Average** | | | **7.0** | to do |

## 3. Merged issue list

Sorted by severity. "From" names the agents' IDs, where the full detail and the exact fix are. Status: Open, Fixed, Not fixed (with the reason), or Needs me (your decision).

### High (7)

| ID | Area | Where | What is wrong | Fix | Effort | Status | From |
|---|---|---|---|---|---|---|---|
| H01 | Email | `lib/email/send.ts:45,52`, `mailer.ts:37` | The List-Unsubscribe header points at the confirm page, so the one-click Unsubscribe in Gmail and Yahoo shows success but records nothing. | Point the header at `/api/unsubscribe/<token>`; keep the page link in the footer. | small | Open | EML-01 |
| H02 | Security | `app/(auth)/login/actions.ts:28-40` | The 5-try limit lives only in the app. Calling Supabase Auth directly with the public key allowed 10 wrong passwords and 8 wrong 2FA codes with no lock. | Supabase settings: turn on CAPTCHA protection and check the Auth rate limits; optionally Auth hooks. Keep the app limit. | medium | Needs me | SEC-01 |
| H03 | Security, database | RLS `staff_select_creators`, `api/creators/export` | Any worker can read every creator's email, phone and notes through the REST API with their own login, bypassing the owner-only export and the audit log. | Your choice: trust staff and add mitigations (audit page views, 2FA for workers), or redesign so personal fields come only through audited functions (large). | large | Needs me | DB-01, SEC-05 |
| H04 | UX | `admin/app` (no `error.tsx`, `not-found.tsx`, `global-error.tsx`) | A failed action replaces the whole screen with Next's bare error page; 404 pages are unstyled with no way back. | Add designed error, not-found and global-error pages that keep the navigation. | small | Open | UX-01, UX-07, ARC-13 |
| H05 | Reliability | `app/(auth)/login/actions.ts:39-42` | When Supabase Auth is down, a correct password is reported as wrong and counted as a failure; the 6th try locks the account for 15 minutes. | Treat an outage as "try again later" and do not record it as a failed attempt. | small | Open | PERF-01 |
| H06 | Reliability | `lib/drafting/index.ts:27`, `emails/compose/actions.ts` | Drafting calls Claude with no timeout (10 minutes, 3 tries). A silent Claude kept compose waiting over 200 s; the host then cuts the request off midway. | One shared Claude client with a 25 s timeout; stop starting batches after about 40 s and list the rest. | small | Open | PERF-02, ARC-06 |
| H07 | Reliability, email | `lib/email/mailer.ts:23-28`, send route, `reserve_send` | SMTP has no timeouts and the send has no time limit. A stopped send leaves the email "sending" forever (it blocks the limit and gap and nobody can change it). "Sent but not recorded" shows a generic error. | Mail timeouts, a route time limit, a `release_stale_sending()` repair, and a clear "it WAS sent" message. | small | Open | PERF-03, DB-04, ARC-04 |

### Medium (44)

| ID | Area | Where | What is wrong | Fix | Effort | Status | From |
|---|---|---|---|---|---|---|---|
| M01 | Database | `staff_update_creators` policy | A worker can lift "do not contact" with one edit, and a hand-set "do not contact" is not an address-level block. | Trigger: only the owner may lift it; setting it also adds the address to the suppression list. | small | Open | DB-02, EML-03 |
| M02 | Database | `emails.creator_id ... on delete cascade` | Deleting a creator deletes their sent-email history and can forget their opt-out. | Before-delete trigger keeps the opt-out; sent history blocks the delete (drafts are removed). | medium | Open | DB-03 |
| M03 | Security | `creators.email`, `emails.to_email`, `mailer.ts:30` | Any text is accepted as an email address; `a@x, b@x` sends to both and slips past the suppression check. | Format constraints (added NOT VALID, then validated) and the mailer refuses more than one recipient. | small | Open | SEC-02, DB-15 |
| M04 | Security | `lib/supabase/server.ts`, `lib/supabase/proxy.ts` | The session cookie can be read by scripts, is not marked Secure and lasts about 400 days. | httpOnly, Secure in production, 30 days. | small | Open | SEC-03 |
| M05 | Security | `creators/page.tsx:45` | Opening `/creators?creator=ID&edit=1` shows the full record with no audit line. | Log `creator.viewed` there too. | small | Open | SEC-04 |
| M06 | Security | `log_audit()` | Any staff member can write fake audit lines, including owner-type events. | Owner-type actions only for the owner. | small | Open | SEC-06, DB-12 |
| M07 | Security | `settings/security/actions.ts`, `settings/layout.tsx` | Only the owner can turn on two-step login; workers cannot. | Each staff member can enrol their own factor; the Security page is shown to workers. | medium | Open | SEC-07 |
| M08 | Security | `login_allowed()` | Anyone who knows the owner's address can lock the owner out again and again. | Lock per email and IP after 5; per email from all addresses only after 20. | medium | Open | SEC-08 |
| M09 | Code | `lib/audit.ts:21`, `api/creators/export` | The export still goes out if the audit line fails, and the line is written only after all rows are read. | Write the line first; stop the export if it cannot be written. | small | Open | ARC-01, PERF-09 |
| M10 | Code | deals, emails actions; review, templates, users, claude pages | Several actions and pages hide database errors: the click does nothing, or the page looks empty. | Return and show a plain error. | medium | Open | ARC-02, ARC-05 |
| M11 | Code | `settings/users/actions.ts:39,61,75` | Removing a user does not check that the account ban worked, and logs "removed" anyway. | Check the result; log only on success. | small | Open | ARC-03 |
| M12 | Code | about 10 `as unknown as` casts | No generated database types, so a renamed column fails only at run time. | Generate types and remove the casts. | large | Open | ARC-07 |
| M13 | Code | `lib/api`, `lib/auth`, `lib/deals` | The security helpers have no unit tests. | Add tests for the API wrapper, client IP and amounts. | medium | Open | ARC-08 |
| M14 | Code | repository | No CI and no lint step. | GitHub workflow running typecheck, tests and oxlint. | small | Open | ARC-09 |
| M15 | Email, Claude | `lib/drafting/validate.ts` | The draft check only looks for `{{`: drafts with invented sponsors, prices, outside links or placeholders are saved. | Stricter checks (links other than the channel, prices, placeholders, fake unsubscribe lines, word cap). | medium | Open | EML-02 |
| M16 | Email | no screen | There is no screen to see or add opt-outs (for example a reply saying "unsubscribe"). M01 gives an address-level block through "do not contact". | An Opt-outs page is a new screen. | medium | Needs me | EML-03 |
| M17 | Legal | creators, `footer.ts`, privacy page | Cold-email gaps (observation, not legal advice): no record of where each address came from or the basis, no notice line, draft privacy page. | Decide with a lawyer; then add source and basis fields and a footer line. | large | Needs me | EML-11 |
| M18 | QA | `lib/creators/csv.ts:16` | Export puts a quote before phone numbers that start with "+", so your own export cannot be re-imported (46 of 67 rows refused). | Leave phone-like values alone; strip a guard quote on import. | small | Open | QA-01 |
| M19 | QA | `creators/page.tsx`, `deals/page.tsx` | A page number past the end shows "No creators yet" or "Deals could not be loaded". | Send the person to the last page. | small | Open | QA-02 |
| M20 | QA | `/deals` | A deal's amount cannot be changed after it is created. | An "edit amount" action is a new feature. | medium | Needs me | QA-03 |
| M21 | UX | `/deals`, `/settings/users` on phones | The page scrolls sideways and the stage dropdown shrinks to an arrow. | Clip the hidden header; give the dropdown a minimum width. | small | Open | UX-02, QA-09 |
| M22 | UX | `deals/StageForm.tsx` | The stage dropdown saves on every arrow-key press. | Save only when the person confirms. | small | Open | UX-03 |
| M23 | UX | navigation | No phone menu: the links wrap into three rows, about 200 px of header. | One scrollable row on small screens. | medium | Open | UX-04 |
| M24 | UX | no `loading.tsx` | A slow page change shows nothing for seconds. | A loading state. | small | Open | UX-05 |
| M25 | UX | tables | Wide tables are cut off with no hint; a long name pushes columns off screen. | Wrap long text; shorter badge. | small | Open | UX-06 |
| M26 | Reliability | `lib/auth/staff.ts:25-31` | A short database outage tells staff "This account does not have access". | Tell an outage apart from "no access". | small | Open | PERF-04 |
| M27 | Performance | `NavLinks.tsx`, `CreatorsTable.tsx` | Link prefetching makes 12 to 33 extra server renders per page view, each with session checks. | Turn prefetch off on those links. | small | Open | PERF-05 |
| M28 | Performance | Supabase project setting | Tokens are signed with a shared secret, so every page asks Supabase Auth twice before reading data. | Switch the project to asymmetric signing keys in the dashboard. | medium | Needs me | PERF-06 |
| M29 | Performance | `deals/page.tsx:43-44` | The deals page loads up to 1,000 creators; above that the dropdown silently stops. | Notice when the list is cut; later a search box. | medium | Open | PERF-07 |
| M30 | Performance | `api/creators/import` | Import reads every creator before checking; a failing chunk can outrun the host; a partial import writes no audit line. | Check only the incoming addresses; always write the audit line. | medium | Open | PERF-08, ARC-19 |
| M31 | Monitoring | no health route; Overview | No health check and no sign of failed sends; failed audit writes only reach the console. | Health route and a failed-sends tile; an outside uptime monitor is your choice. | medium | Open | PERF-10 |
| M32 | Database | `recent_activity()` | The activity list scans whole tables (3.6 s at 50,000 creators). | Compare ids as uuids. | small | Open | DB-05 |
| M33 | Database, privacy | `audit_row()` | The audit log copies creators' email, phone and notes, and nothing can erase them. | Record "changed" instead of the values for personal fields; document an erasure procedure. | small | Open | DB-06 |
| M34 | Docs | `admin/README.md:243-246` | Says visitors cannot open the site; it is public. | Update. | small | Open | DOC-01 |
| M35 | Docs | `admin/README.md` Step 5 | The site address is set only after the first deploy; until then unsubscribe links point at localhost. | Set it first. | small | Open | DOC-02 |
| M36 | Setup | `admin/dev/keys.mjs` | The local setup never writes `EMAIL_FROM`, so every local send fails. | Write the test sender. | small | Open | DOC-03 |
| M37 | Docs | `admin/README.md` prerequisites | Missing tools, image pulls and ports. | List them. | small | Open | DOC-04 |
| M38 | Setup | `admin/package.json`, `tests/run-all.sh:9` | Playwright is not declared; the runner falls back to a sandbox path. | Document the install; keep the fallback optional. | medium | Open | DOC-05 |
| M39 | Docs | `admin/README.md` Tests | Restart after reset, `env -u ANTHROPIC_BASE_URL` and the login limit are not explained. | Add them. | small | Open | DOC-06 |
| M40 | Docs | `docs/handoff.md` deploy | Deploy steps exist only as agent-tool calls; the npx package is not pinned. | Add a human command-line path; pin the version. | medium | Open | DOC-07 |
| M41 | Docs | `docs/handoff.md:47,64` | Contradicts itself about which SMTP variables are set. | Fix. | small | Open | DOC-08 |
| M42 | Docs | `README.md` | Says `site/` is what goes online. | Explain that Netlify builds `admin/`. | small | Open | DOC-09 |
| M43 | Docs, security | `docs/handoff.md` | The public repository describes a live Supabase management token. | Remove the token details; you delete the token. | small | Open (token: Needs me) | DOC-10 |
| M44 | Docs | none | No guide for adding migrations, finding logs, backups, rollback or key rotation. | Add a "Maintaining Smallfold" section. | medium | Open | DOC-11 |

### Low (60)

| ID | Area | Where | What is wrong | Fix | Effort | Status | From |
|---|---|---|---|---|---|---|---|
| L01 | Security | `lib/auth/ip.ts:19-21` | Off Vercel, a missing Netlify header falls back to the client-sent `x-real-ip`. | On Netlify never read `x-real-ip`. | small | Open | SEC-09 |
| L02 | Security | `lib/forms/public.ts` | Public forms have no overall cap and no CAPTCHA. | Global hourly cap; CAPTCHA needs an account. | medium | Open (CAPTCHA: Needs me) | SEC-10 |
| L03 | Security | `lib/api/handler.ts:42-49` | JSON routes accept `text/plain` bodies (a cross-site form could post). | Require `application/json` when a body is expected. | small | Open | SEC-11 |
| L04 | Security | `forgot-password/actions.ts:12` | No limit on password-reset emails. | 3 per hour per email and per IP. | small | Open | SEC-12 |
| L05 | Database | `creators.channel_url`, `contact_messages` | The database does not check channel links or the length of form messages. | Constraints (NOT VALID, then validated). | small | Open | SEC-13, DB-15 |
| L06 | Security | `netlify.toml`, `proxy.ts` | `/assets` and robots.txt lack some headers; no Permissions-Policy on website pages. | Add the headers. | small | Open | SEC-14 |
| L07 | Database | `creator_summaries` | The view adds up all deals and emails for every list page. | Lateral joins. | small | Open | DB-07 |
| L08 | Database | trigram indexes | The search indexes are not used under row-level security. | Search through a function (only matters past a few thousand creators). | medium | Open | DB-08 |
| L09 | Database | `audit_log`, `deals`, foreign keys | Missing indexes for the audit filters, the deals sort and some foreign keys. | Add the indexes. | small | Open | DB-09 |
| L10 | Database | `audit_log` | No retention plan; the audit page counts exactly. | Estimated count now; how long to keep the log is your call. | medium | Open (retention: Needs me) | DB-10 |
| L11 | Database | `20261121000500_rls_and_grants.sql:57-60` | The default-privileges revoke does nothing. | Correct statement plus a test. | small | Open | DB-11 |
| L12 | Database | `recent_activity` vs refresh route | `creator.subscribers_refreshed` never shows on the Overview (name mismatch). | Use the same name. | small | Open | DB-13 |
| L13 | Database | `suppression_after` | A creator added after their address was suppressed shows "New". | Before-insert trigger. | small | Open | DB-14 |
| L14 | Database | `creators`, `contact_messages` | Workers can write bookkeeping columns (`user_id`, `created_by`, `handled_by`). | Guards in triggers. | small | Open | DB-16 |
| L15 | Database | `admin/dev/migrate.sh` | No rollback notes; the migration record is written outside the migration's transaction. | Same transaction; rollback notes in each new migration. | small | Open | DB-17 |
| L16 | Business | commission, `deal_stage`, currency | The commission tier drops at $500 and $2,000; there is no "lost" stage; USD only. | Your call. | small | Needs me | DB-18, QA-05 |
| L17 | Database | design | Future brand and creator portals need new roles, links and safe views. | Design notes in the docs. | large | Open | DB-19 |
| L18 | Code | `lib/auth/staff.ts:13,49,64` | `mfaRequired` is always false (dead code). | Remove it. | small | Open | ARC-10 |
| L19 | Code | login and unsubscribe actions | Some database call results are ignored or errors not logged. | Log them. | small | Open | ARC-11 |
| L20 | Code | `lib/email/send.ts:21-24` | Raw mail-server errors are stored and shown. | Fixed wording; detail to the server log. | small | Open | ARC-12, PERF-14 |
| L21 | Code | several files | Small lint warnings. | Clean up. | small | Open | ARC-14 |
| L22 | Code | `lib/youtube/index.ts` | Reads a secret key without `server-only`. | Add it. | small | Open | ARC-15 |
| L23 | Code | several files | Three ways to validate ids; helpers copied in several places. | One shared helper. | medium | Open | ARC-16 |
| L24 | Code | `lib/**/e2e.cjs` | Test scripts live inside `lib/`; unused exports. | Move and tidy. | medium | Open | ARC-17 |
| L25 | Code | `tsconfig.json`, `vitest.config.ts`, `package.json` | Leftover build folders, a config warning, no `engines` field. | Clean up. | small | Open | ARC-18, DOC-22 |
| L26 | QA | `creators/actions.ts:37` | Adding a creator by hand does not check for the same channel. | Check like the import does. | small | Open | QA-04 |
| L27 | QA | `lib/deals/schemas.ts:14` | An amount like `1,2,3` is accepted as $123. | Check thousands groups. | small | Open | QA-06 |
| L28 | QA | `api/creators/import:14` | An empty file says "Choose a CSV file first". | Say the file is empty. | small | Open | QA-07 |
| L29 | QA | `lib/creators/csv.ts:40` | Rows with the wrong number of columns are accepted. | Mark them as errors. | small | Open | QA-08 |
| L30 | QA | `lib/auth/staff.ts:70` | A worker sent away from an owner page gets no message. | Short notice. | small | Open | QA-10 |
| L31 | UX | emails log, audit, creators | Four date styles; UTC not stated. | One format, say UTC. | small | Open | QA-11, UX-11 |
| L32 | Email | `lib/email/unsubscribe.ts:13-19` | An opt-out under an old address leaves the creator's new address contactable. | Also mark the creator by id. | small | Open | EML-04 |
| L33 | Claude | Review and email pages | A draft written by Claude looks like the person's own. | "Written by Claude" label. | small | Open | EML-05 |
| L34 | Claude | `lib/assistant/tools.ts` | Claude can propose a creator address the owner never typed. | Check the address was typed by the owner. | small | Open | EML-06 |
| L35 | Email | compose and review | Draft failures give no reason; the review page prints any text from the address bar. | Short reason codes with fixed texts. | small | Open | EML-07 |
| L36 | Claude | `lib/drafting/prompt.ts` | The drafting prompt uses a weaker text cleaner than the assistant. | Use the same cleaner. | small | Open | EML-08 |
| L37 | Email | `emails/review/SendBar.tsx` | "Send N approved" does not show who will get mail, and includes old approvals. | List recipients; flag old approvals. | small | Open | EML-09 |
| L38 | Claude | assistant tables | Claude conversations cannot be deleted by anyone. | Owner can delete a conversation. | medium | Open | EML-10 |
| L39 | Email | website Apply form | Anyone can enter someone else's address; that person then becomes contactable. | A confirm-your-address step is a new feature. | medium | Needs me | EML-12 |
| L40 | Accessibility | audit table | Its scroll area cannot be reached with the keyboard. | Make it focusable. | small | Open | UX-08 |
| L41 | Accessibility | `EmptyState.tsx:8` | Empty-state title skips a heading level. | h2. | small | Open | UX-09 |
| L42 | Accessibility | ghost buttons, placeholders | Low contrast of button edges and placeholder text. | Darker border and placeholder. | small | Open | UX-10 |
| L43 | UX | Overview | Activity says "Someone"; heading and chart text styles differ. | Names and shared styles. | small | Open | UX-12 |
| L44 | UX | compose | Cramped intro; lists every creator. | Spacing; limit the list. | small | Open | UX-13 |
| L45 | UX | shell | No logo mark in the back office. | Optional: reuse the website logo. | small | Open | UX-14 |
| L46 | UX | compose, audit, emails log, import | Developer words ("Mock mode", raw codes). | Plain English. | small | Open | UX-15 |
| L47 | Performance | `app/layout.tsx:12,21-23` | Google Fonts block rendering on every page. | Self-host the fonts. | small | Open | PERF-11 |
| L48 | Performance | `settings/audit/page.tsx:26` | The audit page loads 1,000 rows to build a dropdown. | A small function for the list of actions. | small | Open | PERF-12 |
| L49 | Performance | `inbox/page.tsx:37` | The inbox waits for its audit write. | Write it after the response. | small | Open | PERF-13 |
| L50 | Tests | four e2e scripts | Ignore `BASE_URL`; comments show wrong ports. | Read `BASE_URL`. | small | Open | DOC-12 |
| L51 | Docs | `admin/README.md:335` | Login-limit wording is wrong. | Correct it. | small | Open | DOC-13 |
| L52 | Docs | `admin/README.md:151-156` | The `/auth/hash` step is not documented. | One sentence. | small | Open | DOC-14 |
| L53 | Docs | `admin/README.md:163` | Refers to Step 2 before it comes. | Add "(Step 2 below)". | small | Open | DOC-15 |
| L54 | Docs | `.env.example:55` | `UNSUBSCRIBE_SECRET` also protects the website forms. | Say so. | small | Open | DOC-16 |
| L55 | Docs | `next.config.ts:6` | `NEXT_DIST_DIR` is not documented; screenshot folders go to odd places. | Document; better defaults. | small | Open | DOC-17 |
| L56 | Docs | `docs/handoff.md:122` | Says `start.sh` starts Docker; it does not. | Correct. | small | Open | DOC-18 |
| L57 | Setup | `admin/dev/start.sh:62-64` | Continues silently when the login service did not finish. | Stop with a clear message. | small | Open | DOC-19 |
| L58 | Docs | `supabase/tests/run.sh`, README | Misdescribes what the database tests run. | Correct the wording. | small | Open | DOC-20 |
| L59 | Docs | `admin/README.md` | The 25-creator drafting limit is not mentioned. | Mention it. | small | Open | DOC-21 |
| L60 | Docs | `admin/README.md` | `npm test` and `npm run typecheck` are not documented. | Document. | small | Open | DOC-22 |

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
- Sub-agent tokens for this phase: about 1.70 million (agents 1 to 8: 163k, 203k, 241k, 221k, 242k, 163k, 246k, 226k).
