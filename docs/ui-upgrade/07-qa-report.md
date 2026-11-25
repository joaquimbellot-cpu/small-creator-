# 07 - QA report: back-office upgrade (browser test)

Tested 25 November 2026 on the production build at http://localhost:3000 with the fake seed data, as owner and as worker, in a real Chromium browser. I compared with the approved prototype. I changed no application code. I repaired the two test files I own (section 1).

## 1. Summary

**Score: 8 out of 10.** The upgrade works end to end. Every count on screen matched an independent SQL count (76 list cases and 5,645 filter-option counts, no real mismatch). Filters, slider, saved views, bulk actions, profiles, sponsorship history, matching, Link, the board, pitch drafts, test-mode sending, search, roles and the sizes all behave as the plan says. No Blocker. One Major bug (a Completed or Paid deal cannot be deleted), and a short list of Minor and Cosmetic items.

| | Count |
|---|---|
| Checks run by my own browser scripts | about 385 (309 scripted checks plus 76 list-count cases) |
| Filter-option counts compared with SQL | 5,645 (3,071 on creators, 2,574 on sponsors) |
| Existing suites re-run (they use their own fake rows and clean up) | `tests/qa.e2e.cjs` 101 of 101, `lib/creators/e2e.cjs` 70 of 70, `lib/creators/profile.e2e.cjs` 32 of 32, `tests/website.e2e.cjs` all passed |
| Failed (real) | 1 Major bug, 5 Minor, 9 Cosmetic (section 3). Everything else passed. |
| Flagged by my scripts but my own mistake | 14 (wrong locator, a rounding format, a rerun on data left by the first run). Each was re-run correctly and passed; none is listed as a bug. |

**The two known test failures (resolved first).**
- `tests/qa.e2e.cjs`, "owner /deals has a Delete button": **the test was out of date, the app is fine.** The board is now the default view and its cards have no Delete; Delete lives in the table view (`?view=table`). I changed the test to open `/deals?view=table` for both the owner check and the worker check (it still proves owner sees Delete, worker does not). Result: 101 passed, 0 failed. (Side note: Delete is only reachable in the table view; see C-8.)
- `lib/creators/e2e.cjs`, `getByText('Tech and gadgets')` strict-mode error: **the test was out of date.** The niche now appears several times in the panel (header, performance and suggestions). I made the two lookups exact and `.first()` (also the same problem on `getByText('Gaming')`, which hit 7 elements). Result: 70 passed, 0 failed.

**Leftover test records (I could not remove them through the app).** The seed counts are back as found except for these, all named with `ZZ`: creator "ZZ QA Bulk 06" (with one deal and one Confirmed record), sponsor "ZZ QA Sponsor One" (one contact person), creator "Quentin ZZ QA" (one test email that was sent). Counts now: creators 62 (was 60), sponsors 27 (26), contact people 35 (34), sponsorship records 116 (115), deals 20 (19), emails 41 (40). Why: the deal cannot be deleted (bug B-1), so its creator and sponsor cannot go either; a creator with a sent email cannot be deleted by design. The Overview "deals by stage" numbers are therefore off by one deal (Replied) until these are removed. A person with database access can clear them in this order: delete from sponsorships where deal_id in (select id from deals where creator_id = (select id from creators where full_name = 'ZZ QA Bulk 06')); delete the deal; delete the creator "ZZ QA Bulk 06"; delete the sponsor "ZZ QA Sponsor One"; delete the email, then the creator "Quentin ZZ QA". I did not run SQL that writes.

## 2. What passed (short)

