# Smallfold back office: plan for Section 1 (Company)

Status: **built** (approved by the owner and built on 21 November 2026). How to run and set it up: `admin/README.md`. Where the project stands now: `docs/handoff.md`. Some details below changed after the audit of 23 November; those are marked.
Brand facts still come from `docs/brand-info.md`. Nothing in the public site (`src/`, `site/`, `build.js`) changes.

## 1. Decisions

| Topic | Decision | Why |
|---|---|---|
| App | **Next.js 16 (App Router, TypeScript)** in a new folder `admin/`, with its own `package.json` | The public site has no server. Sending email and keeping keys secret need one. A separate folder means the public site cannot break. |
| Look | Plain CSS (CSS Modules) using the site's own tokens: cream `#F1EFEB`, ink `#0E0E0E`, pen blue `#2B44D6`, Newsreader + Instrument Sans, 8px corners, no shadows | Matches the site. `src/css/tokens.css` stays the single source; a small script copies it into `admin/` before each run. |
| Database, login | **Supabase**: Postgres, Supabase Auth, row-level security (RLS) | Proven login (no home-made passwords), invites, password reset, TOTP 2FA, RLS. |
| Hosting | **Netlify**, app folder `admin/` (set in `netlify.toml`), on a `*.netlify.app` address until there is a domain | Runs Next.js. Vercel was the first plan; the app went online on Netlify instead. |
| Sending email | **Gmail SMTP** (Nodemailer) from `small.fold.sponsorship@gmail.com` with a Google **app password** | Owner's choice. Works without a domain; replies land in the same Gmail inbox. |
| Drafting | **Anthropic API**, model `claude-sonnet-5-5` by default (set by env var `ANTHROPIC_MODEL`) | Good writing quality for a sensible price. Called from the server only. |
| Subscribers | **YouTube Data API v3**, `channels.list` (1 quota unit per call, 10,000 free per day) | The owner has no key yet; setup steps go in the README. Until the key is set, the button explains why it is off. |
| Users | Owner only at first; worker invites built and tested | Owner's answer. |
| Brands, creators sections | Not built. The schema and code leave room (section 4). | |

## 2. What gets built

### A. Login and roles
- Login page, logout, "forgot password" and "set a new password" pages, all in the Smallfold style.
- **No public sign-up.** Sign-up is switched off in Supabase. People get in only by an invite from the owner.
- Two roles, stored in `profiles.role`:

| Action | Owner | Worker |
|---|---|---|
| View and edit creators, deals, templates | yes | yes |
| Draft and send emails (with an explicit click) | yes | yes |
| Delete creators, deals, templates | yes | no |
| Export creators to CSV | yes | no (personal data leaves the system; owner only; the audit line is written before the file is sent) |
| Import from CSV | yes | yes |
| Invite and remove workers | yes | no |
| Settings (send limit, test mode, sender details) | yes | no |
| Read the audit log | yes | no |

