# Price calculator (build notes)

Page: `/creators/calculator`. A plain calculation, no Claude call, nothing sent or saved.

## Library: `@/lib/pricing` (pure, no React, no database; money is USD numbers)

- `priceSponsorship(input: PriceInput, context?: PriceContext): PriceResult | null`. Returns `null` when views are missing or 0.
  - `PriceInput`: `{ name?, niche: CpmGroupId, own, cpmLo, cpmHi, subs, views, eng (percent or null), aud (text), format: FormatId, usage (months, 0 = none), excl (days, 0 = none), wide, extras: Record<ExtraId, boolean>, margin (percent or null) }`.
  - `PriceContext` (all optional): `pastDeals: { amountUsd, subscribers }[]` (own deals, for the size check), `sponsor: { name, budgetMinUsd, budgetMaxUsd } | null`, `currency: 'USD' | 'AUD'` and `rate` (only change how money is written in the texts; numbers stay USD).
  - `PriceResult`: `cpm`, `base`, `price`, `payout`, `cut`, `eff` (each `[low, mid, high]`), `steps: { label, detail, v }[]` (format, geography, engagement, usage, exclusivity; running figures), `margin` (the one used), `ask` (mid, rounded), `reason`, `checks: { ok, text, tag? }[]`, `flags`, `assumptions`, `better`.
- `defaultPriceInput(overrides?)`: 60-second integration, margin 20, link extra ticked.
- `cpmGroupForNiche(slug)`: gaming and music -> gaming, tech -> tech, finance -> finance, others -> life. `CPM_GROUPS`, `FORMATS`, `EXTRAS`.
- `parseAudience(text)`, `commissionUsd(amount)` (10% under 500, 8% under 2,000, 5% above), `usagePercent`, `exclusivityPercent`.
- Formatting: `formatMoney(value, currency, rate, dec?)`, `formatCount`, `shortCount`, `plural`, `tidy`, `parseCount`, `parseDecimal`.

Quick use for a profile box: `priceSponsorship(defaultPriceInput({ niche: cpmGroupForNiche(c.niche_slug), subs, views: c.avg_views, eng: Number(c.engagement_rate), aud: c.audience_countries ?? '' }))` then show `price[0]` to `price[2]` and `ask`.

## Link to the page

`/creators/calculator?creator=<creator uuid>&brand=<brand uuid>`. Both optional, both validated as uuid. `creator` fills name (channel name or full name), niche, subscribers, average views, engagement, audience countries. `brand` adds the sponsor's usual budget (`budget_min_cents`, `budget_max_cents`, needs both) to the checks and its name to the intro line. An unknown or invalid id gives the empty form with a notice.

## Files

`admin/lib/pricing/*` (with `pricing.test.ts`, 16 tests including the hand-checked case), `admin/app/(company)/creators/calculator/{page.tsx,PriceCalculator.tsx,calculator.module.css}`, `admin/app/(company)/creators/CreatorsSubnav.tsx` (for the list page agent to add under its page head).

## Notes

- The dark panel uses the global `.panel` class (on-ink tokens). The shared `Input` and `Select` read those tokens, so they follow.
- The prototype's "(fake data here)" wording in the own-deals check is dropped; the "Decide" check about 10/8/5% against the margin is kept.