- Creators list: every filter alone and in combination matched SQL; the slider with mouse and keyboard; "10k", "1.5M", bad input and from-above-to messages; every preset; the detected tick on and off; chips, remove one, Clear all; empty state with a "Remove ... (18)" button; every sort including Best match (the Match column shows "Strong match", a number and a "Why" list of reasons, checked by hand: 40+25+8+15 = 88 for Maya Lindqvist and Gridiron Snacks); table and cards; pagination (page 99 falls back to the last page); a pasted address gives the same list; garbage in the address is ignored; search with %, _, quotes, backslash, tags and 130 characters (counts equal SQL, no error); saved views (save, apply, delete, shared one visible to the worker); bulk select across two pages, Add to a list, Add a tag (twice: second adds 0 and says "3 already had it"), Start outreach drafts link, Change status with a confirm step.
- Creator profile: panel and full page, every section, Previous and Next, Open full page, one `creator.viewed` line per view, add a sponsorship record (empty refused, future date refused, non-YouTube and javascript: links refused, duplicate refused with a plain message, edit works), reject and restore, confirm without the note refused ("Say how you checked it."), tags added and removed, notes saved, new fields round-trip, engagement 150 refused, Delete (no deals: removed with records; with deals: friendly refusal).
- Calculator: the hand-checked case gives ask $850, creator payout $699, Smallfold's cut $175, effective CPM $43.67, steps $399 to $1,497 (on screen rounded to dollars as the test says); missing engagement and audience are flagged; no views gives a clear message; AUD shows A$; prefill from a creator and from creator plus sponsor (sponsor budget check appears); bad or unknown ids give an empty form with a notice.
- Sponsors: SQL match on every filter, 11 combinations of two to four filters and the searches; chips, empty state, all five sorts, Best match for a creator (top row Gridiron Snacks 88 equals `match_pairs`), cards, saved views, bulk tag; profile panel and full page; contact people (add, bad email, non-LinkedIn link, duplicate email refused; edit; set main keeps exactly one main; owner removes); add and edit a sponsor (empty name, bad numbers, from above to, javascript: website, duplicate name in any letter case); tag editor; import (preview writes nothing; duplicate row and bad row skipped with plain reasons; formula characters stripped) and the sample file; owner export (columns, audit line, `=`, `+` and `@` values start with an apostrophe).
- Linking and deals: Link from creator, sponsor and a suggestion card; the fair price and "Use $180.00"; do-not-contact creator, do-not-contact sponsor and an open deal each disable "Create link" with a plain reason; the new deal is at Matched; Move to; drag and drop (with a real mouse); Completed adds one Confirmed record visible in both histories and the toast says so; Paid after Completed adds none and does not claim to; editing an amount (1000 gives 8%, bad amount refused); table view and stage filter equal SQL; Add deal with and without an amount; Delete (owner) for deals that never completed.
- Outreach (test mode, fake Claude "practice draft"): the draft saved to Emails, Review with the sponsor in the title; "Facts used" holds only confirmed records, "Left out" lists the detected one, prices and contact details; refused with a plain message: do-not-contact creator, do-not-contact sponsor, opted-out creator, sponsor with no contact person, contact person on the opt-out list ("(opted out)"); pitch to a sponsor's contact makes a draft to that person; approve and send went to owner@example.test (not the creator), subject "[TEST] ...", `X-Envelope-To` the test address, one new message in the catcher, footer has "Smallfold, sponsors for small YouTube channels" and the unsubscribe line plus List-Unsubscribe headers; old compose to a creator still works.
- Search: Ctrl+K on six pages, Meta+K, the top-bar button, results for creators, sponsors and deals, keyboard only (type and Enter), Recently opened, nothing found, no email or phone in any reply.
- Worker: no Export, no Delete (creator panel and page, sponsor panel and page, contact person, deal board and table), no Claude tab, export routes 403, DELETE route 403 (the creator was still there); worker can add a sponsor, edit a creator, import, link, add a record, move a deal, reject and restore.
- Not logged in: 18 pages redirect to login; 8 GET and 6 POST routes answer 401 (only `/api/health` answers 200); DELETE answers 401.
- Sizes: 15 pages at 400, 820 and 1360 px with no sideways page scroll; skeleton rows appear while a slow filter change loads; bad ids give friendly 404 pages; focus rings visible (slider handle has a blue ring); page titles are set on every page.
- Old screens: Overview, Emails (Review, Templates, Compose, Log), Inbox, Claude, Settings (users, security, audit, sending) load without console errors; the audit log lists the new actions in plain words ("Viewed a sponsor", "Confirmed a detected sponsorship", "Exported sponsors" and so on); the public website forms pass `tests/website.e2e.cjs`.

## 3. Failures and bugs

