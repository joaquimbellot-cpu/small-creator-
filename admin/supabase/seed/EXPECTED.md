# What the seed contains and what the overview must show

Fake data only (`@example.test`). The seed is deterministic: ids come from `md5('<kind>-<n>')::uuid` and
all dates are whole days before `now()` (plus 3 hours), chosen away from the 7 and 30 day edges, so these
numbers hold on any day. `expected.json` has the same numbers for the tests.

## Logins (local stack only)

| Role | Email | Password |
|---|---|---|
| owner | owner@example.test | `Owner-Test-Pass-2026!` |
| worker | worker@example.test | `Worker-Test-Pass-2026!` |

## Rows

60 creators (new 18, contacted 12, replied 8, active 10, inactive 10, do_not_contact 2; every 9th has hidden
subscribers, every 4th has no phone), 10 brands, 15 deals, 40 emails, 3 templates, 2 suppressed addresses
(creator 59 and `removed.sample@example.test`), settings with `test_email = owner@example.test`,
`test_mode = true` and no postal address (so real sending is locked until one is entered).

Emails: real sent 16, replied 12, failed 3, draft 4, approved 2; test sends (is_test) 3.

## `stats_overview()` for the seed

| Field | Value | How |
|---|---|---|
| total_creators | 60 | |
| emails_sent_all | 28 | 16 sent + 12 replied, real only (the 3 test sends are excluded) |
| emails_sent_7d | 5 | sent 1, 2, 4, 6 days ago (contacted creators) and 5 days ago (replied) |
| emails_sent_30d | 16 | the 5 above + 6 more real sends (9 to 29 days ago) + 5 replied (8 to 24 days ago) |
| replies | 12 | status replied, real only |
| reply_rate | 42.9 | 12 / 28 = 42.857 |
| deals_by_stage | contacted 2, replied 2, negotiating 3, signed 3, completed 2, paid 3 | all six stages present |
| active_deals | 8 | negotiating 3 + signed 3 + completed 2 |
| commission_earned_cents | 21900 | paid deals: 80000 -> 6400, 30000 -> 3000, 250000 -> 12500 |
| weekly | 12 points, oldest first | sent sums to 26, replies to 11 (two old emails, 87 and 88 days ago, fall outside the 12 weeks) |

The per-week split depends on the weekday the seed was loaded, so only the sums are fixed.
`creator_summaries` for creator 39 (Wren ...): 2 deals, total_earned_cents 73600 (paid deal 80000 - 6400).

Verified by `admin/supabase/tests/run.sh`, which calls the function as the real owner through the gateway.
