# 09 - Going live with the back office upgrade

Written 25 November 2026. The upgrade is built and tested on the branch `ui-upgrade`. **Nothing is live yet.** The live site and the live database are unchanged.

Going live has two parts that belong together: the database changes first, then the new app. Do not do one without the other on the same day.

## What changes for you on the live site

- New tab **Sponsors**. The Creators list has the filter panel. A creator or sponsor opens in a side panel.
- **Deals** opens as a board with a new first stage, "Matched".
- **Search** (Ctrl+K), the **Sponsorship price calculator** under Creators, and **Draft pitch with Claude**.
- Your 117 creators stay exactly as they are. Their new fields (niche from the fixed list, country, language, average views, engagement, audience) start empty, so the new filters show little until you fill them (see the end of this file).
- No fake data goes to the live database. The fake creators and sponsors exist only on the test copy.

## Step 1: back up the live database (you)

In Supabase: Database, then Backups. On the free plan, download a backup as described in "Maintaining Smallfold" in `admin/README.md`. Write down three numbers from the Table Editor: the number of rows in `creators`, `brands` and `deals`.

## Step 2: apply the eleven database files, in this order

Each file is in `admin/supabase/migrations/`. In Supabase, open the SQL Editor, paste one whole file, press Run, wait for "Success", then do the next one. If a file fails, stop and send Claude the error text: a failed file changes nothing.

1. `20261125000100_niches_creators_brands_contacts.sql`
2. `20261125000200_sponsorships.sql`
3. `20261125000300_deals_amount_tags_lists_views.sql`
4. `20261125000400_views_and_audit.sql`
5. `20261125000500_creators_list.sql`
6. `20261125000700_sponsors.sql`
7. `20261125000800_matching.sql`
8. `20261125000900_outreach.sql`
9. `20261125001000_search.sql`
10. `20261125001100_review_fixes.sql`
11. `20261125001200_retest_fixes.sql`

There is no file numbered `000600`: that is not a mistake.

A check query for each file is in `docs/ui-upgrade/build/database.md`, section "Applying to production". The quick check at the end: the three numbers you wrote down are unchanged, and `select count(*) from niches;` returns 12.

These files only add things: new tables, new optional columns, new rules. They delete no row and change no existing value, except that `brands` rows get an "updated" time.

If you prefer, Claude can apply the eleven files for you through Supabase's management connection, as on 23 November. Say so after the backup is done.

## Step 3: deploy the app (Claude, or you)

Deploy the latest commit of the branch `ui-upgrade`, with the steps in `docs/handoff.md` ("Deploys are manual uploads"). Deploy on the same day as step 2: the old app and the new database rules do not fit together for exports (an export would write two audit lines).

## Step 4: check the live site (you; Claude cannot open the live address from its sandbox)

Log in, then open Overview, Creators (tick a filter, open a creator), Sponsors, Deals, and press Ctrl+K. If something looks wrong, roll back the deploy in Netlify (Deploys, pick the previous one, "Publish deploy"). The database files can stay: the old app works with them, except exports as noted above.

## What to enter so the new screens are useful

1. **Sponsors.** Today the live database holds only brand names created by deals. Add the sponsors you know: name, website, industry, location, the niches they sponsor, the creator size they target, their usual budget, and one contact person each. The Sponsors import takes a CSV (a sample file is on the import page).
2. **Creators' new fields.** Niche (from the fixed list of 12), country and language. The creators CSV import accepts them as new columns, or edit creators one by one.
3. **Past sponsorships you know about.** On a creator's profile, "Add a record". Records you add are Confirmed. Without them, "Has done sponsorships", "Sponsored by" and the suggestions stay almost empty.
4. **For the price calculator:** average views and engagement rate per creator, and audience countries when a creator sends them.

## Still open before real emails can go out (unchanged by this upgrade)

The Gmail app password (`SMTP_PASS`) in Netlify, the sender postal address in Settings, an Anthropic API key for real Claude drafts, and the legal check for cold email.
