# Re-test fixes (final fix agent)

Migration: `admin/supabase/migrations/20261125001200_retest_fixes.sql` (eleventh file; applied by `dev/migrate.sh` and once more by hand). Tests: `admin/supabase/tests/retest_fixes.sql` (12 checks, in `run.sh`), `admin/lib/drafting/pitch.retest.test.ts`.

| # | Item | Result |
|---|---|---|
| 1 | SR-04 draft checker | Fixed as far as rules can go; limits below. |
| 2 | SR-08 sponsor profile audit | Fixed. |
| 3 | SR-05 confirmation note | Fixed. |
| 4 | SR-18 contact email characters | Fixed. |
| 5 | Export audit line | Fixed. |
| 6 | Approve with no address | Fixed. |
| 7 | SR-15 import audit lines | Fixed (it was small). |
| 8 | Cosmetic | Fixed; this note and `review-fixes-ui.md` written. |

## 1. The draft checker

Reproduced first: the re-tester's script (`/tmp/rt/validate10.cjs`) gave 0 of 5 bad drafts caught and 2 of 5 clean drafts refused. After the change all 10 give the right answer, and the five extras the re-tester ran also come out right (the two that used to pass, "a thousand bucks" and "See samplays.link now", are now refused).

What changed (`pitch-safety.ts`, `pitch-validate.ts`, new `pitch-claims.ts`, new `common-words.ts`):
- **Web addresses.** One general pattern: dotted labels whose last label starts with a letter and has two or more characters (`samplays.club`, `x.museum`, `shop.attacker.test`). No list of endings. "e.g.", "i.e.", "U.S.", "4.2k" and "v2.0" are not matched. The same pattern is used on the way in (`unsafeReason`), so a past sponsor, channel name or industry like `Evil shop.attacker.test` is dropped before the prompt (tested with `.test`, `.club`, `.link`, `.xyz`, `.museum`). The text is first read the way a person reads it: full-width characters folded, hidden characters removed, `[.]`, `(dot)`, `(at)` turned back into `.` and `@`, a space before a dot closed.
- **Spelled-out addresses.** "name at example dot com", `DOT` in capitals, "x dot club", a named mail service (gmail, hotmail, yahoo, icloud, protonmail, aol, "at outlook"). "Polka dot" is left alone.
- **Amounts.** Words ("five hundred dollars", "a thousand pounds", "a hundred bucks", "thousands of viewers"), "2k per video" and other amount-per-unit forms, money words (compensation, money, cash, salary, income, profit, bonus ...), percentages and shares of earnings ("20%", "ninety percent", "a share of your earnings").
- **Numbers in words.** "forty thousand" is read as 40,000 and checked against the facts like a digit number. Counts up to 20 pass unless a currency word follows.
- **Promises.** guarantee in any spelling or spacing, promise, risk-free, "you will earn", "double your", "boost your sales", sure thing, 100%, "will definitely", "proven results" and close variants. This check runs last, so an invented number or name is still named first (an existing test expects that).
- **False refusals.** A capitalised word that starts a sentence or a subject passes when it is in the word list (`common-words.ts`, about 1,900 words written by hand, no download; plain and simple endings like -s, -ed, -ing, -ly are also tried) or in the facts or written in lower case elsewhere in the draft. In a subject, an ordinary capitalised word passes anywhere (Title Case subjects). "Introduction", "Intro", "Quick", "Following", "Hello" all pass; "Zentora" does not. The old short starter list is gone.
- **Lower-case brands, partly.** A lower-case word straight after "worked with", "partnered with", "brands like", "such as", "including", "alongside" must be an ordinary word or in the facts; so "worked with zentora and brightfox" is refused. This is a cue-phrase rule, not a general one.
- **Screens.** One line on the pitch dialog result and on the Review card and email page (inside `PitchFacts`): "This check catches common mistakes, not all of them. Read every name and number before you send."

Test counts (`pitch.safety.test.ts` unchanged, plus `pitch.retest.test.ts`): **67 clean drafts** (18 old + 5 re-test + 19 subjects + 25 openings) and **88 bad drafts** (30 old + 10 re-test + 44 new + 4 more subjects). All pass; the full suite is 490 tests.

### What the checker still cannot catch
- An invented brand written in lower case anywhere except right after one of the cue phrases ("we also liked zentora"), or one that is an ordinary word or a real brand that is also a common word at the start of a sentence ("Target has ..."; "Apple" is not in the list, "meta" is not either, but any word that is in it passes).
- A subtle false claim that uses only allowed words and numbers: "Sam Plays has more subscribers than most gaming channels", "Northwind Gear Co sponsored this channel" (a known name in a wrong relation), a wrong month for a real sponsor, a swapped number that is also in the facts.
- An email address or link split so that no `@`, no dot and no "at ... dot" remains ("sam at samplays" with no dot word), or hidden in an image or a different script.
- A promise in wording that is not on the list ("you cannot lose", "this always works").
- Numbers written in words that are 20 or less and not followed by a currency word ("twelve videos" for the wrong count).
- Instruction text in a name that the word list of instructions does not know (unchanged: depth only, the facts sit in tags as data).
- Anything on the creator side that a person only sees by reading the whole email. This is why the screens now say so.

