# FD: creators, CSV, deals input, drafting and review

| ID | Status | Files changed | What changed | How it was checked |
|---|---|---|---|---|
| H07 screen (SendBar) | Fixed | emails/review/SendBar.tsx | A 409 with `reason: 'sent_not_recorded'` shows the server's message as an error notice and stops the run (no retry, no further sends). | tsc. Not forced in a browser. |
| M05 (SEC-04) | Fixed | creators/page.tsx | `?creator=ID&edit=1` writes `creator.viewed`. View mode (no edit) already logs through the dialog's call to `GET /api/creators/[id]`, so it is not logged a second time. | Browser: count 39 to 40 on opening the edit link. |
| M10 part (ARC-05) | Fixed | creators/page.tsx, emails/review/page.tsx | Creators: query error (also page 2+) shows "Could not load the creators." instead of an empty list; Review shows "Could not load the drafts." | tsc. Error path not forced. |
| M15 (EML-02), L36 (EML-08) | Fixed | lib/drafting/validate.ts, prompt.ts, index.ts, types.ts, assistant/untrusted.ts (new `stripBrackets`), assistant/tools.ts, emails/review/actions.ts | `draftProblem(draft, {allowedUrls})` also refuses links other than the creator's channel, prices (the commission steps $500 / $1,999 / $2,000 are allowed), `[x]`, `<x>`, `%x%`, "unsubscribe" or a `--` signature line, and bodies over 220 words. Used for Claude, template, mock, assistant drafts and Review edits (reason shown in the card). prompt.ts uses `cleanText` from untrusted.ts for creator fields, goal and template subject, and `stripBrackets` for the template body. | New vitest cases. |
| M18 (QA-01) | Fixed | lib/creators/csv.ts | Phone-like values starting with `+` are not quote-guarded; a guard quote is removed on import. | Unit test of export then import; browser: exported CSV previews as 0 errors. |
| M19 creators (QA-02) | Fixed | creators/page.tsx | A page past the end counts the rows and redirects to the last page. | Browser: page=99 and page=4 go to page=3. Deals page is not mine. |
| M30 (PERF-08, ARC-19) | Fixed | app/api/creators/import/route.ts | Only incoming emails (ilike, batches of 200) and channels (batches of 100) are looked up. First failed chunk stops the import with a clear 409 message (count saved, how to continue). `creators.imported` is written in `finally` with the count (`partial: true` if not all saved). | Browser: preview of the full export through the new lookup finds all 60 as duplicates. Commit and the failure path not run. |
| M02 app part (DB-03) | Fixed | app/api/creators/[id]/route.ts | 23503 naming emails gives "This creator has emails in the log, so they cannot be deleted. Mark them Inactive or Do not contact instead."; deals message kept. | tsc. Not run against the new FA rule. |
| FA message | Fixed | creators/actions.ts | check_violation (23514) "Only the owner can take a creator off do not contact." shows on the Status field. | tsc. |
| L22 (ARC-15) | Fixed | lib/youtube/index.ts, youtube.test.ts, creators/page.tsx | `import 'server-only'`, `youtubeEnabled()` used by the page. Test file mocks `server-only`. | vitest. |
| L26 (QA-04) | Fixed | creators/actions.ts | Add/edit refuses a channel already used by another creator ("This channel is already in Smallfold."). | Browser: duplicate refused (different letter case too). |
| L27 (QA-06) | Fixed | lib/deals/schemas.ts, new schemas.test.ts | Commas only as thousands groups; `1,2,3` is refused. M13 part: 24 tests for amounts and addDealSchema. | vitest. |
| L28 (QA-07) | Fixed | api/creators/import/route.ts | Zero-byte file says "The file is empty." | Browser: 400 with that text. |
| L29 (QA-08) | Fixed | lib/creators/csv.ts, import route | Rows with too few or too many columns become error rows ("Wrong number of columns..."). `parseCsvText` also returns `badRows`. | Unit test. |
| L33 (EML-05) | Fixed (Review part) | compose/actions.ts, assistant/tools.ts, review/page.tsx, ReviewCard.tsx | `emails.source`: `claude` for assistant drafts and Compose goal drafts, `template` for template or mock drafts, default `staff`. Review shows "Written by Claude". Column was present locally. | tsc. Not seen in a browser with source=claude. |
| L34 (EML-06) | Fixed | lib/assistant/tools.ts | `propose_add_creator` needs the email to appear in a text message the owner typed in that thread. | tsc only. The assistant e2e may need an owner message that contains the address. |
| L35 (EML-07) | Fixed | compose/actions.ts, review/page.tsx, lib/drafting/types.ts | Compose passes `failed=down-1,blocked-2` (codes and counts, no names). Review maps whitelisted codes to fixed texts and ignores everything else; `drafted` must be digits. | Browser with a crafted address: free text ignored. |
| L37 (EML-09) | Fixed | review/SendBar.tsx, review/page.tsx | Confirm box lists the first 10 recipients with subjects and warns about emails approved over 24 hours ago. | tsc. |
| L21 parts | Fixed | creators/actions.ts, lib/creators/query.ts | Needless `\-` removed; the eslint comment removed. | tsc. |
| M13 part (ARC-08) | Fixed | lib/deals/schemas.test.ts | See L27. | vitest. |
| Leader extra 1 | Fixed | lib/deals/e2e.cjs | Stage change now selects, clicks Save, waits for "Saved". Not run. | - |
| L31 | Fixed | creators/CreatorsTable.tsx | Date cells use `formatWhen`. | tsc. |

## Needs another agent
- FC: Compose's old `?failed=<names>` is gone (now `down-1,blocked-2` codes); nothing else read it as far as grep shows.
- The label "Written by Claude" on the single email page (emails/[id]) is FC's file; `emails.source` is available there.
- Deals page-past-the-end (M19 deals part) is in the deals page, not mine.

## Tests run
- `npx tsc --noEmit` clean; `npx vitest run` 12 files, 122 tests pass (new: deals schemas, csv round trip and columns, drafting checks).
- Own dev server on :3204 (stopped, .next-fd removed, tsconfig restored): owner login, creators past-the-end redirect, edit-link audit line, export then import preview, empty file, duplicate channel on manual add, crafted Review address. Test data: none left (ZZ AUDIT rows were never saved).
- e2e scripts (creators, deals, assistant, forms) were not run.
