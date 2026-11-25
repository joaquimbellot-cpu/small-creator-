# Creator profile (build notes)

## Pieces
- `CreatorProfile` (`admin/app/(company)/creators/profile/`): server component, `{ id, mode: 'panel' | 'page' }`. Full page `/creators/[id]` (two columns, `notFound()` for an unknown or malformed id, own `not-found.tsx`). In the panel an unknown id shows "This creator does not exist".
- `SponsorshipHistory` (`admin/components/sponsorships/`): `<SponsorshipHistory side="creator" | "brand" id={...} />`, renders its own section. For a sponsor page use `side="brand"` and the brand id: it lists creators, links each to `/creators/<id>`, and the form picks a creator. Nothing else to wire.
- Server actions in `admin/lib/sponsorships/actions.ts` (all return `ActionResult = { ok: true, message, brandCreated? } | { ok: false, error }`): `addSponsorship`, `updateSponsorship`, `confirmSponsorship({id, note})`, `rejectSponsorship({id})`, `restoreSponsorship({id})`, `listParties(side)`. Pure helpers: `schemas.ts` (`recordSchema`, `cleanVideoUrl`, `isFutureDate`), `errors.ts` (`plainError`), `format.ts`, `types.ts` (`HistoryRecord`, `PartyOption`, `ActionResult`), `load.ts` (`loadHistory`, server only). Profile actions (tags, notes) in `creators/profile/actions.ts`.
- No migration was needed; `supabase/tests/creator_profile.sql` was not added (no SQL of my own). Tests: `lib/sponsorships/sponsorships.test.ts`, new cases in `lib/creators/creators.test.ts`, browser test `lib/creators/profile.e2e.cjs` (32 checks, cleans up after itself).

## Rules worth knowing
- A person's record is saved Confirmed (the database sets who and when). Editing keeps the label. Date may not be in the future (one day of time-zone slack on the server). Video links: https on youtube.com or youtu.be. A new sponsor name creates the sponsor and the toast says so.
- `creator.viewed` is written once per real view with `after()` in `CreatorProfile`. It is skipped when the request carries `next-action` (a refresh caused by a server action) or `next-router-prefetch`. Any `router.refresh()` or filter change on the list page that re-renders an open panel WILL write another line: the list agent should avoid refreshing the open panel (change only `open`, or refresh through a server action).
- Notes are saved by `saveCreatorNotes`; the creators audit trigger stores only `{"changed": true}` for them.
- The Edit form: new fields niche (select), country (short list + Other), language, average views, engagement rate, audience countries, uploads a month. `CreatorDialog` props are unchanged. If `editInitial` has no `niche_slug` key the form loads the seven fields itself (`loadProfileFields`) and sends `profile_fields=1`; an old form without that flag never blanks them. The old free-text niche is kept in a hidden field and shown as a hint.
- CSV: new optional columns `niche_slug, country, language, avg_views, engagement_rate, audience_countries`. A bad value (including an unknown niche slug) makes that row an error with the reason. The export still writes the original 8 columns (`CSV_COLUMNS` unchanged); `SAMPLE_CSV` has all 14.

## Left for others
- List agent: `lib/creators/creators.test.ts` "filters" case and `app/api/creators/export/route.ts` (`applyFilters`) fail type-check/test while their rewrite is in progress (not my files). Pass the seven new fields in `editInitial` if convenient (optional). Avoid refreshing an open panel (see above). Switch `CreatorDialog` to edit and add only; its view mode still works.
- Matching and Outreach agents: `LinkButton`, `DraftPitchButton` and `Suggestions` are already placed in the profile; they render nothing until built.
- `lib/deals/format.ts` has no `matched` stage label (the profile uses its own map).
- Not built: `Refresh subscribers` needs a YouTube key (message "Add a YouTube API key to turn this on" otherwise).
