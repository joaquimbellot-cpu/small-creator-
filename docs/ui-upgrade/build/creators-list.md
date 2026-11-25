# Creators list notes (Creators list agent)

Page `/creators`: filter rail, counts, chips, sort, table and cards, saved views, bulk actions, side panel, export.

## Files
| File | What |
|---|---|
| `admin/supabase/migrations/20261125000500_creators_list.sql` | SQL functions (below). Safe to run twice, additive only. |
| `admin/supabase/tests/creators_list.sql` | 52 checks, in `run.sh` |
| `admin/lib/creators/filters.ts` | `parseFilters`, `filtersToQuery`, `toRpcArgs`, `cleanQuery`, `creatorFilterDefs`, `searchFilter` (still used by the email picker) |
| `admin/lib/creators/query.ts` | `loadPage`, `loadFacets`, `loadRelax`, `loadOptionNames` (server only) |
| `admin/lib/creators/constants.ts` | `NICHES` (12 slugs and names), `ListRow`, option lists |
| `admin/app/(company)/creators/` | `page.tsx`, `CreatorsList.tsx` (owns address, ticks, panel), `CreatorsFilters.tsx`, `CreatorsToolbar.tsx`, `CreatorsTable.tsx` (table and cards), `BulkBar.tsx`, `list-actions.ts`, `list-format.ts` |
| `admin/app/api/creators/export/route.ts` | CSV of the matching rows |

## Database functions (all security invoker, fixed `search_path`, `jit = off` on the big ones, execute for `authenticated` only)
- `creators_match_ids(filters)`: ids that match every filter. One WHERE; used by list and export.
- `creators_list(filters, p_sort, p_dir, p_limit<=100, p_offset)`: a page plus `total`. No email column.
- `creators_facets(filters)`: `(facet, value, n)`. One pass; each creator gets the list of filters it fails; an option counts creators that fail nothing or only its own filter. Rows `_total` (matches) and `_all` (everyone). Options nobody has come back with 0.
- `creators_export(filters, limit, offset)`: rows for the CSV (has email and phone; only the owner-only route calls it).
- `creators_add_to_list(list, ids)`, `creators_add_tag(tag, ids)`: 1 to 200 ids, `on conflict do nothing`, return the number added.
- Helpers: `like_pattern` (escapes `% _ \`), `creator_contacted_at` (same rule as `creator_summaries.last_contacted_at`), `contacted_matches`.
- Sort `match` is parsed (`sort=match&for=<id>`) and kept in the address; the SQL falls back to subscribers. The Matching agent adds the ranking and the entry in `SORT_CHOICES` (`CreatorsToolbar.tsx`).
- Detected records: confirmed counts use `sponsorship_count` / `last_sponsorship_at`; with `detected=1` the detected columns are added (sponsored, recent). "Sponsored by" reads `sponsorships` (not rejected; confirmed, plus detected when ticked). Rejected records are never counted.

## Index per filter (the planner picks them when selective; with a few hundred rows a plain scan is as fast)
q: `creators_full_name_trgm`, `creators_email_trgm`, `creators_channel_name_trgm`. subs: `creators_subscribers_idx`. sponsored: `creators_has_spons_idx`, `creators_has_detected_idx`. recent: `creators_last_spons_idx`, `creators_last_detected_idx`. by: `sponsorships_brand_idx`, `sponsorships_creator_idx`. niche, lang, country, views: `creators_niche_slug_idx`, `creators_language_idx`, `creators_country_idx`, `creators_avg_views_idx`. status: `creators_status_idx`. contacted: `emails_creator_idx` (last real send), `creators_last_contacted_idx`. tag: `creator_tags` pk and `creator_tags_tag_idx`. list: `list_items_creator_idx`. Facets always read all creators once (a hash join on the emails for "last contacted").
Timing with 20,000 fake creators (rolled back): list 8 to 40 ms, facets 130 to 260 ms, search 40 ms. The last contact is worked out for the page rows only (all rows only when sorting by it). Without `jit = off` the planner spent 240 ms compiling.

## Behaviour
- Address keys as in build plan section 4. Bad values are dropped. `?creator=<id>` (no `edit=1`, no `new=1`) is treated as `open=<id>`. Default sort is now subscribers, high to low (was: newest first).
- Any filter, sort, view or page change drops `open` (closes the panel), so an open profile is never rendered twice. Previous and Next only change `open`. The list never calls `router.refresh()` while a panel is open (bulk actions sit behind the panel veil). Checked: opening one creator writes one `creator.viewed` line; a filter change afterwards writes none.
- Ticks live in client state and `sessionStorage` (cap 200). Bulk actions: add to a list (existing or new), add a tag (existing or new), outreach drafts (`/emails/compose?creators=`), change status and refresh subscribers (as before).
- Saved views: stored as the cleaned address query (`cleanQuery`), re-cleaned when applied; own views can be deleted; "Share with the team" tick.
- The list shows no email address (only "no email"), so no audit line. Export: owner only, audit line first, formula guard unchanged. New columns at the end: `niche_category`, `country`, `language`, `average_views` (the import template columns are unchanged, and an export can still be imported).
- Errors: query failure shows a notice with "Try again"; pending shows `SkeletonRows` / `SkeletonCards`.

## Tests and what changed on purpose
- `creators.test.ts`: the old `parseFilters` test changed (new shape: `status` is a list, default sort `subscribers`); new tests for every key, round trip, bad values, old links, chips.
- `e2e.cjs` (68 ok, 2 fail): changed because the page changed: totals read from `.list-count`; the status filter is a live checkbox (no Apply button); the pop-up checks became side-panel checks (`open=`); the edit step uses `select[name=niche_slug]` (the profile agent replaced the free-text niche in the dialog); the new/edit dialog waits for hydration; export header has the 4 new columns. Still failing: "earned $2375" and "deals 1" in the panel; they read the old pop-up layout and belong to the Creator profile agent's panel text.
- Browser checks done as owner and worker: counts beside Status, Country, Language, Last contacted, Sponsored recently, Average views and Niche equal the result after ticking one option; slider by keyboard; chips; clear all; empty state with relax buttons; sort; cards; saved views (save, apply, delete); bulk list and tag (selection kept over a page change); panel with Previous and Next; no sideways scroll at 400, 820 and 1360 px.

## For others
- `lib/deals/format.ts` has no label for stage `matched` yet (not mine).
- Not mine, seen in lint: a warning in `lib/sponsors/e2e.cjs` and `lib/sponsors/sponsors.test.ts`.
- `CreatorDialog` is used only for `?new=1` and `?creator=<id>&edit=1` now.
