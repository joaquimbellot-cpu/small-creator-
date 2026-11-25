# Matching, Link and the deals board (Matching and Link agent)

## What was built

| Piece | Where |
|---|---|
| The score, in SQL | `admin/supabase/migrations/20261125000800_matching.sql` (tests: `admin/supabase/tests/matching.sql`, 28 checks, in `run.sh`) |
| Types, band rule, zod schemas (pure) | `admin/lib/matching/index.ts`, `matching.test.ts`; server reads in `lib/matching/load.ts` |
| Suggestions, Link button and dialog, pickers, "Why" cell, server actions | `admin/components/matching/*` |
| Deals page: board and table, amount editing | `admin/app/(company)/deals/*`, `admin/lib/deals/*` (browser test `lib/deals/e2e.cjs`) |
| "Best match" sort | `creators_list` and `sponsors_list` (migration), toolbars and tables of the two lists |

## The score (one source of truth: the database)

`match_pairs(creator, sponsor, ids)` scores every pair asked for; `match_for_creator(creator, ids?)` returns every sponsor for one creator, `match_for_brand(sponsor, ids?)` every creator for one sponsor. Columns: the other id, `total`, `band` (Strong 70+, Possible 40 to 69, Weak), `reasons` (jsonb array of `{points, text, unconfirmed}` in the order niche, size, similar, recency), `blocked` (text or null), `open_stage`, `recent_on`, `suggestable`. All security invoker, fixed search_path, `authenticated` and `service_role` only (anon is refused: tested). With neither side given they return nothing (never a cross join).

- Niche fit 40: the creator's `niche_slug` is in the sponsor's `target_niches`. Size fit 25: subscribers inside the target 25, within 50% outside 12, else 0 (a missing min counts as 0, a missing max as no limit). Similar creators 20: other creators in the same niche the sponsor backed (confirmed): 1 gives 8, 2 gives 14, 3 or more 20; with no confirmed record, detected records give half (4, 7, 10), the sentence starts "Possibly" and `unconfirmed` is true. Recency 15: the sponsor's latest confirmed sponsorship (`brands.last_sponsorship_at`): 90 days 15, 180 days 10, 365 days 5.
- Missing data gives 0 for that input with a sentence that says what is missing (no niche, subscribers hidden or missing, sponsor has no target niches, no target size).
- Not suggested (`suggestable` false): creator do_not_contact or opted out (the suppression list; the suppression trigger also marks the creator do_not_contact), sponsor do_not_contact, an open deal for the pair (any stage but completed and paid), a confirmed sponsorship for the pair in the last 180 days. `blocked` is only the two hard blocks (Do not contact, opted out): those cannot be linked. An open deal also cannot be linked again. A recent sponsorship only gives a note in the Link dialog (the pair may still be linked).
- Only confirmed, not rejected records feed the confirmed inputs. Detected records never appear in a sentence except as "Possibly ...".

## "Best match" sort

- `sponsors_list` already had `p_for`; the migration copies the body and adds the ordering (people we may contact first, then score high to low, then name). Without `p_for`, `match` still sorts by name (`sponsors_list.sql` unchanged and passing).
- `creators_list` has no "for" argument and its signature must not change, so the sponsor rides in `p_sort` as `match:<sponsor uuid>` (`lib/matching` `matchSortArg`). A plain `match` still equals the subscribers order (`creators_list.sql` unchanged and passing). The export route does not use it.
- The return types are fixed, so the visible page's scores are fetched in a second call (`match_for_brand` / `match_for_creator` with `p_ids` = the 25 ids) inside `loadPage` (`lib/creators/query.ts`) and `loadList` (`lib/sponsors/queries.ts`) and attached to the rows as `row.match`.
- UI: the sort option, a "For sponsor" / "For creator" searchable picker beside it (server search, 20 names), and a Match column right after the name: "Strong match · 84" with a small "Why" disclosure that opens the reasons. Cards get the same disclosure. A click inside it does not open the side panel.
- Files changed in the finished lists (only for this): `CreatorsToolbar.tsx`, `CreatorsTable.tsx`, `lib/creators/constants.ts` (`ListRow.match`), `lib/creators/query.ts`; `SponsorsList.tsx`, `lib/sponsors/constants.ts` (`SORT_OPTIONS`, `SponsorRow.match`), `lib/sponsors/queries.ts`. In `SponsorsList` the sort select reads the raw address so the picker shows when `sort=match` has no `for` yet (the server sorts by name until one is chosen).

