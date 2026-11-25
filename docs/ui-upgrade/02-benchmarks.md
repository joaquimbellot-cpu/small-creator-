# 02 - UX Benchmarks: filters, lists, profiles, matching

Scope: a private back office that matches YouTube creators with sponsors. Users are an owner and a few workers, on laptops and tablets. About 120 creators today, thousands later, plus a few hundred sponsors.

## How this research was done (read first)

Page fetching was blocked in this session (hosts did not resolve). Only web search worked. So:
- "Checked" means the claim came from a search result that quoted or summarised a public page. The address is given.
- Search summaries are second-hand. Treat them as medium confidence.
- Anything marked "(from prior knowledge, not checked today)" was not read today. Verify before relying on it.
- Airbnb, Amazon, Upfluence, Aspire, Grin, HubSpot, Pipedrive, Notion and Stripe pages were not checked. Their patterns below are from prior knowledge.

## 1. Summary: the 10 patterns that matter most

1. Filters update the list live, with a visible result count. No Apply button on desktop or tablet.
2. Every applied filter shows as a removable chip above the list, plus one "Clear all".
3. Range filters (followers, rate, engagement) use number fields first. A slider is an optional extra, with a non-linear scale.
4. Past brand collaboration is a first-class filter ("worked with brand X", "never worked with Y"), as Modash offers.
5. Saved views: a named filter + sort + column set that anyone on the team can reopen (Attio, Linear).
6. The filter state lives in the page address, so a view can be shared, bookmarked and survives Back.
7. Row click opens a side panel (quick look). A full page exists for deep work. Offer both.
8. A profile shows a timeline of past sponsorships and contacts, newest first, with outcome per item.
9. Matches show a score with the reasons in plain words, and mark which facts are verified and which are guessed.
10. Keyboard first: one key opens filters, one key opens search, a command palette jumps anywhere (Linear, from prior knowledge).

## 2. Filtering

**Panel placement.**
- A left rail suits long lists of filters and many facets. It stays visible, so people see what is applied. Baymard describes vertical and horizontal filter layouts. Source: https://baymard.com/blog/horizontal-filtering-sorting-design (title only seen in search; details from prior knowledge).
- A top bar of pop-over buttons saves width but hides the applied state. It suits few filters.
- For this product: a left rail on laptop, a collapsible drawer on tablet portrait. Creator filters are many (niche, size, country, language, engagement, past brands), so the rail wins.

**Live results vs Apply button.** Baymard recommends live-updating the list as filters change. This removes the need for an Apply button inside drop-downs. On small screens, a separate filter layer with a sticky "Show N results" button works well. Source: https://baymard.com/blog/ecommerce-filter-ui and https://baymard.com/blog/current-state-product-list-and-filtering (via search summary).

**Counts.**
- Show a count beside each option, so users know the result before clicking. Same Baymard source.
- Show the total result count near the list title.
- Grey out or hide options that would give zero results. Do not remove them silently if that surprises people.

**Chips and Clear all.**
- Baymard says showing applied filters helps people stay oriented, yet many sites skip it. Source: https://baymard.com/blog/how-to-design-applied-filters (via search summary).
- Chips sit above the list, each with an x. "Clear all" sits at the end of the chip row (placement detail from prior knowledge).
- Linear shows applied filters as chips on top of the view. Source: https://linear.app/docs/filters.

**Range sliders.**
- Baymard found that more than half of testers read a two-handle slider as a single-point slider. Typed inputs were a more precise fallback. Source: https://baymard.com/blog/slider-interfaces (via search summary).
- Baymard also found a linear scale makes common ranges hard to set, and recommends a non-linear scale. Same source.
- Baymard pairs a dual-handle slider with text inputs. Source: https://baymard.com/blog/ecommerce-filter-ui.
- Maersk's design system argues for two number inputs (min and max) over a slider for precision and accessibility. Source: https://designsystem.maersk.com/updates/articles/2026-03-19-sliders/.
- Design for subscribers (1,000 to 1,000,000+): two number fields with "k" and "M" shorthand typing, plus preset buttons (1k-10k, 10k-100k, 100k-1M, 1M+). If a slider is added, make it logarithmic and keep the fields in sync. Presets and log scale are my synthesis of the sources above.
- Slider accessibility: handles must be keyboard operable, with labels and visible values (from prior knowledge, WCAG 2.2 "dragging movements" needs a non-drag alternative; not checked today). The number fields are that alternative.