| Id | Severity | Screen | Steps to reproduce | What happened | What should happen | Suspected file |
|---|---|---|---|---|---|---|
| B-1 | **Major** | Deals (table, owner) | Link any pair, move the deal to Completed or Paid (a Confirmed record is added), optionally move it back, then Delete the deal as owner. | Toast "Could not delete the deal. Try again." The deal stays. Every seed deal that is Completed or Paid is affected. Because of it the creator and the sponsor of that deal can also never be deleted. | The owner can delete the deal (the plan says the record stays, with its deal link cleared). | `admin/supabase/migrations/20261125000200_sponsorships.sql`: the constraint `sponsorships_deal_origin` (origin 'deal' requires `deal_id` not null) conflicts with the foreign key `deal_id ... on delete set null` (line 40 and line 55), so the delete is refused. Also `deals/actions.ts` hides the reason behind a generic message. |
| B-2 | Minor | Creators and Sponsors side panel | Open a profile from the list (click the name or press Enter on it), press Esc or click the x. | Focus goes to the page body, not back to the name that opened the panel. The Link and Draft dialogs do return focus correctly. | Focus returns to the row's name link. | the panel component in `admin/components/ui` (side panel) and `CreatorsList.tsx` / `SponsorsList.tsx` |
| B-3 | Minor | Deals, Add a deal form | Pick a do-not-contact creator (for example Oskar Ibarra), type any sponsor, Add deal. | The deal is created (I deleted it again). The Link dialog refuses the same pair. | The same block rules as Link. | `admin/app/(company)/deals/actions.ts` (add deal action) |
| B-4 | Minor | Profile, Add a record | Type a sponsor name that does not exist (for example "ZZ QA Unlisted Sponsor") and save. | A new sponsor is created silently and shows up in the Sponsors list (27 instead of 26). | A short note ("This sponsor is new and will be added") or a choice to save without a sponsor. | `admin/components/sponsorships/HistoryClient.tsx` and its action |
| B-5 | Minor | Pitch draft (practice mode) | Draft a pitch for creator "Quentin ZZ QA" with sponsor "ZZ QA Sponsor One". | "The draft broke a rule ... names \"M\", which is not in the facts." Normal sponsors work. Probably the validator trips on a sponsor name with an all-capital word and a number. I could not tell for certain. | A normal draft, or a message that names the real problem. | `admin/lib/drafting/pitch-validate.ts` (`unknownProperNouns`) |
| B-6 | Minor | Creators list, From and To fields | Type 1.5M in From and 2k in To. | The message ("From cannot be above To") shows, but the address already holds `subs=1500000-` and the list is filtered by From alone; the To box still shows 2k. | Address and boxes agree (keep the last good value, or clear both). | `admin/components/ui` range filter / `CreatorsFilters.tsx` |
| C-1 | Cosmetic | Creators empty state | Open `/creators?subs=100000-&status=new`. | The footer says "0-0 of 0". | "0 results" or nothing. | `CreatorsList.tsx` |
| C-2 | Cosmetic | Profile, Fair price box | A creator with no engagement rate. | "... for the niche. the engagement rate is not on file" (lowercase after a full stop). | Capital letter. | `admin/lib/pricing` (reason text) |
| C-3 | Cosmetic | Pitch draft (practice text) | Creator without a channel name. | "your channel has 15,000 subscribers" begins a sentence in lowercase. | "Your channel". | `admin/lib/drafting/pitch-mock.ts` |
| C-4 | Cosmetic | Sponsors empty state | Filters with no result. | Only "Clear all filters". The creators list also offers "Remove <filter> (n)" buttons. | The same suggestions as creators. | `SponsorsList.tsx` |
| C-5 | Cosmetic | Saved views | Compare the two menus. | Creators: "Name for this view" and "Save current view". Sponsors: "Name this view" and "Save view" (and "Copy link to these filters"). Delete has no confirm step on either. | One wording. | `CreatorsToolbar.tsx`, `SavedViews.tsx` |
| C-6 | Cosmetic | Deals | Table header and Add deal form say "Brand"; everywhere else says "Sponsor". | Mixed words. | "Sponsor". | `deals/page.tsx`, `AddDealForm.tsx` |
| C-7 | Cosmetic | 404 pages | Open `/creators/<bad id>` and `/sponsors/<bad id>`. | Creator: "This creator does not exist". Sponsor: generic "We could not find that page ... Back to the overview". | A sponsor-specific message with a back link to Sponsors. | `sponsors/[id]/page.tsx` |
| C-8 | Cosmetic | Deals board | Owner looks for Delete on a card. | Delete is only in the table view. The board has Edit (amount) and Move to only. | Mention in the page text, or add Delete to the card menu. | `DealsBoard.tsx` |
| C-9 | Cosmetic | Date format | Dates read "20 Sept 2026" next to "16 Sep" style elsewhere. | One abbreviation is "Sept". | One style. | `lib/.../format` helpers |

