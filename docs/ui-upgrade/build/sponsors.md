# Sponsors (Sponsors agent)

On screen "Sponsor"; in the database a row of `brands`. Everything below is built and checked on the local stack.

## Routes

| Route | What |
|---|---|
| `/sponsors` | List (server component, `requireStaff()`), filter rail, table or cards, side panel at `?open=<id>` |
| `/sponsors/[id]` | Full page, the same profile component as the panel (`mode="page"`) |
| `/sponsors/import` | CSV import: preview (new, duplicate, error), then commit |
| `GET /api/sponsors/export` | CSV of the rows that match the filters. Owner only (403 for a worker). Audit line `brands.exported` is written first; no line, no export |
| `POST /api/sponsors/import?mode=preview\|commit` | Staff. Max 1 MB, 2,000 rows. Audit line `brands.imported` (counts only) |
| `GET /api/sponsors/sample` | Sample file |

## Address keys (list)

`q`, `industry` (names, comma list), `niches` (slugs), `target=min-max` (subscribers), `budget=min-max` (dollars), `active=yes|no`, `detected=1`, `count=1|3|5`, `last=30|90|180`, `rel`, `size`, `country` (2 capitals), `contact=1`, `tag` (tag ids), `sort=name|count|last|budget|match`, `dir=asc|desc`, `view=cards`, `page`, `open`, `for` (creator id, only with `sort=match`).
All parsed and checked in `lib/sponsors/filters.ts` (`parseFilters`); a bad value is ignored. `filtersToParams` writes the canonical address; `viewQuery` is the key of a saved view.
`detected=1` only matters next to `active`, `count` or `last`. The target and budget bands are the four ranges of the prototype (`TARGET_BANDS`, `BUDGET_BANDS` in `constants.ts`, and the same four in `sponsor_facets()`; change both together).

## Database (`20261125000700_sponsors.sql`, tests in `supabase/tests/sponsors_list.sql`, 46 checks)

All `security invoker`, fixed `search_path`, `authenticated` and `service_role` only. The app sends one jsonb filter object that `sponsor_args()` reads into typed values (odd values ignored, never cast blindly, no SQL built from text).
- `sponsor_rows(p jsonb, p_skip text)`: sponsors that pass every filter, except the facet named in `p_skip`.
- `sponsors_list(p, p_sort, p_dir, p_for, p_limit, p_offset)`: a page with `total`. 25 per page in the app, at most 1000 here.
- `sponsors_count(p)`, `sponsor_facets(p)` (facet, value, n: the count beside every option, other filters as they are; zero-count options included), `sponsors_export(p, p_sort, p_dir, p_limit, p_offset)` (same columns as the import file, main contact included).
- "Active" = confirmed sponsorship in the last 90 days. With `detected = true` the active, count and last filters use confirmed and detected records (not rejected), counted per distinct creator, straight from `sponsorships`; with it off they use the cached columns of `brands`.
- **For the Matching agent:** `sort=match` and `for=<creator id>` already reach `sponsors_list` as `p_sort = 'match'`, `p_for`. Today it sorts by name. Replace the function with `create or replace` (same signature and columns) in your migration, and add `{ value: 'match', label: 'Best match for a creator' }` and a "For: creator" picker to `SORT_OPTIONS` / the toolbar in `app/(company)/sponsors/SponsorsList.tsx` (that file is mine; ask me or the leader to merge). The list already shows `sort=match` if it is in the address.

## Helpers other agents may call (server side)

`lib/sponsors/queries.ts`: `searchSponsors(supabase, q, limit)` (brand picker: id, name, industry), `getSponsorBasics(supabase, id)`, `loadList`, `loadFacets`, `countSponsors`, `loadTags`, `loadViews`. `lib/sponsors/constants.ts`: `RELATIONSHIP_LABEL`, `NICHES`, `nicheName`, `countryName`, `DEAL_STAGE_LABEL`. `lib/sponsors/format.ts`: `formatDate`, `relativeDays`, `formatBudget`, `formatTarget`. The profile: `@/app/(company)/sponsors/profile/SponsorProfile` (`{ id, mode: 'panel' | 'page' }`, server component).

## Behaviour notes

- Contact people (`brand_contacts`): add, edit, set main contact (the database un-marks the old one), delete (owner only). The first person added becomes the main contact. LinkedIn must be https on linkedin.com (form, import and database).
- `brand.viewed` is written once per profile render, after the response (`after()`), with the name only. Never an email or phone in an audit detail (the row trigger already hides them for `brand_contact`).
- Delete (owner only): refused with a plain message when deals or sponsorship records exist (the database restricts it too).
- Import: one contact person per row (main contact), duplicates by name (any letter case, database or earlier row), formula characters stripped from the start of cells, imports write no sponsorship records. Export writes the same columns, so a file can be imported again (the guard quote on export is removed on import).
- Saved views: scope `sponsors`, own or shared; apply, save, delete own, "Copy link to these filters". Bulk "Add a tag" creates the tag (scope `brand`) when it does not exist.
- Slots placed as in the prototype: `LinkButton` ("Link to a creator") and `DraftPitchButton` in the actions row, `SponsorshipHistory side="brand"` after the contact people, `Suggestions side="brand"`, Deals, Notes. They render nothing until their owners finish.
- Panel "n of m" counts the rows of the current page (Previous and Next stay on the page).

## Left for others / not done

- The profile has no outreach history (the emails table has no sponsor link yet) and no tag editor on one sponsor (tags are added in bulk from the list).
- `AppShell` has the Sponsors tab; `NavLinks` highlighting for `/sponsors/<id>` follows its own rule.
- Matching sort and "For" picker: see above.

## Tests

`npx vitest run lib/sponsors` (filters round trip, bad values, schemas, CSV), `bash supabase/tests/run.sh` (includes `sponsors_list.sql`), `node lib/sponsors/e2e.cjs` (owner and worker, 93 checks, cleans up what it creates).
