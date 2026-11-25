# Smallfold upgrade: sponsorship data plan

Author: Data Strategist. Date: 2026-11-25. Status: proposal, design only (no SQL, no code changed).

## 0. How to read this, and what was and was not checked

- I read all 15 migrations, `admin/lib/youtube/`, `admin/lib/creators/` and `admin/lib/drafting/facts.ts`.
- The Google pages (developers.google.com) could **not** be reached from this working environment (the host is not on the session's network allow list). Every YouTube claim below is therefore marked **(from prior knowledge, not checked today)**. Someone with a browser should open these three pages and tick them off before building: `videos` resource, "Quota calculator" (`determine_quota_cost`), and "Developer Policies" (section III, data storage). A short checklist is in section 13.
- **Team leader's follow-up check (25 November, by web search, from search-result summaries only, the pages themselves were not opened):** (a) Google's `videos` resource page lists `paidProductPlacementDetails` with the boolean `hasPaidProductPlacement`, so the field exists. The date it was added was not found. (b) Google's developer-policy pages say stored API data such as titles and descriptions follows a 30-day refresh-or-delete rule, with a separate allowance of up to 36 months for some statistics for API clients accepted under an amendment. Whether a plain API key can read the field, and the quota costs, are still unchecked.
- Nothing here is legal advice. Items marked **check with a lawyer** must be reviewed by one.
- No creator names, emails or phone numbers appear in this file.

## 1. What exists today (the starting point)

| Item | What it is | Why it matters |
|---|---|---|
| `creators` | name, email, phone, channel_url, youtube_channel_id, channel_name, `niche` (free text), `subscribers`, `subscribers_hidden`, `subscribers_checked_at`, `status`, `notes`, `last_contacted_at`, `source` (manual / import / website) | Niche, size and last contacted already exist. Language, country, average views and sponsorship summary do not. |
| `brands` | id, name (citext, unique), website, notes, created_at | Already holds sponsors. `deals.brand_id` points here (`on delete restrict`). |
| `deals` | creator_id, brand_id, stage (contacted ... completed, paid), amount_cents, commission trigger | A `completed` or `paid` deal is a confirmed sponsorship that we brokered. |
| `audit_log` | append-only, written by `audit_row('<entity>')` triggers | New tables should use the same trigger. |
| RLS | `staff_select/insert/update_*` using `is_staff()`, `owner_delete_*` using `is_owner()`. `anon` has all privileges revoked. | New tables copy this pattern. |
| `creator_summaries` | view (security_invoker) with deal_count, total_earned_cents, last_contacted_at (greatest of creator and emails) | Filters should extend this view, not replace it. |
| `lib/youtube/` | Only `channels.list` with `part=statistics`, optional `YOUTUBE_API_KEY`, key read on the server only. Parses channel links. | Video scanning is new code. It reuses the same key handling and `channel.ts` parser. |
| `lib/drafting/facts.ts` | Sends Claude only: full name, first name, channel name and url, niche, subscribers. | No sponsorship facts go to Claude today. Keep it that way until a person confirms (section 3). |

## 2. Decision: extend `brands`, do not create a second table

**Decision: sponsors = the existing `brands` table, extended with new columns and new child tables. "Sponsor" is the screen name; `brands` stays the table name.**

Reasons:
1. `deals.brand_id` already points to `brands`. A second `sponsors` table would mean two records for one company, or a risky move of every foreign key.
2. A brand that is only a prospect, a brand we closed a deal with, and a brand a creator was merely detected with are the same real-world company. One row, with a `relationship` column, is simpler.
3. `brands` already has RLS, grants and the audit trigger. Extending it keeps all of that.
4. Existing rows are untouched. Every new column is nullable or has a default. Nothing is renamed, dropped or retyped.
5. The unique `name` (citext) already stops duplicate names. Detection will lean on it, plus an alias table (section 6).

Cost: the word "brand" stays in the database while the UI says "sponsor". That is fine. A short code comment can say so.

## 3. The hard data rule, and how the model enforces it

Rule from the owner: every sponsorship record is **Confirmed** (entered or verified by the team) or **Detected** (found automatically, not verified). Detected records are always shown as unconfirmed and are never stated as fact in emails or pitches until a person confirms them.

How the design enforces it:

1. `sponsorships.source_label` is **not null**, values `confirmed` or `detected`. No default, so code must choose.
2. A database `check` ties the label to the people fields:
   - `confirmed` requires `confirmed_by` and `confirmed_at` to be set, and `rejected` to be false.
   - `detected` requires `confirmed_by` and `confirmed_at` to be null (until promoted).
   - Detected rows must carry `detection_signal`, `detection_confidence` and `detected_at`.
3. Promotion is one action: a person presses Confirm. A trigger sets `source_label = 'confirmed'`, `confirmed_by = auth.uid()`, `confirmed_at = now()`. It also requires an `evidence_note` or `evidence_url` (the team says how they checked: "saw the spoken ad at 0:45", "creator told us by email"). Staff only. The audit trigger records who did it.
4. Rejection is one action: Reject sets `rejected = true`, `rejected_by`, `rejected_at`, optional `reject_reason`. The row is **kept**. A unique key on `(creator_id, youtube_video_id, sponsor_id)` means the scanner cannot create it again; it upserts with "do nothing" when a row exists. A second guard blocks a whole brand: a `sponsor_aliases` row with `kind = 'ignore'` (for example a merch store or the creator's own shop domain) stops that domain or text from matching anywhere.
5. Detected rows may be edited by the scanner only while `rejected = false` and `source_label = 'detected'`. A confirmed row is never overwritten by the scanner. A trigger raises an error if the scanner role tries.
6. **Email and pitch safety.** `lib/drafting/facts.ts` must only read from a view `creator_sponsorship_facts` that returns `source_label = 'confirmed' and not rejected`. Detected rows are not in that view at all, so they cannot leak into a Claude prompt by mistake. In the UI, detected rows show a grey "Detected, unconfirmed" badge and a Confirm / Reject pair of buttons. The email draft screen may show a note such as "2 possible sponsorships are unconfirmed and were not used".
7. Counts and dates on the creator row (`sponsorship_count`, `last_sponsorship_at`) count **confirmed only**. A second pair, `detected_sponsorship_count` and `last_detected_sponsorship_at`, counts detected unrejected rows. Filters say "Has sponsored (confirmed)" and offer an extra switch "include detected (unconfirmed)", off by default.
8. Completed deals: when a deal reaches `completed` or `paid`, a trigger creates (or links) a `confirmed` sponsorship with `origin = 'deal'` and `deal_id` set. Confirmed by = the person who moved the stage.

## 4. Where sponsorship data can come from

### 4.1 YouTube Data API v3 (all facts "from prior knowledge, not checked today")

What can be read for a channel's recent videos with an API key (no creator login needed, for public data):

| Call | What it gives | Notes |
|---|---|---|
| `channels.list` (`part=contentDetails`) | `relatedPlaylists.uploads`, the id of the uploads playlist. `part=statistics` gives subscribers, view count, video count (already used). `part=snippet` gives country, title, description, default language. `part=brandingSettings` gives keywords and country. `part=topicDetails` gives topic categories. | The uploads playlist id equals the channel id with `UC` swapped for `UU`. Store it once and skip this call. |
| `playlistItems.list` (`playlistId=uploads`, `maxResults=50`) | Newest videos first: video id, title, short description, published date. | 50 per page, so the last 20 videos are one call. |
| `videos.list` (`id=` up to 50 comma-separated ids) | `snippet` (title, **full description**, tags, publishedAt, categoryId, defaultLanguage / defaultAudioLanguage), `statistics` (viewCount, likeCount, commentCount; counts can be hidden), `contentDetails` (duration), `topicDetails` (topic categories, Wikipedia links), `status`, **`paidProductPlacementDetails`**. | One call can ask for several parts. The cost is per call, not per part. |

**The paid-promotion field (key finding).**
- It exists: `videos.list` has a part called `paidProductPlacementDetails`, holding `hasPaidProductPlacement` (a boolean). It mirrors the creator's own tick box "My video contains paid promotion" in YouTube Studio. **(Existence confirmed by the follow-up check in section 0. The date it was added is not known.)**
- It is readable with a plain API key for any public video, I believe, because it is part of the public video resource and needs no creator login. **(from prior knowledge, not checked today; confirm with a single test call on a video the team owns, using the team's own key, outside this task.)**
- What it does **not** say: **who the sponsor is**, how much was paid, or what kind of deal it was. It is a yes/no flag only.
- It can be wrong in both directions. Creators forget to tick it (false negative). Some tick it for affiliate-only or product-gifting posts (arguably correct, but not always "a sponsor paid us"). Older videos may predate the box. It is also a flag **the creator controls**, so it is a good hint, not proof.
- Use: a video with `hasPaidProductPlacement = true` is a "this video is a sponsored video" signal. Brand name must come from the description scan (4.4) or from a person.

### 4.2 Quota (from prior knowledge, not checked today)

- Default daily quota for a project: **10,000 units**. It resets at midnight Pacific time. It is shared by everything that uses the key, including the existing subscriber refresh.
- Costs: `channels.list` = 1, `playlistItems.list` = 1, `videos.list` = 1 (whatever the parts), `search.list` = **100** (never use it for this). Writes cost 50 and are not needed.
- More quota needs an audit and a quota extension request to Google. Not needed at our scale if we scan smartly.

**Method.** Per creator: 1 `playlistItems.list` call for the last 20 videos (uploads id derived or stored, so no `channels.list`). `videos.list` takes 50 ids per call, so 20 videos per creator means 0.4 call per creator, if we batch ids from several creators together.

Cost per creator = 1 + 0.4 = **1.4 units** (add 1 once per creator for the first `channels.list` to learn the uploads id, country, language).

| Creators | First ever scan (adds `channels.list`) | Repeat full scan (20 videos each) | Share of one day's 10,000 |
|---|---|---|---|
| 120 | 120 + 120 + 48 = **288** | 120 + 48 = **168** | about 2 % |
| 1,000 | 1,000 + 1,000 + 400 = **2,400** | 1,000 + 400 = **1,400** | 14 to 24 % |
| 5,000 | 5,000 + 5,000 + 2,000 = **12,000** (over one day) | 5,000 + 2,000 = **7,000** | 70 % of a day (too much for one day with other jobs) |

**Sensible schedule.**
- 120 creators: rescan everyone **weekly** (168 units a week). Trivial.
- 1,000 creators: rescan everyone **every 2 weeks**, or about 100 creators a day (about 140 units a day). Run the first scan over 2 days.
- 5,000 creators: spread the first scan over **3 days** (4,000 units a day max). After that, rescan in daily slices of about 1/14 of the list (about 360 creators, 500 units a day) for a **14-day cycle**, or 1/28 for a 28-day cycle.
- Smart skip: only fetch `videos.list` for video ids not seen before (new uploads). Tier the schedule: creators with open deals or recent contact every week, everyone else every 4 weeks.
- **Never let the cycle exceed 30 days** (see 4.3).
- Keep a daily budget counter in the database (units used today). Stop the job at 80 % of quota so the existing subscriber refresh button keeps working. Handle HTTP 403 `quotaExceeded` by stopping and resuming the next day.

### 4.3 YouTube API Services terms that matter (from prior knowledge, not checked today; **check with a lawyer**)

- **Storage age.** As I remember the Developer Policies, API data that is not authorized by a user's login ("non-authorized data", which is all we would fetch with an API key) may be stored for **no more than 30 calendar days** unless it is refreshed or re-verified. Stale data must be refreshed or deleted. Plan on this: every row that came from the API carries `api_fetched_at`, and a daily job refreshes or deletes anything older than about 25 days (a 5 day safety margin).
- **What this means for sponsorship rows.** Raw API content (description text, title, tags, view counts) is the data at risk. The design therefore: (a) stores raw text only in short-lived columns (`evidence_snippet`, `video_title`) with `api_fetched_at`; (b) the daily job nulls those columns after 30 days unless it can re-fetch them; (c) a **confirmed** record keeps the team's own words (`evidence_note`), the video link and the date, which are the team's verified knowledge, not a cache. **Check with a lawyer** whether video id, publish date and a link are acceptable to keep past 30 days for confirmed rows. The safe fallback is to re-fetch the video on a schedule and drop the link if the video is gone.
- **Deriving data.** The policies limit using API data to build certain derived products, and require not misrepresenting YouTube data. Our derived items (a "sponsored recently" flag, average views, a match score) must be recomputed on each refresh and expire with their source. **Check with a lawyer** whether storing a derived "average views" or "sponsorship count" past 30 days counts as storing API data. The cautious design: compute these from fresh data, store `avg_views_checked_at`, and treat as stale after 30 days.
- **Other duties** I remember: show the YouTube Terms of Service link and the Google privacy policy link where API data is used; do not sell or give API data to third parties; handle a user's request to delete data; keep the API key private (already done: server only). **Check with a lawyer**, particularly because Smallfold is a private tool that uses the data to find commercial leads.
- The owner's manual entries (team-typed sponsor, date, notes) are the company's own data and are not subject to the 30 day rule. That is another reason manual and confirmed data should be the long-term core.

### 4.4 Detection by scanning descriptions and titles

Run on `snippet.description`, `snippet.title`, `snippet.tags`, plus the flag from 4.1. Signals, in order of strength. Confidence levels are my judgment and should be tuned with real reviewed data (see "calibration" below).

| Signal (`detection_signal`) | Example pattern | Confidence | Main false positives | Main false negatives |
|---|---|---|---|---|
| `paid_flag` | `hasPaidProductPlacement = true` | **Medium** for "this video is sponsored"; gives **no brand** | Creator ticks it for gifted or affiliate items | Creator forgets to tick it |
| `sponsored_by` | "sponsored by X", "this video is sponsored by X", "sponsor: X", "in partnership with X", "presented by X" | **High** | "not sponsored by anyone"; talking about someone else's sponsor in a news video | Phrase in another language |
| `thanks_sponsor` | "thanks to X for sponsoring", "thank you X for sponsoring this video", "X sponsored this video" | **High** | Thanking a Patreon supporter or a channel member called X | Spoken-only ads, never written down |
| `paid_partnership` | "paid partnership with X", "#paidpartnership" | **High** | Rare | Often only in the video label, not the text |
| `hashtag_ad` | `#ad`, `#sponsored`, `#sponsor`, `#advert`, `#partner` | **Medium** (says it is paid, does not give the brand) | `#ad` as part of a longer word; "ad" meaning something else; the creator's own product advert | Creators who omit the tag |
| `discount_code` | "use code NAME for 10% off", "code NAME", "promo code" with a link | **Medium to low** | Creator's own merch codes; affiliate-only deals | Codes in pinned comments |
| `tracking_link` | URL with `utm_source=`, `utm_campaign=`, `ref=`, `aff=`, `?via=` and a brand domain | **Low to medium** | Plain affiliate links; Amazon Associates; the creator's own shop | Clean links with no tags |
| `shortener_link` | bit.ly, tinyurl, `go.` / `link.` subdomains, `geni.us`, `lddy.no`, `sponsr` style links | **Low** alone (hides the real brand); useful only after following the redirect, which we should **not** do automatically (see below) | Almost every link in a description | Same |
| `known_domain` | A link whose domain is already on a sponsor's `sponsor_aliases` list (kind `domain`) | **Medium** (high if combined with a code or a text phrase) | Creator is a customer or reviewer, not a paid partner | New sponsors not yet in the list |
| `own_product` / `merch` (negative signal) | Link to the creator's own shop, "my merch", "my course" | Used to **remove** a match | n/a | n/a |

Combining signals: a record is `high` if it has a text phrase (`sponsored_by`, `thanks_sponsor`, `paid_partnership`) and an extracted brand; `medium` if it has `paid_flag` plus a known domain or a code; `low` if it has only a tracking link or a code. A video with only `paid_flag` and no brand is stored as "sponsored video, brand unknown", visible on the timeline as an unconfirmed row with no sponsor. A person can pick the sponsor when confirming.

**Extracting the brand name.**
1. After a trigger phrase, take the following words until punctuation, " for ", " and ", " who ", a link or a line end. Trim to at most 5 words. Strip "the", "our", "@", "#".
2. If a link is nearby, take its registrable domain and map via `sponsor_aliases` (domain to sponsor). Ignore a domain on the `ignore` list (YouTube, social networks, Patreon, Amazon, Discord, the creator's own site).
3. Match the result to `brands.name` or `sponsor_aliases` (case-insensitive, citext). If found, link `sponsor_id`. If not found, store `sponsor_name_raw` and leave `sponsor_id` null. A person then maps it to a sponsor or creates one.
4. Do **not** auto-create sponsors from detection. This prevents junk brands from filling the Sponsors section.

**Known weaknesses.**
- Affiliate links are not sponsorships. Never promote on `tracking_link` or `shortener_link` alone; they stay `low`, hidden from the default timeline until a person opens "show weak detections".
- Merch and the creator's own products look like sponsors. Keep a per-creator "own domains" idea simply: any domain in the creator's own `channel_url` links, plus the `ignore` list.
- Spoken-only ads (host-read integrations that are not written in the description) are missed. This is the largest false-negative class, and the reason the Detected count should never be read as "this creator has no sponsors".
- Non-English phrases (for example Spanish "patrocinado por") are missed unless added. Use `defaultAudioLanguage` to choose the phrase list per language, English only at first.
- Do **not** fetch shortener links to find the destination automatically. That is extra network work on untrusted URLs and may break platform rules. Let a person click it.
- **Calibration:** after the first 200 detected rows are confirmed or rejected, measure the confirm rate per signal and edit the confidence labels to match. The confirm and reject decisions are free training data for this.

### 4.5 Other sources

1. **Manual entry by the team** (Confirmed). Best quality, slowest. A form on the creator page: sponsor (pick or create), date, video link (optional), notes.
2. **CSV import** (Confirmed, labelled `origin = 'import'`). A new import type "Sponsorships": columns `creator_email` (or channel_url), `sponsor_name`, `sponsor_website`, `date`, `video_url`, `notes`. Reuses `lib/creators/csv.ts` conventions (formula-injection guard, row limit, dry-run preview). Imported rows count as Confirmed **only if the importing person ticks "I have verified these"**; otherwise they import as Detected with `origin = 'import'` and `detection_signal = 'imported_unverified'`. Rows with an unknown creator or malformed link are reported and skipped, never guessed.
3. **Company's own deals** (Confirmed, `origin = 'deal'`). A `completed` or `paid` deal creates the sponsorship automatically (section 3, item 8). This is the most reliable source and already exists.
4. **Creator self-report** (Detected until a person confirms): the website form or an email reply may say "I worked with X". A person records it as Confirmed after checking, or leaves it Detected.
5. **Third-party data providers** (influencer databases, sponsorship trackers, social listening tools) sell sponsorship history and audience data. They are an option for later if manual and detected data stay too thin. I do not recommend a purchase. Before any purchase: check price, coverage of small channels (many tools ignore channels under 10,000 subscribers), their licence terms for storing and showing data, and whether results carry a source and date. Their data would enter as `source_label = 'detected'` with `origin = 'provider'` until a person confirms it.

## 5. The data model (design, not final SQL)

All changes are **additive migrations**: new tables, new nullable columns, new indexes, new triggers. No `drop`, no `rename`, no type change, no `delete`. Existing rows in `creators`, `brands`, `deals` keep their values. Each new migration is a new file after `20261123000400_followups.sql`, named `2026xxxx_<topic>.sql`, and can be run twice safely (`if not exists`, `drop trigger if exists` then create, etc.).

Common rules for every new table:
- `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `created_by uuid references profiles(id) on delete set null default auth.uid()`, `updated_at` where rows change, with the existing `touch_updated_at()` trigger.
- RLS on. **Staff read and write (`is_staff()`), owner delete (`is_owner()`), no `anon` access at all** (grants revoked from `anon`, as the existing migration does for all tables). Same four policy names pattern: `staff_select_*`, `staff_insert_*`, `staff_update_*`, `owner_delete_*`.
- `grant select, insert, update, delete ... to authenticated; grant all ... to service_role`.
- Add each new entity name to the audit allow-list used by `log_audit` where the existing migrations require it, and to `audit_row()` (the `label` already reads `name`, `full_name`, `subject`, `email`).

### 5.1 `brands` (existing, extended: this is the "sponsors" table)

New columns, all nullable or with defaults:

| Column | Type | Constraint | Purpose |
|---|---|---|---|
| `relationship` | text | check in (`prospect`, `active`, `past`, `do_not_contact`), default `prospect` | Sponsor stage. Existing rows get `prospect`; a one-time update to `active` where a deal exists is optional and done by hand. |
| `industry` | text | length <= 200 | Plain label for the Sponsors list. |
| `country` | text | length 2 to 100 | Filter. |
| `target_niches` | text[] | default `{}` | Niches this sponsor wants. Feeds the match score. |
| `target_min_subs`, `target_max_subs` | integer | `>= 0`, min <= max | Size the sponsor targets. |
| `budget_min_cents`, `budget_max_cents` | bigint | `>= 0` | Typical budget per creator (USD, like `deals`). |
| `target_languages` | text[] | default `{}` | Language fit. |
| `logo_url` | text | https only, length <= 500 | Display. |
| `last_contacted_at` | timestamptz | | Sponsor-side contact date. |
| `sponsorship_count`, `last_sponsorship_at` | integer, timestamptz | maintained by trigger from confirmed sponsorships | Fast filters. |
| `source` | text | check in (`manual`, `import`, `deal`, `detected`), default `manual` | Where the brand row came from. |
| `updated_at` | timestamptz | `touch_updated_at()` trigger | Missing today. |

Indexes: `brands_relationship_idx (relationship)` serves the Sponsors "stage" filter; `brands_name_trgm` (gin trigram on `name::text`) serves sponsor search; `brands_target_niches_gin (gin on target_niches)` serves "sponsors that want niche X" and match suggestions; `brands_country_idx (country)`.
RLS: unchanged (staff read and write, owner delete). Audit: already applies (`trg_audit` on brands).

### 5.2 `brand_contacts` (people at a sponsor: personal data)

| Column | Type | Constraint |
|---|---|---|
| `brand_id` | uuid | not null, references `brands` `on delete cascade` |
| `full_name` | text | not null, 1 to 200 chars |
| `role_title` | text | <= 200 |
| `email` | citext | <= 320, same format check as `creators` |
| `phone` | text | <= 50 |
| `linkedin_url` | text | https, host linkedin.com only, <= 500 |
| `is_primary` | boolean | default false; unique partial index so only one primary per brand |
| `notes` | text | <= 5000 |
| `last_contacted_at` | timestamptz | |
| `do_not_contact` | boolean | default false |

Indexes: `(brand_id)` for the sponsor page; `(email)` unique where not null, within a brand: `unique (brand_id, email)`; trigram on `full_name` for search.
RLS: staff read and write, owner delete, never `anon`. **Audit: yes** (`audit_row('brand_contact')`; the log label uses `full_name`, but the audit log must not store email or phone in `details`, which the current trigger already avoids).
Privacy: this is personal data about people who are not our users. Collect only business contact details, record the source in `notes`, honour removal requests (owner deletes), and add these emails to the existing `suppression_list` check before any outreach. **Check with a lawyer** for GDPR or CAN-SPAM duties.

### 5.3 `sponsor_aliases` (names and domains that map to a sponsor, plus an ignore list)

| Column | Type | Constraint |
|---|---|---|
| `brand_id` | uuid | null allowed only when `kind = 'ignore'`; references `brands` `on delete cascade` |
| `kind` | text | check in (`name`, `domain`, `ignore`) |
| `value` | citext | not null, lowercase domain or name, <= 200 |

Constraints: `unique (kind, value)`. Index: the unique index is the lookup used by the scanner (serves "sponsored by brand X" detection). RLS: staff read and write, owner delete, no `anon`. Audit: yes (`audit_row('sponsor_alias')`).

### 5.4 `sponsorships` (the history; the heart of the upgrade)

| Column | Type | Constraint / note |
|---|---|---|
| `creator_id` | uuid | not null, references `creators` **`on delete restrict`** (match `deals`; history is not silently lost) |
| `sponsor_id` | uuid | null for "sponsored video, brand unknown"; references `brands` `on delete restrict` |
| `sponsor_name_raw` | text | <= 200; the text the scanner extracted, kept when `sponsor_id` is null |
| `sponsored_on` | date | the video publish date, or the date the team gives. Null allowed (date unknown). |
| `youtube_video_id` | text | 11 chars, check `^[A-Za-z0-9_-]{11}$` |
| `video_url` | text | https, youtube.com or youtu.be only, <= 500 |
| `video_title` | text | <= 300; **API data, refresh or clear within 30 days** (see 4.3) |
| `origin` | text | not null, check in (`manual`, `import`, `deal`, `youtube_scan`, `creator_report`, `provider`) |
| `source_label` | text | **not null, check in (`confirmed`, `detected`), no default** |
| `detection_signal` | text | check in (`paid_flag`, `sponsored_by`, `thanks_sponsor`, `paid_partnership`, `hashtag_ad`, `discount_code`, `tracking_link`, `shortener_link`, `known_domain`, `imported_unverified`); required when detected |
| `detection_confidence` | text | check in (`high`, `medium`, `low`); required when detected |
| `detection_signals_all` | text[] | every signal that fired, for the "why" popover |
| `evidence_snippet` | text | <= 500; short extract from the description; **API data, cleared by the 30 day job** |
| `evidence_note` | text | <= 2000; the team's words on how it was verified (kept) |
| `evidence_url` | text | https, <= 500 |
| `detected_at` | timestamptz | |
| `api_fetched_at` | timestamptz | when the API data was last read; drives the 30 day job |
| `confirmed_by` | uuid | references `profiles` `on delete set null` |
| `confirmed_at` | timestamptz | |
| `rejected` | boolean | not null default false |
| `rejected_by`, `rejected_at`, `reject_reason` | uuid, timestamptz, text <= 500 | set together by a check |
| `deal_id` | uuid | references `deals` `on delete set null`; set when `origin = 'deal'` |
| `notes` | text | <= 5000 |

Constraints:
- `check` for the label rules in section 3 (confirmed needs confirmed_by and confirmed_at and not rejected; detected needs signal, confidence, detected_at and no confirmed_by).
- `check (sponsor_id is not null or sponsor_name_raw is not null or origin = 'youtube_scan')`: a row must say something about who, unless it is a paid-flag-only detection.
- `unique (creator_id, youtube_video_id, sponsor_id)` with `nulls not distinct` (Postgres 15+; the project targets 15/17) so the scanner can never re-create a rejected row. For rows without a video id, a second partial unique index on `(creator_id, sponsor_id, sponsored_on)` where `youtube_video_id is null`.
- Trigger `trg_sponsorship_guard`: sets confirm fields from `auth.uid()` on promotion; blocks the scanner (service role marker) from changing confirmed or rejected rows; blocks un-rejecting without a staff action.
- Trigger `trg_sponsorship_rollup`: after insert, update or delete, recomputes the cached columns on `creators` and `brands` (section 5.8, 5.1).

Indexes and the filter each serves:
- `(creator_id, sponsored_on desc)`: the creator timeline.
- `(sponsor_id, sponsored_on desc)`: the sponsor page "creators they sponsored" and filter "sponsored by brand X".
- `(sponsored_on desc) where source_label = 'confirmed' and not rejected`: filters "sponsored in the last 30 / 90 / 180 days" (confirmed only).
- `(sponsored_on desc) where source_label = 'detected' and not rejected`: the same filters with "include detected" switched on, and the review queue.
- `(source_label, detection_confidence) where source_label = 'detected' and not rejected`: the review queue sorted by confidence.
- `(api_fetched_at) where api_fetched_at is not null`: the 30 day clean-up job.
- Unique indexes above also serve duplicate protection.

RLS: staff read and write, owner delete, no `anon`. **Audit: yes** (`audit_row('sponsorship')`), and add `confirmed` / `rejected` as readable actions (status-change style, like emails: log only changes of `source_label` and `rejected`). The scanner writes with the service role, which already bypasses RLS; its inserts show in the audit log with a null actor, which is the right signal for "automatic".

### 5.5 `matches` (a link between a creator and a sponsor; may become a deal)

| Column | Type | Constraint / note |
|---|---|---|
| `creator_id` | uuid | not null, references `creators` `on delete cascade` |
| `brand_id` | uuid | not null, references `brands` `on delete cascade` |
| `score` | smallint | 0 to 100, not null |
| `reasons` | jsonb | not null default `[]`; array of `{input, points, text}` (plain-English sentences, see section 7) |
| `score_version` | smallint | which weights produced it |
| `state` | text | not null, check in (`suggested`, `shortlisted`, `pitched`, `accepted`, `declined`, `dismissed`), default `suggested` |
| `suggested_by` | text | check in (`system`, `staff`), default `system` |
| `dismiss_reason` | text | <= 500 |
| `deal_id` | uuid | references `deals` `on delete set null`; set when it becomes a deal |
| `computed_at` | timestamptz | |
| `notes` | text | <= 5000 |

Constraints: `unique (creator_id, brand_id)`; a dismissed match must not be re-suggested (the job upserts the score only when `state = 'suggested'`). A match in `accepted` state may create a `deals` row with stage `contacted` (a staff action, not automatic). `deals` itself is **not changed**.
Indexes: `(creator_id, score desc)` serves "suggested sponsors" on a creator page; `(brand_id, score desc)` serves "suggested creators" on a sponsor page; `(state)` serves the matches board; `(deal_id) where deal_id is not null`.
RLS: staff read and write, owner delete, no `anon`. **Audit: yes** (`audit_row('match')`, state changes only).
Safety: `reasons` text may mention only **confirmed** sponsorships as fact. Detected-based reasons must read "possibly" and carry an `unconfirmed: true` flag (section 7).

### 5.6 Niches, tags and lists

**`niches`** (a controlled list so the filter is clean and typos do not split groups):
- `name` citext not null unique (1 to 100), `slug` text unique, `sort_order` int. Seeded by a migration or from the owner's list (section 11).
- Creators get `niche_id` (new nullable column, section 5.8). The existing free-text `creators.niche` stays untouched; a one-off, review-by-hand mapping fills `niche_id` from it. Never overwrite the text column.
- Indexes: unique on `name`. RLS: staff read and write, owner delete, no `anon`. Audit: yes.

**`tags`**: `name` citext not null, `scope` text check in (`creator`, `brand`), `color` text, `unique (scope, name)`. Index: the unique index. RLS as above. Audit: no (low risk, noisy).
**`creator_tags`**: `creator_id` references `creators` on delete cascade, `tag_id` references `tags` on delete cascade, primary key `(creator_id, tag_id)`, index `(tag_id, creator_id)` serves the "has tag X" filter. RLS as above. Audit: no.
**`brand_tags`**: same shape for `brands`. Audit: no.

**`lists`**: a named, hand-picked group (for example "Spring campaign shortlist"): `name` text not null, `kind` check in (`creators`, `brands`), `description`, `owner_id` references `profiles`, `is_shared` boolean default true. Index `(kind, name)`. RLS: staff read and write (a private list: `is_shared = false` readable only by its owner), owner delete. Audit: yes.
**`list_items`**: `list_id` references `lists` on delete cascade, `creator_id` null or `brand_id` null (check: exactly one is set, matching the list kind), `added_by`, `added_at`, `unique (list_id, creator_id)`, `unique (list_id, brand_id)`. Index `(creator_id)` and `(brand_id)` serve "which lists is this in". RLS as lists. Audit: no.

### 5.7 `saved_views` (saved filter views, per user)

| Column | Type | Constraint |
|---|---|---|
| `owner_id` | uuid | not null, references `profiles` `on delete cascade`, default `auth.uid()` |
| `scope` | text | not null, check in (`creators`, `sponsors`, `matches`) |
| `name` | text | not null, 1 to 100 chars |
| `query` | text | not null, **the page address query string** such as `status=active&sponsored=90`, <= 2000 chars, must not start with `?` or contain a full URL |
| `is_shared` | boolean | default false |
| `is_default` | boolean | default false; one default per owner and scope (partial unique index) |
| `sort_order` | int | |

The filter is stored as the page-address query so the same code that reads the URL reads the saved view. The app must re-validate the query through the normal filter parser on load, so a stale or edited value cannot do anything the URL could not do.
Constraints: `unique (owner_id, scope, name)`.
Indexes: `(owner_id, scope, sort_order)` serves the "My views" menu; `(scope) where is_shared` serves "Shared views".
RLS: staff may **read** their own views and views where `is_shared`; may insert, update and delete **only their own** (`owner_id = auth.uid()`); the owner may delete any. Never `anon`. This is a small change from the plain pattern, justified because views are personal. Audit: no (preferences, not business data).

### 5.8 New columns on `creators` (additive, nullable)

| Column | Type | Purpose / filter |
|---|---|---|
| `niche_id` | uuid references `niches` on delete set null | niche filter (controlled list) |
| `language` | text | check ISO 639-1 style (2 to 5 chars); language filter. Source: `snippet.defaultLanguage` or manual. |
| `country` | text | 2-letter code; country filter. Source: `channels.snippet.country` or manual. |
| `uploads_playlist_id` | text | skip a `channels.list` call (4.2) |
| `avg_views` | integer, `>= 0` | "average views" filter; mean of views over the last 20 videos |
| `avg_views_checked_at` | timestamptz | drives the 30 day freshness rule |
| `last_video_at` | timestamptz | "active channel" filter (posted in the last 30 days) |
| `last_scanned_at` | timestamptz | scheduler: oldest first |
| `sponsorship_count` | integer not null default 0 | confirmed only, maintained by trigger |
| `last_sponsorship_at` | date | confirmed only; filters "sponsored in the last 30 / 90 / 180 days" |
| `detected_sponsorship_count` | integer not null default 0 | unconfirmed, unrejected |
| `last_detected_sponsorship_at` | date | the same filters with "include detected" |

`last_contacted_at` already exists on `creators`, and the view `creator_summaries` already combines it with sent emails. Reuse that value for the filter "last contacted"; do not add a second column.
`subscribers` and `niche` already exist and cover the size and niche filters.
`has_sponsored` needs no column: it is `sponsorship_count > 0`.

New or changed view: `creator_summaries` gets the new columns added at the end (a `create or replace view` that only appends columns is non-destructive). Existing columns and their order do not change.

Indexes (each serves a filter): `creators_niche_id_idx (niche_id)` niche; `(language)`; `(country)`; `(subscribers)` size range (keep existing status index); `(avg_views)`; `(last_sponsorship_at desc)` sponsored-since filters; `(sponsorship_count) where sponsorship_count > 0` "has sponsored before"; `(last_contacted_at)` exists in the base table and is already combined in the view, so add a plain index on `creators(last_contacted_at)` for "not contacted in N days"; `(last_scanned_at nulls first)` the scan scheduler.
RLS and audit: the table keeps its existing policies. The existing audit trigger records column changes, but the rollup trigger writes cached columns on every sponsorship change and would flood the audit log. **Change needed:** add the cached columns (`sponsorship_count`, `last_sponsorship_at`, the two detected ones, `avg_views`, `avg_views_checked_at`, `last_scanned_at`, `last_video_at`) to the keys that `audit_row()` skips for creators, in a new migration that replaces the function. Do it without removing any existing behaviour.

### 5.9 Scan bookkeeping

**`scan_runs`** (small, owner-readable): `started_at`, `finished_at`, `creators_scanned`, `units_used`, `detections_added`, `status`, `error`. Index `(started_at desc)`. RLS: staff read, service role write, owner delete. Audit: no. It also holds the daily quota counter (sum of `units_used` for the current Pacific day).

## 6. Duplicate and alias handling

- Sponsor names are free text from many sources ("Acme", "Acme Inc.", "acme.com"). Match order: exact `brands.name`, then `sponsor_aliases` kind `name`, then `sponsor_aliases` kind `domain`. No fuzzy auto-merge; propose a merge to a person.
- A "Merge sponsors" action (staff, later) re-points `sponsorships`, `matches`, `deals`, `brand_contacts` to one brand, then **keeps** the old name as an alias. It never deletes history; the owner deletes the empty brand row.

## 7. Match score: simple and transparent

A match is **suggested** for a creator and a sponsor pair. The score is 0 to 100, a sum of four inputs. Each input creates one plain-English reason. Weights live in one code constant and are stored in `matches.score_version`, so the owner can tune them later.

| Input | Weight | How points are earned | Reason text (example) |
|---|---|---|---|
| **Niche fit** | 40 | Creator niche is in the sponsor's `target_niches`: 40. Same niche family (same parent group): 20. No sponsor target set: 10 (neutral, flagged). Else 0. | "Creator's niche (Woodworking) is one the sponsor targets." / "The sponsor has no target niche set, so niche fit is unknown." |
| **Size fit** | 25 | Subscribers inside `target_min_subs`..`target_max_subs`: 25. Within 50 % outside the range: 12. Else 0. If no target size but a budget is set: compare `avg_views` with budget (rough rule: budget per 1,000 views between 10 and 50 USD scores 25; wider scores 12). No target and no budget: 8 (neutral). Hidden subscribers: use `avg_views` if known, else 8. | "12,500 subscribers is inside the sponsor's target of 5,000 to 50,000." |
| **Sponsor has backed similar creators** | 20 | Count of **confirmed** sponsorships by this sponsor for creators in the same niche: 1 gives 8, 2 gives 14, 3 or more gives 20. Detected-only sponsorships give half points and mark the reason unconfirmed. | "This sponsor has sponsored 3 other creators in this niche (confirmed)." / "Possibly sponsored 2 similar creators (detected, not yet confirmed)." |
| **Recency** | 15 | Sponsor's latest confirmed sponsorship (any creator): within 90 days 15, within 180 days 10, within 365 days 5, else 0. Brand `relationship = 'active'` adds nothing here. | "The sponsor last sponsored a creator 40 days ago." |

Penalties and exclusions (not part of the 100; applied first):
- Exclude (no match created): creator `status = 'do_not_contact'`; brand `relationship = 'do_not_contact'`; creator email on `suppression_list`; creator already sponsored by this brand within the last 180 days (confirmed), unless the owner switches that off; a `dismissed` match.
- The same creator and sponsor pair is never suggested twice.

Display rules:
- Show the score as a band: 70 and above "Strong", 40 to 69 "Possible", under 40 not shown by default.
- Always show the reasons list under the score. Any reason built from detected data starts with "Possibly" and carries a grey "unconfirmed" badge.
- Reason text is **not sent to Claude for an email** unless it comes from confirmed data. `lib/drafting/facts.ts` should read only confirmed sponsorships (section 3, item 6).
- The job re-runs when a sponsorship, creator niche or sponsor target changes (queue a recompute), plus nightly. It is cheap: a SQL join, no YouTube calls.

## 8. Filters and the data each needs

| Filter (creators) | Column or table | Index |
|---|---|---|
| Niche, language, country | `niche_id`, `language`, `country` | single column indexes (5.8) |
| Subscribers range, average views range | `subscribers`, `avg_views` | b-tree |
| Status, tag, list | `status`, `creator_tags`, `list_items` | existing status index, `creator_tags (tag_id, creator_id)` |
| Has sponsored before | `sponsorship_count > 0` | partial index |
| Sponsored in last 30 / 90 / 180 days | `last_sponsorship_at >= today - N` | `(last_sponsorship_at desc)` |
| Sponsored by brand X | `exists` in `sponsorships` by `sponsor_id` | `(sponsor_id, sponsored_on desc)` |
| Include detected (unconfirmed) | the `detected_*` columns | partial index on detected rows |
| Last contacted before N days / never | `last_contacted_at` (view value) | `creators(last_contacted_at)` |
| Has an open deal / has a deal | `deals` by `creator_id` | existing `deals_creator_idx` |

"Sponsored in the last N days" means: the **sponsorship date** (video publish date or confirmed date) falls in the last N days, not the date the row was added. The filter label should say "(confirmed)" unless the detected switch is on.

## 9. Reliability of sources

| Source | What it gives | Reliability | Cost | Effort |
|---|---|---|---|---|
| Team confirmed entry | Sponsor, date, link, evidence | **Highest** (a person checked) | Staff time | High per record |
| Company's own completed deals | Confirmed sponsorship we brokered | **Highest** | Free (already stored) | Low (a trigger) |
| CSV import, ticked "verified" | Bulk history from the team's spreadsheets | High if the sheet is good | Free | Medium (one importer, then data cleaning) |
| CSV import, not verified | Same, but unproven | Medium to low (Detected) | Free | Medium |
| YouTube `hasPaidProductPlacement` flag | "This video is paid", no brand | Medium; creators can forget or over-tick | Quota only (about 0.4 units per creator on top of the playlist call) | Low |
| Description text phrases ("sponsored by X") | Brand name plus a "sponsored" claim | Medium to high; misses spoken-only ads | Quota only | Medium |
| Hashtags (`#ad`) | "Paid", no brand | Medium | Quota only | Low |
| Discount codes, tracking links, known domains | Weak brand hint | Low to medium; confuses affiliate and own products | Quota only | Medium |
| Link shorteners | Almost nothing without following the link | Low | Quota only | Low (do not follow automatically) |
| Creator self-report (form or reply) | A claim to verify | Medium until confirmed | Free | Low |
| Third-party data provider | Sponsorship history and audience data | Unknown until tested; weak on small channels | Paid (not recommended now) | Medium |

## 10. Recommended order of rollout

**Build now (no YouTube scan needed, useful on day one):**
1. Migration A: extend `brands` (5.1); create `brand_contacts`, `sponsor_aliases`.
2. Migration B: `sponsorships` with the label rules, guard trigger, rollup trigger, `creator_sponsorship_facts` view; the deal-completion trigger. Backfill: one row per existing `completed` or `paid` deal, `origin = 'deal'`, `source_label = 'confirmed'`. The backfill is an insert only.
3. Migration C: new `creators` columns, `niches`, `tags`, `creator_tags`, `brand_tags`, `lists`, `list_items`, `saved_views`; extend `creator_summaries`; audit trigger changes.
4. UI: creator filters, the creator timeline, the Sponsors section, manual entry, sponsorship CSV import, saved views. Update `facts.ts` to read confirmed sponsorships only.
5. Migration D: `matches` and the score job (it works with confirmed data alone).

**Build next (needs the YouTube API key):**
6. Scanner: uploads playlist, `videos.list`, signals, review queue ("Detected, needs review": Confirm / Reject), daily 30 day clean-up job, quota counter. Start with the 120 current creators weekly.
7. Fill `language`, `country`, `avg_views`, `last_video_at` from the same scan.

**Fill as data arrives (do not wait for it):**
8. Tune confidence labels from confirm and reject rates; add phrases and ignore domains; add languages.
9. Decide on a provider only if confirmed plus detected data stay thin after 2 to 3 months.

## 11. What the owner must enter or import by hand for day one

1. **The niche list** (15 to 40 names, grouped into families if wanted) and a mapping from the existing free-text `niche` values. Without this, niche filters and match scores are empty.
2. **Past sponsorships the team already knows about** (CSV: creator email or channel link, sponsor name, date, video link if any). Even 20 to 50 rows make "has sponsored before" and "sponsored by brand X" useful. Mark them verified only if someone checked.
3. **Sponsor list**: name, website, industry, country, target niches, target size or budget, and a primary contact. The existing `brands` rows stay; fill the new fields by hand.
4. **Sponsor contacts**: name, role, business email, phone, LinkedIn. Only business details. Say where each came from.
5. **Language and country** for creators, if the YouTube scan is not yet on. (A CSV with `creator_email, language, country` is enough.)
6. **Tags** the team already uses (for example "gaming", "quick replier", "premium"), and the first saved views (for example "Active and sponsored in last 90 days").
7. **Decisions:** the "ignore" domains the team never wants matched; whether re-pitching a sponsor to the same creator within 180 days is allowed; who reviews the Detected queue and how often.
8. **The YouTube API key** (optional, `YOUTUBE_API_KEY`, already supported), and a one-time lawyer check of section 4.3.

## 12. Risks and open questions

- **30 day rule** may force the app to clear text and counts regularly; the design makes this a daily job, not a surprise (4.3). Needs a lawyer.
- **Quota sharing**: the scan and the subscriber refresh use one key and one daily budget. Reserve the first 20 % for the buttons.
- **False confidence**: Detected "no sponsors" is not proof of "never sponsored" (spoken-only ads). The UI says "none found", never "none".
- **Personal data** in `brand_contacts` needs a clear source, a removal path and suppression checks (5.2).
- **Audit noise**: rollup updates must be excluded from `audit_row()` (5.8).
- **Naming**: UI says Sponsor, database says `brands`.
- **Postgres version**: `nulls not distinct` needs Postgres 15 or newer. The migrations already state 15/17. If the local stack is older, use two partial unique indexes instead.

## 13. Checklist to verify the unchecked YouTube claims

Open each page in a browser and confirm:
1. `developers.google.com/youtube/v3/docs/videos`: the part `paidProductPlacementDetails` and the property `hasPaidProductPlacement` exist; note the revision date in the API revision history.
2. `developers.google.com/youtube/v3/determine_quota_cost`: default 10,000 units a day; `channels.list`, `playlistItems.list`, `videos.list` cost 1; `search.list` costs 100.
3. `developers.google.com/youtube/terms/developer-policies` (and the Required Minimum Functionality page): the 30 day storage and refresh rule for non-authorized data, the limits on derived data, and the required links to the YouTube Terms of Service and Google privacy policy.
4. One test call by a team member, with the team's own key, on a public video, to prove the paid flag is readable with a key alone. (Not done here.)