- Every page except login, reset and unsubscribe redirects to login without a session. Every server action and API route checks the session **and** the role again, on the server.
- Optional 2FA (authenticator app, TOTP) for every staff member, from Settings, Security (changed 23 November: it used to be the owner only). Once turned on, it is asked at every login.
- Login attempts are rate-limited (our own table, on top of Supabase's limits). Since 23 November: at most 5 failed tries in 15 minutes for one IP address, 5 for one email from one IP, and 20 for one email from any IP. More tries are refused until the old failures are over 15 minutes old.

### B. Creators page
- Table of creators showing **name and email** (plus status and subscriber count as small columns). Search (name, email, channel), filter by status, sort by name, subscribers, last contacted or date added, 25 per page.
- Clicking a row opens a pop-up with: YouTube channel link, email, phone, subscriber count (or "hidden by the channel"), niche, and a summary: status, number of deals, total earned through our deals, last contacted date, notes. Opening it writes a "viewed" line to the audit log.
- Add and edit (owner and worker), delete (owner only, asks for confirmation).
- **CSV import** with a preview step: shows which rows are new, which are duplicates (same email or same channel) and which have errors, before anything is saved. **CSV export** (owner only) of the current filter.
- **Refresh subscribers**: for the selected creators (or all on the page), asks YouTube in batches of 50. If a channel hides its count, the old number stays, the creator is marked "hidden", and the pop-up says so. Channel links in any form work (`/@handle`, `/channel/UC…`); the channel ID is saved after the first lookup.
- Creator statuses: `new`, `contacted`, `replied`, `active` (has a deal in progress), `inactive`, `do_not_contact`.

### C. Overview page
Cards:
- Total creators.
- Emails sent: all time, last 7 days, last 30 days.
- Replies received and reply rate (replies ÷ emails sent, as a %). Replies are marked by hand from the email log for now ("Mark as replied"); automatic Gmail reply tracking is a later phase.
- Deals by stage.
- Active deals: stages negotiating, signed and completed (in progress, not yet paid).
- Total commission earned: the commission on deals in stage **paid**.

Plus one chart (emails sent and replies per week, last 12 weeks) and a recent activity feed (the last 20 audit log lines, written in plain words: "Owner sent an email to Maya Brooks").

All numbers come from one database function, so the page and the tests read the same figures.

### D. Deals (minimal)
- Table: creator, brand name, stage, amount, commission, last change. Filter by stage.
- Add a deal (pick a creator, type a brand name; a new brand is created if the name is new), and change the stage from a dropdown. Delete is owner only. No board, no drag and drop.
- Commission is calculated by the database from the tiers in `docs/brand-info.md` (under $500: 10%, $500 to $1,999: 8%, $2,000 or more: 5%) on the whole amount, and stored on the deal. Amounts are stored in cents, in US dollars.
- A creator's "total earned through our deals" = the amount minus our commission, summed over that creator's **paid** deals.

### E. Email outreach with Claude
1. **Compose**: pick one or many creators (from the creators page or inside compose), then either choose a saved template or write the goal in one sentence.
2. **Draft**: the server sends Claude only that creator's own fields (name, channel name and link, niche, subscriber count) and the template or goal. Notes, email and phone are never sent to Claude. The instructions say: use only these facts, never invent anything about the creator or Smallfold, leave out any fact that is missing, and stay within the brand facts. Claude returns a subject and body for each creator. Each becomes an email with status **draft**.
3. **Review**: one card per draft. Everything can be edited. Each draft can be approved or thrown away. Approving does not send.
4. **Send**: only a click on **Send** sends, and it sends only the approved drafts on screen, one after another. There is no automatic or scheduled sending anywhere in the code.

Server-side rules, checked again at the moment of sending, for every single email:
- The user is logged in, is owner or worker, and the email is approved.
- The creator is not `do_not_contact`, and their address is not on the suppression list.
- The daily limit is not reached (default **30** a day, owner can change it in Settings).
- At least **5 seconds** since the last send (adjustable). The server refuses a send that comes too soon.
- **Test mode** (on by default): every email goes to the owner's own test address instead of the creator, with `[TEST]` in the subject. Test emails are logged as tests and do not count in the stats.
- Real sending (test mode off) is refused until the owner has filled in the sender details in Settings (see open question 1).

Every email carries, added by the server so it cannot be edited out:
- Who it is from: "Smallfold, sponsors for small YouTube channels" and the sender's postal address.
- An opt-out line: "If you would rather not hear from us, use this link or reply 'unsubscribe'." The link opens a small public page on the back office address that asks for one click to confirm. A `List-Unsubscribe` header is added too, so Gmail and other mail apps show their own unsubscribe button.

An opt-out puts the address on the suppression list and marks the creator `do_not_contact`. From then on no email can be drafted or sent to that address. Only the owner can remove an address from the list, and that is logged.

Every email is logged: creator, subject, body, who drafted it, who approved it, who sent it, times, status (`draft`, `approved`, `sent`, `failed`, `replied`), and the error if it failed.

Templates: name, goal, subject and body with placeholders (`{{first_name}}`, `{{channel_name}}`, `{{niche}}`, `{{subscribers}}`). Owner and worker can save them; only the owner deletes them.

## 3. Security

- **The public website never talks to Supabase.** On top of that, the `anon` role has no rights on any table, and every table has RLS switched on with "deny by default". Only logged-in staff (owner, worker) can read company data, through policies that check their role.
- Secret keys (Supabase service key, Gmail app password, Anthropic key, YouTube key, unsubscribe secret) live only in environment variables on the server. None is ever sent to the browser or written in the code. Only the Supabase URL and the public "anon" key go to the browser, and they can read nothing on their own.
- The service key is used in exactly four places: inviting and removing users, the unsubscribe page, the login-attempts functions, and the send functions (called by the send route after its own session and role check). Everything else runs as the logged-in user, so RLS always applies.
- 2FA, once turned on, is enforced inside the database too: a password-only session reads nothing.
- Every input is checked on the server with a schema (Zod): types, lengths, email and URL formats, allowed statuses.
- **Audit log**, written by the database and never editable or deletable, not even by the owner: logins, creator viewed, created, edited, deleted, imported, exported, email drafted, approved, sent, failed, opt-out, deal changes, settings changes, invites and removals.
- `.env.example` lists every variable, with no values. `.env*` files are in `.gitignore`.
- Security headers on every page (no framing, strict referrer, content security policy), and `noindex` so search engines never list the back office.

## 4. Room for Sections 2 and 3 (not built)

Design notes for the brand and creator logins: `docs/future-portals.md`.

- `profiles.role` is a list that can grow: `brand_member` and `creator_member` can be added later without changing the existing rows.
- `creators.user_id` (empty for now) will link a creator to their own login in the creator section.
- `brands` is a real table now (deals point to it), and a `brand_members` table can link brand logins to it later.
- RLS policies are grouped and named per section (`staff_*` now; `creator_self_*` and `brand_member_*` later), so new sections add policies without editing these.
- Back office pages live under `admin/app/(company)/`; the other sections get `(brand)/` and `(creator)/` beside it, with their own layouts and checks.
- Ready for the later phase: `emails.thread_id` and `emails.replied_at` (Gmail reply tracking), `creators.subscribers_checked_at` (scheduled refresh), `deals.stage_changed_at` (Kanban board, reminders).

## 5. Tables

| Table | Holds |
|---|---|
| `profiles` | One row per login: name, role, active or removed |
| `creators` | Name, email, phone, channel URL, channel ID, channel name, niche, subscribers, hidden flag, status, notes, last contacted, `user_id` (future) |
| `brands` | Name, website, notes |
| `deals` | Creator, brand, stage, amount, commission, dates |
| `emails` | Creator, to-address, subject, body, status, test flag, drafted/approved/sent by and when, error, replied at |
| `email_templates` | Name, goal, subject, body |
| `suppression_list` | Email address, reason, when, by whom |
| `settings` | One row: daily limit, seconds between sends, test mode, test address, sender name, sender postal address, time zone |
| `audit_log` | Who, what, which record, when, extra details |
| `login_attempts` | Email, IP, time, success (for rate limiting) |

## 6. The team, files and models

Each agent owns its files and does not edit anyone else's. Missing pieces are reported to the leader.

| Phase | Agent | Model | Owns |
|---|---|---|---|
| 1 | Database | sonnet | `admin/supabase/**` (migrations, seed, RLS tests), `admin/dev/**` (the local test stack) |
| 1 | Auth and app shell | sonnet | Next.js setup, `admin/lib/supabase/**`, `admin/lib/auth/**`, `admin/lib/audit.ts`, `admin/middleware.ts`, layout, navigation, base styles, login/reset/invite pages, Settings → Users and Security |
| 2 | Creators | sonnet | `admin/app/(company)/creators/**`, `admin/lib/creators/**`, `admin/lib/youtube/**` |
| 2 | Dashboard | haiku | `admin/app/(company)/overview/**`, `admin/app/(company)/deals/**`, `admin/lib/deals/**` |
| 2 | Email and Claude | sonnet (the leader reviews it line by line) | `admin/app/(company)/emails/**`, `admin/app/unsubscribe/**`, `admin/lib/email/**`, `admin/lib/drafting/**`, Settings → Sending |
| 3 | Security reviewer | sonnet, read-only | A report only |
| 3 | QA | haiku | `admin/tests/**` |
| 3 | Docs | haiku | `admin/README.md`, `admin/.env.example`, a short pointer in the main `README.md` |

At most 3 agents at once. Each reports back in 10 lines or fewer.

## 7. How it is tested (fake data only)

- A local copy of Supabase runs in this container: Postgres 16, Supabase's real login service (GoTrue) and its database API (PostgREST), behind one local address. The migrations are tested there exactly as they will run on Supabase.
- Seed data: about 60 invented creators (`@example.test` addresses), 15 deals across all stages, 40 emails, 3 templates, 2 suppressed addresses, one owner and one worker login.
- Email goes to a local mail catcher. **No real email is sent while building.** Drafting uses a "mock" mode that fills in templates without calling Claude, unless an Anthropic key is set. YouTube is mocked in tests.
- QA checks: failed login and the rate limit, a worker blocked from owner actions (in the page and directly at the API and the database), search and the pop-up, overview numbers equal to the seed data, test mode only reaching the test address, opted-out and do-not-contact creators blocked, the daily limit and delay enforced.
- Then the leader clicks through every page in a real browser, as the owner and as a worker.

## 8. What the owner sets up (later, with the README's steps)

1. A free Supabase project: run the migrations, switch off sign-up, set the site address, and connect Supabase's own emails (invites, password reset) to the same Gmail account.
2. Gmail: switch on 2-step verification and create an app password.
3. An Anthropic API key, and a YouTube Data API key from Google Cloud.
4. A Netlify project that builds `admin/`, with the environment variables from `.env.example`.
5. In Settings: the test address, the sender postal address, then a test send, then test mode off.

## 9. Open questions (the plan works without answers; these are the defaults)

1. **Postal address in emails.** US law for commercial email (CAN-SPAM) asks for a valid postal address in every message; a PO box is accepted. Smallfold has no location. Default: real sending stays locked until an address is entered in Settings. Test mode works without it.
2. **Gmail limits.** A normal Gmail account allows about 500 emails a day and may flag sudden bursts of cold email. The default 30 a day with 5 seconds between sends stays well below that. Moving to a domain and a sending service later is a change in one file.
3. **Active deals** = negotiating, signed and completed. **Commission earned** = paid deals only. **Commission** is taken on the whole amount (the brand facts list this as unconfirmed).
4. **Export** is owner only. Say so if workers should export too.

## 10. Not built now (the code is kept ready)

Kanban deal board, automatic reply tracking through Gmail, follow-up reminders, scheduled subscriber refresh, the brand section, the creator section.
