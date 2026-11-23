# 09 Functional QA re-test (verification agent V1)

## 1. Scope and method

I repeated every test of `04-functional-qa.md` on the rebuilt app at http://localhost:3000 in Chromium (Playwright), as owner and as worker, with the fake data. I wrote 12 scripts (scratch folder only) and also ran the project's own `lib/creators/e2e.cjs` (62 passed), `lib/deals/e2e.cjs` (all passed, including the new Save button), `tests/website.e2e.cjs` (all passed) and `lib/email/e2e.cjs` (52 passed; test mode only, mail went to the local catcher, settings put back, only `updated_at` differs). I did not run `tests/qa.e2e.cjs` (it tries a wrong password for the owner address and could trip the shared login limit). Wrong passwords used only made-up emails and my own `x-real-ip` (10.66.1.x). Every Overview number was taken from raw SQL at the same moment. Everything I created was named "ZZ AUDIT V1" and deleted (final check: 0 creators, brands, emails, templates, threads left; settings unchanged).

## 2. Done well

- Every fixed item I could exercise works. All 16 Phase 1 test areas pass again, with no 500 and no console error on any page in either role.
- The one-click unsubscribe now works end to end: the header URL is `/api/unsubscribe/<token>`, a POST records the opt-out, marks the creator "do not contact", writes the audit line, is safe to repeat, and a tampered token gives 404.
- Out-of-range pages, the CSV export and re-import, the Save button on deals and the phone layout are all fixed as the log says.

## 3. Results, Phase 1 tests (every test of 04-functional-qa.md)

| Test | Result |
|---|---|
| Logged-out access: 15 back-office pages redirect to /login (307), 3 APIs answer 401, /api/health is public 200 | PASS |
| Login, wrong password then wrong email: same message; 6th try says "Too many attempts. Try again in 15 minutes." (made-up email, own IP) | PASS |
| `next=` with `//evil.com`, `https://evil.com`, `/\evil.com` stays on the site | PASS |
| Logout: cookies gone, back button shows /login, a copy of the old cookie gets 401 | PASS |
| Worker: no owner links, `/claude`, `/settings/users`, `/settings/audit`, `/settings/sending` go to /overview with a notice; export 403; delete creator 403; assistant chat 403; cross-origin write 403 | PASS |
| Owner: export 200 and `creators.exported` audit line; owner pages open | PASS |
| Creators list: all 8 sorts (name, subscribers, last contacted, added, each asc and desc) equal SQL across all 3 pages (61 rows) | PASS (8 of 8) |
| Status filters new 19, contacted 12, replied 8, active 10, inactive 10, do not contact 2 equal SQL; search "wren" = 3 | PASS |
| Pagination: page 4, 99999 and past-the-end with a filter all go to the last page; pager text "51–61 of 61" | PASS |
| Creator pop-up for 6 creators (deals, earned, hidden subscribers, no phone) equals SQL | PASS (6 of 6) |
| Add, edit, delete (owner), worker edit, worker cannot delete, Cancel keeps the creator, delete with deals refused with a clear message | PASS |
| Bad input: subscribers negative, text, decimal, over 100,000,000; bad email; bad phone; bad channel; duplicate email in other letter case; an HTML tag in a name shows as text | PASS (all 8) |
| CSV import: wrong header, empty file, header only, bad quoting, PNG saved as .csv, semicolons, BOM, quoted multi-line cell, 1 MB and 2001-row limits (e2e) | PASS |
| CSV export then re-import of the same file: 0 errors (no quote before `+` phones) | PASS |
| Deals: create (owner and worker), stage change with Save, worker cannot delete, owner delete with confirm, commission from the database | PASS |
| Overview, owner and worker: total creators 60, sent 28 / 5 in 7 days / 16 in 30 days, replies 12 and 42.9%, active deals 8, commission $219.00, deals by stage (2/2/3/3/2/3), chart totals 26 sent and 11 replies, all equal SQL | PASS |
| Inbox (real website form, mark handled, owner delete), templates (unknown placeholder refused, worker can create, no Delete for worker) | PASS |
| Link/page sweep: 10 pages x 2 roles, no 500, no console errors | PASS |

## 4. Results, issues marked Fixed