## 2. Sponsor profile audit line

Reproduced: Save notes, edit or add a contact person, a sponsor edit and tag changes each caused an extra `brand.viewed` line (the components called `router.refresh()`, which carries no `next-action` header). Fix: the actions `saveNotes`, `saveContact`, `setMainContact`, `deleteContact` and `saveSponsor` (edit) call `revalidatePath('/sponsors', 'layout')` themselves, and `NotesEditor`, `ContactPeople` and `SponsorDialog` no longer call `router.refresh()`. The profile already skips the line for requests with `next-action`. Tag changes already went through an action that revalidates. Counted in the browser on a `ZZ FF` sponsor: open profile 0 to 1; save notes 1 to 1; edit person 1 to 1; add person 1 to 1; add tag 1 to 1; edit sponsor 1 to 1; reload 1 to 2. Bulk tagging and saved views on the Sponsors list still use `router.refresh()` (they are not profile edits; with a panel open they would log one view).

## 3. Confirmation note

`sponsorships_guard()`: the note must differ from the old one after trimming all white space and lower-casing, and must have at least 5 characters that are not white space. Also checked on the screen and in `confirmSchema` (new message "Say how you checked it, in at least 5 characters.", the empty message is unchanged). Tests: trailing space, other letter case, leading spaces and line break all refused; `a b`, `ok ok` refused; a real note works.

## 4. Contact email characters

Constraint `brand_contacts_email_chars` (`?`, `&`, `%`, any space or line break), added not valid, existing rows checked in the migration, then validated (all 34 local rows pass; on a database with a failing row the migration prints their ids and leaves it not valid). Tested for insert and update.

## 5. Export audit line

`creators_export()` stores `"q": true` when a search text was used and omits the key when not; `sponsors_export()` replaces the `q` text in its filter JSON with `true`. Other keys unchanged. Tested with an address as the search text (not in the line).

## 6. Approve with no address

`editAction` in `app/(company)/emails/review/actions.ts`: on Approve, a draft to a sponsor's contact is refused when the contact person is gone, has no address, or the address differs from the draft's, with the same words as the send route. Checked in the browser (both cases; the draft stays Draft).

## 7. Import audit lines

New `record_brand_import(count, contacts, duplicates, errors, partial)` (security definer, staff only, counts 0 to 2,000, and the count may not be higher than the sponsors created in the last 30 minutes). `log_audit()` refuses `brands.imported` from any signed-in caller (the owner too) and no longer lists `sponsorships.imported` (nothing writes it; the label stays in the audit screen for old lines). The sponsors import route calls the function in its `finally`, as before. Limit: the cap is "no more than new sponsors from the last half hour", so a staff member who has just created sponsors could still record a smaller number than they imported. The old test in `sponsors.sql` that expected staff to be allowed to log both lines was changed on purpose.

## 8. Cosmetic

The tag chip now holds its own remove button inside one outline (creator and sponsor profile styles). Deleting a deal shows the toast "Deal deleted." (shown when the answer arrives, because the row and its form are gone a moment later). `review-fixes-ui.md` written.

## Test changes made on purpose
- `supabase/tests/sponsors.sql`: staff can no longer write the two import lines through `log_audit` (item 7).
- `supabase/tests/review_fixes.sql`: before the "later page needs a first page" check, recent export lines are moved back a day inside the rolled-back transaction, so the browser tests' own exports do not make it fail (it failed when run within 30 minutes of an owner export).

## Results (local stack, dev server)
`npx tsc --noEmit` clean; `npm run lint` clean; `npx vitest run` 490 passed; `bash supabase/tests/run.sh` all SQL checks and the HTTP checks pass; browser: `tests/qa.e2e.cjs` 131 passed 0 failed (the very first run after my edits had 2 failures in "worker limits", and `lib/creators/e2e.cjs` 1 failure; both passed on the next run with no change, most likely the dev server compiling routes on first use), `lib/creators/e2e.cjs` 70/0, `lib/creators/profile.e2e.cjs` 34/0 (after changing the short-note message so the empty-note text stays "Say how you checked it."), `lib/sponsors/e2e.cjs` 93/0, `lib/deals/e2e.cjs` all passed, `lib/email/e2e.cjs` all passed. Test mode is on. Seed counts as found (60 creators, 26 sponsors, 34 contact people, 115 records, 19 deals, 40 emails); no `ZZ` rows left. The audit log keeps lines from my test runs (names `ZZ FF`).