Notes: the Add deal form defaults the stage to Contacted while Link defaults to Matched (not logged as a bug). The old rule that a creator with any email in the log cannot be deleted was already in place and I left it out of the list.

## 4. Filter-count comparisons

Method: for each case I opened the pasted address, read the "N of 60 creators" (or sponsors) count, and compared it with a SQL count I wrote myself from the tables. For every case I also read every option count in the left rail (3,071 on creators, 2,574 on sponsors) and compared each with SQL (the other filters as they are, this group replaced by the option). Result: no mismatch. In my first sponsor run two "search" cases and 61 option counts differed because my SQL searched the name only; the app searches name, industry and website (that is what its placeholder says). I corrected my SQL and re-ran both (the last four rows).

### Creators (37 cases, 3,071 option counts, 0 mismatches)

| Filter case | Address | Screen count | SQL count | Match |
|---|---|---|---|---|
| none | (none) | 60 | 60 | yes |
| subs 1k-10k | subs=1000-10000 | 52 | 52 | yes |
| subs 10k-50k | subs=10000-50000 | 0 | 0 | yes |
| subs 100k+ | subs=100000- | 0 | 0 | yes |
| sponsored yes | sponsored=yes | 37 | 37 | yes |
| sponsored no | sponsored=no | 23 | 23 | yes |
| sponsored yes + detected | sponsored=yes&detected=1 | 38 | 38 | yes |
| sponsored no + detected | sponsored=no&detected=1 | 22 | 22 | yes |
| recent 30 | recent=30 | 5 | 5 | yes |
| recent 90 | recent=90 | 12 | 12 | yes |
| recent 180 | recent=180 | 21 | 21 | yes |
| recent 90 detected | detected=1&recent=90 | 18 | 18 | yes |
| niche gaming | niche=gaming | 9 | 9 | yes |
| niche gaming+tech | niche=gaming%2Ctech | 13 | 13 | yes |
| status new | status=new | 18 | 18 | yes |
| status new+replied | status=new%2Creplied | 26 | 26 | yes |
| contacted never | contacted=never | 32 | 32 | yes |
| contacted in30 | contacted=in30 | 16 | 16 | yes |
| contacted over30 | contacted=over30 | 12 | 12 | yes |
| contacted over90 | contacted=over90 | 0 | 0 | yes |
| views 1k | views=1000 | 27 | 27 | yes |
| views 5k | views=5000 | 0 | 0 | yes |
| lang en | lang=en | 20 | 20 | yes |
| country US | country=US | 5 | 5 | yes |
| email | email=1 | 60 | 60 | yes |
| q alpha | q=an | 17 | 17 | yes |
| combo status new + niche gaming | niche=gaming&status=new | 3 | 3 | yes |
| combo subs 10k-100k + sponsored yes | subs=10000-100000&sponsored=yes | 0 | 0 | yes |
| combo lang en + country US,GB | lang=en&country=US%2CGB | 10 | 10 | yes |
| combo niche photo + recent 180 + status contacted,new | recent=180&niche=photo&status=contacted%2Cnew | 3 | 3 | yes |
| combo sponsored no + contacted never + status new | sponsored=no&status=new&contacted=never | 6 | 6 | yes |
| combo subs 5k-50k + sponsored yes + detected + recent 90 | subs=5000-50000&sponsored=yes&detected=1&recent=90 | 7 | 7 | yes |
| combo views 1k + lang en + niche tech,gaming,photo | niche=tech%2Cgaming%2Cphoto&lang=en&views=1000 | 5 | 5 | yes |
| combo email + status new,contacted + contacted in30 | status=new%2Ccontacted&contacted=in30&email=1 | 11 | 11 | yes |
| combo q a + country US + sponsored yes + niche gaming | q=a&sponsored=yes&niche=gaming&country=US | 0 | 0 | yes |
| combo subs 1k-10k + lang en + status new + contacted never | subs=1000-10000&status=new&lang=en&contacted=never | 3 | 3 | yes |
| combo sponsored yes + recent 180 + contacted over30 | sponsored=yes&recent=180&contacted=over30 | 6 | 6 | yes |