**Multi-select with search.** For long lists (niches, countries, brands, hundreds of sponsors) use a checkbox list with a type-to-search box, selected items pinned on top, and "any of / all of" choice. Baymard supports allowing several values per filter. Source: https://baymard.com/blog/allow-applying-of-multiple-filter-values (title seen; detail from prior knowledge). Attio adds And/Or toggles and filter groups. Source: https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views.

**Yes / no / any.** Use a three-state control (Any, Yes, No) for things like "has worked with a sponsor", "has a media kit", "email known". A single checkbox cannot say "No" (from prior knowledge, not checked today).

**Date and recency.** Offer relative choices: "contacted in last 30 days", "not contacted in 90 days", "last sponsorship over 1 year ago", plus a custom date range. Relative ranges stay true when saved. Useful for follow-up work (from prior knowledge, not checked today).

**Empty results.**
- Modash warns that stacking too many filters early can give zero results. It advises adding filters step by step. Source: https://help.modash.io/en/articles/14035556-discovery-api-search-optimisation (via search summary).
- So: when the count is zero, say which chip is the biggest cause and offer one-click removal ("Remove 'Spanish' to see 14 creators"). The suggestion text is my idea, inspired by the warning.

## 3. Lists and tables

**Sort.** Click a column header to sort. Show an arrow. One default sort per saved view. Allow a second sort level only as optional (from prior knowledge).

**Column choice.** Linear separates filters (which rows) from display options (which columns and what shows on each item). Source: https://linear.app/docs/display-options. Copy this idea: a "Columns" menu, and the choice is saved with the view.

**Density.** Offer comfortable and compact rows. Compact fits tablets less well: keep rows at least 44 px tall by default on touch devices.

**Table vs cards.** Table is best for comparing and sorting many creators. Cards suit browsing with thumbnails. Linear toggles list and board with one shortcut. Source: https://linear.app/docs/display-options. Default to table, with an optional card toggle.

**Pagination vs infinite scroll.** For work tools, paging or "load more" with a stable position is easier to return to than infinite scroll (from prior knowledge, not checked today). Choose pages of 50 with a visible total, and keep scroll position and page after Back.

**Bulk select and bar.** Checkbox column, "select all matching the filter" (not only the visible page), then a bar that appears with the count and actions: Add to list, Assign owner, Add tag, Export. Show "N selected" and an undo for destructive actions. (Common pattern in Stripe, Notion, HubSpot; from prior knowledge, not checked today.)

**Saved views and shareable addresses.**
- Attio saves filters on views automatically. Anyone with access can see and change them. It advises separate, clearly named views per goal. Source: https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views.
- Linear lets you save a filtered list as a custom view. Source: https://linear.app/docs/custom-views. Its docs say only the main filters go into the address. Source: https://linear.app/docs/filters.
- For this product: put all filters, sort and page in the address query. A "Save view" button names it. Mark views shared or personal.

## 4. Profiles

**Side panel vs full page.** Side panel keeps the list in sight, so people compare and move down the list fast. Full page suits long history and editing. Offer both: row click opens the panel, an "Open full page" button and a shareable address for each record. Next/previous arrows in the panel move through the filtered list (from prior knowledge on HubSpot, Attio and Linear; not checked today).

**Header content (creator).** Name, channel link, avatar, subscribers, average views, country, language, niche tags, owner, status, last contact date, and primary actions (Add to list, Link to sponsor, Email). Keep key numbers in the header so they are never one click away.

