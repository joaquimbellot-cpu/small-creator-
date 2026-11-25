# Database notes (Database agent)

Four migrations, `admin/supabase/migrations/20261125000100` to `20261125000400`, all applied to the local stack and safe to run twice.
Seed: `admin/supabase/seed/seed-upgrade.sql` (run by `run-seed.sh` after `seed.sql`, also safe to run again). Tests: `admin/supabase/tests/sponsors.sql` (72 checks, in `run.sh`).

## Where each thing lives

| File | Contents |
|---|---|
| `20261125000100_niches_creators_brands_contacts.sql` | enum value `matched`; `niches`; new `creators` and `brands` columns and indexes; `brand_contacts`; `touch_unless_counters()` |
| `20261125000200_sponsorships.sql` | `sponsorships`, its guard / rollup / deal triggers, view `creator_sponsorship_facts`, backfill from completed and paid deals |
| `20261125000300_deals_amount_tags_lists_views.sql` | `deals.amount_cents` nullable; `deals_before()`; `tags`, `creator_tags`, `brand_tags`, `lists`, `list_items`, `saved_views` |
| `20261125000400_views_and_audit.sql` | `creator_summaries` (new columns appended), `brand_summaries`, `log_audit`, `audit_row`, audit triggers |

Later migrations that replace `log_audit` or `audit_row` must copy the version in `20261125000400` (it holds the newest action list). Add your action to the `v_ok` array there.

## Tables and columns (as built)

All new tables: RLS on, `anon` has nothing, `authenticated` reads and writes as staff (owner role or worker role), delete is owner only unless noted. `service_role` has all privileges.

**niches** `slug text pk` (lowercase), `name text`, `sort_order int`. Twelve rows: tech, gaming, diy, cooking, fitness, finance, travel, education, beauty, music, photo, outdoors (names as in the prototype). Staff can edit; owner deletes.

**creators**, new columns: `niche_slug text -> niches(slug)`, `language text` (`en`, `pt`, `en-GB` style), `country text` (2 capital letters), `avg_views integer`, `avg_views_checked_at timestamptz`, `last_video_at timestamptz`, `uploads_per_month integer`, `engagement_rate numeric(5,2)` (percent, 0 to 100), `audience_countries text` (up to 500 characters), and the trigger-kept `sponsorship_count integer not null default 0`, `last_sponsorship_at date`, `detected_sponsorship_count integer not null default 0`, `last_detected_sponsorship_at date`. Counters ignore rejected records. Creator counts are records, not sponsors.

**brands** (the Sponsors), new columns: `relationship text not null default 'prospect'` (`prospect`, `contacted`, `talks`, `partner`, `past`, `do_not_contact`), `industry text`, `country text` (2 capitals), `company_size text` (`1-10`, `11-50`, `51-200`, `201-1000`, `1000+`), `target_niches text[] default '{}'` (niche slugs), `target_min_subs int`, `target_max_subs int`, `budget_min_cents bigint`, `budget_max_cents bigint` (min must not exceed max), `last_contacted_at timestamptz`, `updated_at timestamptz not null default now()`, and the trigger-kept `sponsorship_count int not null default 0` (distinct creators, confirmed), `last_sponsorship_at date`, `detected_sponsorship_count int not null default 0` (distinct creators, detected), `last_detected_sponsorship_at date`.

**brand_contacts** `id uuid`, `brand_id uuid` (cascade), `full_name text`, `role_title text`, `email citext`, `phone text`, `linkedin_url text` (https, linkedin.com only), `is_primary boolean`, `notes text`, `created_at`, `created_by`, `updated_at`. One primary per sponsor: saving a new primary un-marks the old one. Same email once per sponsor.

**sponsorships** `id`, `creator_id` (cascade), `brand_id` (nullable, restrict), `brand_name_raw text`, `sponsored_on date`, `video_url text` (https), `video_title text`, `source_label text not null` (`confirmed` | `detected`, no default), `origin text not null` (`manual`, `import`, `deal`, `detected`), `detection_signal text`, `detection_confidence text` (`high`, `medium`, `low`), `evidence_note text`, `confirmed_by uuid`, `confirmed_at timestamptz`, `rejected boolean not null default false`, `rejected_by uuid`, `rejected_at timestamptz`, `deal_id uuid` (set null), `notes text`, `created_at`, `created_by`, `updated_at`.

