# 04 - UI spec for the back office upgrade

Written 25 November 2026. It combines `01-current-state.md`, `02-benchmarks.md` and `03-data-plan.md`.
Status: **draft, waiting for the owner's approval of the prototype.** Nothing in the real back office is built until then.

## 1. The goal, and how each screen serves it

| Goal | Screen |
|---|---|
| 1. Find the right creators | Creators list with a filter panel (A) |
| 2. See what a creator did with sponsors before | Creator profile with a sponsorship timeline (B) |
| 3. The same for sponsors | Sponsors list and sponsor profile (C) |
| 4. Link the right pair and contact them with real facts | Link action, match suggestions, deals board, pitch draft (D, E) |

A command palette (F) reaches any creator, sponsor or deal from anywhere.

## 2. Decisions taken in this spec

1. **Sponsors are the existing `brands` table, extended.** Deals already point to it. Only optional columns and child tables are added, so no existing row changes. The screens say "Sponsor".
2. **Every sponsorship record is Confirmed or Detected.** The database enforces it. The pitch code reads a confirmed-only view, so a detected record cannot reach an email. Filters and counts use confirmed records unless the person ticks "Count detected records too".
3. **Filters apply live** (no Apply button), show a result count, and live in the page address. A saved view is a named page-address query, per user, optionally shared.
4. **The subscriber control is a two-handle slider on a logarithmic scale, with number fields and presets.** The owner asked for the slider. The benchmark research warns that a slider alone is imprecise, so the number fields are equal partners and accept "10k" and "1.5M".
5. **A creator or sponsor opens in a side panel first, with "Open full page".** The side panel keeps the list and its filters in place. The old pop-up stays only as the add and edit form.
6. **A score is never shown alone.** Each suggestion shows a band (Strong or Possible), the number, and one plain sentence per input. A reason built on detected data starts with "Possibly" and carries the Detected label.
7. **Pitch drafts use confirmed facts only,** and list under the draft which facts were used and which were left out because they are unconfirmed. Nothing is sent without the owner's click on Send. Test mode, the send limit, opt-outs and the audit log stay as they are.
8. **The look does not change.** Cream ground, ink text, paper surfaces, one blue accent, Newsreader headings, uppercase Instrument Sans labels, hairlines, 8px corners, no shadows and no icons (`01-current-state.md`, section 2).

## 3. Screens

### A. Creators list (`/creators`)

Layout: page head, then a left filter rail (280px) and the results. Under 900px the rail becomes a drawer opened by a "Filters (n)" button.

Filters, in this order:

| Filter | Control | Address key |
|---|---|---|
| Subscribers | two-handle log slider 1k to 1M, two number fields, presets 1k to 10k, 10k to 50k, 50k to 100k, 100k+ | `subs=1000-10000` |
| Has done sponsorships | Any / Yes / No | `sponsored=yes` |
| Count detected records too | tick box, off by default | `detected=1` |
| Sponsored recently | Any / 30 / 90 / 180 days | `recent=90` |
| Sponsored by | sponsor list with search, pick several | `by=id,id` |
| Niche | tick list with counts | `niche=slug,slug` |
| Pipeline status | tick list with counts | `status=new,contacted` |
| Last contacted | Any / Never / in the last 30 days / over 30 days ago / over 90 days ago | `contacted=never` |
| Language, Country | tick lists | `lang=en`, `country=GB` |
| Average views | Any / 1k+ / 5k+ / 10k+ / 25k+ | `views=5000` |
| Has an email address | tick box | `email=1` |
| Tag, List | tick lists | `tag=…`, `list=…` |

- Each option shows how many creators it would give with the other filters as they are.
- Above the results: the count ("12 of 48 creators"), one removable chip per active filter, and "Clear all".
- No results: a plain message that names the filters whose removal would bring results back, each as a button.
- Sort: Subscribers (high or low first), Most recent sponsorship, Last contacted, Name, Best match for a chosen sponsor.
- Views: table (default) and cards. 25 per page with Previous and Next.
- Saved views: a menu with the person's own and shared views, "Save current view", and "Copy link".
- Bulk: tick rows, then Add to a list, Add a tag, Start outreach drafts, Change status (exists), Refresh subscribers (exists). The selection survives a page change.
- Search box at the top of the rail (name, channel, email), as today.

### B. Creator profile (side panel, and `/creators/[id]` as a full page)

- **Header:** name, channel link, subscribers with the date checked, niche, country and language, status, tags, email and phone (staff only, a view is written to the audit log as today).
- **Actions:** Link to a sponsor, Draft pitch with Claude, Edit, and Delete (owner only).
- **Sponsorship history:** a timeline, newest first. Each record: sponsor, date, video link, the **Confirmed** or **Detected** label, where it came from (entered by the team, a Smallfold deal, import, or the detection signal and its confidence), and who confirmed it. Detected records have Confirm (asks how it was checked) and Reject (kept and hidden, so it is not detected again). "Add a record" and Edit open a small form.
- **Recent videos:** title, date, views, and whether the video carries a paid-promotion sign. Performance basics: average views, uploads per month, last upload.
- **Suggested sponsors:** up to five, each with band, score, reasons, Link and Draft pitch.
- **Deals**, **Outreach history** (emails with status) and **Notes**.

