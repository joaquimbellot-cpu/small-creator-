# 05 - Build plan and shared contract

The owner approved the prototype on 25 November 2026. This file is the contract every build agent follows.
Read it fully. Then read only the parts of the other files that your brief points to.

- Approved look and behaviour: `docs/ui-upgrade/prototype/smallfold-ui-prototype.html` (fake data, one file: CSS at the top, then JavaScript). It is the reference for layout, wording and behaviour. Do not copy its data.
- What exists today: `docs/ui-upgrade/01-current-state.md`.
- Data model reasoning: `docs/ui-upgrade/03-data-plan.md` (this file overrides it where they differ).
- Screens: `docs/ui-upgrade/04-ui-spec.md`.

## 1. Rules for every agent

1. Work in `/home/user/small-creator-` on branch `ui-upgrade`. **Do not commit, push, stash, switch branch or run any git command that changes anything.** The team leader commits.
2. **Edit only the files your brief says you own.** If you need a change in someone else's file, do not make it: say so in your report.
3. Fake data only. Never send a real email. Never read `.env*` files. Never connect to anything but the local stack. Put no real names, emails, phone numbers or secrets in any file: the repository is public.
4. The local stack is already running. **Never run `dev/reset.sh`, `dev/stop.sh` or `dev/start.sh`.** Postgres: `psql -h 127.0.0.1 -p 54322 -U postgres`.
5. A dev server is already running on http://localhost:3000 with hot reload. **Do not start, stop or restart it, and do not run `npm run build` or `npm run dev`.** You may open pages on it (Playwright is installed: `require('playwright')`, `chromium.launch()` needs no options; take screenshots at `deviceScaleFactor: 1` and save them only under your scratch folder, never in the repo). Logins are in `admin/supabase/seed/EXPECTED.md`. Use the correct password: five wrong tries lock the login for 15 minutes.
6. Checks you run from `admin/`: `npx tsc --noEmit` (fix errors in your own files; report errors in files you do not own), `npm run lint`, `npx vitest run <your test files>`.
7. Database changes are **new migration files only**, in `admin/supabase/migrations/`, with the file name your brief gives you. Additive only: no drop of a table or column, no rename, no type change, no delete or update of existing rows except a documented backfill of new columns. Every statement must be safe to run twice (`if not exists`, `create or replace`, `drop trigger if exists` then create). Start each file with a header comment like the existing migrations: what it does, why it is safe on the live database, how to roll back. Apply it with `bash dev/migrate.sh`; to re-apply your own edited file: `psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -1 -f <file>`.
8. Security, as in the existing code: every page calls `requireStaff()` or `requireOwner()`; every API route uses `admin/lib/api/handler.ts`; every server action checks the role and validates input with zod; database access goes through the user's Supabase client so RLS applies; every new table has RLS on, staff read and write, owner delete, nothing for `anon`; a view of contact details (email, phone) writes an audit line; export and import write audit lines.
9. Match the existing code style: server components by default, small client components, CSS modules or the shared classes, no new npm packages, no icons, no shadows, plain English labels in sentence case. Comments explain why, in one or two lines.
10. Write tests where the brief asks. Do not weaken, skip or delete an existing test. If an existing test must change because behaviour changed on purpose, say so in your report.
11. Finish with a report of 10 lines or fewer: files you created or changed, what works, what you could not do, and anything another agent or the leader must do. Save longer notes to `docs/ui-upgrade/build/<your-name>.md`.

## 2. Decisions

- **Sponsors are the `brands` table, extended.** Table and column names say `brand`; screens say "Sponsor". Routes: `/sponsors`, `/sponsors/[id]`.
- **A link is a deal.** There is no `matches` table. "Link" creates a row in `deals` with the new first stage `matched`. `deals.amount_cents` may be empty for a new link.
- **Suggestions are worked out on request**, not stored. Score: niche fit 40, size fit 25, the sponsor backed similar creators 20, recency 15. Rules in `03-data-plan.md` section 7 and in the prototype's `score()` function.
- **Sponsorship records** carry `source_label` = `confirmed` or `detected`. Detected records never reach an email. Counts and filters use confirmed records unless the person ticks "Count detected records too".
- **No YouTube scanner in this build.** Detected records come only from the seed (local) and from imports marked unverified. Leave out `sponsor_aliases` and `scan_runs`.
- **Niches are a fixed list**, keyed by slug: tech, gaming, diy, cooking, fitness, finance, travel, education, beauty, music, photo, outdoors. Names as in the prototype (`NICHES`). The free-text `creators.niche` column stays as it is.
- **The commission rule does not change** (10%, 8%, 5% by deal size, set by the database). The price calculator has its own margin field and shows a note that the two differ.
- **Filters live in the page address.** List pages are server components that read `searchParams`. The filter rail is a client component that changes the address with `router.replace` (short debounce). The server returns the rows and the counts per option.
- **Profiles open in a side panel first** (`?open=<id>` on the list page), with a link to the full page (`/creators/[id]`, `/sponsors/[id]`).