**tags** `id`, `name citext`, `scope` (`creator` | `brand`), `created_at`, `created_by`; unique `(scope, name)`. **creator_tags** `(creator_id, tag_id, created_at)` pk on the two ids; **brand_tags** `(brand_id, tag_id, created_at)`. A tag only fits its scope (trigger). Staff can also delete rows in the two link tables and in `list_items` (taking a tag off or a person out of a list is not a data delete).

**lists** `id`, `name`, `kind` (`creators` | `brands`), `created_by`, `created_at`, `updated_at`; unique `(kind, name)`. **list_items** `id`, `list_id`, `creator_id` or `brand_id` (exactly one, matching the list kind, enforced by trigger), `added_by`, `added_at`; each item once per list.

**saved_views** `id`, `owner_id` (default the caller), `scope` (`creators` | `sponsors`), `name`, `query text` (page-address query, no leading `?`, not a full address, 2000 characters at most), `is_shared`, `created_at`, `updated_at`; unique `(owner_id, scope, name)`. Read: your own and shared ones. Insert, update, delete: only your own (the owner role may also delete any). The page must still validate `query` when it loads it.

**deals**: enum `deal_stage` is now `matched, contacted, replied, negotiating, signed, completed, paid`. `amount_cents` may be null and has no default (an empty amount); `commission_cents` stays not null and is 0 when the amount is empty.

## Sponsorship rules (enforced by the database)

- `source_label` has no default; a missing label is an error.
- Confirmed: needs `confirmed_at`, `confirmed_by` (except `origin = 'deal'`), and cannot be rejected. A client that inserts a confirmed row gets `confirmed_by = auth.uid()` and `confirmed_at = now()` whatever it sent.
- Detected: needs `detection_signal` and `detection_confidence`; no confirm fields.
- Confirming (update detected to confirmed): needs a non-empty `evidence_note`; `confirmed_by` and `confirmed_at` are set from the login. A rejected record must be restored first. Who confirmed cannot be changed later.
- Rejecting: `update ... set rejected = true`; `rejected_by` and `rejected_at` are filled in; the row stays. A confirmed record cannot be rejected (the owner deletes it instead).
- Restoring: `set rejected = false` by signed-in staff (not the service role); the reject fields are cleared. A confirmed record never goes back to detected.
- A client cannot insert `origin = 'deal'` or a `deal_id`. Records from deals are made by the trigger below.
- The same creator, video link and sponsor is stored once (unique), so a rejected record is not re-created by an import; use `on conflict do nothing`.
- Email and Claude prompts must read `creator_sponsorship_facts` only.

**Deal to record**: when a deal is inserted at, or moved to, `completed` or `paid`, trigger `trg_deal_sponsorship` inserts one confirmed record (`origin = 'deal'`, `deal_id`, `sponsored_on` = the day of the stage change, `confirmed_by` = whoever moved it, empty when the database did it). Never twice per deal. Moving a deal back leaves the record in place.

## Views and functions