### C. Sponsors (`/sponsors`, new main tab between Creators and Deals)

List with the same filter rail, chips, counts, sort, views, saved views, pagination and bulk actions.

Filters: industry, company size, country, typical budget per creator, target creator size, niches they sponsor, currently active (a confirmed sponsorship in the last 90 days), creators sponsored (1+, 3+, 5+), last sponsorship (30, 90, 180 days), our contact status (prospect, contacted, in talks, partner, past, do not contact), has a contact person, tag.

Sponsor profile: company details and website; contact people (name, role, email, phone, LinkedIn); creators they sponsored, with the same Confirmed and Detected labels; Suggested creators with reasons; deals; outreach history; notes.

Add, edit, import from CSV and export follow the creators rules: staff add, edit and import; only the owner exports and deletes; every export and import writes an audit line.

### D. Linking and matching

- **Link** is on both profiles and on every suggestion. It opens a short dialog: the pair, the score with its reasons, an optional expected amount, and the starting stage. It creates a deal and opens it on the board.
- **Score (0 to 100):** niche fit 40, size fit 25, the sponsor already backed similar creators 20, recency 15. 70 and above is "Strong", 40 to 69 is "Possible", lower is not suggested. Do-not-contact and opted-out people are never suggested.
- **Deals page:** a board with one column per stage and a table view. Each card has a "Move to" menu, so it works without dragging on a tablet. Dragging also works on a laptop.

### E. Pitch drafts

"Draft pitch with Claude" is on a creator, a sponsor, a suggestion and a deal. The person picks who the email goes to (the creator or the sponsor's contact). The draft lands in Emails, Review, as today. Under the draft: "Facts used" and "Left out because unconfirmed".

### F. General

- **Command palette:** Ctrl+K or Cmd+K, or the Search button in the top bar. Results grouped as Creators, Sponsors, Deals. Arrow keys and Enter.
- **States:** skeleton rows while loading, a plain error notice with "Try again", and helpful empty states.
- **Tablet:** the rail is a drawer, the side panel takes the full width, the board scrolls sideways inside its own frame.
- **Keyboard and contrast:** every control reachable by Tab, visible focus ring, slider handles are native range inputs, labels on every field, status never shown by colour alone.

## 4. What must be built (real back office, after approval)

**New components** (none exist today): filter rail and facet list, range slider, chips, segmented control, tick box, side panel, tabs, tag, toast, skeleton, command palette, timeline, board.

**Database** (all additive; details in `03-data-plan.md`, section 5):
- `brands`: new optional columns (industry, country, size, target niches, target size, budget, relationship, cached counts).
- New tables: `brand_contacts`, `sponsor_aliases`, `sponsorships`, `matches`, `niches`, `tags`, `creator_tags`, `brand_tags`, `lists`, `list_items`, `saved_views`.
- `creators`: new optional columns (niche id, language, country, average views, cached sponsorship counts and dates). The view `creator_summaries` gets the new columns appended.
- `log_audit` allow-list: new actions for viewing, importing and exporting sponsors and contacts.
- The current drafting prompt forbids sponsor names. Pitch drafts need a second prompt and their own checks, fed only from the confirmed-only view.

**Security, unchanged rules:** `requireStaff` or `requireOwner` on every page, `handler.ts` on every API route with input validation, RLS on every new table with no access for the public role, an audit line when contact details are viewed, exported or imported.

## 5. Optional items (not built unless the owner says so)

| Item | Why it could be worth it |
|---|---|
| YouTube scanner that creates Detected records | Fills the history without typing. Needs the YouTube key, and a lawyer's view on the 30-day storage rule. |
| "Detected records to review" queue | One place to confirm or reject, sorted by confidence. |
| CSV import of past sponsorships | The fastest way to make the history filters useful on day one. |
| "More like this creator" | Finds lookalikes from one good example. |
| Merge two sponsors | Cleans up duplicates such as "Acme" and "Acme Inc". |
| Compact row density, second sort level | Comfort for heavy users. |
| Alerts for a saved view | "New creators match this view." |

## 6. Open questions for the owner

1. Which niche list to use.
2. Which sponsor details the company already holds.
3. How many people will use the back office.
4. Whether a new link starts in a new "Matched" stage (not contacted yet) or goes straight to "Contacted".
5. Whether a profile opens as a side panel first, or always as a full page.

## 7. Build order after approval (at most three agents at once)

1. Database agent: migrations and fake seed data.
2. Creators list and filters; Creator profile; Sponsors.
3. Matching and Link; Outreach integration; Global search and polish.
4. Security review (read-only), then QA in the browser against the approved prototype. Fix and re-test.
