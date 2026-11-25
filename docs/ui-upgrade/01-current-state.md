# Smallfold back office: current state (01)

Read-only scan of branch `ui-upgrade` (latest commit seen: `c7f15d1`). Written for the designer (prototype) and the engineers (build plan). Everything below was checked against the code, not only the old audit files. Where the old map (`docs/audit/00-project-map.md`) or the UI audit (`docs/audit/06-ui-ux-accessibility.md`) is now out of date, that is said.

No secrets, real names, e-mail addresses or phone numbers are in this file.

Differences from the old audit files (verified in code):
- The stage dropdown on Deals no longer saves on every key press. It now shows a "Save" button when the value changed (`deals/StageForm.tsx`).
- Error, not-found and global-error screens exist now (`app/error` files, `app/not-found.tsx`, `app/global-error.tsx`).
- The logo mark (round "S") is in the shell (`components/shell/LogoMark.tsx`). There is a pending line under a nav link while a page loads (`NavLinks.tsx`).
- The phone nav is one sideways-scrolling row (`globals.css`, media query 700px).
- A bulk "Change status" action and the route `POST /api/creators/status` exist now. The list has a "Subscribers" and a "Last contacted" column.
- There is a lint script now: `oxlint app lib components proxy.ts` (the old map said "no lint").
- Fonts now come from npm (`@fontsource/*`), not Google Fonts.

---

## 1. Pages and routes

Roles: **owner** = full access. **worker** = view and edit creators, deals, templates, emails, import, inbox. "staff" below means owner or worker. Every page calls `requireStaff()` or `requireOwner()` itself (see section 7).

### Company pages (inside the shell, folder `admin/app/(company)/`)

| URL | What it does | Who | File |
|---|---|---|---|
| `/` | Redirects to `/overview` (the public website pages are rewritten from `/` by `next.config.ts`; `app/page.tsx` is the fallback) | staff (via login) | `app/page.tsx` |
| `/overview` | Six key-number tiles, deals by stage strip, 12-week emails-and-replies bar chart, "Recent activity" list (last 20) | staff | `(company)/overview/page.tsx` |
| `/creators` | Creator list: search, status filter, 4 sortable columns, 25 per page, checkbox bulk actions, row click opens the pop-up | staff | `(company)/creators/page.tsx`, `CreatorsTable.tsx` |
| `/creators?creator=<id>` | The same list with the creator pop-up in view mode (adds `&edit=1` for edit, `?new=1` for add) | staff | `CreatorDialog.tsx` |
| `/creators/import` | Upload a CSV, preview (new / duplicate / error per row), then commit | staff | `creators/import/page.tsx`, `ImportClient.tsx` |
| `/deals` | Deals table (creator, brand, stage, amount, commission, last change), stage filter, 25 per page, "Add a deal" tile on the right | staff; delete only owner | `(company)/deals/page.tsx` |
| `/emails` | Email log: filter by status, type (test/real), creator, date range; 25 per page | staff | `(company)/emails/page.tsx` |
| `/emails/compose` | Find and select creators (max 25), pick a template or type a goal, create drafts. Accepts `?creators=id,id` | staff | `emails/compose/page.tsx`, `ComposeForm.tsx` |
| `/emails/review` | Draft and approved emails (mine or all), edit, approve, back to draft, discard, Send bar | staff | `emails/review/page.tsx`, `ReviewCard.tsx`, `SendBar.tsx` |
| `/emails/[id]` | One email: status, who drafted/approved/sent, body, mark replied, retry failed | staff | `emails/[id]/page.tsx`, `EmailActions.tsx` |
| `/emails/templates` | Template list | staff | `emails/templates/page.tsx` |
| `/emails/templates/new`, `/emails/templates/[id]` | Create or edit a template (name, goal, subject, body). Delete is owner only | staff; delete owner | `TemplateForm.tsx`, `actions.ts` |
| `/inbox` | Brand inquiries from the website contact form; filter open/handled/all; 25 per page; logs `contact.viewed` | staff | `(company)/inbox/page.tsx` |
| `/inbox/[id]` | One inquiry (name, company, budget, message), mark handled; delete is owner only | staff; delete owner | `inbox/[id]/page.tsx`, `actions.ts` |
| `/claude` | Chat with the Claude assistant (threads on the left, proposals with Approve / Reject) | owner | `(company)/claude/page.tsx`, `ChatClient.tsx` |
| `/settings` | Redirects: owner to `/settings/users`, worker to `/settings/security` | staff | `settings/page.tsx` |
| `/settings/users` | Invite staff, change role, deactivate | owner | `settings/users/page.tsx` |
| `/settings/security` | Set up own two-step login (TOTP) | staff | `settings/security/page.tsx` |
| `/settings/audit` | Audit log table (50 per page), filter by action and person | owner | `settings/audit/page.tsx`, `format.ts` |
| `/settings/sending` | Test mode, test address, daily limit, gap between sends, sender name, postal address, time zone | owner | `settings/sending/page.tsx` |

### Auth and public pages

| URL | What | Who | File |
|---|---|---|---|
| `/login`, `/login/2fa` | Password login, then TOTP step if enrolled | public | `(auth)/login/` |
| `/forgot-password`, `/reset-password` | Password reset flow | public | `(auth)/` |
| `/unsubscribe/[token]` | Opt-out confirm page (signed token) | public | `app/unsubscribe/` |
| `/auth/confirm`, `/auth/hash` | Landing for links in Supabase e-mails | public | `app/auth/` |
| `/auth/signout` (POST) | Ends the session | any | `app/auth/signout/route.ts` |
| `/`, `/brands`, `/apply`, ... | The public website (static pages built from `src/`), served by the same app | public | `lib/site-pages.ts`, `next.config.ts` |

### API routes (folder `admin/app/api/`)

| Route | What | Who | File |
|---|---|---|---|
| `GET /api/creators/[id]` | One creator from `creator_summaries`; writes audit `creator.viewed` | staff | `creators/[id]/route.ts` |
| `DELETE /api/creators/[id]` | Delete a creator (409 if deals or sent e-mails exist) | owner | same |
| `GET /api/creators/export` | CSV of the current filter; audit line written first (refuses if it cannot be written) | owner | `creators/export/route.ts` |
| `POST /api/creators/import?mode=preview\|commit` | CSV import, max 1 MB, 2,000 rows, checks twice on the server | staff | `creators/import/route.ts` |
| `GET /api/creators/sample` | Sample CSV (fake rows) | staff | `creators/sample/route.ts` |
| `POST /api/creators/refresh-subscribers` | `{ids: uuid[] (max 200)}`, asks YouTube for subscriber counts, 503 if no YouTube key | staff | `creators/refresh-subscribers/route.ts` |
| `POST /api/creators/status` | `{ids (max 200), status}`, bulk status change | staff (worker cannot take a creator off Do not contact) | `creators/status/route.ts` |
| `GET /api/emails/creators?q=` | Creator search for the compose page (max 20) | staff | `emails/creators/route.ts` |
| `POST /api/emails/[id]/send` | Sends ONE approved e-mail. Only the Send button calls it. `maxDuration = 30` | staff | `emails/[id]/send/route.ts` |
| `POST /api/assistant/chat` | Claude assistant turn | owner | `assistant/chat/route.ts` |
| `POST /api/assistant/proposals/[id]/approve` and `/reject` | Decide a Claude proposal | owner | `assistant/proposals/` |
| `POST /api/public/apply` | Creator application from the website (creates a creator with `source = 'website'`) | public (Origin check, honeypot, 5 per hour per visitor) | `public/apply/route.ts` |
| `POST /api/public/contact` | Brand inquiry from the website (creates a `contact_messages` row) | public (same checks) | `public/contact/route.ts` |
| `POST /api/unsubscribe/[token]` | One-click unsubscribe (RFC 8058) | public (signed token) | `unsubscribe/[token]/route.ts` |
| `GET /api/health` | Uptime check, answers `{ok}` only | public | `health/route.ts` |

Total: 21 company pages and routes (including sub-pages), 15 API routes, 2 auth routes. There is **no** route for brands, brand contacts, matches, saved views, global search or bulk delete.

Request gate: `admin/proxy.ts` (Next 16 "middleware") requires a session for everything except `/login`, `/forgot-password`, `/reset-password`, `/auth/*`, `/unsubscribe/*`, `/api/unsubscribe/*`, `/api/public/*`, `/api/health` and the website pages. It sets a CSP with a per-request nonce.

---

## 2. Design system, exact values