### Sponsors (33 matching cases from the first run, plus the corrected re-run of the search cases; 2,574 option counts, 0 mismatches after the fix)

| Filter case | Address | Screen count | SQL count | Match |
|---|---|---|---|---|
| none | (none) | 26 | 26 | yes |
| industry Food and drink | industry=Food+and+drink | 5 | 5 | yes |
| niches gaming | niches=gaming | 3 | 3 | yes |
| niches gaming+tech | niches=gaming%2Ctech | 9 | 9 | yes |
| target 1k-10k | target=1000-10000 | 26 | 26 | yes |
| target 100k+ | target=100000- | 3 | 3 | yes |
| budget under 250 | budget=0-250 | 14 | 14 | yes |
| budget 1000-5000 | budget=1000-5000 | 14 | 14 | yes |
| budget 5000+ | budget=5000- | 1 | 1 | yes |
| active yes | active=yes | 12 | 12 | yes |
| active no | active=no | 14 | 14 | yes |
| active yes + detected | active=yes&detected=1 | 18 | 18 | yes |
| count 1 | count=1 | 26 | 26 | yes |
| count 3 | count=3 | 14 | 14 | yes |
| count 3 detected | detected=1&count=3 | 26 | 26 | yes |
| count 5 | count=5 | 0 | 0 | yes |
| last 30 | last=30 | 5 | 5 | yes |
| last 90 | last=90 | 12 | 12 | yes |
| last 180 detected | detected=1&last=180 | 22 | 22 | yes |
| rel partner | rel=partner | 6 | 6 | yes |
| rel prospect+talks | rel=prospect%2Ctalks | 12 | 12 | yes |
| size 51-200 | size=51-200 | 10 | 10 | yes |
| country US | country=US | 10 | 10 | yes |
| contact | contact=1 | 22 | 22 | yes |
| combo rel partner + niches outdoors | niches=outdoors&rel=partner | 2 | 2 | yes |
| combo country US + size 11-50 + active yes | size=11-50&country=US&active=yes | 1 | 1 | yes |
| combo budget 250-1000 + target 1k-10k + count 1 | target=1000-10000&budget=250-1000&count=1 | 26 | 26 | yes |
| combo industry Software+Education + niches tech | industry=Software%2CEducation&niches=tech | 4 | 4 | yes |
| combo last 90 + rel contacted,talks,partner + contact | rel=contacted%2Ctalks%2Cpartner&last=90&contact=1 | 9 | 9 | yes |
| combo country GB,US + niches cooking + count 3 + detected | niches=cooking&country=GB%2CUS&detected=1&count=3 | 5 | 5 | yes |
| combo active no + rel prospect + size 1-10,11-50 | rel=prospect&size=1-10%2C11-50&active=no | 3 | 3 | yes |
| combo budget 1000-5000 + last 180 + country US,CA,GB | country=US%2CCA%2CGB&budget=1000-5000&last=180 | 6 | 6 | yes |
| combo niches travel,photo + target 10k-50k + rel past,partner | niches=travel%2Cphoto&rel=past%2Cpartner&target=10000-50000 | 3 | 3 | yes |
| q a | q=a | 26 | 26 | yes |
| combo q e + industry Food and drink + active yes | q=e&industry=Food+and+drink&active=yes | 3 | 3 | yes |
| q gear | q=gear | 4 | 4 | yes |
| q example.test | q=example.test | 26 | 26 | yes |

Single-option clicks in the rail (address updated, count right) were also done for Niche, Pipeline status, Language, Country, Tag and List.