## Suggestions and Link

- `Suggestions` (server): heading "Suggested sponsors" or "Suggested creators", up to five that are suggestable and score 40 or more, each with the other party linked to its profile, a one-line description, `ScoreReasons`, `LinkButton` and the Outreach agent's `DraftPitchButton`. A notice when the record is do_not_contact. The explanatory line as in the prototype. A failed load shows a plain error notice.
- `LinkButton` opens `LinkDialog`: two searchable pickers (`PartyPicker`: a server action returns at most 20 names, no emails; once one side is chosen the other is ordered by score and each option shows band and score), the score with reasons, blocked and open-deal notices (Create link is disabled), the fair price from `priceSponsorship` (60-second integration, margin 20) with "Use $X" and a link to the calculator, an optional amount, the starting stage (Matched or Contacted). "Create link" is `createLinkAction`: `requireStaff()`, zod, the user's client, the block rules checked again on the server, inserts the deal, revalidates; the toast offers "View on the board".
- Server actions are in `components/matching/actions.ts` (`searchPartiesAction`, `partyNameAction`, `pairInfoAction`, `createLinkAction`).

## Deals page

- `?view=table` for the table; the board is the default. Board: seven columns with count and total ("No amounts yet" when none), cards with linked creator and sponsor, amount or "Amount not set", days in stage, a native "Move to" select (works with a keyboard and on tablets) and drag and drop on top. Each column shows 50 cards and a "Show more" button; the board loads the newest 2,000 deals (a notice says so past that). The board scrolls inside its own frame.
- Moving is `moveDealAction`; the board updates at once and goes back if the server refuses. Moving to Completed or Paid for the first time makes the database add a Confirmed record; the toast then says "A Confirmed sponsorship was added to both histories." (the action checks whether a record for the deal existed before the move, so a second move to Paid does not claim it). The table's Save pattern says the same.
- Amount editing (staff, zod, M20): an "Edit" link beside the amount in both views; empty means "not set"; the database works the commission out again and the existing audit trigger records the change. Add deal: the amount is now optional (an empty amount is stored as null). `matched` has a label in `lib/deals/format.ts`; `formatAmount` and `timeInStage` are new; `STAGES` now starts with `matched`, which the assistant tools use (`z.enum(STAGES)`), so the assistant can propose moving a deal to Matched and to no stage that does not exist; its `DealRow` now allows a null amount.
- The Draft pitch button on cards at Matched and Contacted is rendered by the server (the Outreach component) and handed to the board, so the board does not import it.
- Overview: the stage strip lists seven stages (inline `gridTemplateColumns` in `page.tsx` so they fit in one row).

## Tests

`npx vitest run lib/matching lib/deals lib/creators lib/sponsors` (136 with the assistant tests), `bash supabase/tests/run.sh` (matching.sql: 28 checks), `node lib/deals/e2e.cjs` (about 120 checks, owner and worker, 400, 820 and 1360 px; creates "ZZ Deals Creator" and three "ZZ" brands and removes them and their records at the end).

## For others

- `supabase/tests/rls.sql` expects exactly 40 emails and the seed counts; it failed once with 42 emails because another agent's test left drafts behind (not matching related).
- `tests/qa.e2e.cjs` mentions deal stages and the old deals page; not mine, not run.
- Both profile pages already format a null amount as "Amount not set".
