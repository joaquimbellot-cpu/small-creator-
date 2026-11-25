# Outreach notes (pitch drafts)

Files: `admin/components/outreach/*` (`DraftPitchButton`, `OutreachHistory`, `actions.ts`, `outreach.module.css`), `admin/lib/drafting/pitch*.ts` (+ tests), migration `20261125000900_outreach.sql`, SQL tests `supabase/tests/outreach.sql` (31 checks, in `run.sh`), extra checks in `lib/email/e2e.cjs`, the pitch answer in `dev/fake-anthropic.mjs`.
Small edits in finished files: Review (`page.tsx`, `ReviewCard.tsx`), Log (`emails/page.tsx`), email detail, send route messages, `lib/email/unsubscribe.ts`, and one line in `SponsorProfile.tsx` (`<OutreachHistory side="brand" id={id} />`).

## What Claude is given in pitch mode (the exact list)
Inside tags in the user prompt, each value cleaned (angle brackets out, one line, 300 characters):
- **Creator:** first name, channel name, channel link, niche (name from `niches`, else the free text), subscribers (the word `hidden` when hidden or unknown), average views (`unknown` when empty).
- **Sponsor:** name, industry, names of the niches it targets, target creator size (min to max subscribers), and the number of OTHER channels in this creator's niche it has confirmed sponsorships with.
- **Past sponsors:** at most 3 confirmed sponsorships of this creator, name and month only, one per sponsor, never the sponsor being pitched, none without a date. Read from the view `creator_sponsorship_facts` only.
- **Greeting name:** the creator's first name, or for the sponsor direction the contact person's first name.
- A fixed system prompt (Smallfold facts from `docs/brand-info.md` without the commission tiers; allows naming the pitched sponsor and the listed past sponsors; forbids prices, budgets, commission, promises, invention, other links, placeholders, signature/footer; about 150 words).

## What is withheld
Creator email, phone, notes, status; contact person's email, phone, role, notes; any price, budget, commission, deal; detected and rejected sponsorship records (detected ones are shown to the person under "Left out" only); the creator's full name, surname, ids. The types have no field for them (`pitch-types.ts`), and tests check prompt and facts for planted addresses, phone numbers, notes, budgets and detected names.

## Checks on Claude's answer (`pitch-validate.ts`; refusal means nothing is saved)
General checks of every draft (length, placeholders, unsubscribe line, one link only) plus: no currency amount, no "price/budget/commission"; body at most 190 words; greeting names the right first name; every company is the pitched sponsor, the channel or a confirmed past sponsor (any other sponsor known to the database is refused, so are two unknown capitalised words in a row, and unknown capitalised words inside a sentence); every number and month is in the facts (abbreviations like "4.2k" within 5%). Known limit: a single invented one-word brand that starts a sentence and is not in the database passes; the owner reads every draft.

## Database (`20261125000900_outreach.sql`, additive, safe to run twice)
`emails.brand_id` (references brands, set null on delete), `recipient_kind` (`creator` default | `brand_contact`; a contact email needs a sponsor), `brand_contact_id` (references brand_contacts, set null), `pitch_facts jsonb` (`{used: [...], left_out: [...]}`, plain sentences, at most 8000 characters). New `emails_check_recipient()`. Replaced (bodies copied, only the listed checks added): `emails_guard`, `reserve_send`, `mark_sent`, `audit_row` (copy of `20261125000400`, email lines also carry `brand_id` and `recipient_kind`; `log_audit` is unchanged).

## Refusals
- Draft or approval: creator `do_not_contact` (also for an email to a contact), sponsor `do_not_contact`, address on the opt-out list (to_email, and the contact's current address), a client writing a wrong address for the kind (creator's for `creator`, the contact's for `brand_contact`, the contact must belong to the sponsor). A change of sponsor, contact or kind drops an approved email back to draft.
- `reserve_send`: the old codes plus `sponsor_do_not_contact`, `no_contact` (contact deleted), and `suppressed` also checks the contact's current address. Test mode, daily limit, gap unchanged: a test send goes to the test address with `[TEST]`.
- `mark_sent`: a real send to a contact stamps `brands.last_contacted_at` and leaves the creator alone; creator emails behave as before.
- Unsubscribe from a contact email adds that address to the opt-out list and does NOT mark the creator Do not contact (`lib/email/unsubscribe.ts`).
- The dialog explains each refusal plainly and disables "Write the draft"; the server action repeats every check.

## Roles
Same as Compose today: any staff member (owner or worker) may draft; drafts are never approved and only the Send button (server, existing guards) sends. No action returns an email address.

## Left for others / notes
- Bulk "Start outreach drafts" still goes to `/emails/compose` (unchanged; the compose page works, covered by the e2e).
- `DraftPitchButton` is used by the creator and sponsor profiles already; the Matching agent can pass `creatorId` and `brandId` together from suggestions and deals.
- The local app runs `DRAFT_MODE=mock`, so the dialog writes practice drafts there. The real path is tested against the fake Claude in `lib/drafting/pitch.fake.test.ts` (it starts its own copy of the fake on port 4017). The already-running fake on 4010 predates the pitch change until it is restarted by the leader.
- The prompt-size and per-hour limits of Claude calls are as for Compose (25 s, one retry); no extra rate limit was added.