**Header content (sponsor).** Name, industry, budget range, country, contact person, status, last contact, active deals.

**Timeline.** One reverse-date feed mixing sponsorships, emails, notes and status changes, with filter chips by type. Each sponsorship entry shows brand, date, deliverable, fee and outcome. The "brands a creator has worked with" idea exists as a Modash filter. Source: https://modash.io/blog/product-updates-q1-2023 (via search summary). Activity timelines are standard in CRMs (from prior knowledge, not checked today).

**Verified vs machine-detected data.** Not checked today for any named product. Recommended pattern from prior knowledge: a small label per field or row ("Confirmed by team", "Detected from channel", "Entered by [name], date"). Detected items show a "Confirm" or "Wrong" action. Never mix the two without a visual difference that does not rely on colour alone. Show the date a number was last refreshed.

**Associations (creator and sponsor).** Show a related-records block on each record: creator page lists sponsors with deal status, sponsor page lists creators. Each row links both ways. A link is created from either side. HubSpot and Attio both model person-company links (from prior knowledge, not checked today). Attio also has lists as a separate concept from records. Source: https://attio.com/help/reference/attio-101/attios-data-model/understanding-lists.

## 5. Matching and suggestions

- Modash "lookalike" search takes up to five reference creators and finds creators that share qualities with all of them. You can stack filters like location on top. Source: https://help.modash.io/en/articles/5467269-find-lookalikes (via search summary).
- Idea for us: "More like this creator" button on a profile that pre-fills filters (niche, size band, language) and lets the user edit chips. This keeps the logic visible.
- Score with reasons (from prior knowledge on influencer tools, not checked today): show a simple score or a High/Medium/Low label, and under it 3 short reasons: "Same niche (gaming)", "Audience in Spain, as the brand wants", "Worked with 2 similar brands". Add a "Why not higher" line for the main gap.
- Trusted suggestions: reasons in plain words, based on data the team can see, easy to dismiss, and a note when data is old. Past real results (this creator did well with brand type X) beat generic similarity.
- Distrusted suggestions: a bare number with no reasons, a score that never changes, results that ignore filters the user set, and data that is old or unverified without a label.
- Keep the user in control: the suggestion is a sorted list with a reason column, never an automatic action.

## 6. Pipeline board

- Attio's kanban lets you move cards between stages, choose visible attributes, apply filters and sort. Source: https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views.
- Linear toggles the same data between list and board. Source: https://linear.app/docs/display-options.
- Pipedrive's deal board (from prior knowledge, not checked today): column header shows deal count and total value, cards show one or two key facts, and a rotting or "no activity" marker flags stale cards.
- For us: stages such as Idea, Pitched, Replied, Negotiating, Booked, Published, Paid, Lost. A card shows creator, sponsor, fee, owner, days in stage. Drag to move, plus a "Move to..." menu for tablets and keyboard use. Ask for a reason when moving to Lost. Same filters and saved views as the table.

## 7. Global search and command palette

