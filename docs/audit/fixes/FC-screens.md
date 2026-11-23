# FC (screens) fix log

| ID | Status | Files changed | What changed | How it was checked |
|---|---|---|---|---|
| H04 | Fixed | new `app/(company)/error.tsx`, `(auth)/error.tsx`, `global-error.tsx`, `not-found.tsx`, `(company)/not-found.tsx`; `app/globals.css` | Designed error pages (shell kept, "Something went wrong. Your last change may not have been saved.", Try again, link to Overview), sign-in card error, cream global error, not-found pages with a way back | Temporary throwing pages (removed): company and auth error screens seen with the shell kept; `/emails/not-a-uuid` and `/nope-404` show the new 404. global-error.tsx type-checked only (cannot be triggered in dev) |
| M10 (part) | Fixed | `deals/actions.ts`, `deals/DeleteDealForm.tsx` (new), `emails/actions.ts`, `emails/[id]/EmailActions.tsx` (new), `emails/[id]/page.tsx`, `emails/page.tsx`, `emails/templates/page.tsx`, `emails/templates/actions.ts`, `claude/page.tsx`, `deals/page.tsx`, `inbox/page.tsx`, `settings/audit/page.tsx` | Delete deal, mark replied and retry return and show a plain error (retry also notices "no row changed"). Pages emails/[id], templates, claude, deals, emails log, audit and inbox show an error notice instead of an empty list or 404. Template delete only logs the error (no message) | Deal delete through the UI; email detail buttons render; error notices by reading the code paths. Not tested with a real DB failure |
| M19 | Fixed | `deals/page.tsx`, `components/ui/Pagination.tsx` | A deals page past the end redirects to the last page (checked with `?page=99`). Previous never points past the last page | Browser |
| M21 | Fixed | `components/ui/ui.module.css`, `deals/StageForm.tsx` | `.tableWrap` is `position: relative` (clips hidden text); stage select min width 9rem | 375, 768, 1440 px: no sideways page scroll on any of my pages |
| M22 | Fixed | `deals/StageForm.tsx`, `deals/actions.ts` | Changing the dropdown saves nothing; a Save button appears and "Saved" shows after | Browser: 0 POSTs after change, Save then "Saved", value persists |
| M23 | Fixed | `app/globals.css` | At 700 px and below, brand and user on row one, links in one scrollable row | 375 px screenshots |
| M24 | Fixed | new `(company)/loading.tsx`, `globals.css` | Loading bar and text during page changes | Code and type check; not timed with a slow page |
| M25 | Fixed | `ui.module.css`, `creators/creators.module.css`, `emails/page.tsx` | Long text wraps, edge shadows hint at sideways scroll, log badge shortened to "Test" (full sentence in a tooltip) | Screenshots |
| M27 | Fixed | `NavLinks.tsx`, `AppShell.tsx`, `ui/Button.tsx` (LinkButton), `ui/Table.tsx` (SortLink), `claude/page.tsx`, `creators/CreatorsTable.tsx` (line 68 only) | `prefetch={false}` on navigation, brand, sort, button and creator row links | Code |
| M29 | Fixed | `deals/page.tsx` | Notice when the creator or brand list reached 1,000 (and an error notice if either failed) | Code; not tested with 1,000 rows |
| M31 (screen) | Fixed | `overview/page.tsx`, `lib/deals/stats.ts` | Tile "Failed sends, last 7 days" from `emails_failed_7d` (0 when missing) | Browser: shows 1 with FA's field |
| M07 (nav) | Fixed | `AppShell.tsx` | Worker sees Settings linking to /settings/security | Worker at 375 px |
| L21 (part) | Fixed | `overview/page.tsx` | Unused `Table` import removed | tsc |
| L30 | Fixed | `overview/page.tsx` | "Only the owner can open that page." for `?notice=owner-only` | Browser (worker to /claude lands there) |
| L31 | Fixed | `emails/page.tsx`, `emails/[id]/page.tsx`, `settings/audit/page.tsx`, `inbox/page.tsx`, `deals/page.tsx`, `overview/page.tsx` | All use `formatWhen`; headers or headings say UTC. Creators table dates not changed (not mine) | Browser |
| L38 | Fixed (needs audit allow-list) | new `claude/actions.ts`, `claude/DeleteThread.tsx`, `claude/page.tsx` | Owner "Delete conversation" with confirm dialog; checks that a row was deleted | Browser: conversation deleted with FA's policy. The audit line `assistant.thread_deleted` is rejected by `log_audit` until its allow-list has it (logged to console only) |
| L40 | Fixed | `ui/Table.tsx` | Scroll box is a focusable labelled region | Code |
| L41 | Fixed | `ui/EmptyState.tsx`, `ui.module.css` | h3 became h2 | Code |
| L42 | Fixed | `ui.module.css` | Darker ghost border, darker placeholder | Code |
| L43 | Fixed (part) | `globals.css`, `overview/Overview.module.css`, `WeeklyChart.tsx` | `.label` uses the sans font everywhere; chart text 12px with a width cap, every second week label hidden on phones. "Someone" is FA's | Screenshots |
| L44 | Fixed | `emails/compose/page.tsx`, `ComposeForm.tsx` | Space under the intro, results capped at 25 with a hint (the search already returns 20) | Code |
| L45 | Fixed | new `components/shell/LogoMark.tsx`, `AppShell.tsx` | Website "S" mark in the header (auth card not changed, `(auth)/layout.tsx` not mine) | Screenshots |
| L46 | Fixed | `ComposeForm.tsx`, `settings/audit/page.tsx`, `audit/format.ts`, `emails/page.tsx`, `creators/import/page.tsx` | "Practice drafts" wording, no raw codes in the audit filter, capitalised statuses, plain import wording | Code |
| L48 | Fixed | `settings/audit/page.tsx` | Action list from `rpc('audit_actions')`, falling back to the known list | Browser (FA's function present) |
| L49 | Fixed | `inbox/page.tsx` | Audit line written with `after()` using the request's own client (`logAudit` calls `cookies()`, not allowed inside `after`) | Browser: each inbox view adds one `contact.viewed` line |
| L10 (part) | Fixed | `settings/audit/page.tsx` | `count: 'estimated'` | Code |

## Needs another agent
- `admin/lib/deals/e2e.cjs` (line 155) changes the stage with `selectOption` and expects an automatic save. It now needs a click on the row's "Save" button. I do not own that file, and I did not run it.
- `log_audit` allow-list (FA): add `assistant.thread_deleted`, so the delete line is stored.
- Creators table dates (FD) still use the old date style; to match, use `formatWhen` and say UTC.
- Review page (`emails/review`) and Users page were not in my list for the error notices (M10).

## Tests run
- `npx tsc --noEmit`: clean. `npx vitest run`: 89 passed.
- `tests/website.e2e.cjs`: all passed. `tests/qa.e2e.cjs`: 72 passed, 0 failed (both against my server on port 3202).
- Browser checks at 375, 768, 1440 px as owner and worker. Test data (`ZZ AUDIT FC` deal, brand, conversation) deleted. Dev server stopped and `.next-fc` removed.