Source files:
- Tokens: `src/css/tokens.css` (the public website's file). It is copied to `admin/app/tokens.css` by `npm run tokens` (`admin/scripts/copy-tokens.mjs`). The copy is generated and git-ignored. So the back office and the website share one set of values.
- Base and shell styles: `admin/app/globals.css` (76 lines).
- Building blocks: `admin/components/ui/ui.module.css` (72 lines).
- Page styles: `creators.module.css`, `claude.module.css`, `Overview.module.css`.
- Fonts: `admin/app/layout.tsx`.

The look: quiet, flat, hairlines instead of boxes. Cream ground, ink text, one pen-blue accent. No shadows (except two faint scroll hints on tables). No gradients (except those scroll hints). No icons anywhere except the round "S" mark. No dark mode in the back office (the dark "grounds" exist as classes `.on-ink`, `.panel`, `.on-photo` for the website but the back office does not use them).

### 2.1 Colour tokens (from `src/css/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--cream` | `#F1EFEB` | Page ground (`--bg`) |
| `--ink` | `#0E0E0E` | Text and filled buttons (`--fg`) |
| `--paper` | `#FAF8F4` | Raised surfaces: tiles, fields, notices, hovered table rows (`--surface`) |
| `--cream-deep` | `#E5E1D8` | Defined, no component reads it |
| `--ink-soft` | `#1A1A19` | Raised surface on ink |
| `--muted` | `#5C5A55` | Secondary text and field borders (`--fg-muted`), contrast 6.0 on cream |
| `--muted-on-ink` | `#A9A59C` | Secondary text on ink |
| `--faint` | `#B9B5AC` | Decorative only, never text |
| `--line` | `rgba(14, 14, 14, .14)` | Hairlines (`--rule`) |
| `--line-on-ink` | `rgba(241, 239, 235, .18)` | Hairlines on ink |
| `--accent` | `#2B44D6` | Pen blue (`--accent-fg`): focus ring, current nav item, "contacted" badge, links on auth pages, chart reply bars |
| `--accent-on-ink` | `#A8B4FF` | Accent on ink |
| `--veil` | `rgba(14, 14, 14, .64)` | Dark veil on photos (website only) |

The six "ground" variables every component reads (default `.on-cream` on `:root`): `--bg` cream, `--fg` ink, `--fg-muted` muted, `--rule` line, `--surface` paper, `--accent-fg` accent.

**Hard-coded colours** (not tokens, in `ui.module.css` and a few pages):

| Value | Use |
|---|---|
| `#9B2C1F` | Red: danger button, error text, error field frame, `bad` badge, `nError` notice border, stage-save error text |
| `#2F6B3C` | Green: `good` badge, `nSuccess` notice border |
| `#8A5A00` | Amber: `warn` badge, `nWarn` notice border |
| `rgba(14, 14, 14, .45)` | Modal backdrop |
| `rgba(14, 14, 14, .16)` | Table scroll-edge shadows |
| `#fff` | QR code box (`.qr`) |
| `var(--cream)` | Text on a solid red button |

### 2.2 Type

Fonts (`admin/app/layout.tsx`): `@fontsource/instrument-sans` weights **500** and **600**; `@fontsource/newsreader` weights **300**, **300 italic**, **400**.

| Token | Value |
|---|---|
| `--font-serif` | `"Newsreader", Georgia, "Times New Roman", serif` |
| `--font-sans` | `"Instrument Sans", "Helvetica Neue", Arial, sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| `--w-heading` | 300 (headings, serif) |
| `--w-text` | 400 |
| `--w-label` | 500 (uppercase sans labels) |
| `--w-label-strong` | 600 (label of a field with an error) |

Note: body text in the back office is **sans** at weight 400, but the layout does not load Instrument Sans 400. Only 500 and 600 are imported, so body text falls back to the nearest loaded weight (500) in the real font. This is a small mismatch to check when you see the real fonts (the old audit could not load fonts either).

Size tokens (`clamp` ones scale with the screen):

| Token | Value | Line height token |
|---|---|---|
| `--t-hero` | `clamp(2.75rem, 6.2vw, 5.5rem)` | `--lh-hero` 1.02 (not used in the back office) |
| `--t-h1` | `clamp(2.4rem, 4.6vw, 4rem)` | 1.06 |
| `--t-h2` | `clamp(2rem, 3.6vw, 3.25rem)` | 1.1 |
| `--t-h3` | `clamp(1.375rem, 1.8vw, 1.625rem)` | `--lh-h3` 1.25 (modal title, empty-state title) |
| `--t-lead` | `clamp(1.1875rem, 1.5vw, 1.375rem)` | 1.45 |
| `--t-body` | `1.125rem` | 1.55 |
| `--t-small` | `1rem` | `--lh-small` 1.5 (the back office body size) |
| `--t-label` | `.75rem` (12px) | `--lh-label` 1.4 |
| `--track-heading` | `-0.01em` | |
| `--track-label` | `.07em` | |
| `--measure` | `34em` | widest running text (`.page-lead`) |

Actual use in the back office:
- `body`: `400 1rem/1.5 var(--font-sans)`, `-webkit-font-smoothing: antialiased`.
- `h1, h2, h3`: serif, weight 300, letter-spacing `-0.01em`.
- `.page-title`: `clamp(1.75rem, 3vw, 2.5rem)`, line height 1.1. (Smaller than `--t-h1`.)
- `.page-lead`: muted, max width `34em`, margin-top 8px.
- `.label` (global and module copy): sans 500, 12px, `.07em`, UPPERCASE, muted.
- Table text `.9375rem` (15px), line height 1.4. Notices `.9375rem`/1.5. Hints and errors `.875rem`. Small helper text 15px.
- Shell brand: serif 300 `1.5rem/1`. Auth brand: serif 300 `2rem/1`. Auth title `1.625rem`. Modal title `var(--t-h3)`. Overview big number: serif 300 `clamp(2rem, 3.4vw, 2.75rem)`/1.1; stage numbers serif `1.5rem`. State title `clamp(1.75rem, 3vw, 2.5rem)`.
- Numbers in tables use `font-variant-numeric: tabular-nums` (class `num`).

### 2.3 Space, shape, lines, controls, motion

| Group | Tokens |
|---|---|
| Space scale | `--s-1` 4px, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 24, `--s-6` 32, `--s-7` 48, `--s-8` 72, `--s-9` 112, `--s-10` 160 |
| Gutter | `--gutter: max(clamp(20px, 4vw, 56px), env(safe-area-inset-left), env(safe-area-inset-right))` |
| Widths | `--wrap` 1320px (content), `--narrow` 720px (error pages text) |
| Radii | `--r-sm` 4px (badges), `--r` 8px (buttons, fields, tiles, notices, modal), `--r-lg` 14px (defined, not used in the back office) |
| Lines | `--hairline` 1px (all borders), `--stroke` 2px (focus ring, error frame, current-nav underline), `--focus-offset` 3px |
| Control sizes | `--tap` 44px, `--h-btn` 48px, `--h-btn-small` 40px, `--h-field` 52px, `--icon` 24px, `--icon-small` 16px, `--mark` 20px |
| Motion | `--ease: cubic-bezier(.22, 1, .36, 1)`, `--dur-hover` 200ms (set to .01ms under reduced motion) |
| Shadows | None. Only the table scroll hint (see 2.4) |
| Focus | `:focus-visible { outline: 2px solid var(--accent-fg); outline-offset: 3px; }` |

Breakpoints actually used in the back office CSS:
- `max-width: 520px`: creator `dl` stacks, overview chart tick labels bigger and every second one hidden.
- `min-width: 640px`: creator form two-column grid (`.two`).
- `max-width: 700px`: shell collapses (brand and user on first row, nav in its own scrolling row).
- `min-width: 900px`: `.split` becomes two columns (2fr / 1fr; `.split--wide` is 3fr / 1fr), Claude layout gets a 240px thread column.
- `max-width: 860px` (in tokens only): section spacing tokens shrink. Not used by the back office.
- `prefers-reduced-motion: reduce`: nav pending line stops moving.

### 2.4 Building blocks (real CSS)

**Shell** (`globals.css`)
- `.shell` min-height 100vh, flex column. `.shell__bar`: `border-bottom: 1px solid var(--rule)`, background `--bg`.
- `.shell__inner`: max-width `--wrap`, centred, padding `0 var(--gutter)`, flex, align centre, gap `--s-5` (24px), `min-height: 64px`, wraps.
- `.shell__brand`: inline-flex, gap 8px, serif 300 `1.5rem/1`, no underline. Contains the 24px round "S" mark (SVG, `currentColor`, a `var(--accent)` dot at top right).
- `.shell__nav`: flex, gap 4px, `flex: 1`. Links: min-height 44px, padding `0 12px`, muted, sans 500 12px UPPERCASE `.07em`, `border-bottom: 2px solid transparent`. Hover: ink. Current (`aria-current='page'`): ink with `border-bottom-color: var(--accent-fg)`. Pending: a 2px accent bar sliding under the link (`.nav-pending`).
- Nav items: Overview, Creators, Deals, Emails, Inbox, Claude (owner only), Settings (workers go straight to Security).
- `.shell__user`: right side, shows full name and role (small uppercase label), then a "Log out" text button (label style, underlined, min-height 44px).
- `.shell__main`: max-width `--wrap`, padding `32px gutter 72px`.
- `.skip-link`: hidden at top -100px, shows on focus (ink on cream, radius 8px).
- Phone (<=700px): `.shell__inner` gap `8px 12px`, no min-height, `padding-top: 8px`; user block `order 2; margin-left:auto`; nav `order 3; flex: 1 0 100%`, one row, `overflow-x: auto`, links do not wrap.

**Subnav** (`.subnav`): flex, gap 16px, `border-bottom: 1px solid var(--rule)`, margin-bottom 24px. Links: padding `8px 0`, min-height 44px, muted 15px, `border-bottom: 2px solid transparent; margin-bottom: -1px`. Current: ink with accent underline. Used by Emails (Compose, Review, Templates, Log) and Settings.

**Page head** (`.page-head`): flex, `align-items: flex-end`, `justify-content: space-between`, gap 16px, wraps, margin-bottom 24px. `.page-title` + optional `.page-lead`.

**Toolbar** (`.toolbar`): flex, gap 12px, `align-items: flex-end`, wraps, margin-bottom 16px. Children get `margin-bottom: 0 !important` (so labelled fields and buttons sit on one baseline).

**Tile** (`.tile`): background `--surface` (paper), `1px solid var(--rule)`, radius 8px, padding 16px.

**Split layout** (`.split`): grid, gap 32px, one column; at >=900px `2fr 1fr`. `.split--wide` is `3fr 1fr` (Deals: table left, add form right).

**Buttons** (`ui.module.css`): `.btn` inline-flex, centred, gap 8px, min-height 48px, padding `0 24px`, `1px solid var(--fg)`, radius 8px, background `--fg` (ink), text `--bg` (cream), sans 500 12px/1.4 UPPERCASE `.07em`, nowrap, hover transition 200ms. Variants:
- primary (default): filled ink; hover: transparent with ink text.
- `ghost`: transparent, ink text, `border-color: var(--fg-muted)`; hover: border ink + paper background.
- `danger`: transparent, `#9B2C1F` text and border; hover: filled red, cream text.
- `dangerSolid`: filled `#9B2C1F`, cream text; hover: transparent, red text.
- `sm`: min-height 40px, padding `0 16px`.
- Disabled: opacity .45, `cursor: not-allowed`, no pointer events. Loading: label becomes "Working…" and `aria-busy`.

**Inputs** (`.control`): width 100%, min-height 52px, padding `0 16px`, background `--surface` (paper), ink text, `1px solid var(--fg-muted)`, radius 8px, 400 16px/1.5 sans. Placeholder muted at full opacity. Textarea: padding `12px 16px`, min-height 120px, vertical resize. **Select**: native select with `appearance: none`, `padding-right: 32px`, two small CSS-gradient triangles as the arrow. Field wrapper `.field`: grid, gap 4px, margin-bottom 16px. Label: the uppercase label style. Hint 14px muted. Error 14px red with `role="alert"`; the field gets `2px solid #9B2C1F` and a heavier (600) red label. No checkboxes or radios in `ui` (creators page styles its own 20px checkbox with `accent-color: var(--accent-fg)`).

**Badge** (`.badge`): inline-block, padding `2px 8px`, radius 4px, `1px solid var(--rule)`, label style (12px UPPERCASE 500), muted, nowrap. Tones set text and border colour only (no fill): `accent` = `--accent-fg` (#2B44D6), `good` = #2F6B3C, `warn` = #8A5A00, `bad` = #9B2C1F, `neutral` = muted default.
Tone maps in code:
- Creator status (`lib/creators/constants.ts`): new = neutral, contacted = accent, replied = good, active = good, inactive = warn, do_not_contact = bad.
- Email status (`emails/status.ts`): draft neutral, approved accent, sending warn, sent good, failed bad, replied good.
- Deal stage: shown as a plain dropdown, no badge.

**Notice** (`.notice`): padding `12px 16px`, `1px solid var(--rule)`, radius 8px, background paper, 15px/1.5, margin-bottom 16px. Tones change only the border colour: error `#9B2C1F`, success `#2F6B3C`, warn `#8A5A00`, info = default hairline. Optional bold title line. Error uses `role="alert"`, others `role="status"`.

**Table** (`.tableWrap` + `.table`): wrapper has `border-top: 1px solid var(--rule)`, horizontal scroll, and four background gradients that draw soft `rgba(14,14,14,.16)` scroll-edge shadows (12px wide) when more content is off-screen. Table: width 100%, collapsed borders, 15px/1.4. `th`: left, padding `12px`, label style, muted, `border-bottom: 1px solid var(--rule)`, nowrap. `td`: padding 12px, `border-bottom: 1px solid var(--rule)`, vertically centred, `overflow-wrap: break-word`, `max-width: 40ch`. Row hover: paper background. `.num` right-aligned with tabular numbers; `.actions` right-aligned nowrap. `clickable`: pointer cursor on rows. Sortable header = a plain link with an arrow ` ↑` or ` ↓` after the label (`SortLink`). No sticky header, no row selection styling, no zebra, no density option.

**Pagination** (`.pager`): flex, space-between, gap 16px, padding `16px 0`, 15px muted. Left text "26–50 of 140". Right: ghost small "Previous" / "Next" link buttons. No page numbers, no page-size choice.

**Modal** (`.overlay`, `.modal`): overlay fixed, `z-index: 50`, centred grid, padding 16px, `rgba(14,14,14,.45)`. Panel: width `min(100%, 560px)` (`wide` = 760px), max-height `100vh - 32px`, scrolls inside, background cream, `1px solid var(--line)`, radius 8px, padding 24px. Head: title (serif `--t-h3`) and a "×" close button (24px, min 44x44). Footer: right-aligned buttons, gap 8px, margin-top 24px. Focus trap, Esc and backdrop click close, body scroll locked. There is no slide-over / side panel style.

**Empty state** (`.empty`): centred, padding `72px 16px`, muted; `h2` serif `--t-h3` in ink, paragraph max 32em, then an optional button.

**Other** (`globals.css` and pages):
- Error / not-found screens: `.state` (max-width 720px, padding 72px 0), `.state--page` full height.
- Auth card: `.auth__card` width `min(100%, 420px)` centred.
- `.dl` (creator pop-up details): two columns `minmax(0, 11rem) 1fr`, gap `8px 16px`; `dt` is a 12px uppercase muted label; stacks under 520px.
- Creators selection bar `.bar`: flex, gap 12px, min-height 44px; status picker `.statusPick` 36px high.
- Overview: `.cards` grid `repeat(auto-fit, minmax(200px, 1fr))` gap 16px; `.stages` strip is a bordered paper box with six cells divided by hairlines (`minmax(120px, 1fr)`); `.chart` bordered paper box with 600px max SVG; sent bars ink, reply bars accent; legend swatches 10px.
- Claude chat: `.you` bubble paper with hairline, right-aligned, max 85%; `.claude` bubble hairline only; proposal `.card` paper tile.

### 2.5 Shared components (`admin/components/`)

All exported from `components/ui/index.ts`. Components with their props:

| Component | File | Props |
|---|---|---|
| `Button` | `ui/Button.tsx` | `variant?: 'primary'\|'ghost'\|'danger'\|'dangerSolid'`, `size?: 'md'\|'sm'`, `loading?: boolean`, plus native button props. Default `type="button"` |
| `LinkButton` | same | `href`, `variant?`, `size?`, `className?`, `children`. Next `Link`, `prefetch={false}` |
| `buttonClass()` | same | helper returning the button classes (used for `<a>` downloads) |
| `Badge` | `ui/Badge.tsx` | `tone?: 'neutral'\|'accent'\|'good'\|'warn'\|'bad'`, `children` |
| `Notice` | `ui/Notice.tsx` | `tone?: 'info'\|'success'\|'error'\|'warn'`, `title?`, `children` |
| `Modal` | `ui/Modal.tsx` (client) | `open`, `onClose`, `title`, `children`, `footer?`, `wide?`. Elements with `data-autofocus` get first focus |
| `ConfirmButton` | `ui/ConfirmButton.tsx` (client) | `children`, `title`, `message`, `confirmLabel?='Confirm'`, `variant?='danger'`, `size?='sm'`, `disabled?`, `onConfirm?` (without it, submits the surrounding form) |
| `Input`, `Select`, `Textarea` | `ui/Field.tsx` | `label` (required), `error?`, `hint?`, `id?`, `className?`, plus native props |
| `Field` | same | `label`, `htmlFor`, `error?`, `hint?`, `children` (wrap a custom control with `controlClass`) |
| `controlClass` | same | the input class string |
| `Table` | `ui/Table.tsx` | `children`, `clickable?`, `label?` (labelled scroll region when set) |
| `SortLink` | same | `href`, `children`, `active?: 'asc'\|'desc'\|false` |
| `tableCell` | same | `{ num, actions }` class names |
| `Pagination` | `ui/Pagination.tsx` | `page`, `pageSize`, `total`, `hrefFor(page)` |
| `EmptyState` | `ui/EmptyState.tsx` | `title`, `children?`, `action?` |
| `AppShell` | `shell/AppShell.tsx` | `staff: Staff`, `children` |
| `NavLinks` | `shell/NavLinks.tsx` (client) | `items: {href,label}[]`, `label?='Main'`, `className?`. Marks the longest matching path as current |
| `LogoMark` | `shell/LogoMark.tsx` | none |

Page-local components worth knowing: `CreatorsTable` (client; selection, bulk bar), `CreatorDialog` (view/edit/add), `ComposeForm`, `ReviewCard`, `SendBar`, `StageForm`, `AddDealForm`, `WeeklyChart` (hand-drawn SVG).

Not in `ui` at all: tabs, tooltip, dropdown menu, popover, checkbox/radio/switch component, tag/chip input, date picker, slider, skeleton, toast, avatar, icon set, drawer/side panel, command palette, breadcrumbs, key-value list, card list. Many pages use inline `style={{...}}` for layout (lists in compose, review, forms).

---

## 3. Creators today

### 3.1 List (`/creators`)
Files: `app/(company)/creators/page.tsx` (server), `CreatorsTable.tsx` (client), `creators.module.css`; logic in `lib/creators/` (`constants.ts`, `filters.ts`, `query.ts`, `schema.ts`, `csv.ts`); import page in `creators/import/`.

- **Data source:** the view `creator_summaries` through the user's Supabase client (RLS applies). Count is exact.
- **Page head:** title "Creators", lead "N in total" or "N matching" plus "Smallfold works with channels of 1,000 to 50,000 subscribers." Buttons: Add creator (primary), Import CSV (ghost), Export CSV (ghost link, **owner only**).
- **Filters (only two):** a text search (`q`, max 100 characters, matches `full_name`, `email` or `channel_name` with ILIKE; `searchFilter()` quotes and escapes the text) and a status select (six statuses). The form is a plain GET form with an "Apply" button and a "Clear" button when filtered. No live filtering.
- **Columns:** checkbox, Name (link, with the e-mail address under it), Status (badge), Subscribers (right aligned; shows "Hidden" or an em dash), Last contacted, Added. Dates use `formatWhen` ("21 Nov 2026, 14:05", always UTC).
- **Sort:** four sortable columns via links: `name`, `subscribers`, `last_contacted`, `added`. Default is `added` descending. Name default direction is ascending, others descending. Ties are broken by `full_name`, then `id`. Nulls last.
- **Pagination:** 25 rows (`PAGE_SIZE = 25`), previous/next only. A page past the end redirects to the last page.
- **URL parameters (all of them):** `q`, `status`, `sort` (`name|subscribers|last_contacted|added`), `dir` (`asc|desc`), `page`, plus `creator=<uuid>` (open pop-up in view mode), `edit=1` (edit mode), `new=1` (add mode). Defaults are left out of the URL. Bad values are ignored, not errors. `parseFilters` and `filtersToQuery` in `lib/creators/filters.ts` are the single place for this.
- **Row click:** anywhere on the row except links, checkboxes and buttons opens the pop-up by `router.push`.
- **Selection:** checkbox per row plus "select all on this page". Selection is lost on page change or filter change (client state only, not in the URL).
- **Bulk actions (selection bar):** "Refresh subscribers" (max 200), "Email selected" (link to `/emails/compose?creators=id,id`), "Change status to" select plus "Change status" confirm button (max 200, the confirmation text warns about Do not contact; result notice lists changed / unchanged / owner-only / missing counts). No bulk delete, tag, export-selected, add-to-sponsor.

### 3.2 Pop-up dialog (`CreatorDialog.tsx`)
A `Modal` (wide, 760px) opened by `?creator=<id>`. **View mode** loads `GET /api/creators/[id]` (which writes the audit line `creator.viewed`) and shows a definition list:
Name, YouTube (channel name linked to the channel, opens in a new tab), Email, Phone, Subscribers (with "Hidden by the channel", "last known" number, "checked <date UTC>" or "never checked"), Niche, Status (badge), Deals (count), Earned through us (USD, sum of paid deals minus commission), Last contacted (date or "Never"), Notes.
Buttons: Edit, "Email this creator" (not shown for Do not contact), "Refresh subscribers", Delete (owner only, with confirm; refused with a plain message if the creator has deals or sent e-mails).
**Edit and add mode** (a form with server action `saveCreator`): Name, Email, Phone (optional), Niche (optional, free text, max 120), YouTube channel link, Subscribers (optional whole number), Status, Notes (max 2000). Errors per field. After saving it redirects to the pop-up in view mode. Edit mode also writes `creator.viewed` (the edit form reads the record on the server).
**What the dialog does NOT show:** the list of deals (only a count), brand names, emails sent to this creator, history, country, language, source, average views, created by. There is no creator profile page; the pop-up is the only detail view.

### 3.3 Import and export
- **Import** (`/creators/import`, `POST /api/creators/import`): CSV with columns `name, email, phone, channel_url, niche, subscribers, status, notes` (`CSV_COLUMNS`). Needs at least `name` and `email`. Max 1 MB, 2,000 rows. Preview mode classifies each row as new / duplicate (same e-mail or same channel, in the file or in the database) / error with a reason, then commit inserts the new rows in chunks of 500 and writes audit `creators.imported`. Leading `'` formula guards are removed on import. A sample file is at `/api/creators/sample`.
- **Export** (`GET /api/creators/export`, owner only): the same filters as the list (`q`, `status`, `sort`, `dir`), all matching rows in pages of 1,000, columns `full_name, email, phone, channel_url, niche, subscribers, status, notes`. Formula-injection guard (a leading `=`, `+`, `-`, `@`, tab or CR gets a `'`). The audit line `creators.exported` (with the row count) is written first and the export is refused if that fails. Not offered to workers.

### 3.4 Subscriber refresh
`POST /api/creators/refresh-subscribers` with up to 200 ids. Uses the YouTube Data API through `lib/youtube/` (`index.ts`, `channel.ts`); needs a YouTube key in the environment (otherwise 503 and the UI says refresh is off). Batches of 50 channel ids. Per creator the result is `updated` (new `subscribers`, `subscribers_hidden = false`, `subscribers_checked_at`, `youtube_channel_id`), `hidden`, `not_found` or `error`. Audit action `creator.subscribers_refreshed` with counts. Only subscriber count and hidden flag are fetched. **No average views, country, language, upload dates or video list are fetched**, though the YouTube API could return some of them.

### 3.5 Other ways creators get in
- Website "Apply" form: `POST /api/public/apply` calls the database function `submit_application` and stores `creators.source = 'website'` (values: `manual`, `import`, `website`; note the staff form and CSV import also insert with the default `manual`; whether import sets `import` is not done in the code I read: the import route inserts without a `source`, so it stays `manual`).
- The Claude assistant can propose adding a creator (owner approves).

---

## 4. Deals and brands today

### 4.1 Deals page (`/deals`)
- Server component `app/(company)/deals/page.tsx`, actions in `actions.ts`, schemas in `lib/deals/schemas.ts`, display helpers in `lib/deals/format.ts`.
- **Table:** Creator (plain text, not a link), Brand (plain text), Stage (a select with a "Save" button that appears when changed), Amount, Commission, "Last change (UTC)", and a Delete button (owner only). No creator or brand link, no search, no sort, no date range, no amount filter, no deal detail page.
- **Filter:** only `stage` (and `page`). 25 per page, newest stage change first.
- **Add a deal tile** (right column): Creator select (first 1,000 creators A to Z, with a warning notice when the list is cut), Brand (free text with a `<datalist>` of existing brand names; typing a new name **creates a brand**), Amount (USD, 2 decimals, up to 10,000,000), Stage (default "Contacted"). Server action `addDealAction` validates with zod (`addDealSchema`), finds or creates the brand by name (citext, case-insensitive), inserts the deal.
- **Stages** (enum `deal_stage`, `STAGES` in `lib/deals/format.ts`): `contacted`, `replied`, `negotiating`, `signed`, `completed`, `paid`. Any stage can be set to any other (no ordering rule in the database). `stage_changed_at` updates by trigger.
- **Commission rule** (database function `commission_cents(bigint)`, set by trigger `deals_before` on every insert and update; the app never sends it): tiers on the whole amount, rounded to the cent: under $500 = 10%; $500 to $1,999.99 = 8%; $2,000 and up = 5%. It is the "single source for the dashboard and tests". Stored in `deals.commission_cents`. Currency is always USD (check constraint).
- **Where deal numbers are used:** `stats_overview()` (active deals = negotiating + signed + completed; commission earned = sum of `commission_cents` on `paid` deals), `creator_summaries` (`deal_count`, `total_earned_cents` = amount minus commission on paid deals), the Claude assistant tools `list_deals` and `propose_deal_stage`.
- **Deleting:** owner only, with a confirm. A creator with deals cannot be deleted (foreign key RESTRICT).

### 4.2 The `brands` table
Columns: `id uuid`, `name citext unique` (1 to 200 characters), `website text` (max 500), `notes text` (max 5000), `created_at`. That is all: **no contact person, no e-mail, no industry, no country, no budget, no status, no logo, no owner, no `updated_at`.**
- **Created:** only by `findOrCreateBrand` in `deals/actions.ts` when a deal is added.
- **Read:** the deals page (names for the datalist and the joined brand name), the Claude tools (deal rows show `brands(name)`).
- **Never edited:** there is no UI to edit `website` or `notes`. The two columns exist in the database but nothing in the app writes them.
- **Audit:** the trigger `trg_audit` logs brand create/update/delete (`brand.created` etc.).
- **RLS:** staff can read, insert, update; only the owner can delete.
- **No brand list, brand page or brand search exists.**
- **Leads from brands:** the website brand form saves into `contact_messages` (columns `name`, `email`, `topic`, `message`, `company`, `budget`, `phone`, `handled_at`, `handled_by`). The Inbox shows them. There is **no link** between an inquiry and a brand, and no "convert to brand" action.

---

## 5. E-mail outreach today

### 5.1 Flow
1. **Compose** (`/emails/compose`): search creators (live, 250ms pause, `GET /api/emails/creators`), add up to 25, choose "A saved template" or "A goal I type" (one sentence, max 500). Blocked creators (status Do not contact, or address on the suppression list) are shown with a red badge and cannot be added. A "Practice drafts" warning shows in mock mode. Server action `draftAction` (`compose/actions.ts`) drafts in batches of 5, stops starting new batches after 40 seconds, saves each draft as `emails.status = 'draft'` with `source` = `template` (template or mock) or `claude` (a goal written by Claude), writes audit `email.drafted`, then redirects to Review with counts.
2. **Review** (`/emails/review`): list of draft and approved e-mails (mine or all, max 100). Each card can be edited (saved with the same `draftProblem` checks), approved, put back to draft, or discarded. Editing an approved e-mail drops it back to draft (database rule). A "stale" flag shows for approvals older than 24 hours. The page shows the footer preview.
3. **Send:** the Send bar posts to `POST /api/emails/[id]/send` for each approved e-mail, one at a time, with a delay between them. Nothing is sent without a click. Only the server sends (`lib/email/send.ts`).
4. **Log** (`/emails`) and detail (`/emails/[id]`): filter, see who drafted, approved and sent; mark as replied (function `mark_replied`); retry a failed e-mail (back to draft).

### 5.2 Templates
Table `email_templates` (`name`, `goal`, `subject`, `body`). Placeholders: `{{first_name}}`, `{{channel_name}}`, `{{niche}}`, `{{subscribers}}`. Unknown placeholders fail the draft check. Subject max 120 characters, body max 4000. Any staff can create and edit, only the owner deletes. In template mode with Claude on, the template is passed to Claude "as the starting point" and Claude may reword it. With mock mode the placeholders are just filled in.

### 5.3 Send gate (`reserve_send`, SQL; called with the service role)
Refuses with a reason code unless: the actor is an active owner or worker; the e-mail is `approved`; the creator is not `do_not_contact`; neither the creator address nor `to_email` is on `suppression_list`; test mode has a test address, or real mode has a sender postal address; the daily limit (default **30**, per day in the settings time zone, test and real counted separately) is not reached; the gap since the last send (default **5 seconds**) has passed. A single advisory lock stops two sends racing. Then it sets `sending` and returns the recipient: in **test mode** the real address is replaced by the test address and the subject gets `[TEST] `. After SMTP, `mark_sent` sets `sent`, stamps `creators.last_contacted_at` and moves a creator from `new` to `contacted` (real sends only; test sends never touch the creator). `mark_failed` stores a short fixed error text. A cut-off "sending" e-mail is released after 15 minutes (`release_stale_sending`). The `settings` table default is `test_mode = true`; the old map says production runs with test mode off and an empty postal address (so real sends are refused), which cannot be checked from here.

### 5.4 Opt-outs
Every e-mail gets a footer built by `lib/email/footer.ts`: `--`, the sender line "Smallfold, sponsors for small YouTube channels", the postal address (if set), and an unsubscribe line with a signed link (`lib/email/token.ts`). Headers `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` are added (`lib/email/mailer.ts`). The link opens `/unsubscribe/[token]` (confirm), and the one-click `POST /api/unsubscribe/[token]` calls `opt_out(email, reason)` which sets matching creators to `do_not_contact` and adds the address to `suppression_list`. Setting Do not contact by hand adds a `manual` suppression row; only the owner can take a creator off Do not contact.

### 5.5 What Claude is given for a draft
Files: `admin/lib/drafting/facts.ts`, `types.ts`, `prompt.ts`, `validate.ts`, `index.ts`, `mock.ts`.

**Given (only these six facts, type `CreatorFacts`):**
- `fullName`, `firstName` (first word of the full name)
- `channelName`
- `channelUrl`
- `niche`
- `subscribers` (a number, or sent as the word `hidden` when the channel hides its count or the number is unknown)

They are written into the user prompt inside `<creator>` tags (`first_name`, `full_name`, `channel_name`, `channel_url`, `niche`, `subscribers`). Every value goes through `cleanText(v, 300)` (angle brackets removed, one line, cut to 300 characters). The system prompt says the content of those tags is untrusted data. A template (subject and body, with brackets stripped) or the one-sentence goal (cut to 500) is added as the task.

**Deliberately withheld** (the type `CreatorFacts` has no field for them, "so they cannot end up in a prompt by accident"): e-mail address, phone, **notes**, status, deals, earnings, last contacted, `source`, ids. The Claude chat assistant (`lib/assistant/tools.ts`) sees a few more things (status, deal count, total earned, last contacted) but also never e-mail, phone or notes.

**Also given to Claude as fixed text (system prompt `SYSTEM_PROMPT`):** the Smallfold facts (finds sponsors by hand, 1,000 to 50,000 subscribers only, joining is free, commission tiers 10% / 8% / 5%, creator has the final say, reply within 2 working days), the voice (premium and calm, plain words, "we", American English, never name a person), and the rules (use only given facts, no invented sponsors, brands, results, dates, places, prices; no price promises; no placeholders; no signature, footer, address or unsubscribe line; plain text; under 200 words). **No sponsor or brand information is ever given to Claude today.**

**Output checks (`draftProblem`):** subject 1 to 120 characters on one line; body at most 4000 characters and 220 words; no `{{...}}`, `[...]`, `<...>` or `%x%`; no link except the creator's own channel link; no dollar, pound or euro amount other than 500, 1,999, 2,000; no "USD / dollars" amounts; no "unsubscribe" or signature line. Model: `process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'`, 25 second timeout, one retry, `effort: 'low'`, structured output (subject, body). Mock mode when there is no `ANTHROPIC_API_KEY` or `DRAFT_MODE=mock`.

**Impact for the pitch feature:** a sponsor pitch needs brand facts and match reasons in the prompt, a different system prompt (the current one only writes a first-contact e-mail about Smallfold itself, "Never invent ... sponsors, brand names"), an allow-list for the brand's own link, and an update to `draftProblem` (it refuses any link and any amount not in the commission steps).

---

## 6. Data model

Database: Postgres on Supabase, 15 migrations in `admin/supabase/migrations/` (dates 20261121 to 20261123). All objects live in schema `public`. Extensions: `citext`, `pg_trgm` (schema `extensions`).

### 6.1 Enums
- `app_role`: `owner`, `worker`
- `creator_status`: `new`, `contacted`, `replied`, `active`, `inactive`, `do_not_contact`
- `deal_stage`: `contacted`, `replied`, `negotiating`, `signed`, `completed`, `paid`
- `email_status`: `draft`, `approved`, `sending`, `sent`, `failed`, `replied`

### 6.2 Tables (16 tables and one view)

**`creators`** (the main table)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `full_name` | text not null | 1 to 200 chars |
| `email` | citext not null **unique** | max 320, format check |
| `phone` | text | max 50 |
| `channel_url` | text | max 500, must match YouTube (constraint `creators_channel_url_youtube`) |
| `youtube_channel_id` | text **unique** | set by refresh |
| `channel_name` | text | max 200. No app code writes it (not the staff form, import or refresh), so it is probably empty for most rows; the list search, the pop-up link text and Compose still read it |
| `niche` | text | max 200, free text |
| `subscribers` | integer | >= 0 |
| `subscribers_hidden` | boolean not null default false | |
| `subscribers_checked_at` | timestamptz | |
| `status` | `creator_status` not null default `new` | |
| `notes` | text | max 5000 |
| `last_contacted_at` | timestamptz | stamped by `mark_sent` |
| `user_id` | uuid fk `auth.users` | future creator login; unique where not null |
| `created_by` | uuid fk `profiles` | default `auth.uid()` |
| `source` | text not null default `manual` | `manual`, `import`, `website` |
| `created_at`, `updated_at` | timestamptz | `updated_at` by trigger |

Indexes: trigram GIN on `full_name`, `email::text`, `channel_name`; btree on `status`, `created_at desc`, `created_by`. No index on `niche`, `subscribers` or `last_contacted_at`.

**`brands`**: `id`, `name` (citext unique), `website`, `notes`, `created_at`. (See 4.2.)

**`deals`**: `id`, `creator_id` (fk creators, **restrict**), `brand_id` (fk brands, **restrict**), `stage` (default `contacted`), `amount_cents bigint` (>= 0), `commission_cents bigint` (trigger-set), `currency` (always `USD`), `stage_changed_at`, `created_by`, `created_at`, `updated_at`. Indexes on creator, brand, stage, `created_at`, `stage_changed_at`. There is **no** title, deliverable, video link, publish date, notes, contact person, or "match" state. A deal row is the only link between a creator and a brand.

**`emails`**: `id`, `creator_id` (fk creators, **restrict**), `to_email citext`, `subject` (max 500), `body` (max 20000), `status`, `is_test`, `template_id` (fk, set null), `drafted_by`, `approved_by`, `approved_at`, `sent_by`, `sent_at`, `error`, `message_id`, `thread_id` (reserved for Gmail reply tracking, unused), `replied_at`, `source` (`staff`, `claude`, `template`), `created_at`, `updated_at`. **No `brand_id` or `deal_id`**, so an e-mail cannot be tied to a sponsor or a deal.

**`email_templates`**: `id`, `name`, `goal`, `subject`, `body`, `created_by`, `created_at`, `updated_at`.

**`suppression_list`**: `email citext pk`, `reason`, `created_at`, `created_by`.

**`settings`** (one row, `id = 1`): `daily_send_limit` (30), `min_seconds_between_sends` (5), `test_mode` (true), `test_email`, `sender_name` ("Smallfold"), `sender_postal_address`, `timezone` ("UTC"), `updated_at`, `updated_by`.

**`profiles`**: `id` (= `auth.users.id`), `full_name`, `email`, `role` (null = no access), `is_active`, `created_at`. Created by trigger on `auth.users`.

**`audit_log`** (append-only): `id bigserial`, `actor_id` (no fk), `action`, `entity_type`, `entity_id` (text), `details jsonb`, `created_at`.

**`login_attempts`**: `id`, `email`, `ip`, `success`, `created_at`. **`reset_requests`**: `id`, `email`, `ip`, `created_at` (password-reset rate limit). **`form_rate_limits`**: `id`, `form` (`apply`/`contact`), `ip_hash`, `created_at`.

**`contact_messages`**: `id`, `name`, `email`, `topic`, `message`, `created_at`, `handled_at`, `handled_by`, `company`, `budget`, `phone`.

**`assistant_threads`** (`id`, `owner_id`, `title`, `locked_at`, timestamps), **`assistant_messages`** (`id bigint`, `thread_id`, `owner_id`, `role`, `content jsonb`, `created_at`; append-only), **`assistant_proposals`** (`id`, `thread_id`, `owner_id`, `kind` in `creator.create`/`creator.update`/`deal.stage`, `payload jsonb`, `summary`, `status` pending/approved/rejected/failed, `result`, `created_at`, `decided_at`, `decided_by`).

**View `creator_summaries`** (`security_invoker = true`): all creator columns except `source`, `last_contacted_at` is replaced by the later of the stored value and the newest real (non-test) sent or replied e-mail, plus `deal_count` (count of all deals) and `total_earned_cents` (amount minus commission on `paid` deals). Computed with lateral joins. Grants: select to authenticated and service role. **This view is what the list page filters, sorts and counts on, so any new filter must be added to the view (or a new view) as well as to the query.**

### 6.3 Which creator columns the new filters could use

| Wanted filter | Exists today? | Column / note |
|---|---|---|
| Subscriber range (slider) | Yes | `subscribers` (integer, nullable, plus `subscribers_hidden`). No index |
| Niche | Partly | `niche` free text (max 200; website applicants get the first 120 characters of their free-text answer). No fixed list, no tags, no normalisation |
| Pipeline status | Yes | `status` enum (6 values), indexed |
| Last contacted | Yes | `last_contacted_at` in `creator_summaries`; also `emails.sent_at` |
| Has e-mail | Not meaningful | `email` is `not null`, so every creator has one. "Has phone" is possible (`phone` nullable). |
| Source | Column yes, view no | `creators.source`, but not in `creator_summaries` |
| Deal count / earned | Yes | in the view |
| Added date | Yes | `created_at` |
| Sponsorship history | Partly | `deals` rows (brand, stage, amount, dates). No title, no date of publication, no video link |
| **Country** | **No** | no column anywhere |
| **Language** | **No** | no column anywhere |
| **Average views** | **No** | not stored, not fetched from YouTube |
| **Upload frequency, last upload, video count, subscribers history** | **No** | |
| Tags / lists / saved views | **No** | |
| Sponsor-side data (industry, budget, target niche, target countries) | **No** | `brands` only has name, website, notes |

### 6.4 Triggers and functions (important ones)
- `is_staff()`, `is_owner()` (SECURITY DEFINER helpers used by every policy; with a verified 2FA factor, only an `aal2` session counts as staff).
- `touch_updated_at` on creators and templates.
- `deals_before`: sets `commission_cents`, `updated_at`, `stage_changed_at`.
- `emails_guard`: client may only insert as `draft`, move `draft`<->`approved` and `failed`->`draft`; bookkeeping columns cannot be written; editing approved text drops back to draft; checks that `to_email` is the creator's address.
- `creators_guard`: a non-owner cannot leave `do_not_contact`; keeps `user_id` and `created_by` from client edits.
- `creators_before_insert` (a suppressed address starts as `do_not_contact`), `creators_suppress_manual` (manual Do not contact adds a `manual` suppression row), `creators_before_delete` (deletes unsent drafts; sent e-mails block the delete).
- `profiles_guard`, `settings_guard`, `suppression_before/after`, `assistant_*` guards.
- `audit_row()` (row trigger `trg_audit` on creators, deals, brands, emails, email_templates, settings, suppression_list, profiles): writes `<entity>.created|updated|deleted`, plus `email.status_changed`, `profile.role_changed`; entity type names: `creator, deal, brand, email, template, settings, suppression, profile`. Updates carry `details.changes.<column>.{from,to}`. Creator e-mail, phone and notes changes and `emails.to_email` are stored only as `{"changed": true}`, not the value (migration `20261123000200`).
- `audit_log_immutable` (row and truncate triggers): nobody can update, delete or truncate the log, not even the owner.
- RPC functions: `log_audit`, `reserve_send`, `mark_sent`, `mark_failed`, `mark_replied`, `opt_out`, `bootstrap_owner`, `login_allowed`, `record_login_attempt`, `reset_allowed`, `record_reset_request`, `stats_overview`, `recent_activity`, `audit_actions`, `release_stale_sending`, `commission_cents`, `form_rate_ok`, `submit_application`, `submit_contact`.

**`log_audit` has a fixed allow-list of action names** (in `20261123000400_followups.sql`): `creator.viewed, creators.exported, creators.imported, creator.subscribers_refreshed, email.drafted, auth.login, auth.logout, auth.password_changed, auth.2fa_enabled, auth.2fa_removed, user.invited, user.removed, user.restored, contact.viewed, assistant.message, assistant.proposal_approved, assistant.proposal_rejected, assistant.thread_deleted` (and `email.unsubscribed` with no user). Any new audit action (for example `brand.viewed`, `brand.contact_viewed`, `creators.bulk_exported`) **needs a new migration** that re-creates `log_audit` with the longer list. Owner-type actions (`user.*`, `creators.exported`, `assistant.*`) are refused for workers.

### 6.5 RLS policies and grants, one line per table
- `creators`, `brands`, `deals`, `email_templates`: staff select, insert, update; owner delete (policies `staff_select_*`, `staff_insert_*`, `staff_update_*`, `owner_delete_*`). Grants: select, insert, update, delete to `authenticated`; full to `service_role`.
- `emails`: staff select, insert, update; staff may delete only `draft` or `approved` e-mails; nobody deletes the sent log.
- `suppression_list`: staff select and insert; owner delete.
- `settings`: staff select; owner update (one row; no insert or delete).
- `profiles`: staff select; owner update, with a column grant limited to `full_name, role, is_active`.
- `audit_log`: owner select only; no insert, update or delete policy for anyone (writes go through `log_audit` and triggers). `service_role` has select and insert.
- `login_attempts`, `reset_requests`, `form_rate_limits`: RLS on, **no policies**; only the service role and the functions touch them.
- `contact_messages`: staff select and update (columns `handled_at, handled_by` only); owner delete; service role inserts.
- `assistant_threads`, `assistant_messages`, `assistant_proposals`: owner only, own rows only; messages are append-only.
- `creator_summaries` view: `security_invoker`, so the creators policies apply.
- Default privileges: `anon` has nothing; functions are revoked from `public`, then granted one by one.

### 6.6 Audit log mechanism
Two sources: (1) the row trigger `audit_row()` on the tables above, which names the actor from `auth.uid()` or a per-transaction setting (`smallfold.actor`) used by the send functions; (2) the app calls `logAudit()` (`lib/audit.ts`) which calls the RPC `log_audit` as the logged-in user, for things a trigger cannot see (views, exports, imports, refreshes, logins). The log has an index on `created_at`, on `(entity_type, entity_id)`, on `(action, created_at)` and on `(actor_id, created_at)`. Details are limited to 8 KB. The owner reads it at `/settings/audit` (filter by action and person, 50 per page).

---

## 7. Security patterns to reuse

- **Pages:** every server component page starts with `const staff = await requireStaff();` (or `requireOwner()`), even though `(company)/layout.tsx` also calls `requireStaff()`. The rule in the code: never rely on a layout alone. `lib/auth/staff.ts` uses React `cache` so repeated calls cost one lookup. `requireStaff()` redirects (not logged in `/login`, missing 2FA step `/login/2fa`, no access `/auth/signout?reason=no_access`, database down `/login?error=busy`). `requireOwner()` sends a worker to `/overview?notice=owner-only`. Layouts with owner-only tabs (`settings/layout.tsx`) hide tabs but each page checks again.
- **Server actions** (`'use server'` files): call `requireStaff()` / `requireOwner()` as the first line, validate with zod or `validateCreator`, use the user's Supabase client (`lib/supabase/server.ts`) so RLS applies, and return a state object (`{error, fieldErrors, ok}`) for `useActionState`.
- **API routes:** wrap with `apiHandler({ role?, body?, query? }, fn)` from `lib/api/handler.ts`. It does: same-origin check for writes (`Origin` and `Sec-Fetch-Site`), `getCurrentStaff()` (401), role check (403 for `role: 'owner'`), `Content-Type: application/json` check (415) and zod body parse (400 "Invalid input."), zod query parse, JSON errors `{ error }`, `Cache-Control: no-store`, unknown errors become 500 "Something went wrong." (details only in the server log). The handler gets `{ req, staff, supabase, body, query, params }`. Use `throw new ApiError(status, message)` for controlled errors. Not wrapped: public routes and the unsubscribe route (their own checks).
- **Input validation:** zod 4 everywhere (`z.guid()` for ids, `z.enum(STATUSES)`, array caps such as `max(200)`). Search text is quoted and escaped before it goes into a PostgREST `.or()` filter (`searchFilter` in `lib/creators/filters.ts`: ILIKE `%` `_` `\` escaped, `*` replaced). **Any new filter that builds a PostgREST filter string must use the same escaping.** Page numbers are capped at 100000. URL values are parsed with `parseFilters` and bad values fall back to defaults.
- **Audit lines for viewing personal data:** the creator pop-up writes `creator.viewed` (via the API route or the edit page); the inbox list writes `contact.viewed` after the response (`after()` from `next/server`, re-using the request's client because `cookies()` cannot be called inside `after`); exports write `creators.exported` **before** sending any data and refuse on failure; imports and refreshes write a line with counts. `logAudit` never throws and returns true/false. New views of personal data (a brand contact's e-mail, a side panel on hover) need their own audit actions and a migration (see 6.4).
- **Rate limits:** login (`login_allowed(email, ip)`: 5 failures in 15 minutes per e-mail and per IP, `lib/auth/ip.ts` picks the IP), password reset (`reset_allowed`), public forms (`form_rate_ok`: 5 per hour per IP hash per form), sending (daily limit and gap in `reserve_send`), Claude chat (12 tool steps per message, 100 messages a day, in `lib/assistant/`). Hard caps in the creator code: 200 ids per bulk call, 25 creators per compose run, 2,000 CSV rows, 1 MB CSV.
- **Personal data in prompts and logs:** Claude gets only the six creator facts (section 5.5); audit rows do not store e-mail, phone or notes values; mail errors are stored as fixed short texts.
- **Headers:** CSP with nonce, `X-Frame-Options: DENY`, `noindex`, `Cache-Control: private, no-store` on all back-office responses (`proxy.ts`). Fonts must be self-hosted (the back-office CSP has `font-src 'self'`), and `connect-src` is `'self'` plus the Supabase URL. A command palette or any new fetch must stay on the same origin.
- **Database layer:** a second wall. RLS on every table and DB triggers enforce rules even if the UI is bypassed. New tables must copy the pattern (enable RLS, `staff_*` and `owner_*` policies, explicit grants, audit trigger `audit_row('<entity>')`).

---

## 8. Tests and local stack

Suites (`admin/tests/run-all.sh` runs them in this order, against the running local stack, with fake data only):
1. **DB tests**: `admin/supabase/tests/run.sh`. SQL files `rls.sql`, `hardening.sql`, `fixes.sql`, `forms.sql`, `assistant.sql`, `activity.sql`, `followups.sql` each in a rolled-back transaction, then HTTP checks through the gateway (`gateway.test.mjs`). Contract notes in `supabase/tests/README.md`.
2. **vitest**: `npx vitest run` (config `vitest.config.mts`, includes `tests/**/*.test.ts` and `lib/**/*.test.ts`). Test files: `lib/site-pages.test.ts`, `lib/deals/schemas.test.ts`, `lib/auth/ip.test.ts`, `lib/auth/safe-next.test.ts`, `lib/api/handler.test.ts`, `lib/assistant/assistant.test.ts`, `lib/youtube/youtube.test.ts`, `lib/email/email.test.ts`, `lib/email/mailer.test.ts`, `lib/creators/creators.test.ts`, `lib/drafting/drafting.test.ts`, `lib/forms/schemas.test.ts`.
3. **Browser end-to-end** (Playwright, plain `.cjs` scripts, run with `BASE_URL=http://localhost:3000 node <file>`): `tests/qa.e2e.cjs`, `lib/creators/e2e.cjs`, `lib/deals/e2e.cjs`, `lib/email/e2e.cjs`, `tests/website.e2e.cjs`, `lib/forms/e2e.cjs`, `lib/assistant/e2e.cjs`, and `scripts/e2e-auth.cjs` last (it trips the login limit). Playwright is expected on `NODE_PATH` (the script uses `/opt/node-tools/node_modules` if it exists).
4. **Other scripts** (`package.json`): `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`oxlint app lib components proxy.ts`), `npm run build`, `npm run dev` (copies tokens, builds the website into `public/`, then `next dev -p 3000`).

Local stack (`admin/dev/`, needs Postgres 16, GoTrue and PostgREST binaries): `start.sh` (Postgres on 127.0.0.1:54322, gateway on :54321 serving `/auth/v1` and `/rest/v1`, mail catcher SMTP 1025 with a web view on :8025, fake Anthropic on :4010), `stop.sh`, `reset.sh`, `migrate.sh`. Seed (`supabase/seed/`): 60 creators across all six statuses (every 9th with hidden subscribers), 10 brands, 15 deals across all six stages, 40 e-mails, 3 templates, 2 suppressed addresses, test mode on. Expected numbers in `supabase/seed/EXPECTED.md` and `expected.json`. A prototype can use this shape of data. No e2e or unit tests exist for the UI components in `components/ui` themselves; the UI is covered only through the page-level e2e scripts.

---

## 9. Weak for our goal

**Finding creators**
1. Only two filters (text, status) and four sorts. No range, no multi-select, no combination of conditions. The only data to filter on beyond status is subscribers (integer) and free-text niche.
2. Filters need a click on "Apply" (full page reload through a GET form). No live results, no chips showing active filters, no count per filter value.
3. Niche is free text, so "Cooking", "cooking" and "Food & cooking" are different. The website application stores the first 120 characters of a long free-text answer as niche (`lib/forms/schemas.ts`), so niche values are often sentences.
4. No country, language, average views or upload data exist, and the YouTube refresh fetches only the subscriber count. The "1,000 to 50,000" rule is only text on the page, not a filter or a warning.
5. No saved views, no "my filters", no pinned lists. URL state exists but is limited to the 5 params and is lost for selections.
6. Selection is client-only and per page; bulk actions are limited to refresh, e-mail and status. Moving through pages loses the selection. No "select all N matching".
7. The list is 6 columns; there is no way to choose columns or density; no "last contacted" relative time ("12 days ago"); the e-mail address is always shown under the name (personal data on every list view, with no audit line per list view, only per pop-up).
8. Tables use full page navigation for sort and page change (links), so the scroll position and the selection reset.

**Sponsorship history on a creator**
9. The pop-up shows only `Deals: 3` and `Earned through us`. The actual deals (brand, stage, amount, date) are not listed anywhere on the creator. To see them you must go to `/deals`, which has no creator filter.
10. A "past sponsorship" cannot be recorded in the data model: no deliverable type, video link, publish date or fee agreed vs paid date; deals started at `contacted` are mixed with real sponsorships. Sponsors the creator worked with before Smallfold cannot be stored at all.
11. There is no creator profile page and no side panel. The pop-up is a modal on top of the list: it hides the list, it is a full dialog (760px), and its edit and view modes replace each other.

**Sponsors (brands)**
12. Brands have no list, no page, no search and no edit form. Only a name is ever stored (created as a side effect of adding a deal). `website` and `notes` columns are unused.
13. No contact people for a brand (name, role, e-mail, phone). The only brand contact data is in the Inbox messages (`contact_messages`), which are not linked to a brand.
14. No brand attributes to match on: industry, niches wanted, budget range, countries, languages, minimum and maximum subscribers, status (lead / active / paused).
15. Typing a brand name in the Add-deal form silently creates a brand; a typo creates a duplicate brand (citext only ignores case).
16. Deals list cannot filter by brand or creator, cannot sort, shows no links to either side, and the Add form only lists the first 1,000 creators in a plain select (not searchable).

**Matching and deals**
17. There is no "match" concept. A deal starts at `contacted`, which is the first pipeline step, so a suggested pairing that has not been approached yet has no place to live. Stages cannot represent "suggested", "pitched", "declined", "lost".
18. The stage select allows any jump and has no "reason" field; no history of stage changes except the generic audit log (hard to show to a user).
19. No suggestions logic. Nothing computes why a creator fits a sponsor. All of the data the reasons would use (niche, language, country, subscribers range, past sponsorships) is either free text or missing.
20. Deals page uses a 2/3 – 1/3 split with the form always shown; it is a table, not a pipeline. No board (kanban) view by stage.

**Pitch e-mails**
21. The drafting flow starts only from creators (Compose). There is no way to start from a sponsor or from a match, no way to pass brand facts to Claude, and the prompt actively forbids naming sponsors.
22. E-mails have no link to a brand or deal, so the log cannot show "pitches for brand X", and replies cannot move a deal's stage.
23. `draftProblem` rejects any link other than the creator's channel link and any amount other than 500 / 1,999 / 2,000, which would block a pitch that names the sponsor's website or a typical budget.
24. Compose caps at 25 creators per run and lists 20 search results; fine for first-contact mails, tight for large campaigns.

**Search and navigation**
25. No global search. The only search boxes are in the creator list (name, e-mail, channel) and in Compose. Nothing searches brands, deals, inbox messages or e-mails by text.
26. Navigation has 7 flat top links; no breadcrumbs, no recents, no keyboard shortcuts, no quick-add.

**Design system gaps affecting the new screens**
27. Missing building blocks (see section 2.5): range slider, multi-select, chip/tag input, side panel/drawer, tabs, popover/dropdown menu, toast, skeleton, checkbox/switch styles, icons, avatar, command palette, sticky table header.
28. A lot of page-level layout is done with inline `style={{...}}` (compose lists, forms, review), so new work cannot rely on shared list or form-row styles.
29. `.label` is defined twice (global and in the UI module). Hard-coded colours (#9B2C1F, #2F6B3C, #8A5A00) are not tokens. No dark mode. `--r-lg` and `--cream-deep` exist but are unused in the back office.
30. Mobile: the table scrolls inside its box; there is no card layout for a list at phone width.
31. Body-text font weight: Instrument Sans 400 is not imported (only 500 and 600), see section 2.2.
32. Date and time formats: `formatWhen` (UTC, "21 Nov 2026, 14:05") is used in lists; the creator pop-up uses its own `dateTime` and `dateOnly` helpers (en-GB, UTC) so formats are close but not shared.

**Data and permissions**
33. `creator_summaries` computes deal counts and last-contacted with lateral joins on every list query. That is fine at 117 creators (the handoff says 117 are in production) but any new aggregate columns (sponsor names, average views) should be materialised or indexed.
34. No index on `niche`, `subscribers`, `last_contacted_at`; filtering on subscriber ranges and niche substring will scan at larger sizes (trigram index exists for name, e-mail and channel name only).
35. Workers can edit and bulk-change creators but cannot export. Any "export selected" or saved-view sharing needs a rule (and the audit line, see section 7).

---

## 10. Missing for our goal

Checklist of what does not exist today. "(UI)" = design and front end; "(DB)" = migration; "(API)" = route or action.

**Creator list and profile**
- [ ] Filter bar with live results and removable filter chips (UI)
- [ ] Subscriber range slider (two handles, with number inputs and the 1,000 to 50,000 band marked) (UI component) and an index on `subscribers` (DB)
- [ ] Multi-select filters: niche, language, country, status, source (UI component)
- [ ] Sponsorship-history filter ("worked with brand X", "has any paid deal", "no deals yet") (API + view columns)
- [ ] Last-contacted filter ("never", "over 30 days ago", date range) (UI + query)
- [ ] "Has phone" / "has email" style toggles (email is always present) (UI)
- [ ] Average-views filter and column (DB columns + YouTube fetch + UI)
- [ ] New creator columns: `country`, `language`, `average_views` (and its checked-at), a structured niche (a `niches` list or tags table) (DB)
- [ ] Add the new columns and a `source` column to `creator_summaries` (DB)
- [ ] More sort keys (average views, country, deal count, earned) and a sort menu (UI + `SORTS` in `lib/creators/filters.ts`)
- [ ] All new filters read from and write to the URL (extend `parseFilters` / `filtersToQuery`)
- [ ] Saved views (name, filters, sort, columns, who owns it, shared or private) (DB table + API + UI)
- [ ] Bulk actions beyond status: add tag, add to a sponsor's matches, export selected, "select all N matching" (API + UI)
- [ ] Column chooser and density option (UI)
- [ ] Creator profile page `/creators/[id]` and/or a side panel (drawer) that opens beside the list (UI + route)
- [ ] Sponsorship history section on the creator: list of deals with brand link, stage, amount, dates, plus the creator's e-mail history (API/query + UI)
- [ ] Place to record past sponsorships that happened outside Smallfold (DB)
- [ ] Notes timeline or activity feed per creator (UI + query; the data for part of it is in `audit_log` and `emails`)

**Sponsors (brands)**
- [ ] `/brands` list page with search, filters and sort (UI + route)
- [ ] `/brands/[id]` profile or side panel with deals, matches, contacts (UI)
- [ ] Brand columns: industry, status, budget range, target niches, countries, languages, subscriber range wanted, `updated_at`, owner (DB)
- [ ] `brand_contacts` table (name, role, email, phone, is_primary, notes) with RLS, grants and an audit trigger (DB)
- [ ] Create, edit, merge and archive brand forms; stop creating brands silently from the Add-deal form (UI + actions)
- [ ] Convert an Inbox inquiry into a brand and contact (API + UI) and link `contact_messages` to a brand (DB)
- [ ] Audit actions for viewing brand contacts, and the migration to extend the `log_audit` allow-list (DB)
- [ ] Brand import and export (API)

**Matches and deals**
- [ ] `matches` table (creator, brand, status such as suggested / approved / pitched / declined, reasons, score, created by, timestamps) (DB)
- [ ] A way to turn a match into a deal (action) and an earlier deal stage (for example `suggested` or `pitched`) in the `deal_stage` enum (DB; changing an enum needs a careful migration and updates to `lib/deals/format.ts`, the stats functions and the assistant tool schemas)
- [ ] Deal fields: title or campaign, deliverable, expected dates, notes, contact person, link to e-mails (DB)
- [ ] Deals pipeline (board) view by stage, with drag or quick stage change (UI)
- [ ] Deals list filters: creator, brand, amount range, date range; sort; links to both profiles (UI)
- [ ] Searchable creator and brand pickers (combobox) replacing the plain select and datalist (UI component)
- [ ] Match suggestions with reasons: a scoring function or query using niche, language, country, subscribers range, past sponsorships, last contacted, do-not-contact and recent-pitch exclusions (DB function or API) and a UI that shows "why" chips
- [ ] Stage history table (who moved what, when) if the UI needs more than the audit log (DB)

**Pitch with Claude**
- [ ] New drafting kind "pitch to a creator for a brand" with its own system prompt and facts (brand name, what they sell, why it fits, budget wording rules) in `lib/drafting/` (`types.ts`, `facts.ts`, `prompt.ts`, `validate.ts`)
- [ ] Update `draftProblem` to allow the sponsor's name and, if wanted, its link; keep the no-price rule
- [ ] Link `emails` to `brand_id` and `deal_id` or `match_id` (DB) and show it in the log and the review card
- [ ] Start drafting from a match, a creator page or a bulk selection (UI + action)
- [ ] Update the Claude chat tools if the assistant should read matches and brands (`lib/assistant/tools.ts`, `proposals.ts`, system prompt)

**Global search and navigation**
- [ ] Command palette (Ctrl/Cmd+K) component with grouped results (creators, brands, deals, e-mails, inbox, pages) and quick actions (UI component)
- [ ] `GET /api/search?q=` wrapped in `apiHandler`, with trigram indexes for brands (DB) and a result cap, no personal data beyond names unless required, and an audit decision for e-mail hits (API)
- [ ] Search trigger button in the shell top bar and a keyboard hint (UI)
- [ ] New nav items (Sponsors, Matches) in `components/shell/AppShell.tsx` and a decision on how the top bar fits 8 to 9 links (UI)

**Design-system components to add** (none exist in `components/ui`)
- [ ] Range slider, multi-select / combobox, chip and filter-chip, checkbox and switch, tabs, side panel (drawer), dropdown or popover menu, tooltip, toast, skeleton, avatar or initials mark, icon set, sticky table header, row-selected style, card list for phones, key-value list (replace the page-local `.dl`), stat tile (move `.tile` plus the overview card into `ui`)
- [ ] Turn the repeated hard-coded colours into tokens (`--danger`, `--success`, `--warn`)
- [ ] Remove inline styles from compose, review and forms in favour of shared classes

**Cross-cutting**
- [ ] Migration plan for every new table: RLS policies named `staff_*` / `owner_*`, grants, `audit_row('<entity>')` trigger, trigram or btree indexes, seed rows and `expected.json` updates, SQL tests in `supabase/tests/`
- [ ] Update `creator_summaries` safely (it is dropped and re-created as a view; its definition lives in `20261123000300_stats_activity_indexes.sql`) and the TypeScript types `CreatorSummary` / `ListRow` in `lib/creators/constants.ts`
- [ ] New e2e scripts for the list filters, side panel, brand pages and palette; component tests for the slider
- [ ] Decide the worker/owner rule for each new action (for example: workers may create matches, only the owner deletes brands, only the owner exports)
- [ ] Production data note: production holds about 117 real creators (from `docs/handoff.md` at the last commit); migrations must be additive and must not drop or rewrite creator data

---

Open questions I could not settle from the code:
- Whether `creators.channel_name` is ever filled. No TypeScript code writes it; only an SQL function such as `submit_application` could, and I did not confirm that. Treat it as probably empty and check the real data before using it as a display name.
- Whether the CSV import ever sets `source = 'import'`. The insert in `api/creators/import/route.ts` does not pass `source`, so rows get the default `manual`.
- Production settings (test mode, postal address, API keys) are not readable from the repo; the old map says test mode is off, the postal address is empty and there is no Anthropic key.