## 5. Differences from the prototype

| # | Screen | Prototype | Built | Verdict |
|---|---|---|---|---|
| 1 | All | Black "Prototype, fake data" bar, "Viewing as", "Show loading/error state" buttons | Not there | fine (prototype device) |
| 2 | Top nav and Creators tabs | "New" badges on Sponsors and on Sponsorship price calculator | No badges | fine |
| 3 | Creators | "Page address" bar with Copy link | A "Copy link" button in the toolbar | fine |
| 4 | Creators table | Name is a link, channel line says "no email" | Name opens the panel; channel line shows "No channel name" when empty; email never shown in the list | fine |
| 5 | Creators table | "Avg views" | "Average views" | fine |
| 6 | Profile | "Recent videos" table | "Performance" box (no video table) | fine (agreed change) |
| 7 | Profile, average views | "over the last 20 videos" | "checked 2 weeks ago" | fine |
| 8 | Profile | Edit, Delete | Adds "Refresh subscribers" (existing feature) | fine |
| 9 | Profile tags | Tag chips and a tag editor | Tag chip plus "Add a tag" (datalist field); remove with a x | fine |
| 10 | Suggestions | Size far from target gives +0 | "just outside the target" gives +12 (plan's rule) | fine |
| 11 | Link and Draft dialogs | Pick lists (selects) | Search boxes that show band and score; wording otherwise identical | fine (improvement) |
| 12 | Deals board | Amounts "$340", ages "19 days ago", "Move this deal to" | "$340.00", "Today / 2 days", "Move the deal X with Y to"; "Add a deal" fold and an "Edit" link beside amounts | fine (deals page as built); the cents are cosmetic, should match if the owner prefers |
| 13 | Deals board | Card has no Delete | No Delete on the board either (table only) | see C-8 |
| 14 | Sponsors empty state | Not compared in detail | Only "Clear all filters" | should match creators (C-4) |
| 15 | Saved view menus | Not compared in detail | Wording differs between lists | should match (C-5) |
| 16 | Fair price and calculator | Same method and wording | Same; "(fake data here)" dropped by design | fine |

I looked at the prototype's creators list, profile panel, Link and Draft dialogs, deals board and search; I did not compare its sponsor profile, calculator and import screens line by line.

## 6. What I could not test, and why (not run)

- **Confirm a detected record with the note, as a button press in my own scripts:** it cannot be undone (a confirmed record never goes back to detected) and would change the seed counts. The same steps passed in the existing `lib/creators/profile.e2e.cjs` (it adds its own detected rows and removes them). In my scripts I ran: confirm without the note (refused), reject, restore, as owner and as worker.
- **Creating a new list or a new tag name from the bulk bars or the tag editors:** there is no way to delete a list or tag in the app, so it would have left rows behind. I used the existing list "Spring campaign shortlist" and tags "Premium" and "Agency" and removed what I added.
- **A creator with no email:** every form requires an email, so I could not create one (the "no email" refusal is not run).
- **An opted-out creator who is not marked Do not contact:** the suppression trigger marks them; the one in the seed (Wren Mbeki) is already Do not contact, so I saw the "marked Do not contact" message. The opted-out contact person case was tested and passed.
- **Real Claude drafts:** the app runs `DRAFT_MODE=mock`, so every draft was a "Practice draft"; the wording rules for real Claude answers were not seen (only `pitch.fake.test.ts` covers them).
- **Real sending to a real address and the postal address rule:** test mode is on, no postal address is set; I did not touch Settings.
- **"Send N approved" button:** I sent my one test email through the same route the button calls (`POST /api/emails/<id>/send`), because the button would also have sent the seed's approved email to Idris Fairweather.
- **A forced server error state:** I provoked only bad ids and the slow-loading state; no safe way to make the list query fail.
- **Slow-network behaviour of the board and the calculator, print views, and Safari or Firefox:** not run (Chromium only).
- **The Security Reviewer's area** (direct server-action tampering, RLS by hand): not tested beyond the 401 and 403 checks above.
- **`lib/deals/e2e.cjs` and `lib/sponsors/e2e.cjs`:** not run, because the first would hit B-1 and leave more rows behind.
