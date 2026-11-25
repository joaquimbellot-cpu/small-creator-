# Search and polish (notes)

## Global search
- Button "Search  Ctrl K" in the top bar (`components/shell/AppShell.tsx` mounts `components/search/SearchLauncher.tsx`). Ctrl+K and Cmd+K toggle it on every company page; Esc, the x button or a click on the veil close it and focus goes back to where it was.
- Dialog (`role="dialog"`, label "Search"), one labelled input (combobox), `role="listbox"` with `role="option"` rows (focus stays in the input, `aria-activedescendant`; arrows move, Enter opens, mouse hover and click work). Tab cycles between the input and the close button. States: "Searching...", "Nothing matches ...", and an error line with "Try again". A screen-reader status line says the number of results.
- Empty input: "Recently opened" (creators and sponsors opened from the palette; `sessionStorage` key `smallfold.recent`, name, meta and link only, 6 at most, re-validated on every read) and "Go to" (Creators, Sponsors, Deals, Sponsorship price calculator).
- Client: 200 ms debounce, stale requests aborted. Server: `GET /api/search?q=` via `apiHandler` (staff, zod 1 to 100 characters after trim, 400 otherwise, 401 when logged out), calls `global_search`, returns `{ groups }`.
- Database: `20261125001000_search.sql`, function `global_search(text)`, security invoker, fixed `search_path`, `authenticated` and `service_role` only. Creators by name and channel name, sponsors by name and industry, deals by creator or sponsor name; `like_pattern()` escapes `% _ \`; 6 rows per kind. Returns ids, names, channel, subscribers, industry, deal stage, the other party's name. **No email, phone, note or contact person, so no audit line is written.**
- Speed: no new index. With 20,000 fake creators (rolled back) a search took 20 to 26 ms, one letter included; the existing trigram indexes on creator name, channel name and sponsor name are used. Sponsor industry has a btree only, but there are few sponsors.
- Tests: `lib/search/search.test.ts` (9, vitest), `supabase/tests/search.sql` (18, added to `run.sh`): each field, case, `%` and `_`, blank input, 6 per kind, no contact column, `anon` refused, a role-less login gets 0 rows.

## Audit log labels
`settings/audit/format.ts` has plain verbs for `creator.*`, `brand.*` (shown as "sponsor"), `brands.exported|imported`, `brand_contact.*`, `sponsorship.*` (including confirmed, rejected, restored), `sponsorships.imported`, `list.*`, `deal.*`, `email.drafted`, `email.unsubscribed`, `profile.created|deleted`, `settings.updated`. The Audit log page renders with the seed (50 rows, "Viewed a sponsor" shown).

## Sponsor tag editor
`sponsors/profile/TagEditor.tsx` (same look as the creator one) and `tag-actions.ts` (`addSponsorTag`, `removeSponsorTag`: `requireStaff`, zod, user's client so RLS applies, scope `brand`), own `tags.module.css`. `SponsorProfile.tsx` shows it in the head, in place of the read-only tags, and loads the known sponsor tags for the suggestions. Checked as a worker: add and remove.

## Browser tests
- `lib/creators/e2e.cjs`: 70 ok. Changed: "earned $2375" and "deals 1" now read the Deals section of the new profile (the profile has no "earned" total and no "Deals n" counter): the paid deals' amounts are on screen and amount less commission equals `total_earned_cents`; the number of deal rows equals `deal_count`. Nothing else touched.
- `tests/qa.e2e.cjs`: 101 ok. Changed: section 3 and the worker/owner Delete checks wait for `?open=` (was `?creator=`) and say "side panel" (was "pop-up"); the channel link is looked up as a link to the channel URL under the creator name (the old "YouTube" row is gone); the panel `Escape` was moved so the list can be checked after it closes. Added: the creators list shows no email; section 8 (list counts, top-bar Sponsors tab, full profile page and 404 for a bad id, sponsors list, panel, full page, worker without Delete, calculator); section 9 (Ctrl+K, find and open a creator, a sponsor and a deal, Recently opened, Esc, Nothing matches, route 401 and 400, worker allowed, no contact data in the reply). All other checks kept as they were.

## Keyboard and contrast pass (`/creators`, `/creators/<id>`, `/creators/calculator`, `/sponsors`, `/sponsors/<id>`, owner, 1360 px)
Measured with a script (tab order, computed outline, label of every input, text contrast against the real background): page titles set on all five; one `h1` each; no unlabelled input or nameless button or link; no text under 4.5:1 (3:1 for large text); Tab order follows reading order (brand, nav, Search, Log out, then the page; filter rail before results). Every stop shows the 2px blue ring. The range-slider thumbs show it on the thumb, not on the input (by design in `kit.module.css` lines 82 to 84). Nothing to fix in files I do not own. The palette itself fits 400, 820 and 1360 px without sideways scroll, as owner and worker, opened on Overview, Creators, Sponsors, Deals, the calculator and a creator page.
Not checked: dark mode, and Tab order inside an open side panel after a click elsewhere on the page (the panel traps focus only once focus is inside it, as designed in the UI kit).

## For others
- `lib/deals/format.ts` still has no `matched` label (Matching agent); the search box has its own stage map.
- `AppShell` now holds the Search button inside `.shell__user`; no global CSS was needed.