(All from prior knowledge on Linear, Notion and Stripe; only Linear's filter shortcut was seen in search.)
- One shortcut opens it (Cmd/Ctrl+K). The Linear doc shows `F` opens filters. Source: https://linear.app/docs/filters.
- Group results by type: Creators, Sponsors, Deals, Lists, Actions. Show the type as a label and a small icon.
- Show recent items before the user types.
- Arrow keys to move, Enter to open, Esc to close. Show shortcut hints beside actions.
- Include actions, not only records: "New creator", "Go to pipeline", "Open saved view...".
- Typo tolerance and search by channel name, handle and email.

## 8. Accessibility and tablets

- Keyboard: every filter, chip, row action and the bulk bar reachable by Tab, with a visible focus ring. Row selection by Space. (WCAG 2.1; from prior knowledge, not checked today.)
- Contrast: text 4.5:1, interactive borders and icons 3:1. Do not use colour alone for status or for verified/unverified.
- Touch targets: at least 44 by 44 px as a design target (Apple guidance 44 pt; WCAG 2.2 minimum is 24 px). From prior knowledge, not checked today.
- Sliders: always have typed fields, as the Baymard and Maersk sources above argue. Avoid drag-only controls and avoid hover-only actions on tablets.
- Tablet layout: filter drawer, side panel becomes a full-width sheet, bulk bar fixed at the bottom, sticky header row.
- Announce result counts to screen readers when they change (polite live region), from prior knowledge.

## 9. Recommendations for this product (priority order)

1. **Live filters with total count and per-option counts** on a left rail (drawer on tablet). Why: fastest way to find creators. Inspired by Baymard's guidance (https://baymard.com/blog/ecommerce-filter-ui) and Airbnb/Amazon patterns.
2. **Chips with Clear all, and zero-result help** that names the filter to relax. Why: people get lost in stacked filters. Inspired by Baymard and the Modash warning about zero results.
3. **Number fields (with k/M typing) and presets for followers, engagement and fee.** Add a log-scale slider only as optional. Why: precision, accessibility, and wide value range. Inspired by Baymard and Maersk.
4. **Past-collaboration filters ("worked with brand X", "worked in category Y", "never contacted").** Why: this is the core of the goal. Inspired by Modash's past-brands filter.
5. **Saved views plus filters in the address.** Why: the team reuses and shares searches. Inspired by Attio and Linear.
6. **Side panel with next/previous, plus full profile page.** Why: quick comparison without losing place. Inspired by CRMs (prior knowledge).
7. **Timeline of sponsorships, emails and notes on both creator and sponsor pages, with two-way links.** Why: the "what happened before" answer in seconds. Inspired by HubSpot and Attio.
8. **Verified vs detected labels with last-updated dates.** Why: trust before pitching. Pattern is my recommendation.
9. **Bulk select with a bulk bar (add to list, assign, tag, export), select-all-matching.** Why: building shortlists for a sponsor. Inspired by Stripe and Notion.
10. **"More like this" and match suggestions with plain reasons.** Why: speeds up pitching, stays explainable. Inspired by Modash lookalikes.
11. **Pipeline board with the same filters, plus a "Move to" menu.** Why: tracks deals by stage. Inspired by Attio and Pipedrive.
12. **Command palette (Cmd/Ctrl+K) with grouped results and recents.** Why: speed for daily users. Inspired by Linear.
13. Optional: card view toggle for creators.
14. Optional: compact density setting.
15. Optional: log-scale slider as a visual add-on.
16. Optional: second-level sort, saved-search alerts ("new creators matching this view").

## 10. Sources (addresses read, as search results or summaries; page fetch was blocked)

- https://baymard.com/blog/slider-interfaces
- https://baymard.com/blog/ecommerce-filter-ui
- https://baymard.com/learn/ecommerce-filter-ui
- https://baymard.com/blog/current-state-product-list-and-filtering
- https://baymard.com/blog/how-to-design-applied-filters
- https://baymard.com/blog/allow-applying-of-multiple-filter-values
- https://baymard.com/blog/horizontal-filtering-sorting-design
- https://designsystem.maersk.com/updates/articles/2026-03-19-sliders/
- https://help.modash.io/en/articles/5467269-find-lookalikes
- https://help.modash.io/en/articles/14035556-discovery-api-search-optimisation
- https://modash.io/blog/product-updates-q1-2023
- https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views
- https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views
- https://attio.com/help/reference/attio-101/attios-data-model/understanding-lists
- https://linear.app/docs/filters
- https://linear.app/docs/custom-views
- https://linear.app/docs/display-options

Not reached: Nielsen Norman Group, Stripe docs, Notion, HubSpot, Pipedrive, Airbnb, Amazon, Upfluence, Aspire, Grin. A second pass with network access to baymard.com, nngroup.com, linear.app, stripe.com, attio.com and modash.io would let us confirm the items marked from prior knowledge.