- `creator_summaries` (security invoker): the old 20 columns in the old order, then `niche_slug, language, country, avg_views, avg_views_checked_at, last_video_at, uploads_per_month, engagement_rate, audience_countries, sponsorship_count, last_sponsorship_at, detected_sponsorship_count, last_detected_sponsorship_at`.
- `brand_summaries` (security invoker): `id, name, website, notes, created_at, relationship, industry, country, company_size, target_niches, target_min_subs, target_max_subs, budget_min_cents, budget_max_cents, last_contacted_at, updated_at, sponsorship_count, last_sponsorship_at, detected_sponsorship_count, last_detected_sponsorship_at, contact_count, deal_count, open_deal_count`. `open_deal_count` = deals not `completed` and not `paid` (a `matched` deal is open). "Active sponsor" on screen = a confirmed record in the last 90 days: use `last_sponsorship_at`.
- `creator_sponsorship_facts` (security invoker): `id, creator_id, brand_id, brand_name, sponsored_on, video_url, video_title, origin, confirmed_at` for confirmed, not rejected records only. No notes, no evidence.
- `stats_overview()` is unchanged: `deals_by_stage` now has a `matched` key (JSON keys are unordered, so do not depend on its position); `active_deals` counts only negotiating, signed and completed.
- `log_audit(action, entity_type, entity_id, details)`: new allowed actions `brand.viewed`, `brands.imported`, `sponsorships.imported` (staff) and `brands.exported` (owner only, like `creators.exported`).
- Audit lines written by triggers: `brand_contact.created|updated|deleted` (email, phone, LinkedIn and notes appear only as `{"changed": true}`), `sponsorship.created|updated|deleted|confirmed|rejected|restored` (label = the sponsor name; details carry `creator_id`, `brand_id`, `source_label`, `origin`), `list.created|updated|deleted`. The four counter columns on creators and brands never create a line, and a counter-only change does not move `updated_at`. `recent_activity()` does not list the new actions (unchanged on purpose).
- Calls from the app (user's client, RLS applies): confirm = `update sponsorships set source_label='confirmed', evidence_note=... where id=...`; reject = `set rejected=true`; restore = `set rejected=false`.

## Seed (local only, fake)

Logins as before: `owner@example.test` / `Owner-Test-Pass-2026!`, `worker@example.test` / `Worker-Test-Pass-2026!`.

| Table | Rows |
|---|---|
| creators | 60 (unchanged); all 12 niches, 12 countries, 9 languages; `avg_views` 54, `engagement_rate` 45, `audience_countries` 36 |
| brands | 26 (10 old, 16 new), all with the new columns |
| brand_contacts | 34 (22 sponsors have 1 or 2; sponsors 10, 19, 22, 24 have none) |
| sponsorships | 115 (64 confirmed, 51 detected; 5 with no sponsor, 2 rejected; 5 of the confirmed come from the completed and paid deals); 38 creators |
| tags / links | 7 (4 creator, 3 sponsor) / 33 creator links, 11 sponsor links |
| lists / items | 2 (a creators list with 7, a sponsors list with 5) |
| saved_views | 3 (one shared) |
| deals | 19 (4 new at `matched`, 2 of them with no amount) |

Numbers changed in the old tests and `expected.json` / `EXPECTED.md` because of this: `deals_by_stage.matched = 4`; `rls.sql` now expects 26 brands and 19 deals (and 20 deals after the worker's own insert); the `fixes.sql` check on `creator_summaries` columns now checks the first 20 columns and their order (the new ones are appended after them). Creators, emails and every other overview number are unchanged.

## Applying to production

Order: apply ALL the `20261125*` files in name order (listed below; the Supabase CLI or `psql -1 -f`, one transaction per file), nothing else in between. The enum value in file 1 must be committed before file 3 runs, which the one-file-per-transaction order guarantees. Do not load `seed-upgrade.sql` in production. Re-run `ls admin/supabase/migrations | grep ^20261125` before you start: if a file is not in this list, apply it in its place in the order and read its header first.

0. Back up first: a point-in-time backup or `pg_dump --format=custom` of the project, and note the row counts of `creators`, `brands`, `deals`.
1. `20261125000100_niches_creators_brands_contacts.sql`. Check: `select count(*) from niches;` returns 12; `select enum_range(null::deal_stage);` starts with `matched`; `select count(*) from creators where sponsorship_count <> 0;` returns 0. Adds columns with constant defaults, so no table rewrite. `brands.updated_at` for existing rows is the time of the migration.
2. `20261125000200_sponsorships.sql`. Check: `select count(*) from deals d where stage in ('completed','paid') and not exists (select 1 from sponsorships s where s.deal_id = d.id);` returns 0 (every such deal has a record; on a database that had none, `select count(*) from sponsorships` equals the number of those deals). The backfill writes no audit lines.
3. `20261125000300_deals_amount_tags_lists_views.sql`. Check: `select is_nullable from information_schema.columns where table_name='deals' and column_name='amount_cents';` returns YES; `select count(*) from deals where amount_cents is null;` returns 0 until someone links a creator.
4. `20261125000400_views_and_audit.sql`. Check: `select count(*) from brand_summaries;` equals `select count(*) from brands;`; `select count(*) from creator_summaries;` equals `select count(*) from creators`; `select proname from pg_proc where proname='audit_row';` returns one row.
5. `20261125000500_creators_list.sql` (list, facets and export functions for creators). Check: `select count(*) from creators_list(p_limit => 1);` returns 1 row with `total` equal to `select count(*) from creators` (run as the owner).
6. `20261125000700_sponsors.sql` (sponsor list, facets and export functions). Check: `select count(*) from sponsors_count('{}'::jsonb);` returns the number of rows in `brands`.
7. `20261125000800_matching.sql` (match score and "Best match" sort). Check: `select count(*) from pg_proc where proname in ('match_pairs','match_for_creator','match_for_brand');` returns 3.
8. `20261125000900_outreach.sql` (pitch emails to creators and sponsor contacts). Check: `select count(*) from emails where recipient_kind <> 'creator';` returns 0 on a database with no pitch drafts; `select column_name from information_schema.columns where table_name='emails' and column_name in ('brand_id','recipient_kind','brand_contact_id','pitch_facts');` returns 4 rows.
9. `20261125001000_search.sql` (global search). Check: `select count(*) from pg_proc where proname = 'global_search';` returns 1.
10. `20261125001100_review_fixes.sql` (security review and QA fixes: SR-01, 02, 03, 05, 06, 07, 09, 12, 15, 16, B-1; details in `review-fixes-db.md`). Check: `select count(*) from pg_trigger where tgname in ('brands_guard','trg_contact_email_sync','trg_contact_delete_sync');` returns 3; `select convalidated from pg_constraint where conname = 'sponsorships_video_host';` returns `t` (if it returns `f`, the notice printed by the migration lists the sponsorship rows whose video link is not YouTube: fix those, then run `alter table sponsorships validate constraint sponsorships_video_host;`); `select pg_get_constraintdef(oid) from pg_constraint where conname = 'sponsorships_deal_origin';` no longer mentions `deal_id`; as a worker `select * from creators_export()` fails with "Only the owner can export creators.".

Deploy the app together with file 10: the two export routes no longer write their own audit line (the database functions do), so an old route on the new file would write two lines per export, and a new route on the old file would write no line at all. Do not mix.

11. After the last file: smoke test as a worker and as the owner in the app: `/overview`, `/creators`, `/sponsors`, `/deals`. Then re-run `select * from stats_overview();` as the owner and compare with the number before.

Manual roll back of files 1 to 4 (only before anyone relies on the new data; the leader decides): reverse order. File 4: recreate `creator_summaries` as in `20261123000300`, drop `brand_summaries`, recreate `log_audit` from `20261123000400` and `audit_row` from `20261123000200`, drop the triggers `trg_audit` on `brand_contacts`, `sponsorships`, `lists`. File 3: `update deals set amount_cents = 0 where amount_cents is null`, then `alter column amount_cents set default 0`, `set not null`; restore `deals_before()` from `20261121000300`; drop `list_items, lists, creator_tags, brand_tags, tags, saved_views`. File 2: drop trigger `trg_deal_sponsorship` on `deals`, drop view `creator_sponsorship_facts`, drop table `sponsorships`, drop the functions `sponsorships_guard, sponsorships_rollup, sponsorship_refresh, deals_make_sponsorship`. File 1: drop table `brand_contacts`, `niches` (after dropping `creators.niche_slug`), drop the added columns and indexes, recreate trigger `trg_touch` on `creators` with `touch_updated_at()` and drop it on `brands`, drop `touch_unless_counters()`. The enum value `matched` cannot be removed from a Postgres enum; leave it (no deal uses it once the rows are moved to `contacted` first: `update deals set stage = 'contacted' where stage = 'matched'`).

## For the other agents

- TypeScript: `Stage` lists in `lib/deals/*`, `lib/assistant/tools.ts` (`STAGES`) and the deals page filters need `matched` as the first stage; `deals_by_stage` now has a `matched` key; `amount_cents` is `number | null` and `deals.amount_cents` is no longer filled with 0 by default. Anything that sums or formats amounts must handle null.
- Deleting a creator with sponsorship records works (records go with it); deleting a sponsor that has records is refused until they are removed or moved.
- The importer must send `source_label` and the other fields explicitly. For unverified imports use `source_label = 'detected'`, `origin = 'import'`, `detection_signal = 'imported_unverified'`, `detection_confidence = 'low'`.