## 3. Database contract (the Database agent builds this; everyone else uses these names)

`niches`: `slug text primary key`, `name text`, `sort_order int`. Seeded with the 12 niches by the migration (this is reference data, so it belongs in the migration).

`creators`, new optional columns: `niche_slug text references niches(slug)`, `language text`, `country text` (2-letter code), `avg_views integer`, `avg_views_checked_at timestamptz`, `last_video_at timestamptz`, `uploads_per_month integer`, `engagement_rate numeric(5,2)` (percent), `audience_countries text` (free text such as "US 40%, UK 15%"), and cached, trigger-kept: `sponsorship_count integer not null default 0`, `last_sponsorship_at date`, `detected_sponsorship_count integer not null default 0`, `last_detected_sponsorship_at date`.

`brands`, new optional columns: `relationship text` (`prospect`, `contacted`, `talks`, `partner`, `past`, `do_not_contact`; default `prospect`), `industry text`, `country text`, `company_size text` (`1-10`, `11-50`, `51-200`, `201-1000`, `1000+`), `target_niches text[]` (niche slugs), `target_min_subs integer`, `target_max_subs integer`, `budget_min_cents bigint`, `budget_max_cents bigint`, `last_contacted_at timestamptz`, `updated_at timestamptz`, and cached: `sponsorship_count integer` (distinct creators, confirmed), `last_sponsorship_at date`, `detected_sponsorship_count integer`, `last_detected_sponsorship_at date`.

`brand_contacts`: `id`, `brand_id`, `full_name`, `role_title`, `email citext`, `phone`, `linkedin_url`, `is_primary`, `notes`, `created_at`, `created_by`, `updated_at`.

`sponsorships`: `id`, `creator_id`, `brand_id` (may be empty when the brand is not known), `brand_name_raw`, `sponsored_on date`, `video_url`, `video_title`, `source_label` (`confirmed` | `detected`), `origin` (`manual`, `import`, `deal`, `detected`), `detection_signal text`, `detection_confidence` (`high`, `medium`, `low`), `evidence_note`, `confirmed_by`, `confirmed_at`, `rejected boolean`, `rejected_by`, `rejected_at`, `deal_id`, `notes`, `created_at`, `created_by`, `updated_at`. Rules in `03-data-plan.md` section 3 (items 1 to 5, 7 and 8). View `creator_sponsorship_facts`: confirmed and not rejected only.

`deals`: new enum value `matched` before `contacted`; `amount_cents` may be null (commission is then null or 0; every function that sums amounts must still work).

`tags` (`id`, `name citext`, `scope` = `creator` | `brand`, unique per scope), `creator_tags`, `brand_tags`, `lists` (`id`, `name`, `kind` = `creators` | `brands`, `created_by`), `list_items` (`list_id`, `creator_id` or `brand_id`), `saved_views` (`id`, `owner_id`, `scope` = `creators` | `sponsors`, `name`, `query text`, `is_shared`).

The view `creator_summaries` gets the new creator columns appended. A matching view `brand_summaries` is added for the sponsors list.

Audit: new allowed actions in `log_audit`: `brand.viewed`, `brands.exported`, `brands.imported`, `sponsorships.imported`. Row triggers: `brand_contact`, `sponsorship` (with `sponsorship.confirmed` and `sponsorship.rejected` as readable actions), `list`. Cached counter columns must not flood the audit log.

Migration file names (one owner each):

| Prefix | Owner |
|---|---|
| `20261125000100` to `20261125000400` | Database agent |
| `20261125000500` | Creators list agent |
| `20261125000600` | Creator profile agent |
| `20261125000700` | Sponsors agent |
| `20261125000800` | Matching and Link agent |
| `20261125000900` | Outreach agent |
| `20261125001000` | Search and polish agent |

Fake seed data lives in `admin/supabase/seed/` and is applied only to the local stack. It is never part of a migration.

## 4. Page address keys (creators list)

`q`, `subs=min-max`, `sponsored=yes|no`, `detected=1`, `recent=30|90|180`, `by=<brand id>,<brand id>`, `niche=<slug>,<slug>`, `status=<status>,<status>`, `contacted=never|in30|over30|over90`, `views=<min>`, `lang=…`, `country=…`, `email=1`, `tag=<tag id>,…`, `list=<list id>,…`, `sort`, `dir`, `view=cards`, `page`, `open=<creator id>`, `for=<brand id>` (best-match sort). Sponsors list: `q`, `industry`, `niches`, `target=min-max`, `budget=min-max` (dollars), `active=yes|no`, `detected=1`, `count=1|3|5`, `last=30|90|180`, `rel`, `size`, `country`, `contact=1`, `tag`, `sort`, `dir`, `view`, `page`, `open`, `for=<creator id>`.

## 5. Waves

1. Database; UI kit; Price calculator.
2. Creators list and filters; Creator profile; Sponsors.
3. Matching and Link (with the deals board); Outreach (pitch drafts); Search and polish.
4. Security review (read-only), then QA in the browser. Fix, then re-test.