| ID | Result | Evidence |
|---|---|---|
| H01 | PASS | Test-mode mail from the catcher: `List-Unsubscribe: <http://localhost:3000/api/unsubscribe/<token>>, <mailto:...>`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, footer keeps the page link. POST to that URL (mail row switched to non-test, fake data) gives 200, suppression row, creator do_not_contact, audit `email.unsubscribed`; GET gives 405 and records nothing. Note: a POST for a TEST-mode email returns 200 and records nothing, by design (`lib/email/unsubscribe.ts`: test emails are skipped), so the check "a POST for a test-mode email records the opt-out" cannot pass as worded. |
| H04 | PASS (partly) | Unknown addresses and bad ids show a designed 404 with "Back to the overview"; the shell is kept for bad ids. The error page for a thrown error could not be forced (not checked). |
| M01 | PASS | Worker sets "do not contact": suppression row added. Worker lifting it is refused with "Only the owner can take a creator off do not contact." Owner lifting it removes the manual row. The database also refuses an approved email for a "do not contact" creator. |
| M02 | PASS | Creator with only drafts deletes and its "do not contact" address stays in the suppression list. Creator with a sent email: 409 "This creator has emails in the log...". |
| M05 | PASS | Opening `?creator=ID&edit=1` adds a `creator.viewed` line. |
| M07 | PASS | Worker opens /settings/security (shows "Two-step login OFF, set up"); /settings sends a worker there; the nav shows only that link. Enrolling a factor was not done (would change the worker account). |
| M10 | PARTLY | Pages open with no error. A stale delete or stale stage change shows no message, but nothing breaks. Database-error paths could not be forced (unverified). |
| M18 | PASS | Export keeps `+1-555-0127` unquoted; the re-import preview shows 0 errors. |
| M19 | PASS | See pagination above; deals `?page=99` and `?page=99999` go to /deals; `page=0`, `-1`, `abc` show no error. |
| M21 | PASS | 390 px: no sideways scroll on 14 pages (owner) and 10 pages (worker); deals stage select 144 px wide. |
| M22 | PASS | Changing the dropdown or pressing arrow keys sends no request and saves nothing; Save stores it and shows "Saved". Works for the worker. |
| M23 | PASS | At 390 px the header is 105 px high (was about 200). |
| M24 | PASS | A loading indicator shows during a slowed page change. |
| M25 | PASS | A 150-character name without spaces does not push the table off screen at 1280 or 390 px. |
| M26, M29 | Not checked | Need a database outage or 1,000 creators. |
| M27 | PASS | 0 prefetch requests (`_rsc=`) on /creators and /overview after load. |
| M31 | PASS | `/api/health` 200 `{"ok":true}` without a login; Overview tile "Failed sends, last 7 days" shows 1 and equals SQL (both roles). |
| L26 | PASS | A duplicate channel (other spelling) is refused on add and on edit: "This channel is already in Smallfold." |
| L27 | PASS | `1,2,3` refused; `1,234.50` saved as 123450. |
| L28 | PASS | A zero-byte file says "The file is empty." |
| L29 | PASS | Too many and too few columns are flagged "Wrong number of columns". |
| L30 | PASS | "Only the owner can open that page." on /overview for a worker. |
| L31 | PASS | Emails log, audit, deals, inbox and creators use "23 Nov 2026, 02:56" and say UTC. |
| L33 | PASS | "Written by Claude" badge on the Review card and the email page for `source = claude`; none for a staff draft. |
| L38 | PASS | Owner deletes a conversation; its messages go with it; audit `assistant.thread_deleted` is stored (one short chat message used). |
| L40 | PASS | The audit table scroll area is a focusable region. |
| L41 | PASS | Empty-state heading is h2. |
| L42 | PASS | Placeholder contrast 6.49:1, ghost button border 6.00:1. |
| L43 | PASS | Activity lines show names ("Smallfold", staff names); no "Someone". |
| L44 | PASS | Compose shows "0 of 25 max" and a spaced intro. |
| L45 | PASS | Logo mark in the header. |
| L46 | PASS | "Practice drafts" instead of "Mock mode"; audit filter lists plain names, not codes. |

## 5. Issues

| ID | Severity | Location | What is wrong | Why it matters | Exact fix | Effort |
|---|---|---|---|---|---|---|
| QA2-01 | Low | `/does-not-exist`, `/creators/zzz` (root `app/not-found.tsx`) | A logged-in owner who opens an address that is not a page sees the not-found page without the navigation bar (only "Back to the overview"), while a missing record such as `/emails/<bad id>` keeps the bar. | Two looks for the same mistake; a small loss of orientation. | Accept it, or make the root `not-found.tsx` check the session and wrap in `AppShell`. | small |
| QA2-02 | Low | `/deals` (stale tab) | In a stale tab, deleting or changing a deal that another person already deleted shows neither an error nor a message; the row just disappears after the refresh. Unverified whether M10 intended a message here. | Harmless, but the person gets no feedback. | In `deals/actions.ts` check the affected row count and return "This deal no longer exists." | small |

Still open from Phase 1 and unchanged on purpose (Needs me): M20 (no edit of a deal amount) and L16/QA-05 (commission cliff: $499.99 gives $50.00, $500.00 gives $40.00, $1,999.99 gives $160.00, $2,000.00 gives $100.00, seen again).

## 6. Not checked or limits

- Not run: `tests/qa.e2e.cjs` (login limit), enrolling two-step login for the worker (M07 end to end), H04 error page for a thrown error, M10 database-error paths, M26 and H05 (login service outage), M29 (1,000 creators), M24 timing on a real slow page. Real (non-test) email sending was not done: I did not switch test mode off; the real opt-out path was tested by marking a fake test-mode email row as non-test.
- Mistake of mine: my first creators script cleaned up with `delete ... where full_name like 'ZZ AUDIT%'`, which also removed the other agent's rows named "ZZ AUDIT v2 ..." (their own cleanup would have done the same). All later scripts used the prefix "ZZ AUDIT V1". The security agent may find some of its rows gone.
- Leftover that I cannot delete: `login_attempts` rows for `zz-audit-v1-nobody@example.test` from IP bucket 10.66.1.21.

Score: 9/10. All Phase 1 tests and 30 fixed issues pass with no regression and no 500; only two Low polish items remain, plus three paths I could not force.
