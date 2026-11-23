# FR: follow-ups from the re-audits

| ID | Status | Files changed | What changed | How it was checked |
|---|---|---|---|---|
| Regression (channel_url https) | Fixed | `lib/youtube/channel.ts`, `youtube.test.ts`, `lib/creators/creators.test.ts` | `normalizeChannelUrl` turns `http://` (any case) into `https://`. Every stored link goes through it (website Apply form, CSV import, creator form all use `validateCreator`). A bare `@handle` is turned into a youtube.com link by the Apply form and refused by the staff form / CSV (not a link). | Unit tests; Apply form on a dev server with `http://`, `https://`, `@handle`, upper-case host: all saved as https (test rows deleted). |
| SEC2-06 | Fixed | `20261123000400_followups.sql` | `creators_channel_url_https` replaced by `creators_channel_url_youtube`: `channel_url is null or channel_url ~* '^https://((www\|m)\.)?youtube\.com/'`, NOT VALID. VALIDATE and the listing query are in the file's header. | `supabase/tests/followups.sql` |
| SEC2-01 | Fixed | same migration | `login_allowed` skips the 20-per-email block for an IP with a successful login for that email in the last 30 days. Finding: `record_login_attempt` deleted rows after 7 days, so the migration keeps them 35 days (only less deleting). `reset_allowed`: 3/h per (email, IP), 3/h per IP, 10/h per email overall. Signatures unchanged. | followups.sql; old L04 check in fixes.sql updated (email limit is now per pair) |
| SEC2-02 | Fixed | same migration | `log_audit`: `creators.exported` owner-only; `creators.imported` still open to staff. | followups.sql; hardening.sql worker list no longer has `creators.exported` |
| SEC2-03 | Fixed | `lib/email/unsubscribe.ts` | Creator update and `email.unsubscribed` audit line only when `opt_out` reports `newly_suppressed`; a repeat POST changes nothing. (The route needed no change.) | tsc; reviewed (no e2e for a double POST) |
| SEC2-05 | Fixed | same migration | New `emails_check_address()` called from `emails_guard` on insert and when `to_email` / `creator_id` change, only when `current_user = 'authenticated'` (case-insensitive, citext). Drafting paths copy `c.email` and still pass. | followups.sql; rls.sql "suppressed address" check now accepts the new message too |
| SEC2-07 | Fixed | `app/api/health/route.ts` | 10 s in-memory cache of the answer (both ok and failed); no query in between. | Two calls on a dev server returned `{"ok":true}` |
| SEC2-08 | Fixed (partly) | same migration | Lift branch deletes `manual` rows for old and new address. Limit: if the address was edited in an earlier, separate save, the trigger no longer knows the old address; only a same-save edit and lift clears both. | followups.sql |
| QA2-01 | Fixed | `app/not-found.tsx` | Links to the website home (`/`) and the back office (`/overview`). | tsc, lint (not seen in a browser: the gate redirects logged-out visitors) |
| QA2-02 | Fixed | `app/(company)/deals/actions.ts` | Stage change and delete select the affected rows; none means "This deal no longer exists. Refresh the page." (shown inline, no refresh so the message stays). | tsc; not exercised in a browser |

## Needs another agent
- SEC2-04 (Supabase email templates) is an owner setting.
- Live database: run the VALIDATE for `creators_channel_url_youtube` only after the listing query returns no rows (old `http://` rows must be edited first).

## Tests run
`bash admin/dev/migrate.sh` (applied 20261123000400), `bash admin/supabase/tests/run.sh` (SQL 101 + 59 + 15 checks, HTTP all passed; new `followups.sql` added to run.sh), `npx tsc --noEmit`, `npx vitest run` (125 passed), `npm run lint` clean.
